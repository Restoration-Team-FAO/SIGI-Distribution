import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';
import {
  DEFAULT_PAGE_SIZE,
  GeoExtentInput,
  GeoFeatureQueryFilterInput,
  GeoSavedViewCreateInput,
  GeoSortInput,
  MAX_NEARBY_RESULTS,
  MAX_SEARCH_RESULTS,
  MAX_STATS_GROUPS,
} from './dto/geo-feature-query.dto';
import { buildFilterClause, ParamBuilder, resolveFieldExpression } from './geo-filter-sql';
import { buildSortClause } from './geo-sort-sql';
import { deriveFieldsFromPropertySamples, SCHEMA_SAMPLE_SIZE } from './geo-schema';
import {
  GeoDatasetProfile,
  GeoFeature,
  GeoFeatureQueryResult,
  GeoLayer,
  GeoLayerFieldStats,
  GeoLayerIntersectionResult,
  GeoLayerMetadata,
  GeoLayerSchema,
  GeoNearbyTerritoryResult,
  GeoSavedView,
  GeoSavedViewState,
  GeoTerritorySearchResult,
} from './geo.types';

export type GeoFeatureQueryInput = {
  bbox?: GeoExtentInput;
  zoom?: number;
  page?: number;
  pageSize?: number;
  filters?: GeoFeatureQueryFilterInput[];
  /** P0-7 — attribute table sorting; defaults to ORDER BY t.name ASC. */
  sort?: GeoSortInput;
};

/** P0-8 — export never paginates or simplifies; see exportFeatures. */
export type GeoExportQueryInput = {
  bbox?: GeoExtentInput;
  filters?: GeoFeatureQueryFilterInput[];
  sort?: GeoSortInput;
};

export type GeoExportResult = {
  layer: GeoLayer;
  features: GeoFeature[];
  totalFeatures: number;
  exportedCount: number;
  truncated: boolean;
};

/**
 * Hard cap on exported rows — an export is still a single in-memory
 * response, not a stream, so it needs the same "never unbounded" guarantee
 * as every other /geo/* read (docs/geo/postgis.md §4). Generous relative to
 * today's largest layer (2,248 features) but still bounded; a request that
 * hits the cap gets `truncated: true` rather than a silently short file.
 */
const MAX_EXPORT_FEATURES = 20000;
const MAX_INTERSECTION_FEATURES = 200;

/** Whole-world default when no bbox is given. Still paginated — see queryFeatures. */
const WORLD_EXTENT: GeoExtentInput = { minLon: -180, minLat: -90, maxLon: 180, maxLat: 90 };

/**
 * Zoom → simplification tolerance, in degrees. Approximates the angular
 * size of one pixel in a standard 256px web-map tile scheme at the given
 * zoom (360° / (256 * 2^zoom)), times ~1.5px of tolerated wobble — a
 * common cartographic generalization heuristic, not an arbitrary constant.
 * Beyond MAX_SIMPLIFY_ZOOM the tolerance is negligible, so simplification
 * is skipped outright: docs/geo/postgis.md §4 measured that
 * ST_SimplifyPreserveTopology itself can cost more than serving the raw
 * geometry for very dense sources, so it should only run when it is
 * actually going to shrink the payload.
 */
const TILE_PIXELS = 256;
const SIMPLIFY_TOLERANCE_PIXELS = 1.5;
const MAX_SIMPLIFY_ZOOM = 15;

function resolveSimplifyTolerance(zoom: number | undefined): number {
  if (zoom === undefined || zoom >= MAX_SIMPLIFY_ZOOM) {
    return 0;
  }
  const pixelSizeDegrees = 360 / (TILE_PIXELS * 2 ** zoom);
  return pixelSizeDegrees * SIMPLIFY_TOLERANCE_PIXELS;
}

@Injectable()
export class GeoService {
  constructor(private readonly postgresService: PostgresService) {}

  async listLayers(includeInternal: boolean): Promise<GeoLayer[]> {
    const result = await this.postgresService.query<GeoLayerRow>(
      `
        SELECT id, code, name, description, category, group_name, layer_type,
               geometry_type, crs, visibility, status, sort_order, created_at, updated_at
        FROM gis.geo_layers
        WHERE ($1::boolean OR (gis.geo_visibility_is_public(visibility) AND status = 'published'))
        ORDER BY sort_order ASC, name ASC
      `,
      [includeInternal],
    );

    return result.rows.map(mapGeoLayerRow);
  }

