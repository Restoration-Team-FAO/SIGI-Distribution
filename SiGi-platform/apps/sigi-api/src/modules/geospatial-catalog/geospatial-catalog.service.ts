import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';
import { getValidatedEnv } from '../../common/config/env';
import { GEO_VISIBILITY_LEVELS, GeoVisibilityValue } from '../../common/geo/geo-visibility';
import { PostgresService } from '../../common/db/postgres.service';
import { requestInternalJson } from '../../common/http/internal-service-client';

const STATIC_PUBLICATIONS: Record<string, StaticPublicationDefinition> = {
  territories: {
    sourceMode: 'managed',
    notes: 'Capa base pública territorial gobernada por SIGI.',
    title: 'Public Territories',
    nativeViewSql: `
      CREATE OR REPLACE VIEW gis.v_public_territories AS
      SELECT
        tf.id,
        gl.code AS layer_code,
        t.code AS territory_code,
        t.name AS territory_name,
        t.level AS territory_level,
        tf.area_ha,
        tf.geometry
      FROM gis.territory_features tf
      INNER JOIN core.territories t ON t.id = tf.territory_id
      INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
      WHERE gl.visibility = 'public'
        AND gl.status = 'published'
        AND gl.code <> 'project_polygons'
        AND gis.project_geometry_is_public(gl.code, tf.territory_id)
    `,
  },
  project_polygons: {
    sourceMode: 'managed',
    notes: 'Polígonos públicos de proyectos publicados desde vistas seguras.',
    title: 'Public Project Polygons',
    nativeViewSql: `
      CREATE OR REPLACE VIEW gis.v_public_project_polygons AS
      SELECT
        tf.id,
        gl.code AS layer_code,
        p.code AS project_code,
        p.title AS project_name,
        pt.territory_code,
        COALESCE(pt.territory_name, t.name) AS territory_name,
        pt.country,
        pt.area_ha,
        tf.geometry
      FROM gis.territory_features tf
      INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
      INNER JOIN core.territories t ON t.id = tf.territory_id
      INNER JOIN core.project_territories pt ON pt.territory_id = t.id
      INNER JOIN core.projects p ON p.id = pt.project_id
      WHERE gl.code = 'project_polygons'
        AND gl.visibility = 'public'
        AND gl.status = 'published'
        AND p.visibility = 'public'
    `,
  },
  project_centroids: {
    sourceMode: 'derived',
    notes: 'Centroides públicos derivados de proyectos para visualización liviana.',
    title: 'Public Project Centroids',
    nativeViewSql: `
      CREATE OR REPLACE VIEW gis.v_public_project_centroids AS
      SELECT
        tf.id,
        gl.code AS layer_code,
        p.code AS project_code,
        p.title AS project_name,
        pt.country,
        pt.area_ha,
        ST_Centroid(tf.geometry)::geometry(Point, 4326) AS geometry
      FROM gis.territory_features tf
      INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
      INNER JOIN core.territories t ON t.id = tf.territory_id
      INNER JOIN core.project_territories pt ON pt.territory_id = t.id
      INNER JOIN core.projects p ON p.id = pt.project_id
      WHERE gl.code = 'project_polygons'
        AND gl.visibility = 'public'
        AND gl.status = 'published'
        AND p.visibility = 'public'
    `,
  },
};

const PROTECTED_LAYER_CODES = new Set([
  'territories',
  'project_polygons',
  'project_centroids',
  'dnea_activity_points',
  'odoo_project_territories',
]);

const SHAPEFILE_IMPORT_MODES = ['project-linked', 'reference-layer'] as const;
type ShapefileImportMode = (typeof SHAPEFILE_IMPORT_MODES)[number];

@Injectable()
export class GeospatialCatalogService {
  constructor(private readonly postgresService: PostgresService) {}

  async getCatalog() {
    const [managedLayersResult, centroidStatsResult, geoserverSnapshot] =
      await Promise.all([
        this.postgresService.query<ManagedLayerRow>(
          `
            SELECT
              gl.id,
              gl.code,
              gl.name,
              gl.layer_type,
              gl.visibility,
              gl.status,
              COUNT(tf.id)::int AS feature_count,
              COALESCE(SUM(tf.area_ha), 0)::numeric AS total_area_ha,
              MAX(tf.updated_at) AS last_updated_at
            FROM gis.geo_layers gl
            LEFT JOIN gis.territory_features tf ON tf.layer_id = gl.id
            GROUP BY gl.id, gl.code, gl.name, gl.layer_type, gl.visibility, gl.status
            ORDER BY gl.visibility ASC, gl.name ASC
          `,
        ),
        this.postgresService.query<DerivedLayerStatsRow>(
          `
            SELECT
              COUNT(*)::int AS feature_count,
              COALESCE(SUM(pt.area_ha), 0)::numeric AS total_area_ha,
              MAX(tf.updated_at) AS last_updated_at
            FROM gis.territory_features tf
            INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
            INNER JOIN core.territories t ON t.id = tf.territory_id
            INNER JOIN core.project_territories pt ON pt.territory_id = t.id
            INNER JOIN core.projects p ON p.id = pt.project_id
            WHERE gl.code = 'project_polygons'
              AND gl.visibility = 'public'
              AND gl.status = 'published'
              AND p.visibility = 'public'
          `,
        ),
        this.getGeoServerCapabilities(),
      ]);

    const publishedByLayerName = new Map(
      geoserverSnapshot.publishedLayers.map((layer) => [layer.name, layer] as const),
    );

    const managedEntries = managedLayersResult.rows.map((row) =>
      mapManagedLayerRow(row, publishedByLayerName, geoserverSnapshot),
    );
    const derivedEntries = [
      mapProjectCentroidsEntry(
        centroidStatsResult.rows[0],
        publishedByLayerName,
        geoserverSnapshot,
      ),
    ];
    const entries = [...managedEntries, ...derivedEntries];
    const workbench = await this.buildWorkbench(geoserverSnapshot, publishedByLayerName);

    return {
      summary: {
        catalogEntries: entries.length,
        managedLayers: managedEntries.length,
        derivedLayers: derivedEntries.length,
        publicLayers: entries.filter((entry) => entry.visibility === 'public').length,
        publishedInGeoServer: entries.filter((entry) => entry.publishedInGeoServer).length,
      },
      geoserver: geoserverSnapshot,
      workbench,
      entries,
    };
  }

  async publishLayer(code: string, actorSubject: string | null) {
    const requestedCode = normalizeLayerCode(code);
    const entry = await this.findEntryByCode(requestedCode);

    if (!entry) {
      throw new NotFoundException('La capa indicada no existe en el catálogo geoespacial.');
    }

    if (!entry.publicationEligible) {
      throw new BadRequestException(
        entry.publicationEligibilityReason ??
          'La capa no es elegible para publicación manual en GeoServer.',
      );
    }

    const publication = resolvePublicationDefinition(entry.code, entry.name);
    await this.publishDefinition(publication);

    await this.recordAudit(actorSubject, 'geospatial_catalog.layer_published', {
      code: entry.code,
      title: entry.title,
      sourceMode: entry.sourceMode,
      visibility: entry.visibility,
      status: entry.status,
      publicationScope: 'layer',
      geoserverLayerName: publication.geoserverLayerName,
      nativeViewName: publication.nativeViewName,
    });

    const refreshedCatalog = await this.getCatalog();
    const refreshedEntry = refreshedCatalog.entries.find(
      (candidate) => candidate.code === entry.code,
    );
    const publishedLayerExists = refreshedCatalog.geoserver.publishedLayers.some(
      (layer) => layer.name === publication.geoserverLayerName,
    );

    return {
      entry: refreshedEntry ?? entry,
      geoserver: refreshedCatalog.geoserver,
      action: publishedLayerExists ? 'republish' : 'publish',
      message:
        'La capa fue publicada en GeoServer usando una vista segura gobernada por SIGI.',
    };
  }

  async publishProjectLayer(projectId: string, actorSubject: string | null) {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      throw new BadRequestException('Debes indicar un proyecto válido.');
    }

