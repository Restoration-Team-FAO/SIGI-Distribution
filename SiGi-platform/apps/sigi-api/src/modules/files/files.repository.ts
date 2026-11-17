import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { PostgresService } from '../../common/db/postgres.service';

export type FilesUserContext = {
  userId: string;
  institutionId: string | null;
  roleIds: string[];
  roleCodes: string[];
};

type FolderRow = {
  id: string;
  egi_id: string | null;
  parent_id: string | null;
  institution_id: string | null;
  project_id: string | null;
  name: string;
  path: string;
  description: string | null;
  visibility: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  child_folder_count?: number;
  file_count?: number;
};

type FileRow = {
  id: string;
  egi_id: string | null;
  folder_id: string | null;
  institution_id: string | null;
  institution_name: string | null;
  project_id: string | null;
  project_title: string | null;
  current_version_id: string | null;
  name: string;
  title: string | null;
  description: string | null;
  file_type: string | null;
  mime_type: string | null;
  extension: string | null;
  size_bytes: string | number;
  checksum_sha256: string | null;
  confidentiality_level: string;
  validation_status: string;
  source_type: string;
  is_geospatial: boolean;
  is_public: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  folder_path?: string | null;
};

type VersionRow = {
  id: string;
  file_id: string;
  version_number: number;
  storage_key: string;
  original_filename: string;
  mime_type: string | null;
  size_bytes: string | number;
  checksum_sha256: string | null;
  change_note: string | null;
  uploaded_by: string | null;
  uploaded_at: Date;
};