  async getLayer(code: string, includeInternal: boolean): Promise<GeoLayer> {
    return this.findVisibleLayer(code, includeInternal);
  }

  async getLayerMetadata(
    code: string,
    includeInternal: boolean,
  ): Promise<{ layer: GeoLayer; metadata: GeoLayerMetadata | null }> {
    const layer = await this.findVisibleLayer(code, includeInternal);

    const result = await this.postgresService.query<GeoLayerMetadataRow>(
      `SELECT * FROM gis.geo_layer_metadata WHERE layer_id = $1::uuid`,
      [layer.id],
    );

    return {
      layer,
      metadata: result.rows[0] ? mapGeoLayerMetadataRow(result.rows[0]) : null,
    };
  }

  async getLayerSchema(code: string, includeInternal: boolean): Promise<GeoLayerSchema> {
    const layer = await this.findVisibleLayer(code, includeInternal);
    const fields = await this.deriveLayerSchema(layer.id);
    return { layerId: layer.id, fields };
  }

  /**
   * P1-1 — cross-layer territorial search (spec §18): find a territory by
   * name/code across every layer the caller can see, not just the ones
   * currently active on the map. Same visibility predicate as
   * buildBaseQuery/listLayers — reused, not re-derived — but without a
   * `gl.code = ...` constraint since this searches across layers by design.
   * A territory can legitimately appear in more than one layer; each
   * (territory, layer) pair is returned as its own result so the caller can
   * pick which layer to jump to.
   */
  async searchTerritories(term: string, includeInternal: boolean): Promise<GeoTerritorySearchResult[]> {
    const params = new ParamBuilder();
    const includeInternalParam = params.add(includeInternal);
    const termParam = params.add(`%${term}%`);
    const limitParam = params.add(MAX_SEARCH_RESULTS);

    const result = await this.postgresService.query<TerritorySearchRow>(
      `
        SELECT territory_code, territory_name, territory_level, layer_code, layer_name
        FROM (
          SELECT DISTINCT
            t.code AS territory_code,
            t.name AS territory_name,
            t.level AS territory_level,
            gl.code AS layer_code,
            gl.name AS layer_name
          FROM gis.territory_features tf
          INNER JOIN core.territories t ON t.id = tf.territory_id
          INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
          WHERE (${includeInternalParam} OR (gis.geo_visibility_is_public(gl.visibility) AND gl.status = 'published'))
            AND (${includeInternalParam} OR gis.project_geometry_is_public(gl.code, tf.territory_id))
            AND (t.name ILIKE ${termParam} OR t.code ILIKE ${termParam})
        ) matches
        ORDER BY territory_name ASC
        LIMIT ${limitParam}
      `,
      params.params,
    );

    return result.rows.map(mapTerritorySearchRow);
  }

  /**
   * P1-2 — cached per-layer profile (spec §11). Never computes anything
   * inline: reads whatever gis.refresh_geo_layer_profile() last persisted.
   * Returns `null` (not an error) when the layer has never been profiled —
   * true for any layer imported after P0-2's one-time manual profiling run
   * (docs/geo/postgis.md §2) until refresh is wired into the import path,
   * a documented open gap, not something this endpoint silently papers
   * over.
   */
  async getLayerProfile(code: string, includeInternal: boolean): Promise<GeoDatasetProfile | null> {
    const layer = await this.findVisibleLayer(code, includeInternal);

    const result = await this.postgresService.query<ProfileRow>(
      `
        SELECT
          layer_id,
          feature_count,
          null_geometry_count,
          invalid_geometry_count,
          geometry_type,
          crs,
          ST_XMin(extent) AS min_lon,
          ST_YMin(extent) AS min_lat,
          ST_XMax(extent) AS max_lon,
          ST_YMax(extent) AS max_lat,
          profiled_at
        FROM gis.geo_layer_profile
        WHERE layer_id = $1::uuid
      `,
      [layer.id],
    );

    const row = result.rows[0];
    return row ? mapProfileRow(row) : null;
  }