    const project = await this.loadProjectPublicationRecord(normalizedProjectId);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado para publicación geoespacial.');
    }
    if (!project.publicationEligible) {
      throw new BadRequestException(
        project.publicationEligibilityReason ??
          'El proyecto no es elegible para publicación geoespacial.',
      );
    }

    const publication = buildProjectPublicationDefinition(project);
    await this.publishDefinition(publication);

    await this.recordAudit(actorSubject, 'geospatial_catalog.project_published', {
      code: project.code,
      title: project.title,
      sourceMode: 'derived',
      visibility: project.visibility,
      status: project.status,
      publicationScope: 'project',
      projectId: project.id,
      geoserverLayerName: publication.geoserverLayerName,
      nativeViewName: publication.nativeViewName,
    });

    const refreshedCatalog = await this.getCatalog();
    const refreshedProject = refreshedCatalog.workbench.projectPublications.find(
      (candidate) => candidate.id === project.id,
    );

    return {
      project: refreshedProject ?? project,
      geoserver: refreshedCatalog.geoserver,
      action: 'publish',
      message:
        'El proyecto fue publicado como capa dedicada en GeoServer desde una vista derivada de SIGI.',
    };
  }

  async exportLayerAsGeoJson(code: string) {
    const normalizedCode = normalizeLayerCode(code);
    const layerResult = await this.postgresService.query<LayerExportRow>(
      `
        SELECT
          gl.code AS layer_code,
          gl.name AS layer_name,
          gl.layer_type,
          gl.visibility,
          gl.status,
          t.code AS territory_code,
          t.name AS territory_name,
          t.level AS territory_level,
          tf.area_ha,
          tf.properties_json,
          ST_AsGeoJSON(tf.geometry)::text AS geometry_json
        FROM gis.territory_features tf
        INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
        INNER JOIN core.territories t ON t.id = tf.territory_id
        WHERE gl.code = $1
        ORDER BY t.name ASC, tf.created_at ASC
      `,
      [normalizedCode],
    );

    if (layerResult.rows.length === 0) {
      throw new NotFoundException('No hay features exportables para la capa solicitada.');
    }

    const firstRow = layerResult.rows[0];
    const featureCollection = {
      type: 'FeatureCollection',
      name: firstRow.layer_code,
      features: layerResult.rows.map((row) => ({
        type: 'Feature',
        geometry: JSON.parse(row.geometry_json),
        properties: {
          layer_code: row.layer_code,
          layer_name: row.layer_name,
          layer_type: row.layer_type,
          visibility: row.visibility,
          status: row.status,
          territory_code: row.territory_code,
          territory_name: row.territory_name,
          territory_level: row.territory_level,
          area_ha: Number(row.area_ha ?? 0),
          ...(row.properties_json ?? {}),
        },
      })),
    };

    return {
      code: firstRow.layer_code,
      fileName: `${firstRow.layer_code}.geojson`,
      featureCount: featureCollection.features.length,
      format: 'geojson',
      featureCollection,
    };
  }

  async importGeoJsonLayer(
    input: {
      fileBuffer?: Buffer;
      fileName?: string | null;
      code?: string;
      name?: string;
      layerType?: string;
      visibility?: string;
      status?: string;
      territoryLevel?: string;
      country?: string;
    },
    actorSubject: string | null,
  ) {
    const buffer = input.fileBuffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Debes adjuntar un archivo GeoJSON válido.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new BadRequestException('El archivo cargado no contiene un GeoJSON válido.');
    }

    const collection = normalizeFeatureCollection(parsed);
    const layerCode = normalizeLayerCode(input.code || stripExtension(input.fileName) || '');
    const layerName = normalizeRequiredText(input.name, 'name');
    const visibility = normalizeVisibility(input.visibility);
    const status = normalizeLayerStatus(input.status);
    const layerType = normalizeOptionalText(input.layerType) ?? 'polygon';
    const territoryLevel = normalizeOptionalText(input.territoryLevel) ?? 'custom';
    const features = collection.features.map((feature, index) =>
      normalizeImportedFeature(feature, layerCode, territoryLevel, index),
    );

    if (features.length === 0) {
      throw new BadRequestException('El GeoJSON no contiene features importables.');
    }

    const result = await this.postgresService.transaction(async (client) => {
      const layerId = await upsertLayer(client, {
        code: layerCode,
        name: layerName,
        layerType,
        visibility,
        status,
      });

      await client.query(`DELETE FROM gis.territory_features WHERE layer_id = $1::uuid`, [
        layerId,
      ]);

      for (const feature of features) {
        const territoryId = await upsertTerritory(client, {
          code: feature.territoryCode,
          name: feature.territoryName,
          level: feature.territoryLevel,
        });
        const areaHa = await computeAreaHa(client, feature.geometryText);

        await client.query(
          `
            INSERT INTO gis.territory_features (
              territory_id,
              layer_id,
              area_ha,
              geometry,
              properties_json
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3,
              ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)),
              $5::jsonb
            )
          `,
          [
            territoryId,
            layerId,
            areaHa,
            feature.geometryText,
            JSON.stringify(feature.properties),
          ],
        );
      }

      return {
        layerId,
        importedFeatures: features.length,
      };
    });

    await this.recordAudit(actorSubject, 'geospatial_catalog.layer_imported', {
      code: layerCode,
      title: layerName,
      sourceMode: 'managed',
      visibility,
      status,
      publicationScope: 'layer',
      importedFeatures: result.importedFeatures,
      fileName: input.fileName ?? `${layerCode}.geojson`,
      format: 'geojson',
    });

    const catalog = await this.getCatalog();
    const entry = catalog.entries.find((candidate) => candidate.code === layerCode);

    return {
      entry: entry ?? null,
      importedFeatures: result.importedFeatures,
      message:
        'La capa GeoJSON fue importada a PostGIS y registrada en el catálogo geoespacial de SIGI.',
    };
  }

  async previewShapefileImport(input: {
    fileBuffer?: Buffer;
    fileName?: string | null;
    mappingJson?: string | null;
    country?: string | null;
    importMode?: string | null;
  }) {
    return this.requestGisShapefilePreview({
      ...input,
      importMode: normalizeShapefileImportMode(input.importMode),
    });
  }

  async importShapefileLayer(
    input: {
      fileBuffer?: Buffer;
      fileName?: string | null;
      code?: string;
      name?: string;
      layerType?: string;
      visibility?: string;
      status?: string;
      mappingJson?: string | null;
      country?: string | null;
      importMode?: string | null;
    },
    actorSubject: string | null,
  ) {
    const layerCode = normalizeLayerCode(input.code || stripExtension(input.fileName) || '');
    const layerName = normalizeRequiredText(input.name, 'name');
    const visibility = normalizeVisibility(input.visibility);
    const status = normalizeLayerStatus(input.status);
    const layerType = normalizeOptionalText(input.layerType) ?? 'polygon';
    const importMode = normalizeShapefileImportMode(input.importMode);

    const transformed = await this.requestGisShapefileTransform({
      ...input,
      importMode,
    });
    const validationIssues = Array.isArray(transformed.validationIssues)
      ? transformed.validationIssues
      : [];
    const blockingIssues = validationIssues.filter((issue) => issue?.severity === 'error');
    if (blockingIssues.length > 0) {
      throw new BadRequestException(
        `El shapefile contiene ${blockingIssues.length} hallazgo(s) bloqueante(s). Corrige validaciones semánticas y geográficas antes de importar.`,
      );
    }
    const rows = Array.isArray(transformed.rows) ? transformed.rows : [];
    if (rows.length === 0) {
      throw new BadRequestException('El shapefile no produjo filas válidas para importación.');
    }

    const result = await this.postgresService.transaction(async (client) => {
      const layerId = await upsertLayer(client, {
        code: layerCode,
        name: layerName,
        layerType,
        visibility,
        status,
      });

      await client.query(`DELETE FROM gis.territory_features WHERE layer_id = $1::uuid`, [
        layerId,
      ]);

      for (const row of rows) {
        const territoryId = await upsertTerritory(client, {
          code: sanitizeLayerCode(String(row.territory_code || `${layerCode}_row_${row.rowNumber}`)),
          name: String(row.territory_name || row.territory_code || `Feature ${row.rowNumber}`),
          level: String(row.territory_level || 'parcel'),
        });

        await client.query(
          `
            INSERT INTO gis.territory_features (
              territory_id,
              layer_id,
              area_ha,
              geometry,
              properties_json
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3,
              ST_Multi(ST_SetSRID(ST_GeomFromText($4), 4326)),
              $5::jsonb
            )
          `,
          [
            territoryId,
            layerId,
            Number(row.area_ha ?? 0),
            String(row.geometry_wkt || ''),
            JSON.stringify({
              project_code: row.project_code ?? '',
              country: row.country ?? '',
              source_crs: row.source_crs ?? '',
              ...(row.raw_properties ?? {}),
            }),
          ],
        );
      }

      return {
        layerId,
        importedFeatures: rows.length,
      };
    });

    await this.recordAudit(actorSubject, 'geospatial_catalog.shapefile_imported', {
      code: layerCode,
      title: layerName,
      sourceMode: 'managed',
      visibility,
      status,
      publicationScope: 'layer',
      importedFeatures: result.importedFeatures,
      fileName: input.fileName ?? `${layerCode}.zip`,
      format: 'shapefile',
      importMode,
      bbox: transformed.bbox ?? null,
      countries: transformed.countries ?? [],
      territoryLevels: transformed.territoryLevels ?? [],
      geographicSummary: transformed.geographicSummary ?? null,
    });

    const catalog = await this.getCatalog();
    const entry = catalog.entries.find((candidate) => candidate.code === layerCode);

    return {
      entry: entry ?? null,
      importedFeatures: result.importedFeatures,
      preview: {
        geometryType: transformed.geometryType ?? 'Unknown',
        crs: transformed.crs ?? 'Unknown',
        validationSummary: transformed.validationSummary ?? null,
      },
      message:
        'El shapefile fue transformado por GIS Service, cargado en PostGIS y registrado en el catálogo geoespacial.',
    };
  }

  async promoteLatestKoboSyncToLayer(
    input: {
      sourceId?: string;
      code?: string;
      name?: string;
      visibility?: string;
      status?: string;
    },
    actorSubject: string | null,
  ) {
    const sourceId = normalizeRequiredText(input.sourceId, 'sourceId');
    const source = await this.loadKoboSource(sourceId);
    const latestJob = await this.loadLatestKoboRawPayloadJob(sourceId, source.connectorId);

    if (!latestJob) {
      throw new NotFoundException(
        'La fuente Kobo no tiene raw payloads sincronizados. Ejecuta un sync real o carga un payload controlado antes de promover.',
      );
    }

    const pages = await this.loadKoboRawPayloadPages(latestJob.syncJobId, sourceId);
    const records = pages.flatMap((page) => extractKoboRecords(page.payload));
    const features = records
      .map((record, index) =>
        mapKoboRecordToPromotableFeature(record, {
          index,
          layerCodeSeed: source.code,
          sourceId,
          connectorId: source.connectorId,
          syncJobId: latestJob.syncJobId,
          assetUid: latestJob.assetUid,
        }),
      )
      .filter((feature): feature is KoboPromotableFeature => feature !== null);

    if (features.length === 0) {
      throw new BadRequestException(
        'Los payloads Kobo recuperados no contienen geopuntos válidos para promoción.',
      );
    }

    const layerCode = sanitizeLayerCode(input.code?.trim() || `kobo_${source.code}_points`);
    const layerName =
      normalizeOptionalText(input.name) ?? `Kobo ${source.name} Points`;
    const visibility = normalizeVisibility(input.visibility);
    const status = normalizeLayerStatus(input.status);

    const result = await this.postgresService.transaction(async (client) => {
      const layerId = await upsertLayer(client, {
        code: layerCode,
        name: layerName,
        layerType: 'point',
        visibility,
        status,
      });

      await client.query(`DELETE FROM gis.territory_features WHERE layer_id = $1::uuid`, [
        layerId,
      ]);

      for (const feature of features) {
        const territoryId = await upsertTerritory(client, {
          code: feature.territoryCode,
          name: feature.territoryName,
          level: 'site',
        });

        await client.query(
          `
            INSERT INTO gis.territory_features (
              territory_id,
              layer_id,
              area_ha,
              geometry,
              properties_json
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3,
              ST_SetSRID(ST_MakePoint($4, $5), 4326),
              $6::jsonb
            )
          `,
          [
            territoryId,
            layerId,
            feature.areaHa,
            feature.longitude,
            feature.latitude,
            JSON.stringify(feature.properties),
          ],
        );
      }

      return {
        layerId,
        promotedFeatures: features.length,
      };
    });

    await this.recordAudit(actorSubject, 'geospatial_catalog.kobo_promoted', {
      code: layerCode,
      title: layerName,
      sourceMode: 'managed',
      visibility,
      status,
      sourceId,
      connectorId: source.connectorId,
      syncJobId: latestJob.syncJobId,
      assetUid: latestJob.assetUid,
      rawPages: pages.length,
      extractedRecords: records.length,
      promotedFeatures: result.promotedFeatures,
      publicationScope: 'layer',
      format: 'kobo-json',
    });

    const catalog = await this.getCatalog();
    const entry = catalog.entries.find((candidate) => candidate.code === layerCode);

    return {
      entry: entry ?? null,
      source: {
        id: source.id,
        code: source.code,
        name: source.name,
      },
      syncJobId: latestJob.syncJobId,
      assetUid: latestJob.assetUid,
      rawPages: pages.length,
      extractedRecords: records.length,
      promotedFeatures: result.promotedFeatures,
      discardedRecords: Math.max(records.length - result.promotedFeatures, 0),
      message:
        'Los submissions Kobo fueron transformados a una capa de puntos SIGI y cargados en PostGIS.',
    };
  }

  async buildKoboDemoAnalysisLayer(
    input: {
      sourceLayerCode?: string;
      pasturesLayerCode?: string;
      protectedAreasLayerCode?: string;
      territoriesLayerCode?: string;
      code?: string;
      name?: string;
      visibility?: string;
      status?: string;
    },
    actorSubject: string | null,
    options?: {
      allowLegacyDemoRoute?: boolean;
    },
  ) {
    const env = getValidatedEnv();
    if (env.appEnv === 'production' && options?.allowLegacyDemoRoute) {
      throw new BadRequestException(
        'La ruta legado build-demo-analysis está deshabilitada en producción. Usa kobo/build-analysis.',
      );
    }

    const sourceLayerCode = normalizeLayerCode(input.sourceLayerCode || 'kobo_dnea_demo_points');
    const pasturesLayerCode = normalizeLayerCode(input.pasturesLayerCode || 'pastos_ref');
    const protectedAreasLayerCode = normalizeLayerCode(
      input.protectedAreasLayerCode || 'areas_protegidas_ref',
    );
    const territoriesLayerCode = normalizeLayerCode(input.territoriesLayerCode || 'territories');
    const layerCode = normalizeLayerCode(input.code || `${sourceLayerCode}_analysis`);
    const layerName = normalizeRequiredText(input.name || 'Kobo DNEA Demo Analysis', 'name');
    const visibility = normalizeVisibility(input.visibility);
    const status = normalizeLayerStatus(input.status || 'published');

    const result = await this.postgresService.transaction(async (client) => {
      const layerLookup = await client.query<{ id: string; code: string }>(
        `
          SELECT id, code
          FROM gis.geo_layers
          WHERE code = ANY($1::text[])
        `,
        [[sourceLayerCode, pasturesLayerCode, protectedAreasLayerCode, territoriesLayerCode]],
      );

      const layerIds = new Map(layerLookup.rows.map((row) => [row.code, row.id] as const));
      const sourceLayerId = layerIds.get(sourceLayerCode);
      const pasturesLayerId = layerIds.get(pasturesLayerCode);
      const protectedAreasLayerId = layerIds.get(protectedAreasLayerCode);
      const territoriesLayerId = layerIds.get(territoriesLayerCode);

      if (!sourceLayerId) {
        throw new NotFoundException(`La capa fuente ${sourceLayerCode} no existe.`);
      }
      if (!pasturesLayerId) {
        throw new NotFoundException(`La capa de pastos ${pasturesLayerCode} no existe.`);
      }
      if (!protectedAreasLayerId) {
        throw new NotFoundException(
          `La capa de áreas protegidas ${protectedAreasLayerCode} no existe.`,
        );
      }
      if (!territoriesLayerId) {
        throw new NotFoundException(`La capa territorial ${territoriesLayerCode} no existe.`);
      }

      const layerId = await upsertLayer(client, {
        code: layerCode,
        name: layerName,
        layerType: 'point',
        visibility,
        status,
      });

      await client.query(`DELETE FROM gis.territory_features WHERE layer_id = $1::uuid`, [layerId]);

      const insertResult = await client.query<{
        intersects_pasto: boolean;
        intersects_protected_area: boolean;
      }>(
        `
          WITH source AS (
            SELECT
              tf.id AS source_feature_id,
              tf.territory_id,
              tf.area_ha,
              tf.geometry,
              tf.properties_json
            FROM gis.territory_features tf
            WHERE tf.layer_id = $1::uuid
          ),
          pastos AS (
            SELECT
              s.source_feature_id,
              COUNT(DISTINCT pf.id)::int AS pasto_hits
            FROM source s
            LEFT JOIN gis.territory_features pf
              ON pf.layer_id = $2::uuid
             AND ST_Intersects(s.geometry, pf.geometry)
            GROUP BY s.source_feature_id
          ),
          protected_areas AS (
            SELECT
              s.source_feature_id,
              COUNT(DISTINCT af.id)::int AS protected_hits
            FROM source s
            LEFT JOIN gis.territory_features af
              ON af.layer_id = $3::uuid
             AND ST_Intersects(s.geometry, af.geometry)
            GROUP BY s.source_feature_id
          ),
          admin AS (
            SELECT
              s.source_feature_id,
              MAX(CASE WHEN t.level = 'country' THEN t.name END) AS country_name,
              MAX(CASE WHEN t.level = 'province' THEN t.name END) AS province_name,
              MAX(CASE WHEN t.level = 'region' THEN t.name END) AS region_name
            FROM source s
            LEFT JOIN gis.territory_features tf_admin
              ON tf_admin.layer_id = $4::uuid
             AND ST_Intersects(s.geometry, tf_admin.geometry)
            LEFT JOIN core.territories t ON t.id = tf_admin.territory_id
            GROUP BY s.source_feature_id
          )
          INSERT INTO gis.territory_features (
            territory_id,
            layer_id,
            area_ha,
            geometry,
            properties_json
          )
          SELECT
            s.territory_id,
            $5::uuid,
            s.area_ha,
            s.geometry,
            COALESCE(s.properties_json, '{}'::jsonb)
              || jsonb_build_object(
                'analysisSourceLayer', $6::text,
                'analysisPasturesLayer', $7::text,
                'analysisProtectedAreasLayer', $8::text,
                'analysisTerritoriesLayer', $9::text,
                'intersectsPasto', COALESCE(p.pasto_hits, 0) > 0,
                'pastoOverlapCount', COALESCE(p.pasto_hits, 0),
                'intersectsProtectedArea', COALESCE(pa.protected_hits, 0) > 0,
                'protectedAreaOverlapCount', COALESCE(pa.protected_hits, 0),
                'adminCountry', COALESCE(a.country_name, ''),
                'adminProvince', COALESCE(a.province_name, ''),
                'adminRegion', COALESCE(a.region_name, ''),
                'insideCostaRica', a.country_name IS NOT NULL,
                'analysisGeneratedAt', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              )
          FROM source s
          LEFT JOIN pastos p ON p.source_feature_id = s.source_feature_id
          LEFT JOIN protected_areas pa ON pa.source_feature_id = s.source_feature_id
          LEFT JOIN admin a ON a.source_feature_id = s.source_feature_id
          RETURNING
            COALESCE((properties_json ->> 'intersectsPasto')::boolean, false) AS intersects_pasto,
            COALESCE((properties_json ->> 'intersectsProtectedArea')::boolean, false) AS intersects_protected_area
        `,
        [
          sourceLayerId,
          pasturesLayerId,
          protectedAreasLayerId,
          territoriesLayerId,
          layerId,
          sourceLayerCode,
          pasturesLayerCode,
          protectedAreasLayerCode,
          territoriesLayerCode,
        ],
      );

      return {
        featureCount: insertResult.rowCount,
        intersectingFeatures: insertResult.rows.filter((row) => row.intersects_pasto).length,
        protectedAreaIntersections: insertResult.rows.filter(
          (row) => row.intersects_protected_area,
        ).length,
      };
    });

    await this.recordAudit(actorSubject, 'geospatial_catalog.kobo_analysis_built', {
      code: layerCode,
      title: layerName,
      sourceLayerCode,
      pasturesLayerCode,
      protectedAreasLayerCode,
      territoriesLayerCode,
      visibility,
      status,
      publicationScope: 'layer',
      featureCount: result.featureCount,
      intersectingFeatures: result.intersectingFeatures,
      protectedAreaIntersections: result.protectedAreaIntersections,
    });

    const catalog = await this.getCatalog();
    const entry = catalog.entries.find((candidate) => candidate.code === layerCode) ?? null;

    return {
      entry,
      sourceLayerCode,
      pasturesLayerCode,
      protectedAreasLayerCode,
      territoriesLayerCode,
      featureCount: result.featureCount,
      intersectingFeatures: result.intersectingFeatures,
      protectedAreaIntersections: result.protectedAreaIntersections,
      message:
        'Se generó una capa analítica derivada del lote Kobo con intersección de pastos, áreas protegidas y validación territorial básica.',
    };
  }

  async deleteLayer(code: string, actorSubject: string | null) {
    const normalizedCode = normalizeLayerCode(code);
    if (PROTECTED_LAYER_CODES.has(normalizedCode)) {
      throw new BadRequestException(
        'La capa seleccionada es gobernada por SIGI y no puede eliminarse desde esta operación.',
      );
    }

    const entry = await this.findEntryByCode(normalizedCode);
    if (!entry) {
      throw new NotFoundException('La capa indicada no existe en el catálogo geoespacial.');
    }
    if (entry.publishedInGeoServer) {
      throw new BadRequestException(
        'Primero despublica o reemplaza la capa en GeoServer antes de eliminarla del catálogo.',
      );
    }

    const result = await this.postgresService.transaction(async (client) => {
      const layer = await client.query<{ id: string }>(
        `SELECT id FROM gis.geo_layers WHERE code = $1 LIMIT 1`,
        [normalizedCode],
      );
      const layerId = layer.rows[0]?.id;
      if (!layerId) {
        throw new NotFoundException('La capa indicada ya no existe en base de datos.');
      }

      const deletedFeatures = await client.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM gis.territory_features WHERE layer_id = $1::uuid`,
        [layerId],
      );
      await client.query(`DELETE FROM gis.territory_features WHERE layer_id = $1::uuid`, [
        layerId,
      ]);
      await client.query(`DELETE FROM gis.geo_layers WHERE id = $1::uuid`, [layerId]);
      await client.query(`DROP VIEW IF EXISTS ${entry.nativeViewName}`, []);

      return {
        deletedFeatures: Number(deletedFeatures.rows[0]?.total ?? '0'),
      };
    });

    await this.recordAudit(actorSubject, 'geospatial_catalog.layer_deleted', {
      code: entry.code,
      title: entry.title,
      sourceMode: entry.sourceMode,
      visibility: entry.visibility,
      status: entry.status,
      publicationScope: 'layer',
      deletedFeatures: result.deletedFeatures,
    });

    return {
      code: entry.code,
      deleted: true,
      deletedFeatures: result.deletedFeatures,
      message: 'La capa importada fue eliminada del catálogo y de PostGIS.',
    };
  }

  private async findEntryByCode(code: string) {
    const catalog = await this.getCatalog();
    return catalog.entries.find((entry) => entry.code === code) ?? null;
  }

  private async buildWorkbench(
    geoserverSnapshot: GeoServerSnapshot,
    publishedByLayerName: Map<string, PublishedLayer>,
  ) {
    const env = getValidatedEnv();
    const databaseUrl = new URL(env.databaseUrl);
    const projectCandidates = await this.postgresService.query<ProjectPublicationRow>(
      `
        SELECT
          p.id,
          p.code,
          p.title,
          p.visibility,
          p.status,
          EXISTS (
            SELECT 1
            FROM core.project_territories pt
            INNER JOIN core.territories t ON t.id = pt.territory_id
            INNER JOIN gis.territory_features tf ON tf.territory_id = t.id
            INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
            WHERE pt.project_id = p.id
              AND gl.code = 'project_polygons'
          ) AS has_polygon
        FROM core.projects p
        ORDER BY p.updated_at DESC, p.title ASC
        LIMIT 8
      `,
    );

    return {
      connectors: {
        postgis: {
          host: databaseUrl.hostname,
          port: databaseUrl.port || '5432',
          database: databaseUrl.pathname.replace(/^\//, ''),
          schema: 'gis',
          user: decodeURIComponent(databaseUrl.username || 'sigi_user'),
          connectionName: 'SIGI PostGIS',
          qgisUriSample: `dbname='${databaseUrl.pathname.replace(/^\//, '')}' host='${databaseUrl.hostname}' port='${databaseUrl.port || '5432'}' user='${decodeURIComponent(databaseUrl.username || 'sigi_user')}' sslmode=disable`,
          sampleLayers: [
            'gis.v_public_territories',
            'gis.v_public_project_polygons',
            'gis.v_public_project_centroids',
          ],
        },
        geoserver: {
          workspace: geoserverSnapshot.workspace,
          datastore: env.geoserverDatastore,
          wmsUrl: geoserverSnapshot.wmsUrl,
          wfsUrl: geoserverSnapshot.wfsUrl,
          capabilitiesUrl: geoserverSnapshot.capabilitiesUrl,
        },
      },
      imports: {
        supportedFormats: ['geojson'],
        geometrySupport: 'Polygon y MultiPolygon',
        notes:
          'Fase 1 limitada a GeoJSON poligonal para mantener compatibilidad con el modelo actual de territorio_features.',
      },
      exports: {
        supportedFormats: ['geojson', 'wms', 'wfs', 'sql-view'],
        notes:
          'Cada capa puede descargarse como GeoJSON o consumirse por endpoints OGC / vistas PostGIS.',
      },
      projectPublications: projectCandidates.rows.map((row) =>
        mapProjectPublicationRow(row, publishedByLayerName),
      ),
    };
  }

  private async loadProjectPublicationRecord(projectId: string) {
    const result = await this.postgresService.query<ProjectPublicationRow>(
      `
        SELECT
          p.id,
          p.code,
          p.title,
          p.visibility,
          p.status,
          EXISTS (
            SELECT 1
            FROM core.project_territories pt
            INNER JOIN core.territories t ON t.id = pt.territory_id
            INNER JOIN gis.territory_features tf ON tf.territory_id = t.id
            INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
            WHERE pt.project_id = p.id
              AND gl.code = 'project_polygons'
          ) AS has_polygon
        FROM core.projects p
        WHERE p.id = $1::uuid
        LIMIT 1
      `,
      [projectId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const geoserverSnapshot = await this.getGeoServerCapabilities();
    const publishedByLayerName = new Map(
      geoserverSnapshot.publishedLayers.map((layer) => [layer.name, layer] as const),
    );
    return mapProjectPublicationRow(row, publishedByLayerName);
  }

  private async publishDefinition(definition: PublicationDefinition) {
    await this.postgresService.query(definition.nativeViewSql);

    const env = getValidatedEnv();
    await this.ensureGeoServerWorkspaceAndDatastore(env);

    const featureTypeStatus = await this.requestGeoServerStatus(
      new URL(
        `/geoserver/rest/workspaces/${env.geoserverWorkspace}/datastores/${env.geoserverDatastore}/featuretypes/${definition.featureName}.xml`,
        env.geoserverInternalUrl,
      ),
    );

    if (featureTypeStatus === 200) {
      await this.requestGeoServer(
        new URL(
          `/geoserver/rest/workspaces/${env.geoserverWorkspace}/datastores/${env.geoserverDatastore}/featuretypes/${definition.featureName}`,
          env.geoserverInternalUrl,
        ),
        'PUT',
        `
          <featureType>
            <title>${escapeXml(definition.title)}</title>
            <nativeName>${escapeXml(definition.viewName)}</nativeName>
            <srs>EPSG:4326</srs>
          </featureType>
        `,
      );
      return 'republish';
    }

    await this.requestGeoServer(
      new URL(
        `/geoserver/rest/workspaces/${env.geoserverWorkspace}/datastores/${env.geoserverDatastore}/featuretypes`,
        env.geoserverInternalUrl,
      ),
      'POST',
      `
        <featureType>
          <name>${escapeXml(definition.featureName)}</name>
          <nativeName>${escapeXml(definition.viewName)}</nativeName>
          <title>${escapeXml(definition.title)}</title>
          <srs>EPSG:4326</srs>
        </featureType>
      `,
    );
    return 'publish';
  }

  private async getGeoServerCapabilities() {
    const env = getValidatedEnv();
    const endpoint = new URL(
      '/geoserver/ows?service=WMS&version=1.1.1&request=GetCapabilities',
      env.geoserverInternalUrl,
    );
    const xml = await requestText(endpoint, 8000);
    const layers = Array.from(
      xml.matchAll(
        /<Layer\b[\s\S]*?<Name>\s*([^<]+)\s*<\/Name>[\s\S]*?<Title>\s*([^<]+)\s*<\/Title>/gi,
      ),
    )
      .map((match) => ({
        name: match[1]?.trim() ?? '',
        title: match[2]?.trim() ?? '',
      }))
      .filter((layer) => layer.name.includes(':'))
      .filter(
        (layer, index, collection) =>
          collection.findIndex((item) => item.name === layer.name) === index,
      )
      .map((layer) => ({
        ...layer,
        workspace: layer.name.split(':')[0],
      }));

    return {
      workspace: env.geoserverWorkspace,
      wmsUrl: `${env.geoserverInternalUrl.replace(/\/$/, '')}/wms`,
      wfsUrl: `${env.geoserverInternalUrl.replace(/\/$/, '')}/ows`,
      capabilitiesUrl: endpoint.toString(),
      publishedLayers: layers,
    };
  }

  private async ensureGeoServerWorkspaceAndDatastore(env: ReturnType<typeof getValidatedEnv>) {
    const workspaceUrl = new URL(
      `/geoserver/rest/workspaces/${env.geoserverWorkspace}.xml`,
      env.geoserverInternalUrl,
    );
    const workspaceStatus = await this.requestGeoServerStatus(workspaceUrl);
    if (workspaceStatus !== 200) {
      throw new ServiceUnavailableException(
        `GeoServer workspace ${env.geoserverWorkspace} no está disponible.`,
      );
    }

    const datastoreUrl = new URL(
      `/geoserver/rest/workspaces/${env.geoserverWorkspace}/datastores/${env.geoserverDatastore}.xml`,
      env.geoserverInternalUrl,
    );
    const datastoreStatus = await this.requestGeoServerStatus(datastoreUrl);
    if (datastoreStatus !== 200) {
      throw new ServiceUnavailableException(
        `GeoServer datastore ${env.geoserverDatastore} no está disponible.`,
      );
    }
  }

  private async requestGeoServerStatus(endpoint: URL) {
    const env = getValidatedEnv();
    return new Promise<number>((resolve, reject) => {
      const transport = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = transport(
        endpoint,
        {
          method: 'GET',
          timeout: 8000,
          headers: {
            Authorization: buildBasicAuth(
              env.geoserverAdminUser,
              env.geoserverAdminPassword,
            ),
            Accept: 'application/xml',
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 500));
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error('GeoServer status request timed out'));
      });
      req.on('error', (error) => {
        reject(
          new ServiceUnavailableException(
            `GeoServer status request failed: ${error.message}`,
          ),
        );
      });
      req.end();
    });
  }

  private async requestGeoServer(endpoint: URL, method: 'POST' | 'PUT', body: string) {
    const env = getValidatedEnv();
    return new Promise<void>((resolve, reject) => {
      const transport = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
      const payload = body.trim();
      const req = transport(
        endpoint,
        {
          method,
          timeout: 12000,
          headers: {
            Authorization: buildBasicAuth(
              env.geoserverAdminUser,
              env.geoserverAdminPassword,
            ),
            Accept: 'application/xml',
            'Content-Type': 'text/xml',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let rawResponse = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            rawResponse += chunk;
          });
          res.on('end', () => {
            const statusCode = res.statusCode ?? 500;
            if (statusCode >= 400) {
              reject(
                new ServiceUnavailableException(
                  `GeoServer REST ${method} failed with ${statusCode}: ${rawResponse || 'no body'}`,
                ),
              );
              return;
            }
            resolve();
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error('GeoServer publish request timed out'));
      });
      req.on('error', (error) => {
        reject(
          new ServiceUnavailableException(
            `GeoServer publish request failed: ${error.message}`,
          ),
        );
      });

      req.write(payload);
      req.end();
    });
  }

  private async recordAudit(
    actorSubject: string | null,
    action: string,
    details: Record<string, unknown>,
  ) {
    const actorUserId = await this.resolveActorUserId(actorSubject);
    await this.postgresService.query(
      `
        INSERT INTO core.audit_events (
          actor_user_id,
          action,
          entity_type,
          entity_id,
          source,
          result,
          details_json
        )
        VALUES ($1, $2, $3, NULL, $4, $5, $6::jsonb)
      `,
      [
        actorUserId,
        action,
        'geo_layer_publication',
        'api',
        'success',
        JSON.stringify(details),
      ],
    );
  }

  private async resolveActorUserId(actorSubject: string | null) {
    if (!actorSubject?.trim()) {
      return null;
    }

    const byEmail = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.users
        WHERE email = $1
        LIMIT 1
      `,
      [actorSubject.trim()],
    );
    if (byEmail.rows[0]?.id) {
      return byEmail.rows[0].id;
    }

    const byId = await this.postgresService.query<{ id: string }>(
      `
        SELECT id
        FROM core.users
        WHERE id::text = $1
        LIMIT 1
      `,
      [actorSubject.trim()],
    );
    return byId.rows[0]?.id ?? null;
  }

  private async requestGisShapefilePreview(input: {
    fileBuffer?: Buffer;
    fileName?: string | null;
    mappingJson?: string | null;
    country?: string | null;
    importMode?: ShapefileImportMode;
  }) {
    return this.requestGisShapefile('/shapefile/preview', input);
  }

  private async requestGisShapefileTransform(input: {
    fileBuffer?: Buffer;
    fileName?: string | null;
    mappingJson?: string | null;
    country?: string | null;
    importMode?: ShapefileImportMode;
  }) {
    return this.requestGisShapefile('/shapefile/transform', input);
  }

  private async requestGisShapefile(
    path: string,
    input: {
      fileBuffer?: Buffer;
      fileName?: string | null;
      mappingJson?: string | null;
      country?: string | null;
      importMode?: ShapefileImportMode;
    },
  ) {
    const fileBuffer = input.fileBuffer;
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Debes adjuntar un shapefile comprimido válido.');
    }

    const boundary = `----sigi-${Date.now().toString(16)}`;
    const body = buildMultipartBody({
      boundary,
      fileFieldName: 'file',
      fileName: input.fileName ?? 'shapefile.zip',
      fileBuffer,
      contentType: 'application/zip',
      fields: {
        ...(input.mappingJson?.trim() ? { mappingJson: input.mappingJson.trim() } : {}),
        ...(input.country?.trim() ? { country: input.country.trim() } : {}),
        ...(input.importMode ? { importMode: input.importMode } : {}),
      },
    });

    return requestInternalJson<ShapefileTransformResponse>({
      serviceName: 'gis-service',
      baseUrl: getValidatedEnv().gisServiceUrl,
      path,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      timeoutMs: getValidatedEnv().gisServiceTimeoutMs,
    });
  }

  private async loadKoboSource(sourceId: string) {
    const result = await this.postgresService.query<KoboSourceRow>(
      `
        SELECT
          ds.id,
          ds.code,
          ds.name,
          ds.connector_id,
          ds.config_json,
          c.display_name AS connector_name
        FROM core.data_sources ds
        INNER JOIN core.connectors c ON c.id = ds.connector_id
        WHERE ds.id = $1::uuid
          AND ds.source_type = 'kobo'
          AND c.connector_type = 'kobo'
        LIMIT 1
      `,
      [sourceId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('La fuente indicada no existe o no corresponde a KoboToolbox.');
    }

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      connectorId: row.connector_id,
      connectorName: row.connector_name,
      config: row.config_json ?? {},
    };
  }

  private async loadLatestKoboRawPayloadJob(sourceId: string, connectorId: string) {
    const result = await this.postgresService.query<KoboRawPayloadJobRow>(
      `
        SELECT
          rp.sync_job_id,
          COALESCE(MAX(rp.payload->>'assetUid'), '') AS asset_uid,
          MAX(rp.received_at) AS last_received_at
        FROM integration.raw_payloads rp
        WHERE rp.connector_id = $1::uuid
          AND COALESCE(rp.payload->>'sourceId', '') = $2
        GROUP BY rp.sync_job_id
        ORDER BY MAX(rp.received_at) DESC
        LIMIT 1
      `,
      [connectorId, sourceId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      syncJobId: row.sync_job_id,
      assetUid: row.asset_uid || null,
      lastReceivedAt: row.last_received_at?.toISOString() ?? null,
    };
  }

  private async loadKoboRawPayloadPages(syncJobId: string, sourceId: string) {
    const result = await this.postgresService.query<KoboRawPayloadPageRow>(
      `
        SELECT
          id,
          source_record_key,
          payload,
          received_at
        FROM integration.raw_payloads
        WHERE sync_job_id = $1::uuid
          AND COALESCE(payload->>'sourceId', '') = $2
        ORDER BY received_at ASC, source_record_key ASC
      `,
      [syncJobId, sourceId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      sourceRecordKey: row.source_record_key,
      payload: row.payload,
      receivedAt: row.received_at?.toISOString() ?? null,
    }));
  }
}

