import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { PostgresService } from '../../common/db/postgres.service';
import { AuthPrincipal } from '../auth/auth.types';
import { FilesAuditService } from './audit/files-audit.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { LinkFileEntityDto } from './dto/link-file-entity.dto';
import { SearchFilesDto } from './dto/search-files.dto';
import { UpdateFileMetadataDto } from './dto/update-file-metadata.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesRepository } from './files.repository';
import { FilesPermissionsService } from './permissions/files-permissions.service';
import { FilesStorageService } from './storage/files-storage.service';

type UploadedBinary = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

@Injectable()
export class FilesService {
  constructor(
    private readonly postgresService: PostgresService,
    private readonly filesRepository: FilesRepository,
    private readonly filesStorageService: FilesStorageService,
    private readonly filesPermissionsService: FilesPermissionsService,
    private readonly filesAuditService: FilesAuditService,
  ) {}

  async getTree(principal: AuthPrincipal | undefined | null, request: Request) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    await this.filesPermissionsService.resolveUserContext(principal);
    const folders = await this.filesRepository.listFoldersFlat(egiId);
    return {
      folders,
      rootFolders: folders.filter((folder) => folder.parentId === null),
    };
  }

  async getFolderItems(folderId: string | null, principal: AuthPrincipal | undefined | null, request: Request) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    if (folderId) {
      await this.filesPermissionsService.assertFolderAccess(principal, folderId, 'read', egiId);
    } else {
      await this.filesPermissionsService.resolveUserContext(principal);
    }

    const [folder, items, breadcrumb] = await Promise.all([
      folderId ? this.filesRepository.getFolderById(folderId, egiId) : Promise.resolve(null),
      this.filesRepository.listFolderItems(folderId, egiId),
      folderId ? this.filesRepository.getFolderBreadcrumb(folderId, egiId) : Promise.resolve([]),
    ]);

    return {
      folder,
      folders: items.folders,
      files: items.files,
      breadcrumb,
    };
  }

  async createFolder(
    input: CreateFolderDto,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.resolveUserContext(principal);
    const name = this.normalizeFolderName(input.name);
    const parentFolder = input.parentId
      ? await this.filesRepository.getFolderById(input.parentId, egiId)
      : null;

    if (input.parentId && !parentFolder) {
      throw new NotFoundException('Parent folder not found');
    }

    if (parentFolder) {
      await this.filesPermissionsService.assertFolderAccess(principal, parentFolder.id, 'write', egiId);
    }

    const sibling = await this.filesRepository.getFolderByParentAndName(input.parentId ?? null, name, egiId);
    if (sibling) {
      throw new BadRequestException('Ya existe una carpeta con ese nombre en el mismo nivel.');
    }

    const path = buildFolderPath(parentFolder?.path ?? null, name);
    const institutionId = input.institutionId ?? parentFolder?.institutionId ?? actor.institutionId;
    const projectId = input.projectId ?? parentFolder?.projectId ?? null;

    const folder = await this.postgresService.transaction(async (client) => {
      const created = await this.filesRepository.createFolder(
        {
          parentId: input.parentId ?? null,
          egiId,
          institutionId,
          projectId,
          name,
          path,
          description: normalizeOptionalText(input.description),
          visibility: normalizeVisibility(input.visibility),
          createdBy: actor.userId,
        },
        client,
      );

      await this.filesAuditService.record(
        {
          egiId,
          folderId: created.id,
          eventType: 'FOLDER_CREATED',
          userId: actor.userId,
          details: { path: created.path, name: created.name },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );

      return created;
    });

    return folder;
  }

  async updateFolder(
    folderId: string,
    input: UpdateFolderDto,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.assertFolderAccess(principal, folderId, 'write', egiId);
    const current = await this.filesRepository.getFolderById(folderId, egiId);
    if (!current) {
      throw new NotFoundException('Folder not found');
    }

    const nextParent = input.parentId === undefined
      ? current.parentId
      : input.parentId;
    const parentFolder = nextParent
      ? await this.filesRepository.getFolderById(nextParent, egiId)
      : null;
    if (nextParent && !parentFolder) {
      throw new NotFoundException('Target parent folder not found');
    }
    if (parentFolder && parentFolder.id === current.id) {
      throw new BadRequestException('La carpeta no puede moverse sobre sí misma.');
    }

    const nextName = input.name === undefined ? current.name : this.normalizeFolderName(input.name);
    const nextPath = buildFolderPath(parentFolder?.path ?? null, nextName);

    const sibling = await this.filesRepository.getFolderByParentAndName(nextParent ?? null, nextName, egiId);
    if (sibling && sibling.id !== folderId) {
      throw new BadRequestException('Ya existe una carpeta con ese nombre en el destino.');
    }

    const updated = await this.postgresService.transaction(async (client) => {
      const folder = await this.filesRepository.updateFolder(
        folderId,
        {
          parentId: nextParent ?? null,
          institutionId: current.institutionId,
          projectId: current.projectId,
          name: nextName,
          path: nextPath,
          description:
            input.description === undefined
              ? current.description ?? null
              : normalizeOptionalText(input.description),
          visibility:
            input.visibility === undefined
              ? current.visibility
              : normalizeVisibility(input.visibility),
          previousPath: current.path,
        },
        client,
      );

      await this.filesAuditService.record(
        {
          egiId,
          folderId,
          eventType:
            current.parentId !== (nextParent ?? null) ? 'FOLDER_MOVED' : 'FOLDER_RENAMED',
          userId: actor.userId,
          details: {
            previousPath: current.path,
            nextPath,
            previousName: current.name,
            nextName,
          },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );

      return folder;
    });

    if (!updated) {
      throw new NotFoundException('Folder not found after update');
    }

    return updated;
  }

  async deleteFolder(
    folderId: string,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.assertFolderAccess(principal, folderId, 'delete', egiId);
    const current = await this.filesRepository.getFolderById(folderId, egiId);
    if (!current) {
      throw new NotFoundException('Folder not found');
    }

    const dependents = await this.filesRepository.countFolderDependents(folderId);
    if (dependents.child_folders > 0 || dependents.files > 0) {
      throw new BadRequestException(
        'La carpeta no se puede eliminar mientras tenga subcarpetas o archivos activos.',
      );
    }

    await this.postgresService.transaction(async (client) => {
      await this.filesRepository.softDeleteFolder(folderId, client);
      await this.filesAuditService.record(
        {
          egiId,
          folderId,
          eventType: 'FOLDER_DELETED',
          userId: actor.userId,
          details: { path: current.path, name: current.name },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );
    });

    return { id: folderId, deleted: true };
  }

  async uploadFile(
    file: UploadedBinary | undefined,
    input: UploadFileDto,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.resolveUserContext(principal);
    const prepared = this.prepareUpload(file);
    const folder = input.folderId ? await this.filesRepository.getFolderById(input.folderId, egiId) : null;
    if (input.folderId && !folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder) {
      await this.filesPermissionsService.assertFolderAccess(principal, folder.id, 'write', egiId);
    }

    const institutionId = input.institutionId ?? folder?.institutionId ?? actor.institutionId;
    const projectId = input.projectId ?? folder?.projectId ?? null;
    const checksum = this.filesStorageService.computeChecksum(prepared.buffer);

    const createdFileId = await this.postgresService.transaction(async (client) => {
      const createdFile = await this.filesRepository.createFile(
        {
          folderId: folder?.id ?? null,
          egiId,
          institutionId,
          projectId,
          name: prepared.sanitizedName,
          title: normalizeOptionalText(input.title) ?? prepared.sanitizedName,
          description: normalizeOptionalText(input.description),
          fileType: prepared.extension,
          mimeType: prepared.mimeType,
          extension: prepared.extension,
          sizeBytes: prepared.sizeBytes,
          checksumSha256: checksum,
          confidentialityLevel: normalizeOptionalText(input.confidentialityLevel) ?? 'internal',
          validationStatus: normalizeOptionalText(input.validationStatus) ?? 'draft',
          sourceType: normalizeOptionalText(input.sourceType) ?? 'manual',
          isGeospatial: parseBooleanLike(input.isGeospatial) ?? isGeospatialExtension(prepared.extension),
          isPublic: parseBooleanLike(input.isPublic) ?? false,
          createdBy: actor.userId,
        },
        client,
      );

      const versionNumber = 1;
      const storageKey = this.filesStorageService.buildStorageKey(
        createdFile.id,
        versionNumber,
        prepared.sanitizedName,
      );
      const absolutePath = await this.filesStorageService.writeObject(storageKey, prepared.buffer);
      const version = await this.filesRepository.createFileVersion(
        {
          fileId: createdFile.id,
          versionNumber,
          storageKey,
          originalFilename: prepared.originalName,
          mimeType: prepared.mimeType,
          sizeBytes: prepared.sizeBytes,
          checksumSha256: checksum,
          changeNote: normalizeOptionalText(input.changeNote),
          uploadedBy: actor.userId,
        },
        client,
      );
      await this.filesRepository.createStorageObject(
        {
          fileId: createdFile.id,
          versionId: version.id,
          storageKey,
          absolutePath,
        },
        client,
      );
      await this.filesRepository.setCurrentVersion(createdFile.id, version.id, client);
      await this.filesRepository.upsertFileMetadata(
        createdFile.id,
        {
          country: null,
          department: null,
          municipality: null,
          thematicArea: null,
          documentType: null,
          dataOwner: null,
          technicalCustodian: null,
          license: null,
          retentionPolicy: null,
          spatialReference: null,
          geometryType: null,
          bbox: null,
          metadata: {},
        },
        client,
      );
      await this.filesAuditService.record(
        {
          fileId: createdFile.id,
          folderId: folder?.id ?? null,
          eventType: 'FILE_UPLOADED',
          userId: actor.userId,
          details: {
            fileName: prepared.sanitizedName,
            storageKey,
            sizeBytes: prepared.sizeBytes,
          },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );

      return createdFile.id;
    });

    return this.getFile(createdFileId, principal, request);
  }

  async getFile(fileId: string, principal: AuthPrincipal | undefined | null, request: Request) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    await this.filesPermissionsService.assertFileAccess(principal, fileId, 'read', egiId);
    const file = await this.filesRepository.getFileById(fileId, egiId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const [metadata, versions, links] = await Promise.all([
      this.filesRepository.getFileMetadata(fileId),
      this.filesRepository.getFileVersions(fileId),
      this.filesRepository.getFileLinks(fileId),
    ]);

    return {
      ...file,
      metadata,
      versions,
      currentVersion: versions.find((version) => version.id === file.currentVersionId) ?? versions[0] ?? null,
      links,
    };
  }

  async getPublicFile(fileId: string) {
    const canRead = await this.filesPermissionsService.canReadPublicFile(fileId);
    if (!canRead) {
      throw new NotFoundException('Public file not found');
    }

    const file = await this.filesRepository.getFileById(fileId);
    if (!file || !file.isPublic) {
      throw new NotFoundException('Public file not found');
    }

    const [metadata, versions, links] = await Promise.all([
      this.filesRepository.getFileMetadata(fileId),
      this.filesRepository.getFileVersions(fileId),
      this.filesRepository.getFileLinks(fileId),
    ]);

    return {
      ...file,
      metadata,
      versions,
      currentVersion: versions.find((version) => version.id === file.currentVersionId) ?? versions[0] ?? null,
      links,
    };
  }

  async downloadFile(
    fileId: string,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.assertFileAccess(principal, fileId, 'download', egiId);
    const file = await this.filesRepository.getFileById(fileId, egiId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const storageObject = await this.filesRepository.getCurrentStorageObject(fileId);
    if (!storageObject) {
      throw new NotFoundException('Storage object not found');
    }

    await this.filesStorageService.assertObjectExists(storageObject.absolutePath);
    await this.filesAuditService.record({
      egiId,
      fileId,
      folderId: file.folderId ?? null,
      eventType: 'FILE_DOWNLOADED',
      userId: actor.userId,
      details: { storageKey: storageObject.storageKey },
      ipAddress: readIpAddress(request),
      userAgent: request.header('user-agent') ?? null,
    });

    return {
      file,
      stream: this.filesStorageService.createDownloadStream(storageObject.absolutePath),
    };
  }

  async downloadPublicFile(fileId: string) {
    const file = await this.getPublicFile(fileId);
    const storageObject = await this.filesRepository.getCurrentStorageObject(fileId);
    if (!storageObject) {
      throw new NotFoundException('Storage object not found');
    }
    await this.filesStorageService.assertObjectExists(storageObject.absolutePath);
    return {
      file,
      stream: this.filesStorageService.createDownloadStream(storageObject.absolutePath),
    };
  }

  async updateFileMetadata(
    fileId: string,
    input: UpdateFileMetadataDto,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.assertFileAccess(principal, fileId, 'write', egiId);
    const current = await this.filesRepository.getFileById(fileId, egiId);
    if (!current) {
      throw new NotFoundException('File not found');
    }

    const updated = await this.postgresService.transaction(async (client) => {
      await this.filesRepository.updateFileBasics(
        fileId,
        {
          title: input.title === undefined ? current.title ?? null : normalizeOptionalText(input.title),
          description:
            input.description === undefined
              ? current.description ?? null
              : normalizeOptionalText(input.description),
          confidentialityLevel:
            normalizeOptionalText(input.confidentialityLevel) ?? current.confidentialityLevel,
          validationStatus:
            normalizeOptionalText(input.validationStatus) ?? current.validationStatus,
          isPublic: parseBooleanLike(input.isPublic) ?? current.isPublic,
        },
        client,
      );

      const metadata = await this.filesRepository.upsertFileMetadata(
        fileId,
        {
          country: normalizeOptionalText(input.country),
          department: normalizeOptionalText(input.department),
          municipality: normalizeOptionalText(input.municipality),
          thematicArea: normalizeOptionalText(input.thematicArea),
          documentType: normalizeOptionalText(input.documentType),
          dataOwner: normalizeOptionalText(input.dataOwner),
          technicalCustodian: normalizeOptionalText(input.technicalCustodian),
          license: normalizeOptionalText(input.license),
          retentionPolicy: normalizeOptionalText(input.retentionPolicy),
          spatialReference: normalizeOptionalText(input.spatialReference),
          geometryType: normalizeOptionalText(input.geometryType),
          bbox: input.bbox ?? null,
          metadata: input.metadata ?? {},
        },
        client,
      );

      await this.filesAuditService.record(
        {
          egiId,
          fileId,
          folderId: current.folderId ?? null,
          eventType: 'FILE_METADATA_UPDATED',
          userId: actor.userId,
          details: {
            title: input.title ?? current.title ?? null,
            confidentialityLevel:
              normalizeOptionalText(input.confidentialityLevel) ?? current.confidentialityLevel,
          },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );

      return metadata;
    });

    return {
      metadata: updated,
      file: await this.getFile(fileId, principal, request),
    };
  }

  async createVersion(
    fileId: string,
    file: UploadedBinary | undefined,
    input: UploadFileDto,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.assertFileAccess(principal, fileId, 'write', egiId);
    const currentFile = await this.filesRepository.getFileById(fileId, egiId);
    if (!currentFile) {
      throw new NotFoundException('File not found');
    }

    const prepared = this.prepareUpload(file);
    const checksum = this.filesStorageService.computeChecksum(prepared.buffer);

    await this.postgresService.transaction(async (client) => {
      const versionNumber = (await this.filesRepository.getLatestVersionNumber(fileId, client)) + 1;
      const storageKey = this.filesStorageService.buildStorageKey(fileId, versionNumber, prepared.sanitizedName);
      const absolutePath = await this.filesStorageService.writeObject(storageKey, prepared.buffer);
      const version = await this.filesRepository.createFileVersion(
        {
          fileId,
          versionNumber,
          storageKey,
          originalFilename: prepared.originalName,
          mimeType: prepared.mimeType,
          sizeBytes: prepared.sizeBytes,
          checksumSha256: checksum,
          changeNote: normalizeOptionalText(input.changeNote),
          uploadedBy: actor.userId,
        },
        client,
      );
      await this.filesRepository.createStorageObject(
        { fileId, versionId: version.id, storageKey, absolutePath },
        client,
      );
      await this.filesRepository.setCurrentVersion(fileId, version.id, client);
      await this.filesAuditService.record(
        {
          egiId,
          fileId,
          folderId: currentFile.folderId ?? null,
          eventType: 'FILE_VERSION_CREATED',
          userId: actor.userId,
          details: { versionNumber, storageKey, changeNote: input.changeNote ?? null },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );
    });

    return {
      versions: await this.filesRepository.getFileVersions(fileId),
      file: await this.getFile(fileId, principal, request),
    };
  }

  async listVersions(fileId: string, principal: AuthPrincipal | undefined | null, request: Request) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    await this.filesPermissionsService.assertFileAccess(principal, fileId, 'read', egiId);
    return this.filesRepository.getFileVersions(fileId);
  }

  async linkFile(
    fileId: string,
    input: LinkFileEntityDto,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.assertFileAccess(principal, fileId, 'write', egiId);
    const relationType = normalizeOptionalText(input.relationType) ?? 'related';

    const link = await this.postgresService.transaction(async (client) => {
      const created = await this.filesRepository.createEntityLink(
        fileId,
        {
          entityType: normalizeRequiredText(input.entityType, 'entityType'),
          entityId: normalizeRequiredText(input.entityId, 'entityId'),
          relationType,
        },
        client,
      );

      const currentFile = await this.filesRepository.getFileById(fileId, egiId, client);
      await this.filesAuditService.record(
        {
          egiId,
          fileId,
          folderId: currentFile?.folderId ?? null,
          eventType: 'FILE_LINKED',
          userId: actor.userId,
          details: {
            entityType: created.entityType,
            entityId: created.entityId,
            relationType: created.relationType,
          },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );

      return created;
    });

    return link;
  }

  async unlinkFile(
    fileId: string,
    linkId: string,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.assertFileAccess(principal, fileId, 'write', egiId);

    const link = await this.postgresService.transaction(async (client) => {
      const removed = await this.filesRepository.deleteEntityLink(fileId, linkId, client);
      if (!removed) {
        throw new NotFoundException('File link not found');
      }

      const currentFile = await this.filesRepository.getFileById(fileId, egiId, client);
      await this.filesAuditService.record(
        {
          egiId,
          fileId,
          folderId: currentFile?.folderId ?? null,
          eventType: 'FILE_UNLINKED',
          userId: actor.userId,
          details: {
            entityType: removed.entityType,
            entityId: removed.entityId,
            relationType: removed.relationType,
            linkId: removed.id,
          },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );

      return removed;
    });

    return link;
  }

  async searchFiles(query: SearchFilesDto, principal: AuthPrincipal | undefined | null, request: Request) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    await this.filesPermissionsService.resolveUserContext(principal);
    return this.filesRepository.searchFiles({
      egiId,
      q: normalizeOptionalText(query.q) ?? undefined,
      folderId: query.folderId,
      projectId: query.projectId,
      institutionId: query.institutionId,
      fileType: normalizeOptionalText(query.fileType) ?? undefined,
      confidentialityLevel: normalizeOptionalText(query.confidentialityLevel) ?? undefined,
      validationStatus: normalizeOptionalText(query.validationStatus) ?? undefined,
      isPublic: query.isPublic === undefined ? null : parseBooleanLike(query.isPublic),
    });
  }

  async searchPublicFiles(query?: string) {
    return this.filesRepository.listPublicFiles(normalizeOptionalText(query) ?? undefined);
  }

  async getAudit(fileId: string, principal: AuthPrincipal | undefined | null, request: Request) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    await this.filesPermissionsService.assertFileAccess(principal, fileId, 'read', egiId);
    return this.filesRepository.listAuditForFile(fileId);
  }

  async deleteFile(
    fileId: string,
    principal: AuthPrincipal | undefined | null,
    request: Request,
  ) {
    const egiId = await this.getAuthorizedEgiId(principal, request);
    const actor = await this.filesPermissionsService.assertFileAccess(principal, fileId, 'delete', egiId);
    const current = await this.filesRepository.getFileById(fileId, egiId);
    if (!current) {
      throw new NotFoundException('File not found');
    }

    await this.postgresService.transaction(async (client) => {
      await this.filesRepository.softDeleteFile(fileId, client);
      await this.filesAuditService.record(
        {
          fileId,
          folderId: current.folderId ?? null,
          eventType: 'FILE_DELETED',
          userId: actor.userId,
          details: { name: current.name, currentVersionId: current.currentVersionId ?? null },
          ipAddress: readIpAddress(request),
          userAgent: request.header('user-agent') ?? null,
        },
        client,
      );
    });

    return { id: fileId, deleted: true };
  }

  private prepareUpload(file: UploadedBinary | undefined) {
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException('Debes adjuntar un archivo válido.');
    }
    const sanitizedName = this.filesStorageService.sanitizeFileName(file.originalname);
    const sizeBytes = typeof file.size === 'number' ? file.size : file.buffer.byteLength;
    this.filesStorageService.validateUpload(sanitizedName, sizeBytes);

    return {
      buffer: file.buffer,
      originalName: file.originalname,
      sanitizedName,
      sizeBytes,
      mimeType: normalizeOptionalText(file.mimetype) ?? 'application/octet-stream',
      extension: this.filesStorageService.getExtension(sanitizedName),
    };
  }

  private normalizeFolderName(name: string | undefined) {
    const normalized = normalizeRequiredText(name, 'name')
      .replace(/[\\/]+/g, '-')
      .replace(/\.\./g, '')
      .trim();
    if (!normalized) {
      throw new BadRequestException('Nombre de carpeta inválido.');
    }
    return normalized;
  }

  private getRequiredEgiId(request: Request) {
    const egiId = request.header('x-sigi-egi-id')?.trim() ?? '';
    if (!egiId) {
      throw new BadRequestException(
        'Para utilizar esta funcionalidad primero debe crear o seleccionar un Espacio de Gestión de Información.',
      );
    }
    return egiId;
  }

  // V2-05: el EGI del encabezado debe ser uno al que el usuario tiene acceso (antes bastaba con
  // conocer su id para listar el árbol y los archivos raíz de otro EGI).
  private async getAuthorizedEgiId(principal: AuthPrincipal | undefined | null, request: Request) {
    const egiId = this.getRequiredEgiId(request);
    await this.filesPermissionsService.assertEgiAccess(principal, egiId);
    return egiId;
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeRequiredText(value: string | null | undefined, field: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException(`${field} es requerido`);
  }
  return normalized;
}

function normalizeVisibility(value: string | undefined) {
  const normalized = normalizeOptionalText(value) ?? 'internal';
  if (!new Set(['internal', 'public', 'restricted']).has(normalized)) {
    throw new BadRequestException('visibility no es válido');
  }
  return normalized;
}

function parseBooleanLike(value: string | boolean | undefined | null) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return null;
}

function isGeospatialExtension(extension: string) {
  return new Set(['geojson', 'json', 'zip']).has(extension);
}

function buildFolderPath(parentPath: string | null, name: string) {
  return parentPath ? `${parentPath}/${name}` : `/${name}`;
}

function readIpAddress(request: Request) {
  const forwarded = request.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return request.ip ?? null;
}