  /** P1-4 — a user's own saved views only, never another user's (spec §19). */
  async listSavedViews(userId: string): Promise<GeoSavedView[]> {
    const result = await this.postgresService.query<SavedViewRow>(
      `
        SELECT id, user_id, name, view_state, created_at, updated_at
        FROM gis.geo_saved_views
        WHERE user_id = $1::uuid
        ORDER BY updated_at DESC
      `,
      [userId],
    );
    return result.rows.map(mapSavedViewRow);
  }

  async createSavedView(userId: string, input: GeoSavedViewCreateInput): Promise<GeoSavedView> {
    const viewState = { activeLayers: input.activeLayers };
    const result = await this.postgresService.query<SavedViewRow>(
      `
        INSERT INTO gis.geo_saved_views (user_id, name, view_state)
        VALUES ($1::uuid, $2, $3::jsonb)
        RETURNING id, user_id, name, view_state, created_at, updated_at
      `,
      [userId, input.name, JSON.stringify(viewState)],
    );
    return mapSavedViewRow(result.rows[0]);
  }

  /**
   * Ownership checked in application code (SELECT then compare), not just
   * relied on as an implicit side effect of the WHERE clause below — so a
   * caller who does not own the view gets a real 403, and a caller
   * targeting an id that simply does not exist gets a real 404, instead of
   * both silently no-op'ing the same way.
   */
  async deleteSavedView(userId: string, id: string): Promise<void> {
    const existing = await this.postgresService.query<{ user_id: string }>(
      `SELECT user_id FROM gis.geo_saved_views WHERE id = $1::uuid`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFoundException('La vista guardada solicitada no existe.');
    }
    if (row.user_id !== userId) {
      throw new ForbiddenException('No tienes permiso para eliminar esta vista guardada.');
    }

    await this.postgresService.query(`DELETE FROM gis.geo_saved_views WHERE id = $1::uuid`, [id]);
  }

  /**
   * P1-5 — distribution of the *whole* filtered result set for one field
   * (spec §12), not the current table page. Reuses buildBaseQuery (same
   * visibility + filter predicate as /features and /export) and
   * resolveFieldExpression (same field-name validation and safe SQL
   * binding as filters/sort) — no new query-building logic, just a
   * different SELECT shape (GROUP BY vs. LIMIT/OFFSET) on top of them.
   */
  async getLayerStats(
    code: string,
    fieldName: string,
    filters: GeoFeatureQueryFilterInput[],
    includeInternal: boolean,
  ): Promise<GeoLayerFieldStats> {
    const { schema, params, baseFrom } = await this.buildBaseQuery(code, includeInternal, undefined, filters, true);
    const { expr, type } = resolveFieldExpression(fieldName, schema, params);

    if (type === 'number' || type === 'date') {
      const castExpr = type === 'number' ? `(${expr})::numeric` : `(${expr})::date`;
      const avgSql = type === 'number' ? `, AVG(${castExpr}) AS avg_value` : '';
      const result = await this.postgresService.query<{
        count: string;
        min_value: string | null;
        max_value: string | null;
        avg_value: string | null;
      }>(
        `
          SELECT COUNT(*)::text AS count, MIN(${castExpr}) AS min_value, MAX(${castExpr}) AS max_value${avgSql}
          ${baseFrom}
            AND ${expr} IS NOT NULL
        `,
        params.params,
      );
      const row = result.rows[0];
      const count = Number(row?.count ?? '0');

      return type === 'number'
        ? {
            field: fieldName,
            kind: 'numeric',
            count,
            min: row?.min_value !== null && row?.min_value !== undefined ? Number(row.min_value) : null,
            max: row?.max_value !== null && row?.max_value !== undefined ? Number(row.max_value) : null,
            avg: row?.avg_value !== null && row?.avg_value !== undefined ? Number(row.avg_value) : null,
          }
        : {
            field: fieldName,
            kind: 'date',
            count,
            min: row?.min_value ?? null,
            max: row?.max_value ?? null,
          };
    }

    const limitParam = params.add(MAX_STATS_GROUPS + 1);
    const result = await this.postgresService.query<{ value: string; count: string }>(
      `
        SELECT ${expr} AS value, COUNT(*)::text AS count
        ${baseFrom}
          AND ${expr} IS NOT NULL
        GROUP BY ${expr}
        ORDER BY COUNT(*) DESC, value ASC
        LIMIT ${limitParam}
      `,
      params.params,
    );

    const truncated = result.rows.length > MAX_STATS_GROUPS;
    const groups = result.rows
      .slice(0, MAX_STATS_GROUPS)
      .map((row) => ({ value: row.value, count: Number(row.count) }));

    return { field: fieldName, kind: 'grouped', groups, truncated };
  }