function mapManagedLayerRow(
  row: ManagedLayerRow,
  publishedByLayerName: Map<string, PublishedLayer>,
  geoserverSnapshot: GeoServerSnapshot,
): GeospatialCatalogEntryRecord {
  const publication = resolvePublicationDefinition(row.code, row.name);
  const publishedLayer = publishedByLayerName.get(publication.geoserverLayerName);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    title: publishedLayer?.title ?? publication.title,
    layerType: row.layer_type,
    sourceMode: publication.sourceMode,
    visibility: row.visibility,
    status: row.status,
    featureCount: row.feature_count,
    totalAreaHa: Number(row.total_area_ha ?? 0),
    lastUpdatedAt: row.last_updated_at ? row.last_updated_at.toISOString() : null,
    publishedInGeoServer: Boolean(publishedLayer),
    geoserverLayerName: publication.geoserverLayerName,
    geoserverWorkspace: publishedLayer?.workspace ?? geoserverSnapshot.workspace,
    nativeViewName: publication.nativeViewName,
    notes:
      STATIC_PUBLICATIONS[row.code]?.notes ??
      'Capa gestionada por SIGI y disponible para publicación manual gobernada.',
    publicationEligible: row.visibility === 'public' && row.status === 'published',
    publicationEligibilityReason: buildPublicationEligibilityReason(
      row.visibility,
      row.status,
    ),
  };
}