type MetadataRow = {
  id: string;
  file_id: string;
  country: string | null;
  department: string | null;
  municipality: string | null;
  thematic_area: string | null;
  document_type: string | null;
  data_owner: string | null;
  technical_custodian: string | null;
  license: string | null;
  retention_policy: string | null;
  spatial_reference: string | null;
  geometry_type: string | null;
  bbox: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type LinkRow = {
  id: string;
  file_id: string;
  entity_type: string;
  entity_id: string;
  relation_type: string;
  created_at: Date;
};

type AuditRow = {
  id: string;
  file_id: string | null;
  folder_id: string | null;
  event_type: string;
  user_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
};

type StorageObjectRow = {
  id: string;
  file_id: string;
  version_id: string | null;
  storage_key: string;
  storage_provider: string;
  absolute_path: string;
  exists_on_disk: boolean;
  created_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class FilesRepository {
  constructor(private readonly postgresService: PostgresService) {}

  async resolveUserContext(email: string): Promise<FilesUserContext | null> {
    const result = await this.postgresService.query<{
      user_id: string;
      institution_id: string | null;
      role_ids: string[];
      role_codes: string[];
    }>(
      `
        SELECT
          u.id AS user_id,
          u.institution_id,
          COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.id::text), NULL), ARRAY[]::text[]) AS role_ids,
          COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.code), NULL), ARRAY[]::text[]) AS role_codes
        FROM core.users u
        LEFT JOIN core.user_roles ur ON ur.user_id = u.id
        LEFT JOIN core.roles r ON r.id = ur.role_id
        WHERE LOWER(u.email) = LOWER($1)
        GROUP BY u.id, u.institution_id
      `,
      [email],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      institutionId: row.institution_id,
      roleIds: row.role_ids,
      roleCodes: row.role_codes,
    };
  }

  async hasEgiAccess(userId: string, institutionId: string | null, egiId: string) {
    const result = await this.postgresService.query<{ allowed: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM core.egi_spaces e
          LEFT JOIN core.egi_memberships em
            ON em.egi_id = e.id AND em.user_id = $1::uuid AND em.membership_status = 'active'
          WHERE e.id::text = $3
            AND (em.user_id IS NOT NULL OR ($2::uuid IS NOT NULL AND e.institution_id = $2::uuid))
        ) AS allowed
      `,
      [userId, institutionId, egiId],
    );
    return Boolean(result.rows[0]?.allowed);
  }

  async listFoldersFlat(egiId: string) {
    const result = await this.postgresService.query<FolderRow>(
      `
        SELECT
          f.*,
          (
            SELECT COUNT(*)::int
            FROM documents.folders child
            WHERE child.parent_id = f.id
              AND child.deleted_at IS NULL
          ) AS child_folder_count,
          (
            SELECT COUNT(*)::int
            FROM documents.files df
            WHERE df.folder_id = f.id
              AND df.deleted_at IS NULL
          ) AS file_count
        FROM documents.folders f
        WHERE f.deleted_at IS NULL
          AND f.egi_id = $1::uuid
        ORDER BY f.path ASC
      `,
      [egiId],
    );

    return result.rows.map(mapFolderRow);
  }

  async getFolderById(id: string, egiId?: string | null, client?: PoolClient) {
    const query = `
      SELECT
        f.*,
        (
          SELECT COUNT(*)::int
          FROM documents.folders child
          WHERE child.parent_id = f.id
            AND child.deleted_at IS NULL
        ) AS child_folder_count,
        (
          SELECT COUNT(*)::int
          FROM documents.files df
          WHERE df.folder_id = f.id
            AND df.deleted_at IS NULL
        ) AS file_count
      FROM documents.folders f
      WHERE f.id = $1::uuid
        AND ($2::uuid IS NULL OR f.egi_id = $2::uuid)
        AND f.deleted_at IS NULL
    `;
    const result = client
      ? await client.query<FolderRow>(query, [id, egiId ?? null])
      : await this.postgresService.query<FolderRow>(query, [id, egiId ?? null]);
    return result.rows[0] ? mapFolderRow(result.rows[0]) : null;
  }

  async getFolderByParentAndName(parentId: string | null, name: string, egiId: string, client?: PoolClient) {
    const query = `
      SELECT *
      FROM documents.folders
      WHERE (
          ($1::uuid IS NULL AND parent_id IS NULL)
          OR parent_id = $1::uuid
        )
        AND LOWER(name) = LOWER($2)
        AND egi_id = $3::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const result = client
      ? await client.query<FolderRow>(query, [parentId, name, egiId])
      : await this.postgresService.query<FolderRow>(query, [parentId, name, egiId]);
    return result.rows[0] ? mapFolderRow(result.rows[0]) : null;
  }

  async getFolderBreadcrumb(id: string, egiId: string) {
    const result = await this.postgresService.query<FolderRow>(
      `
        WITH RECURSIVE folder_path AS (
          SELECT *
          FROM documents.folders
          WHERE id = $1::uuid
            AND egi_id = $2::uuid
            AND deleted_at IS NULL
          UNION ALL
          SELECT parent.*
          FROM documents.folders parent
          INNER JOIN folder_path current_folder ON current_folder.parent_id = parent.id
          WHERE parent.deleted_at IS NULL
        )
        SELECT *
        FROM folder_path
        ORDER BY path ASC
      `,
      [id, egiId],
    );

    return result.rows.map(mapFolderRow);
  }

  async listFolderItems(id: string | null, egiId: string) {
    const foldersResult = await this.postgresService.query<FolderRow>(
      `
        SELECT
          f.*,
          (
            SELECT COUNT(*)::int
            FROM documents.folders child
            WHERE child.parent_id = f.id
              AND child.deleted_at IS NULL
          ) AS child_folder_count,
          (
            SELECT COUNT(*)::int
            FROM documents.files df
            WHERE df.folder_id = f.id
              AND df.deleted_at IS NULL
          ) AS file_count
        FROM documents.folders f
        WHERE (
            ($1::uuid IS NULL AND f.parent_id IS NULL)
            OR f.parent_id = $1::uuid
          )
          AND f.deleted_at IS NULL
          AND f.egi_id = $2::uuid
        ORDER BY f.name ASC
      `,
      [id, egiId],
    );

    const filesResult = await this.postgresService.query<FileRow>(
      `
        SELECT
          df.*,
          folder.path AS folder_path,
          institution.name AS institution_name,
          project.title AS project_title
        FROM documents.files df
        LEFT JOIN documents.folders folder ON folder.id = df.folder_id
        LEFT JOIN core.institutions institution ON institution.id = df.institution_id
        LEFT JOIN core.projects project ON project.id = df.project_id
        WHERE (
            ($1::uuid IS NULL AND df.folder_id IS NULL)
            OR df.folder_id = $1::uuid
          )
          AND df.deleted_at IS NULL
          AND df.egi_id = $2::uuid
        ORDER BY COALESCE(df.title, df.name) ASC
      `,
      [id, egiId],
    );

    return {
      folders: foldersResult.rows.map(mapFolderRow),
      files: filesResult.rows.map(mapFileRow),
    };
  }

  async createFolder(
    input: {
      parentId: string | null;
      egiId: string;
      institutionId: string | null;
      projectId: string | null;
      name: string;
      path: string;
      description: string | null;
      visibility: string;
      createdBy: string | null;
    },
    client: PoolClient,
  ) {
    const result = await client.query<FolderRow>(
      `
        INSERT INTO documents.folders (
          parent_id,
          egi_id,
          institution_id,
          project_id,
          name,
          path,
          description,
          visibility,
          created_by
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9::uuid)
        RETURNING *
      `,
      [
        input.parentId,
        input.egiId,
        input.institutionId,
        input.projectId,
        input.name,
        input.path,
        input.description,
        input.visibility,
        input.createdBy,
      ],
    );

    return mapFolderRow(result.rows[0]);
  }

  async updateFolder(
    id: string,
    input: {
      parentId: string | null;
      institutionId: string | null;
      projectId: string | null;
      name: string;
      path: string;
      description: string | null;
      visibility: string;
      previousPath: string;
    },
    client: PoolClient,
  ) {
    await client.query(
      `
        UPDATE documents.folders
        SET
          parent_id = $2::uuid,
          institution_id = $3::uuid,
          project_id = $4::uuid,
          name = $5,
          path = $6,
          description = $7,
          visibility = $8,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [
        id,
        input.parentId,
        input.institutionId,
        input.projectId,
        input.name,
        input.path,
        input.description,
        input.visibility,
      ],
    );

    if (input.previousPath !== input.path) {
        await client.query(
          `
            UPDATE documents.folders
            SET
              path = $1 || SUBSTRING(path FROM CHAR_LENGTH($2) + 1),
              updated_at = NOW()
            WHERE path LIKE $2 || '/%'
              AND deleted_at IS NULL
          `,
          [input.path, input.previousPath],
        );
      }

    return this.getFolderById(id, null, client);
  }

  async countFolderDependents(id: string) {
    const result = await this.postgresService.query<{ child_folders: number; files: number }>(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM documents.folders
            WHERE parent_id = $1::uuid
              AND deleted_at IS NULL
          ) AS child_folders,
          (
            SELECT COUNT(*)::int
            FROM documents.files
            WHERE folder_id = $1::uuid
              AND deleted_at IS NULL
          ) AS files
      `,
      [id],
    );

    return result.rows[0] ?? { child_folders: 0, files: 0 };
  }

  async softDeleteFolder(id: string, client: PoolClient) {
    await client.query(
      `
        UPDATE documents.folders
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [id],
    );
  }

  async createFile(
    input: {
      folderId: string | null;
      egiId: string;
      institutionId: string | null;
      projectId: string | null;
      name: string;
      title: string | null;
      description: string | null;
      fileType: string | null;
      mimeType: string | null;
      extension: string | null;
      sizeBytes: number;
      checksumSha256: string;
      confidentialityLevel: string;
      validationStatus: string;
      sourceType: string;
      isGeospatial: boolean;
      isPublic: boolean;
      createdBy: string | null;
    },
    client: PoolClient,
  ) {
    const result = await client.query<FileRow>(
      `
        INSERT INTO documents.files (
          folder_id,
          egi_id,
          institution_id,
          project_id,
          name,
          title,
          description,
          file_type,
          mime_type,
          extension,
          size_bytes,
          checksum_sha256,
          confidentiality_level,
          validation_status,
          source_type,
          is_geospatial,
          is_public,
          created_by
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18::uuid
        )
        RETURNING
          id, egi_id, folder_id, institution_id, project_id, current_version_id, name, title, description,
          file_type, mime_type, extension, size_bytes, checksum_sha256, confidentiality_level,
          validation_status, source_type, is_geospatial, is_public, created_by, created_at,
          updated_at, deleted_at
      `,
      [
        input.folderId,
        input.egiId,
        input.institutionId,
        input.projectId,
        input.name,
        input.title,
        input.description,
        input.fileType,
        input.mimeType,
        input.extension,
        input.sizeBytes,
        input.checksumSha256,
        input.confidentialityLevel,
        input.validationStatus,
        input.sourceType,
        input.isGeospatial,
        input.isPublic,
        input.createdBy,
      ],
    );

    return mapFileRow(result.rows[0]);
  }

  async createFileVersion(
    input: {
      fileId: string;
      versionNumber: number;
      storageKey: string;
      originalFilename: string;
      mimeType: string | null;
      sizeBytes: number;
      checksumSha256: string;
      changeNote: string | null;
      uploadedBy: string | null;
    },
    client: PoolClient,
  ) {
    const result = await client.query<VersionRow>(
      `
        INSERT INTO documents.file_versions (
          file_id,
          version_number,
          storage_key,
          original_filename,
          mime_type,
          size_bytes,
          checksum_sha256,
          change_note,
          uploaded_by
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::uuid)
        RETURNING *
      `,
      [
        input.fileId,
        input.versionNumber,
        input.storageKey,
        input.originalFilename,
        input.mimeType,
        input.sizeBytes,
        input.checksumSha256,
        input.changeNote,
        input.uploadedBy,
      ],
    );

    return mapVersionRow(result.rows[0]);
  }

  async createStorageObject(
    input: {
      fileId: string;
      versionId: string;
      storageKey: string;
      absolutePath: string;
    },
    client: PoolClient,
  ) {
    await client.query(
      `
        INSERT INTO documents.file_storage_objects (
          file_id,
          version_id,
          storage_key,
          absolute_path
        )
        VALUES ($1::uuid, $2::uuid, $3, $4)
      `,
      [input.fileId, input.versionId, input.storageKey, input.absolutePath],
    );
  }

  async setCurrentVersion(fileId: string, versionId: string, client: PoolClient) {
    await client.query(
      `
        UPDATE documents.files
        SET current_version_id = $2::uuid, updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [fileId, versionId],
    );
  }

  async getLatestVersionNumber(fileId: string, client?: PoolClient) {
    const query = `
      SELECT COALESCE(MAX(version_number), 0)::int AS latest
      FROM documents.file_versions
      WHERE file_id = $1::uuid
    `;
    const result = client
      ? await client.query<{ latest: number }>(query, [fileId])
      : await this.postgresService.query<{ latest: number }>(query, [fileId]);
    return result.rows[0]?.latest ?? 0;
  }

  async getFileById(id: string, egiId?: string | null, client?: PoolClient) {
    const query = `
      SELECT
        df.*,
        folder.path AS folder_path,
        institution.name AS institution_name,
        project.title AS project_title
      FROM documents.files df
      LEFT JOIN documents.folders folder ON folder.id = df.folder_id
      LEFT JOIN core.institutions institution ON institution.id = df.institution_id
      LEFT JOIN core.projects project ON project.id = df.project_id
      WHERE df.id = $1::uuid
        AND ($2::uuid IS NULL OR df.egi_id = $2::uuid)
        AND df.deleted_at IS NULL
    `;
    const result = client
      ? await client.query<FileRow>(query, [id, egiId ?? null])
      : await this.postgresService.query<FileRow>(query, [id, egiId ?? null]);
    return result.rows[0] ? mapFileRow(result.rows[0]) : null;
  }

  async getFileVersions(fileId: string) {
    const result = await this.postgresService.query<VersionRow>(
      `
        SELECT *
        FROM documents.file_versions
        WHERE file_id = $1::uuid
        ORDER BY version_number DESC
      `,
      [fileId],
    );
    return result.rows.map(mapVersionRow);
  }

  async getCurrentStorageObject(fileId: string) {
    const result = await this.postgresService.query<StorageObjectRow>(
      `
        SELECT fso.*
        FROM documents.file_storage_objects fso
        INNER JOIN documents.files df ON df.current_version_id = fso.version_id
        WHERE df.id = $1::uuid
          AND fso.deleted_at IS NULL
        LIMIT 1
      `,
      [fileId],
    );
    return result.rows[0] ? mapStorageObjectRow(result.rows[0]) : null;
  }

  async getStorageObjectByVersion(versionId: string) {
    const result = await this.postgresService.query<StorageObjectRow>(
      `
        SELECT *
        FROM documents.file_storage_objects
        WHERE version_id = $1::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [versionId],
    );
    return result.rows[0] ? mapStorageObjectRow(result.rows[0]) : null;
  }

  async getFileMetadata(fileId: string) {
    const result = await this.postgresService.query<MetadataRow>(
      `
        SELECT *
        FROM documents.file_metadata
        WHERE file_id = $1::uuid
      `,
      [fileId],
    );
    return result.rows[0] ? mapMetadataRow(result.rows[0]) : null;
  }

  async upsertFileMetadata(
    fileId: string,
    input: {
      country: string | null;
      department: string | null;
      municipality: string | null;
      thematicArea: string | null;
      documentType: string | null;
      dataOwner: string | null;
      technicalCustodian: string | null;
      license: string | null;
      retentionPolicy: string | null;
      spatialReference: string | null;
      geometryType: string | null;
      bbox: Record<string, unknown> | null;
      metadata: Record<string, unknown>;
    },
    client: PoolClient,
  ) {
    const result = await client.query<MetadataRow>(
      `
        INSERT INTO documents.file_metadata (
          file_id,
          country,
          department,
          municipality,
          thematic_area,
          document_type,
          data_owner,
          technical_custodian,
          license,
          retention_policy,
          spatial_reference,
          geometry_type,
          bbox,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13::jsonb, $14::jsonb, NOW(), NOW()
        )
        ON CONFLICT (file_id) DO UPDATE
        SET
          country = EXCLUDED.country,
          department = EXCLUDED.department,
          municipality = EXCLUDED.municipality,
          thematic_area = EXCLUDED.thematic_area,
          document_type = EXCLUDED.document_type,
          data_owner = EXCLUDED.data_owner,
          technical_custodian = EXCLUDED.technical_custodian,
          license = EXCLUDED.license,
          retention_policy = EXCLUDED.retention_policy,
          spatial_reference = EXCLUDED.spatial_reference,
          geometry_type = EXCLUDED.geometry_type,
          bbox = EXCLUDED.bbox,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *
      `,
      [
        fileId,
        input.country,
        input.department,
        input.municipality,
        input.thematicArea,
        input.documentType,
        input.dataOwner,
        input.technicalCustodian,
        input.license,
        input.retentionPolicy,
        input.spatialReference,
        input.geometryType,
        JSON.stringify(input.bbox ?? null),
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return mapMetadataRow(result.rows[0]);
  }

  async updateFileBasics(
    fileId: string,
    input: {
      title: string | null;
      description: string | null;
      confidentialityLevel: string;
      validationStatus: string;
      isPublic: boolean;
    },
    client: PoolClient,
  ) {
    await client.query(
      `
        UPDATE documents.files
        SET
          title = $2,
          description = $3,
          confidentiality_level = $4,
          validation_status = $5,
          is_public = $6,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [
        fileId,
        input.title,
        input.description,
        input.confidentialityLevel,
        input.validationStatus,
        input.isPublic,
      ],
    );
  }

  async createEntityLink(
    fileId: string,
    input: {
      entityType: string;
      entityId: string;
      relationType: string;
    },
    client: PoolClient,
  ) {
    const result = await client.query<LinkRow>(
      `
        INSERT INTO documents.file_entity_links (
          file_id,
          entity_type,
          entity_id,
          relation_type
        )
        VALUES ($1::uuid, $2, $3::uuid, $4)
        RETURNING *
      `,
      [fileId, input.entityType, input.entityId, input.relationType],
    );

    return mapLinkRow(result.rows[0]);
  }

  async getFileLinks(fileId: string) {
    const result = await this.postgresService.query<LinkRow>(
      `
        SELECT *
        FROM documents.file_entity_links
        WHERE file_id = $1::uuid
        ORDER BY created_at DESC
      `,
      [fileId],
    );
    return result.rows.map(mapLinkRow);
  }

  async deleteEntityLink(fileId: string, linkId: string, client: PoolClient) {
    const result = await client.query<LinkRow>(
      `
        DELETE FROM documents.file_entity_links
        WHERE id = $1::uuid
          AND file_id = $2::uuid
        RETURNING *
      `,
      [linkId, fileId],
    );

    return result.rows[0] ? mapLinkRow(result.rows[0]) : null;
  }

  async searchFiles(filters: {
    egiId: string;
    q?: string;
    folderId?: string;
    projectId?: string;
    institutionId?: string;
    fileType?: string;
    confidentialityLevel?: string;
    validationStatus?: string;
    isPublic?: boolean | null;
  }) {
    const result = await this.postgresService.query<FileRow>(
      `
        SELECT
          df.*,
          folder.path AS folder_path,
          institution.name AS institution_name,
          project.title AS project_title
        FROM documents.files df
        LEFT JOIN documents.folders folder ON folder.id = df.folder_id
        LEFT JOIN core.institutions institution ON institution.id = df.institution_id
        LEFT JOIN core.projects project ON project.id = df.project_id
        WHERE df.deleted_at IS NULL
          AND df.egi_id = $1::uuid
          AND ($2::text IS NULL OR (
            LOWER(df.name) LIKE LOWER('%' || $2 || '%')
            OR LOWER(COALESCE(df.title, '')) LIKE LOWER('%' || $2 || '%')
            OR LOWER(COALESCE(df.description, '')) LIKE LOWER('%' || $2 || '%')
          ))
          AND ($3::uuid IS NULL OR df.folder_id = $3::uuid)
          AND ($4::uuid IS NULL OR df.project_id = $4::uuid)
          AND ($5::uuid IS NULL OR df.institution_id = $5::uuid)
          AND ($6::text IS NULL OR df.file_type = $6)
          AND ($7::text IS NULL OR df.confidentiality_level = $7)
          AND ($8::text IS NULL OR df.validation_status = $8)
          AND ($9::boolean IS NULL OR df.is_public = $9)
        ORDER BY df.updated_at DESC
      `,
      [
        filters.egiId,
        filters.q ?? null,
        filters.folderId ?? null,
        filters.projectId ?? null,
        filters.institutionId ?? null,
        filters.fileType ?? null,
        filters.confidentialityLevel ?? null,
        filters.validationStatus ?? null,
        filters.isPublic ?? null,
      ],
    );
    return result.rows.map(mapFileRow);
  }

  async listPublicFiles(query?: string) {
    const result = await this.postgresService.query<FileRow>(
      `
        SELECT
          df.*,
          folder.path AS folder_path,
          institution.name AS institution_name,
          project.title AS project_title
        FROM documents.files df
        LEFT JOIN documents.folders folder ON folder.id = df.folder_id
        LEFT JOIN core.institutions institution ON institution.id = df.institution_id
        LEFT JOIN core.projects project ON project.id = df.project_id
        WHERE df.deleted_at IS NULL
          AND df.is_public = TRUE
          AND ($1::text IS NULL OR (
            LOWER(df.name) LIKE LOWER('%' || $1 || '%')
            OR LOWER(COALESCE(df.title, '')) LIKE LOWER('%' || $1 || '%')
            OR LOWER(COALESCE(df.description, '')) LIKE LOWER('%' || $1 || '%')
          ))
        ORDER BY df.updated_at DESC
      `,
      [query ?? null],
    );
    return result.rows.map(mapFileRow);
  }

  async listAuditForFile(fileId: string) {
    const result = await this.postgresService.query<AuditRow>(
      `
        SELECT *
        FROM documents.file_audit_events
        WHERE file_id = $1::uuid
        ORDER BY created_at DESC
      `,
      [fileId],
    );
    return result.rows.map(mapAuditRow);
  }

  async listAuditForFolder(folderId: string) {
    const result = await this.postgresService.query<AuditRow>(
      `
        SELECT *
        FROM documents.file_audit_events
        WHERE folder_id = $1::uuid
        ORDER BY created_at DESC
      `,
      [folderId],
    );
    return result.rows.map(mapAuditRow);
  }

  async insertAudit(
    input: {
      egiId: string | null;
      fileId: string | null;
      folderId: string | null;
      eventType: string;
      userId: string | null;
      details: Record<string, unknown>;
      ipAddress: string | null;
      userAgent: string | null;
    },
    client?: PoolClient,
  ) {
    const query = `
        INSERT INTO documents.file_audit_events (
          egi_id,
          file_id,
        folder_id,
        event_type,
        user_id,
        details,
        ip_address,
        user_agent
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::jsonb, $7, $8)
    `;
    if (client) {
      await client.query(query, [
        input.egiId,
        input.fileId,
        input.folderId,
        input.eventType,
        input.userId,
        JSON.stringify(input.details ?? {}),
        input.ipAddress,
        input.userAgent,
      ]);
      return;
    }
    await this.postgresService.query(query, [
      input.egiId,
      input.fileId,
      input.folderId,
      input.eventType,
      input.userId,
      JSON.stringify(input.details ?? {}),
      input.ipAddress,
      input.userAgent,
    ]);
  }

  async getFolderScope(id: string) {
    const result = await this.postgresService.query<{
      id: string;
      egi_id: string | null;
      parent_id: string | null;
      institution_id: string | null;
      project_id: string | null;
      created_by: string | null;
      visibility: string;
    }>(
      `
        SELECT id, egi_id, parent_id, institution_id, project_id, created_by, visibility
        FROM documents.folders
        WHERE id = $1::uuid
          AND deleted_at IS NULL
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getFileScope(id: string) {
    const result = await this.postgresService.query<{
      id: string;
      egi_id: string | null;
      folder_id: string | null;
      institution_id: string | null;
      project_id: string | null;
      created_by: string | null;
      is_public: boolean;
      confidentiality_level: string;
    }>(
      `
        SELECT
          id,
          egi_id,
          folder_id,
          institution_id,
          project_id,
          created_by,
          is_public,
          confidentiality_level
        FROM documents.files
        WHERE id = $1::uuid
          AND deleted_at IS NULL
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async countExplicitPermissions(fileId: string | null, folderId: string | null) {
    const result = await this.postgresService.query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM documents.file_permissions
        WHERE ($1::uuid IS NOT NULL AND file_id = $1::uuid)
           OR ($2::uuid IS NOT NULL AND folder_id = $2::uuid)
      `,
      [fileId, folderId],
    );
    return result.rows[0]?.total ?? 0;
  }

  async hasExplicitPermission(input: {
    fileId: string | null;
    folderId: string | null;
    userId: string;
    institutionId: string | null;
    roleIds: string[];
    projectId: string | null;
    permission: string;
  }) {
    const result = await this.postgresService.query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM documents.file_permissions fp
        WHERE (
            ($1::uuid IS NOT NULL AND fp.file_id = $1::uuid)
            OR ($2::uuid IS NOT NULL AND fp.folder_id = $2::uuid)
          )
          AND fp.permission = $3
          AND (
            (fp.subject_type = 'user' AND fp.subject_id = $4::uuid)
            OR (fp.subject_type = 'institution' AND $5::uuid IS NOT NULL AND fp.subject_id = $5::uuid)
            OR (fp.subject_type = 'project' AND $6::uuid IS NOT NULL AND fp.subject_id = $6::uuid)
            OR (fp.subject_type = 'role' AND fp.subject_id::text = ANY($7::text[]))
          )
      `,
      [
        input.fileId,
        input.folderId,
        input.permission,
        input.userId,
        input.institutionId,
        input.projectId,
        input.roleIds,
      ],
    );
    return (result.rows[0]?.total ?? 0) > 0;
  }

  async softDeleteFile(id: string, client: PoolClient) {
    await client.query(
      `
        UPDATE documents.files
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [id],
    );
    await client.query(
      `
        UPDATE documents.file_storage_objects
        SET deleted_at = NOW()
        WHERE file_id = $1::uuid
          AND deleted_at IS NULL
      `,
      [id],
    );
  }
}

function mapFolderRow(row: FolderRow) {
  return {
    id: row.id,
    egiId: row.egi_id,
    parentId: row.parent_id,
    institutionId: row.institution_id,
    projectId: row.project_id,
    name: row.name,
    path: row.path,
    description: row.description,
    visibility: row.visibility,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    childFolderCount: row.child_folder_count ?? 0,
    fileCount: row.file_count ?? 0,
  };
}

function mapFileRow(row: FileRow) {
  return {
    id: row.id,
    egiId: row.egi_id,
    folderId: row.folder_id,
    institutionId: row.institution_id,
    projectId: row.project_id,
    currentVersionId: row.current_version_id,
    name: row.name,
    title: row.title,
    description: row.description,
    fileType: row.file_type,
    mimeType: row.mime_type,
    extension: row.extension,
    sizeBytes: Number(row.size_bytes ?? 0),
    checksumSha256: row.checksum_sha256,
    confidentialityLevel: row.confidentiality_level,
    validationStatus: row.validation_status,
    sourceType: row.source_type,
    isGeospatial: row.is_geospatial,
    isPublic: row.is_public,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    folderPath: row.folder_path ?? null,
    institutionName: row.institution_name ?? null,
    projectTitle: row.project_title ?? null,
  };
}

function mapVersionRow(row: VersionRow) {
  return {
    id: row.id,
    fileId: row.file_id,
    versionNumber: row.version_number,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    checksumSha256: row.checksum_sha256,
    changeNote: row.change_note,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at.toISOString(),
  };
}

function mapMetadataRow(row: MetadataRow) {
  return {
    id: row.id,
    fileId: row.file_id,
    country: row.country,
    department: row.department,
    municipality: row.municipality,
    thematicArea: row.thematic_area,
    documentType: row.document_type,
    dataOwner: row.data_owner,
    technicalCustodian: row.technical_custodian,
    license: row.license,
    retentionPolicy: row.retention_policy,
    spatialReference: row.spatial_reference,
    geometryType: row.geometry_type,
    bbox: row.bbox,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapLinkRow(row: LinkRow) {
  return {
    id: row.id,
    fileId: row.file_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    relationType: row.relation_type,
    createdAt: row.created_at.toISOString(),
  };
}

function mapAuditRow(row: AuditRow) {
  return {
    id: row.id,
    fileId: row.file_id,
    folderId: row.folder_id,
    eventType: row.event_type,
    userId: row.user_id,
    details: row.details ?? {},
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at.toISOString(),
  };
}

function mapStorageObjectRow(row: StorageObjectRow) {
  return {
    id: row.id,
    fileId: row.file_id,
    versionId: row.version_id,
    storageKey: row.storage_key,
    storageProvider: row.storage_provider,
    absolutePath: row.absolute_path,
    existsOnDisk: row.exists_on_disk,
    createdAt: row.created_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}