  /**
   * P1-6 — proximity search (spec §10, "consultas espaciales"): every
   * feature in `code` within `radiusMeters` of `geometry`, nearest first.
   * `ST_DWithin` on a `::geography` cast is buffer + intersection in one
   * PostGIS call — meters are real meters (geodesic), not degrees, unlike
   * the plain-geometry `ST_Intersects` the bbox query elsewhere in this
   * file uses (bbox filtering doesn't need metric accuracy; a radius
   * search does).
   */
  async findNearbyTerritories(
    code: string,
    geometry: Record<string, unknown>,
    radiusMeters: number,
    includeInternal: boolean,
  ): Promise<GeoNearbyTerritoryResult[]> {
    const layer = await this.findVisibleLayer(code, includeInternal);

    const params = new ParamBuilder();
    const layerIdParam = params.add(layer.id);
    const geometryParam = params.add(JSON.stringify(geometry));
    const radiusParam = params.add(radiusMeters);
    const limitParam = params.add(MAX_NEARBY_RESULTS);
    const includeInternalParam = params.add(includeInternal);
    const layerCodeParam = params.add(layer.code);

    let result;
    try {
      result = await this.postgresService.query<NearbyRow>(
        `
          SELECT
            t.code AS territory_code,
            t.name AS territory_name,
            t.level AS territory_level,
            ST_Distance(
              tf.geometry::geography,
              ST_SetSRID(ST_GeomFromGeoJSON(${geometryParam}), 4326)::geography
            ) AS distance_meters
          FROM gis.territory_features tf
          INNER JOIN core.territories t ON t.id = tf.territory_id
          WHERE tf.layer_id = ${layerIdParam}::uuid
            AND (${includeInternalParam} OR gis.project_geometry_is_public(${layerCodeParam}, tf.territory_id))
            AND ST_DWithin(
              tf.geometry::geography,
              ST_SetSRID(ST_GeomFromGeoJSON(${geometryParam}), 4326)::geography,
              ${radiusParam}
            )
          ORDER BY distance_meters ASC
          LIMIT ${limitParam}
        `,
        params.params,
      );
    } catch {
      // ST_GeomFromGeoJSON throws on a structurally-invalid-but-DTO-shaped
      // geometry (e.g. a coordinate that isn't actually a number) — a real
      // client input error, not a server fault.
      throw new BadRequestException('geometry no es un GeoJSON válido o no se pudo interpretar.');
    }

    return result.rows.map((row) => ({
      territoryCode: row.territory_code,
      territoryName: row.territory_name,
      territoryLevel: row.territory_level,
      layerCode: layer.code,
      layerName: layer.name,
      distanceMeters: Number(row.distance_meters),
    }));
  }