function mapProjectCentroidsEntry(
  row: DerivedLayerStatsRow | undefined,
  publishedByLayerName: Map<string, PublishedLayer>,
  geoserverSnapshot: GeoServerSnapshot,
): GeospatialCatalogEntryRecord {
  const publication = resolvePublicationDefinition('project_centroids');
  const publishedLayer = publishedByLayerName.get(publication.geoserverLayerName);

  return {
    id: 'derived-project-centroids',
    code: 'project_centroids',
    name: 'Project Centroids',
    title: publishedLayer?.title ?? publication.title,
    layerType: 'project-centroid',
    sourceMode: publication.sourceMode,
    visibility: 'public',
    status: 'published',
    featureCount: row?.feature_count ?? 0,
    totalAreaHa: Number(row?.total_area_ha ?? 0),
    lastUpdatedAt: row?.last_updated_at ? row.last_updated_at.toISOString() : null,
    publishedInGeoServer: Boolean(publishedLayer),
    geoserverLayerName: publication.geoserverLayerName,
    geoserverWorkspace: publishedLayer?.workspace ?? geoserverSnapshot.workspace,
    nativeViewName: publication.nativeViewName,
    notes: publication.notes,
    publicationEligible: true,
    publicationEligibilityReason: null,
  };
}

function mapProjectPublicationRow(
  row: ProjectPublicationRow,
  publishedByLayerName: Map<string, PublishedLayer>,
) {
  const publication = buildProjectPublicationDefinition(row);
  const publishedLayer = publishedByLayerName.get(publication.geoserverLayerName);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    visibility: row.visibility,
    status: row.status,
    hasPolygon: row.has_polygon,
    publicationEligible:
      Boolean(row.code?.trim()) &&
      row.visibility === 'public' &&
      row.status === 'published' &&
      row.has_polygon,
    publicationEligibilityReason: buildProjectPublicationEligibilityReason(row),
    geoserverLayerName: publication.geoserverLayerName,
    nativeViewName: publication.nativeViewName,
    publishedInGeoServer: Boolean(publishedLayer),
  };
}