  async intersectLayers(
    sourceLayerCode: string,
    targetLayerCode: string,
    includeInternal: boolean,
  ): Promise<GeoLayerIntersectionResult> {
    const [sourceLayer, targetLayer] = await Promise.all([
      this.findVisibleLayer(sourceLayerCode, includeInternal),
      this.findVisibleLayer(targetLayerCode, includeInternal),
    ]);

    const summaryResult = await this.postgresService.query<IntersectionSummaryRow>(
      `
        WITH source_features AS (
          SELECT id, geometry FROM gis.territory_features
          WHERE layer_id = $1::uuid AND geometry IS NOT NULL
            AND ($3::boolean OR gis.project_geometry_is_public($4, territory_id))
        ), target_features AS (
          SELECT id, geometry FROM gis.territory_features
          WHERE layer_id = $2::uuid AND geometry IS NOT NULL
            AND ($3::boolean OR gis.project_geometry_is_public($5, territory_id))
        ), intersections AS (
          SELECT
            source.id AS source_id,
            target.id AS target_id,
            ST_Intersection(source.geometry, target.geometry) AS geometry
          FROM source_features source
          INNER JOIN target_features target
            ON source.geometry && target.geometry
           AND ST_Intersects(source.geometry, target.geometry)
        )
        SELECT
          (SELECT COUNT(*) FROM source_features)::text AS source_feature_count,
          (SELECT COUNT(*) FROM target_features)::text AS target_feature_count,
          COUNT(DISTINCT source_id)::text AS intersecting_source_count,
          COUNT(DISTINCT target_id)::text AS intersecting_target_count,
          COUNT(*)::text AS pair_count,
          COALESCE(SUM(
            CASE
              WHEN ST_IsEmpty(geometry) THEN 0
              ELSE ST_Area(ST_CollectionExtract(geometry, 3)::geography) / 10000
            END
          ), 0)::text AS intersection_area_ha
        FROM intersections
      `,
      [sourceLayer.id, targetLayer.id, includeInternal, sourceLayer.code, targetLayer.code],
    );

    const featureResult = await this.postgresService.query<IntersectionFeatureRow>(
      `
        WITH matches AS (
          SELECT
            source.id AS source_id,
            source_territory.code AS source_code,
            source_territory.name AS source_name,
            target.id AS target_id,
            target_territory.code AS target_code,
            target_territory.name AS target_name,
            ST_Intersection(source.geometry, target.geometry) AS geometry
          FROM gis.territory_features source
          INNER JOIN core.territories source_territory ON source_territory.id = source.territory_id
          INNER JOIN gis.territory_features target
            ON target.layer_id = $2::uuid
           AND source.geometry && target.geometry
           AND ST_Intersects(source.geometry, target.geometry)
          INNER JOIN core.territories target_territory ON target_territory.id = target.territory_id
          WHERE source.layer_id = $1::uuid
            AND source.geometry IS NOT NULL
            AND target.geometry IS NOT NULL
            AND ($3::boolean OR gis.project_geometry_is_public($4, source.territory_id))
            AND ($3::boolean OR gis.project_geometry_is_public($5, target.territory_id))
        )
        SELECT
          source_id,
          source_code,
          source_name,
          target_id,
          target_code,
          target_name,
          COALESCE(ST_Area(ST_CollectionExtract(geometry, 3)::geography) / 10000, 0)::text AS intersection_area_ha,
          ST_AsGeoJSON(geometry) AS geometry_geojson
        FROM matches
        WHERE NOT ST_IsEmpty(geometry)
        ORDER BY intersection_area_ha DESC, source_name ASC, target_name ASC
        LIMIT $6
      `,
      [sourceLayer.id, targetLayer.id, includeInternal, sourceLayer.code, targetLayer.code, MAX_INTERSECTION_FEATURES],
    );

    const summaryRow = summaryResult.rows[0];
    const pairCount = Number(summaryRow?.pair_count ?? 0);
    const matches = featureResult.rows.map((row) => ({
      sourceCode: row.source_code,
      sourceName: row.source_name,
      targetCode: row.target_code,
      targetName: row.target_name,
      intersectionAreaHa: Number(row.intersection_area_ha ?? 0),
    }));

    return {
      sourceLayer,
      targetLayer,
      summary: {
        sourceFeatureCount: Number(summaryRow?.source_feature_count ?? 0),
        targetFeatureCount: Number(summaryRow?.target_feature_count ?? 0),
        intersectingSourceCount: Number(summaryRow?.intersecting_source_count ?? 0),
        intersectingTargetCount: Number(summaryRow?.intersecting_target_count ?? 0),
        pairCount,
        intersectionAreaHa: Number(summaryRow?.intersection_area_ha ?? 0),
      },
      featureCollection: {
        type: 'FeatureCollection',
        features: featureResult.rows.map((row) => ({
          id: `${row.source_id}:${row.target_id}`,
          type: 'Feature',
          geometry: JSON.parse(row.geometry_geojson),
          properties: {
            code: `${row.source_code}:${row.target_code}`,
            name: `${row.source_name} × ${row.target_name}`,
            sourceCode: row.source_code,
            sourceName: row.source_name,
            targetCode: row.target_code,
            targetName: row.target_name,
            intersectionAreaHa: Number(row.intersection_area_ha ?? 0),
          },
        })),
      },
      matches,
      truncated: pairCount > featureResult.rows.length,
    };
  }