function resolvePublicationDefinition(code: string, name?: string): PublicationDefinition {
  const staticPublication = STATIC_PUBLICATIONS[code];
  if (staticPublication) {
    const suffix = sanitizeLayerCode(code);
    return {
      ...staticPublication,
      code,
      notes: staticPublication.notes,
      featureName: `public_${suffix}`,
      geoserverLayerName: `sigi:public_${suffix}`,
      nativeViewName: `gis.v_public_${suffix}`,
      viewName: `v_public_${suffix}`,
    };
  }

  const suffix = sanitizeLayerCode(code);
  return {
    code,
    sourceMode: 'managed',
    notes: 'Capa gestionada por SIGI y disponible para publicación manual gobernada.',
    title: buildDefaultLayerTitle(name ?? code),
    featureName: `public_${suffix}`,
    geoserverLayerName: `sigi:public_${suffix}`,
    nativeViewName: `gis.v_public_${suffix}`,
    viewName: `v_public_${suffix}`,
    nativeViewSql: `
      CREATE OR REPLACE VIEW gis.v_public_${suffix} AS
      SELECT
        tf.id,
        gl.code AS layer_code,
        t.code AS territory_code,
        t.name AS territory_name,
        t.level AS territory_level,
        tf.area_ha,
        tf.geometry
      FROM gis.territory_features tf
      INNER JOIN core.territories t ON t.id = tf.territory_id
      INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
      WHERE gl.code = '${escapeSqlLiteral(code)}'
        AND gl.visibility = 'public'
        AND gl.status = 'published'
    `,
  };
}