  /**
   * Always bounded: a bbox default (whole world) and a clamped pageSize
   * mean this can never resolve to an unbounded single-response dump of a
   * layer — the failure mode documented in docs/geo/postgis.md §4 (59.1 MB
   * for 19 features on the unbounded /territories/features route).
   */
  async queryFeatures(
    code: string,
    query: GeoFeatureQueryInput,
    includeInternal: boolean,
  ): Promise<GeoFeatureQueryResult> {
    const page = query.page && query.page > 0 ? Math.floor(query.page) : 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const tolerance = resolveSimplifyTolerance(query.zoom);
    const filters = query.filters ?? [];

    const { layer, schema, params, baseFrom } = await this.buildBaseQuery(
      code,
      includeInternal,
      query.bbox,
      filters,
      Boolean(query.sort),
    );

    const countResult = await this.postgresService.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total ${baseFrom}`,
      params.params,
    );
    const totalFeatures = Number(countResult.rows[0]?.total ?? '0');

    const geometryExpr =
      tolerance > 0
        ? `ST_SimplifyPreserveTopology(tf.geometry, ${params.add(tolerance)})`
        : 'tf.geometry';
    // Built after the count query — never needed there — so its params
    // append cleanly onto the same params array without shifting indices
    // the count query already used.
    const orderBySql = query.sort ? buildSortClause(query.sort, schema, params) : 't.name ASC NULLS LAST';
    const limitParam = params.add(pageSize);
    const offsetParam = params.add(offset);

    const dataResult = await this.postgresService.query<FeatureRow>(
      `
        SELECT
          tf.id,
          t.code AS territory_code,
          t.name AS territory_name,
          t.level AS territory_level,
          tf.area_ha,
          tf.updated_at,
          tf.properties_json,
          ST_AsGeoJSON(${geometryExpr}) AS geometry_geojson
        ${baseFrom}
        ORDER BY ${orderBySql}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params.params,
    );