function buildProjectPublicationDefinition(project: {
  id: string;
  code: string | null;
  title: string;
}) {
  const projectCode = project.code?.trim() || `project-${project.id}`;
  const suffix = sanitizeLayerCode(projectCode);
  return {
    code: projectCode,
    sourceMode: 'derived' as const,
    notes: 'Vista derivada por proyecto, lista para consumo dedicado en GeoServer.',
    title: `${project.title} Layer`,
    featureName: `project_${suffix}`,
    geoserverLayerName: `sigi:project_${suffix}`,
    nativeViewName: `gis.v_project_${suffix}`,
    viewName: `v_project_${suffix}`,
    nativeViewSql: `
      CREATE OR REPLACE VIEW gis.v_project_${suffix} AS
      SELECT
        tf.id,
        p.id AS project_id,
        p.code AS project_code,
        p.title AS project_name,
        pt.territory_code,
        COALESCE(pt.territory_name, t.name) AS territory_name,
        pt.country,
        pt.area_ha,
        tf.geometry
      FROM gis.territory_features tf
      INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
      INNER JOIN core.territories t ON t.id = tf.territory_id
      INNER JOIN core.project_territories pt ON pt.territory_id = t.id
      INNER JOIN core.projects p ON p.id = pt.project_id
      WHERE gl.code = 'project_polygons'
        AND p.code = '${escapeSqlLiteral(projectCode)}'
        AND p.visibility = 'public'
        AND p.status = 'published'
    `,
  };
}

function normalizeLayerCode(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new BadRequestException('Debes indicar un código de capa válido.');
  }
  return normalized;
}

function normalizeRequiredText(value: string | undefined | null, label: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException(`${label} es requerido.`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

// V2-02: fail-closed. Solo se publica con 'public' explícito; cualquier otro valor del dominio
// (gis.geo_layers.visibility, ver common/geo/geo-visibility.ts) se respeta y lo desconocido queda 'internal'.
export function normalizeVisibility(value: string | undefined | null) {
  const candidate = value?.trim().toLowerCase();
  return GEO_VISIBILITY_LEVELS.some((level) => level.value === candidate)
    ? (candidate as GeoVisibilityValue)
    : 'internal';
}

function normalizeLayerStatus(value: string | undefined | null) {
  const candidate = value?.trim().toLowerCase();
  if (!candidate) {
    return 'published';
  }
  if (candidate === 'active' || candidate === 'published' || candidate === 'draft') {
    return candidate;
  }
  throw new BadRequestException('status debe ser draft, active o published.');
}

function sanitizeLayerCode(value: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!sanitized) {
    throw new BadRequestException('No se pudo generar un identificador seguro para la capa.');
  }

  return sanitized;
}

function buildDefaultLayerTitle(value: string) {
  return value
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildPublicationEligibilityReason(visibility: string, status: string) {
  if (visibility !== 'public') {
    return 'Solo las capas públicas pueden publicarse manualmente en GeoServer.';
  }
  if (status !== 'published') {
    return 'La capa debe estar en estado published antes de exponerla por OGC.';
  }
  return null;
}

function buildProjectPublicationEligibilityReason(row: ProjectPublicationRow) {
  if (!row.code?.trim()) {
    return 'El proyecto debe tener un código antes de publicarse como capa dedicada.';
  }
  if (row.visibility !== 'public') {
    return 'Solo los proyectos públicos pueden publicarse como capa dedicada.';
  }
  if (row.status !== 'published') {
    return 'El proyecto debe estar en estado published para exponerlo por OGC.';
  }
  if (!row.has_polygon) {
    return 'El proyecto aún no tiene geometría poligonal registrada en SIGI.';
  }
  return null;
}

function normalizeFeatureCollection(payload: unknown): {
  features: ImportedGeoJsonFeature[];
} {
  if (!payload || typeof payload !== 'object') {
    throw new BadRequestException('El archivo GeoJSON no tiene una estructura válida.');
  }

  const record = payload as Record<string, unknown>;
  if (record.type === 'FeatureCollection' && Array.isArray(record.features)) {
    return {
      features: record.features as ImportedGeoJsonFeature[],
    };
  }

  if (record.type === 'Feature') {
    return {
      features: [record as ImportedGeoJsonFeature],
    };
  }

  throw new BadRequestException('Solo se soportan objetos GeoJSON tipo FeatureCollection o Feature.');
}

function normalizeImportedFeature(
  feature: ImportedGeoJsonFeature,
  layerCode: string,
  defaultTerritoryLevel: string,
  index: number,
) {
  const geometry = feature?.geometry as Record<string, unknown> | undefined;
  if (!geometry || typeof geometry !== 'object') {
    throw new BadRequestException(`La feature ${index + 1} no contiene geometría.`);
  }

  const geometryType = String(geometry.type ?? '');
  if (!['Polygon', 'MultiPolygon'].includes(geometryType)) {
    throw new BadRequestException(
      `La feature ${index + 1} usa geometría ${geometryType}. Esta fase solo soporta Polygon/MultiPolygon.`,
    );
  }

  const properties =
    feature.properties && typeof feature.properties === 'object'
      ? (feature.properties as Record<string, unknown>)
      : {};

  const territoryCode =
    readPropertyText(properties, ['territory_code', 'code']) ??
    `${layerCode}_${String(index + 1).padStart(3, '0')}`;
  const territoryName =
    readPropertyText(properties, ['territory_name', 'name']) ?? `Feature ${index + 1}`;
  const territoryLevel =
    readPropertyText(properties, ['territory_level', 'level']) ?? defaultTerritoryLevel;

  return {
    territoryCode: sanitizeLayerCode(territoryCode),
    territoryName,
    territoryLevel,
    properties,
    geometryText: JSON.stringify(geometry),
  };
}

function buildMultipartBody(input: {
  boundary: string;
  fileFieldName: string;
  fileName: string;
  fileBuffer: Buffer;
  contentType: string;
  fields: Record<string, string>;
}) {
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(input.fields)) {
    parts.push(
      Buffer.from(
        `--${input.boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    );
  }

  parts.push(
    Buffer.from(
      `--${input.boundary}\r\nContent-Disposition: form-data; name="${input.fileFieldName}"; filename="${input.fileName}"\r\nContent-Type: ${input.contentType}\r\n\r\n`,
      'utf8',
    ),
  );
  parts.push(input.fileBuffer);
  parts.push(Buffer.from(`\r\n--${input.boundary}--\r\n`, 'utf8'));

  return Buffer.concat(parts);
}

function readPropertyText(properties: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const raw = properties[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
}

async function upsertLayer(
  client: PoolClient,
  input: {
    code: string;
    name: string;
    layerType: string;
    visibility: string;
    status: string;
  },
) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO gis.geo_layers (code, name, layer_type, visibility, status)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        layer_type = EXCLUDED.layer_type,
        visibility = EXCLUDED.visibility,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING id
    `,
    [input.code, input.name, input.layerType, input.visibility, input.status],
  );

  return result.rows[0].id;
}

async function upsertTerritory(
  client: PoolClient,
  input: {
    code: string;
    name: string;
    level: string;
  },
) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO core.territories (code, name, level, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        level = EXCLUDED.level,
        status = 'active',
        updated_at = NOW()
      RETURNING id
    `,
    [input.code, input.name, input.level],
  );

  return result.rows[0].id;
}

async function computeAreaHa(client: PoolClient, geometryText: string) {
  const result = await client.query<{ area_ha: string }>(
    `
      SELECT
        COALESCE(
          ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) / 10000,
          0
        )::text AS area_ha
    `,
    [geometryText],
  );
  return Number(result.rows[0]?.area_ha ?? '0');
}

function stripExtension(fileName: string | null | undefined) {
  const normalized = fileName?.trim();
  if (!normalized) {
    return null;
  }
  return normalized.replace(/\.[^.]+$/, '');
}

function buildBasicAuth(user: string, password: string) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

async function requestText(endpoint: URL, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const transport = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(
      endpoint,
      {
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        let rawResponse = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          rawResponse += chunk;
        });
        res.on('end', () => {
          const statusCode = res.statusCode ?? 500;
          if (statusCode >= 400) {
            reject(
              new ServiceUnavailableException(
                `GeoServer capabilities returned ${statusCode}`,
              ),
            );
            return;
          }
          resolve(rawResponse);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('GeoServer capabilities request timed out'));
    });
    req.on('error', (error) => {
      reject(
        new ServiceUnavailableException(
          `GeoServer capabilities request failed: ${error.message}`,
        ),
      );
    });
    req.end();
  });
}

type ManagedLayerRow = {
  id: string;
  code: string;
  name: string;
  layer_type: string;
  visibility: string;
  status: string;
  feature_count: number;
  total_area_ha: string | number;
  last_updated_at: Date | null;
};

type DerivedLayerStatsRow = {
  feature_count: number;
  total_area_ha: string | number;
  last_updated_at: Date | null;
};

type PublishedLayer = {
  name: string;
  title: string;
  workspace: string;
};

type GeoServerSnapshot = {
  workspace: string | null;
  wmsUrl: string;
  wfsUrl: string;
  capabilitiesUrl: string;
  publishedLayers: PublishedLayer[];
};

type StaticPublicationDefinition = {
  sourceMode: 'managed' | 'derived';
  notes: string;
  title: string;
  nativeViewSql: string;
};

type PublicationDefinition = StaticPublicationDefinition & {
  code: string;
  featureName: string;
  geoserverLayerName: string;
  nativeViewName: string;
  viewName: string;
};

type GeospatialCatalogEntryRecord = {
  id: string;
  code: string;
  name: string;
  title: string;
  layerType: string;
  sourceMode: 'managed' | 'derived';
  visibility: string;
  status: string;
  featureCount: number;
  totalAreaHa: number;
  lastUpdatedAt: string | null;
  publishedInGeoServer: boolean;
  geoserverLayerName: string | null;
  geoserverWorkspace: string | null;
  nativeViewName: string | null;
  notes: string;
  publicationEligible: boolean;
  publicationEligibilityReason: string | null;
};

type ProjectPublicationRow = {
  id: string;
  code: string | null;
  title: string;
  visibility: string;
  status: string;
  has_polygon: boolean;
};

type LayerExportRow = {
  layer_code: string;
  layer_name: string;
  layer_type: string;
  visibility: string;
  status: string;
  territory_code: string;
  territory_name: string;
  territory_level: string;
  area_ha: string | number | null;
  properties_json: Record<string, unknown>;
  geometry_json: string;
};

type ImportedGeoJsonFeature = {
  type?: unknown;
  geometry?: unknown;
  properties?: unknown;
};

type ShapefileTransformRow = {
  rowNumber: number;
  project_code: string;
  territory_code: string;
  territory_name: string;
  territory_level: string;
  country: string;
  area_ha: number;
  geometry_wkt: string;
  source_crs: string;
  raw_properties: Record<string, unknown>;
};

type ShapefileTransformResponse = {
  ok: boolean;
  fileName: string;
  importMode?: string;
  recordCount: number;
  featureCount: number;
  geometryType: string;
  crs: string;
  detectedColumns?: string[];
  requiredFields?: string[];
  mappingSuggested?: Record<string, string>;
  mappingApplied?: Record<string, string>;
  bbox?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  } | null;
  countries?: string[];
  territoryLevels?: string[];
  geographicSummary?: {
    insideNationalBoundsRows: number;
    outsideNationalBoundsRows: number;
    configuredNationalBBox: {
      minLon: number;
      minLat: number;
      maxLon: number;
      maxLat: number;
    } | null;
  } | null;
  validationSummary?: Record<string, unknown>;
  validationIssues?: Array<Record<string, unknown>>;
  previewRows?: Array<Record<string, unknown>>;
  rows?: ShapefileTransformRow[];
};

type KoboSourceRow = {
  id: string;
  code: string;
  name: string;
  connector_id: string;
  config_json: Record<string, unknown> | null;
  connector_name: string;
};

type KoboRawPayloadJobRow = {
  sync_job_id: string;
  asset_uid: string;
  last_received_at: Date | null;
};

type KoboRawPayloadPageRow = {
  id: string;
  source_record_key: string;
  payload: Record<string, unknown>;
  received_at: Date | null;
};

type KoboPromotableFeature = {
  territoryCode: string;
  territoryName: string;
  latitude: number;
  longitude: number;
  areaHa: number;
  properties: Record<string, unknown>;
};

function normalizeShapefileImportMode(
  value: string | null | undefined,
): ShapefileImportMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return 'project-linked';
  }
  if ((SHAPEFILE_IMPORT_MODES as readonly string[]).includes(normalized)) {
    return normalized as ShapefileImportMode;
  }
  throw new BadRequestException(
    `importMode no soportado. Usa ${SHAPEFILE_IMPORT_MODES.join(', ')}.`,
  );
}

function extractKoboRecords(payload: Record<string, unknown>) {
  const nestedPayload =
    payload.payload && typeof payload.payload === 'object'
      ? (payload.payload as Record<string, unknown>)
      : payload;

  if (Array.isArray(nestedPayload.results)) {
    return nestedPayload.results.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
    );
  }

  if (Array.isArray(nestedPayload)) {
    return nestedPayload.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
    );
  }

  if (Object.keys(nestedPayload).length > 0) {
    return [nestedPayload];
  }

  return [];
}

function mapKoboRecordToPromotableFeature(
  record: Record<string, unknown>,
  input: {
    index: number;
    layerCodeSeed: string;
    sourceId: string;
    connectorId: string;
    syncJobId: string;
    assetUid: string | null;
  },
): KoboPromotableFeature | null {
  const point = extractKoboPoint(record);
  if (!point) {
    return null;
  }

  const normalizedRecord = normalizeKoboRecord(record);
  const submissionId = pickKoboText(normalizedRecord, ['_id', 'id', 'instanceid', 'instance_id']);
  const activity = pickKoboText(normalizedRecord, [
    'activity',
    'actividad',
    'identificacion_activity',
    'identificacion_actividad',
  ]);
  const district = pickKoboText(normalizedRecord, [
    'district',
    'distrito',
    'ubicacion_admin_district',
    'ubicacion_admin_distrito',
  ]);
  const territoryName =
    buildKoboFeatureName(district, activity) ??
    `Kobo submission ${submissionId ?? input.index + 1}`;
  const territoryCode = sanitizeLayerCode(
    submissionId
      ? `${input.layerCodeSeed}_${submissionId}`
      : `${input.layerCodeSeed}_${String(input.index + 1).padStart(4, '0')}`,
  );
  const areaHa = pickKoboNumber(normalizedRecord, [
    'area_ha',
    'areaha',
    'area',
    'hectareas',
    'hectares',
    'ha',
    'identificacion_area_ha',
  ]);
  const submissionTime = pickKoboText(normalizedRecord, [
    '_submission_time',
    '_submitted_at',
    'submission_time',
  ]);

  return {
    territoryCode,
    territoryName,
    latitude: point.latitude,
    longitude: point.longitude,
    areaHa: areaHa ?? 0,
    properties: {
      sourceId: input.sourceId,
      connectorId: input.connectorId,
      syncJobId: input.syncJobId,
      assetUid: input.assetUid,
      submissionId: submissionId ?? null,
      submissionTime: submissionTime ?? null,
      latitude: point.latitude,
      longitude: point.longitude,
      province:
        pickKoboText(normalizedRecord, [
          'province',
          'provincia',
          'ubicacion_admin_province',
          'ubicacion_admin_provincia',
        ]) ?? '',
      canton:
        pickKoboText(normalizedRecord, [
          'canton',
          'cantón',
          'ubicacion_admin_canton',
        ]) ?? '',
      district: district ?? '',
      agency:
        pickKoboText(normalizedRecord, [
          'agency',
          'agencia',
          'identificacion_agency',
          'identificacion_agencia',
        ]) ?? '',
      activityGeneral:
        pickKoboText(normalizedRecord, [
          'activity_general',
          'activitygeneral',
          'actividad_general',
          'actividadgeneral',
          'act_general',
          'identificacion_act_general',
        ]) ?? '',
      activity: activity ?? '',
      tenure:
        pickKoboText(normalizedRecord, [
          'tenure',
          'tenencia',
          'identificacion_tenure',
          'identificacion_tenencia',
        ]) ?? '',
      areaHa: areaHa ?? 0,
      rawSubmission: record,
    },
  };
}

function extractKoboPoint(record: Record<string, unknown>) {
  for (const value of Object.values(record)) {
    if (typeof value === 'string') {
      const parts = value.trim().split(/\s+/);
      if (parts.length >= 2) {
        const latitude = Number(parts[0]);
        const longitude = Number(parts[1]);
        if (isValidLongitudeLatitude(longitude, latitude)) {
          return { latitude, longitude };
        }
      }
      continue;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const candidate = value as Record<string, unknown>;
    const latitude = firstNumericValue(candidate, ['latitude', 'lat']);
    const longitude = firstNumericValue(candidate, ['longitude', 'lon', 'lng']);
    if (latitude !== null && longitude !== null && isValidLongitudeLatitude(longitude, latitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

function normalizeKoboRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [sanitizeLookupKey(key), value] as const),
  );
}

function pickKoboText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[sanitizeLookupKey(key)];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function pickKoboNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[sanitizeLookupKey(key)];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const normalized = Number(value.trim().replace(',', '.'));
      if (Number.isFinite(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

function firstNumericValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const normalized = Number(value.trim());
      if (Number.isFinite(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

function sanitizeLookupKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isValidLongitudeLatitude(longitude: number, latitude: number) {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90 &&
    Math.abs(longitude) > 0.000001 &&
    Math.abs(latitude) > 0.000001
  );
}

function buildKoboFeatureName(district: string | null, activity: string | null) {
  if (district && activity) {
    return `${district} · ${activity}`;
  }
  if (district) {
    return district;
  }
  if (activity) {
    return activity;
  }
  return null;
}