    return {
      featureCollection: {
        type: 'FeatureCollection',
        features: dataResult.rows.map(mapFeatureRow),
      },
      page,
      pageSize,
      totalFeatures,
    };
  }

  /**
   * P0-8 — the same filtered/sorted result set queryFeatures serves the
   * table, but unpaginated (up to MAX_EXPORT_FEATURES) and with full-
   * precision geometry (no zoom-based simplification — that is a rendering
   * concern, not an export one).
   */
  async exportFeatures(
    code: string,
    query: GeoExportQueryInput,
    includeInternal: boolean,
  ): Promise<GeoExportResult> {
    const filters = query.filters ?? [];

    const { layer, schema, params, baseFrom } = await this.buildBaseQuery(
      code,
      includeInternal,
      query.bbox,
      filters,
      Boolean(query.sort),
    );

    const countResult = await this.postgresService.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total ${baseFrom}`,
      params.params,
    );
    const totalFeatures = Number(countResult.rows[0]?.total ?? '0');

    const orderBySql = query.sort ? buildSortClause(query.sort, schema, params) : 't.name ASC NULLS LAST';
    const limitParam = params.add(MAX_EXPORT_FEATURES);

    const dataResult = await this.postgresService.query<FeatureRow>(
      `
        SELECT
          tf.id,
          t.code AS territory_code,
          t.name AS territory_name,
          t.level AS territory_level,
          tf.area_ha,
          tf.updated_at,
          tf.properties_json,
          ST_AsGeoJSON(tf.geometry) AS geometry_geojson
        ${baseFrom}
        ORDER BY ${orderBySql}
        LIMIT ${limitParam}
      `,
      params.params,
    );

    const features = dataResult.rows.map(mapFeatureRow);

    return {
      layer,
      features,
      totalFeatures,
      exportedCount: features.length,
      truncated: totalFeatures > features.length,
    };
  }

  private async findVisibleLayer(code: string, includeInternal: boolean): Promise<GeoLayer> {
    const result = await this.postgresService.query<GeoLayerRow>(
      `
        SELECT id, code, name, description, category, group_name, layer_type,
               geometry_type, crs, visibility, status, sort_order, created_at, updated_at
        FROM gis.geo_layers
        WHERE code = $1
          AND ($2::boolean OR (gis.geo_visibility_is_public(visibility) AND status = 'published'))
      `,
      [code, includeInternal],
    );

    const row = result.rows[0];
    if (!row) {
      // Deliberately the same message whether the layer does not exist or
      // simply is not visible to this caller — an anonymous caller must not
      // be able to distinguish "no such layer" from "exists but private" by
      // probing codes. Mirrors the reasoning in docs/geo/permissions.md.
      throw new NotFoundException('La capa geoespacial solicitada no existe o no está disponible.');
    }

    return mapGeoLayerRow(row);
  }

  /**
   * Shared by queryFeatures and exportFeatures (P0-8): resolves the layer,
   * derives its schema only if actually needed, and builds the bbox+
   * visibility+filter WHERE clause. Deliberately does NOT build the ORDER BY
   * clause — each caller does that itself, after its own COUNT query, so
   * that a sort field's bound parameter is never added to the params array
   * before COUNT reads it (COUNT has no ORDER BY and never needed those
   * params; keeping the append order caller-side avoids relying on
   * whether extra unused bind parameters are tolerated).
   */
  private async buildBaseQuery(
    code: string,
    includeInternal: boolean,
    bboxInput: GeoExtentInput | undefined,
    filters: GeoFeatureQueryFilterInput[],
    needsSchemaForSort: boolean,
  ): Promise<{ layer: GeoLayer; schema: GeoLayerSchema['fields']; params: ParamBuilder; baseFrom: string }> {
    const layer = await this.findVisibleLayer(code, includeInternal);
    const bbox = bboxInput ?? WORLD_EXTENT;

    // Schema is only ever needed to validate a field name (filter or sort)
    // against real data — skip the sample query entirely when neither is used.
    const schema = filters.length > 0 || needsSchemaForSort ? await this.deriveLayerSchema(layer.id) : [];

    const params = new ParamBuilder();
    const layerCodeParam = params.add(code);
    const includeInternalParam = params.add(includeInternal);
    const minLonParam = params.add(bbox.minLon);
    const minLatParam = params.add(bbox.minLat);
    const maxLonParam = params.add(bbox.maxLon);
    const maxLatParam = params.add(bbox.maxLat);

    const filterSql = filters
      .map((filter) => buildFilterClause(filter, schema, params))
      .map((clause) => `AND ${clause}`)
      .join('\n');

    // Same predicate structure as gis.features_geojson_in_bbox (P0-2) and
    // gis-service's /geometry route — reused here, not re-derived, because
    // a SQL-language function cannot safely accept a dynamic filter list
    // without EXECUTE, which would reintroduce the risk this module exists
    // to avoid. See docs/geo/postgis.md §4.
    const baseFrom = `
      FROM gis.territory_features tf
      INNER JOIN core.territories t ON t.id = tf.territory_id
      INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
      WHERE gl.code = ${layerCodeParam}
        AND (${includeInternalParam} OR (gis.geo_visibility_is_public(gl.visibility) AND gl.status = 'published'))
        AND (${includeInternalParam} OR gis.project_geometry_is_public(gl.code, tf.territory_id))
        AND ST_Intersects(
          tf.geometry,
          ST_MakeEnvelope(${minLonParam}, ${minLatParam}, ${maxLonParam}, ${maxLatParam}, 4326)
        )
        ${filterSql}
    `;

    return { layer, schema, params, baseFrom };
  }

  /** Bounded sample (SCHEMA_SAMPLE_SIZE rows) — never a full-layer scan. */
  private async deriveLayerSchema(layerId: string) {
    const result = await this.postgresService.query<{ properties_json: Record<string, unknown> }>(
      `
        SELECT tf.properties_json
        FROM gis.territory_features tf
        WHERE tf.layer_id = $1::uuid
        LIMIT $2
      `,
      [layerId, SCHEMA_SAMPLE_SIZE],
    );

    return deriveFieldsFromPropertySamples(result.rows.map((row) => row.properties_json ?? {}));
  }
}

type GeoLayerRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  group_name: string | null;
  layer_type: string;
  geometry_type: string | null;
  crs: string;
  visibility: string;
  status: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type GeoLayerMetadataRow = {
  layer_id: string;
  institution_id: string | null;
  source_name: string | null;
  owner: string | null;
  responsible: string | null;
  data_date: Date | null;
  update_frequency: string | null;
  license: string | null;
  classification: string | null;
  access_level: string | null;
  service_url: string | null;
  quality_status: string | null;
  metadata_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type FeatureRow = {
  id: string;
  territory_code: string;
  territory_name: string;
  territory_level: string;
  area_ha: string | number | null;
  updated_at: Date;
  properties_json: Record<string, unknown>;
  geometry_geojson: string;
};

type TerritorySearchRow = {
  territory_code: string;
  territory_name: string;
  territory_level: string;
  layer_code: string;
  layer_name: string;
};

type NearbyRow = {
  territory_code: string;
  territory_name: string;
  territory_level: string;
  distance_meters: string | number;
};

type IntersectionSummaryRow = {
  source_feature_count: string;
  target_feature_count: string;
  intersecting_source_count: string;
  intersecting_target_count: string;
  pair_count: string;
  intersection_area_ha: string;
};

type IntersectionFeatureRow = {
  source_id: string;
  source_code: string;
  source_name: string;
  target_id: string;
  target_code: string;
  target_name: string;
  intersection_area_ha: string;
  geometry_geojson: string;
};

type ProfileRow = {
  layer_id: string;
  feature_count: number;
  null_geometry_count: number;
  invalid_geometry_count: number;
  geometry_type: string | null;
  crs: string | null;
  min_lon: number | null;
  min_lat: number | null;
  max_lon: number | null;
  max_lat: number | null;
  profiled_at: Date | null;
};

type SavedViewRow = {
  id: string;
  user_id: string;
  name: string;
  view_state: GeoSavedViewState;
  created_at: Date;
  updated_at: Date;
};

function mapGeoLayerRow(row: GeoLayerRow): GeoLayer {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    groupName: row.group_name,
    layerType: row.layer_type,
    geometryType: row.geometry_type,
    crs: row.crs,
    visibility: row.visibility as GeoLayer['visibility'],
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapGeoLayerMetadataRow(row: GeoLayerMetadataRow): GeoLayerMetadata {
  return {
    layerId: row.layer_id,
    institutionId: row.institution_id,
    sourceName: row.source_name,
    owner: row.owner,
    responsible: row.responsible,
    dataDate: row.data_date ? row.data_date.toISOString().slice(0, 10) : null,
    updateFrequency: row.update_frequency,
    license: row.license,
    classification: row.classification,
    accessLevel: row.access_level,
    serviceUrl: row.service_url,
    qualityStatus: row.quality_status,
    metadata: row.metadata_json ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapProfileRow(row: ProfileRow): GeoDatasetProfile {
  const hasExtent =
    row.min_lon !== null && row.min_lat !== null && row.max_lon !== null && row.max_lat !== null;
  return {
    layerId: row.layer_id,
    featureCount: row.feature_count,
    nullGeometryCount: row.null_geometry_count,
    invalidGeometryCount: row.invalid_geometry_count,
    geometryType: row.geometry_type,
    crs: row.crs,
    extent: hasExtent
      ? { minLon: row.min_lon!, minLat: row.min_lat!, maxLon: row.max_lon!, maxLat: row.max_lat! }
      : null,
    profiledAt: row.profiled_at ? row.profiled_at.toISOString() : null,
  };
}

function mapSavedViewRow(row: SavedViewRow): GeoSavedView {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    viewState: row.view_state,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapTerritorySearchRow(row: TerritorySearchRow): GeoTerritorySearchResult {
  return {
    territoryCode: row.territory_code,
    territoryName: row.territory_name,
    territoryLevel: row.territory_level,
    layerCode: row.layer_code,
    layerName: row.layer_name,
  };
}

function mapFeatureRow(row: FeatureRow): GeoFeature {
  return {
    id: row.id,
    type: 'Feature',
    geometry: JSON.parse(row.geometry_geojson),
    properties: {
      code: row.territory_code,
      name: row.territory_name,
      level: row.territory_level,
      areaHa: row.area_ha === null ? null : Number(row.area_ha),
      updatedAt: row.updated_at.toISOString(),
      ...(row.properties_json ?? {}),
    },
  };
}
