/**
 * Local response shapes for the geo module. sigi-api does not depend on
 * @sigi/domain — the backend has always defined its own row/response types
 * per module (see geo-bi.service.ts) — but every shape here is deliberately
 * kept field-for-field identical to its @sigi/domain counterpart
 * (libs/domain/src/index.ts) so the wire format matches by construction.
 */

import { GeoFeatureQueryFilterInput } from './dto/geo-feature-query.dto';

export type GeoVisibility = 'public' | 'institutional' | 'restricted' | 'private' | 'internal';

export type GeoLayer = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  groupName: string | null;
  layerType: string;
  geometryType: string | null;
  crs: string;
  visibility: GeoVisibility;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type GeoLayerMetadata = {
  layerId: string;
  institutionId: string | null;
  sourceName: string | null;
  owner: string | null;
  responsible: string | null;
  dataDate: string | null;
  updateFrequency: string | null;
  license: string | null;
  classification: string | null;
  accessLevel: string | null;
  serviceUrl: string | null;
  qualityStatus: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type GeoLayerFieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum';

export type GeoLayerField = {
  name: string;
  label: string;
  type: GeoLayerFieldType;
  unit: string | null;
  enumValues: string[] | null;
  filterable: boolean;
  sortable: boolean;
  visible: boolean;
};

export type GeoLayerSchema = {
  layerId: string;
  fields: GeoLayerField[];
};

export type GeoExtent = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

/**
 * P1-2 — cached per-layer profile (spec §11, "estadísticas dinámicas").
 * Sourced from gis.geo_layer_profile, populated by
 * gis.refresh_geo_layer_profile() — never computed inline on a request
 * path. `null` (not an error) when the layer has never been profiled — see
 * docs/geo/postgis.md §2 and MAPA_SIGI_DIAGNOSTICO.md §9.12 for why
 * automatic re-profiling after import is still an open gap, not silently
 * resolved by this endpoint.
 */
export type GeoDatasetProfile = {
  layerId: string;
  featureCount: number;
  nullGeometryCount: number;
  invalidGeometryCount: number;
  geometryType: string | null;
  crs: string | null;
  extent: GeoExtent | null;
  profiledAt: string | null;
};

export type GeoFeature = {
  id: string;
  type: 'Feature';
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
};

export type GeoFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoFeature[];
};

export type GeoFeatureQueryResult = {
  featureCollection: GeoFeatureCollection;
  page: number;
  pageSize: number;
  totalFeatures: number;
};

/**
 * P1-1 — one (territory, layer) match for cross-layer territorial search
 * (spec §18). A territory can appear in more than one layer (e.g. a
 * boundary layer and a project-territories layer both referencing the same
 * core.territories row) — each is a distinct, independently selectable
 * result, not collapsed into one.
 */
export type GeoTerritorySearchResult = {
  territoryCode: string;
  territoryName: string;
  territoryLevel: string;
  layerCode: string;
  layerName: string;
};

/**
 * P1-6 — one proximity-search result (spec §10, "consultas espaciales").
 * Same shape as GeoTerritorySearchResult plus distance, deliberately — the
 * frontend reuses the exact same "activate layer if needed, then select"
 * flow P1-1's territorial search already built for search results.
 */
export type GeoNearbyTerritoryResult = GeoTerritorySearchResult & { distanceMeters: number };

export type GeoLayerIntersectionMatch = {
  sourceCode: string;
  sourceName: string;
  targetCode: string;
  targetName: string;
  intersectionAreaHa: number;
};

export type GeoLayerIntersectionResult = {
  sourceLayer: GeoLayer;
  targetLayer: GeoLayer;
  summary: {
    sourceFeatureCount: number;
    targetFeatureCount: number;
    intersectingSourceCount: number;
    intersectingTargetCount: number;
    pairCount: number;
    intersectionAreaHa: number;
  };
  featureCollection: GeoFeatureCollection;
  matches: GeoLayerIntersectionMatch[];
  truncated: boolean;
};

/**
 * P1-4 — one active layer's captured configuration inside a saved view
 * (spec §19). Deliberately does not include viewport (map center/zoom):
 * MultiLayerMap already auto-fits to the active layers' combined bounds on
 * load, so restoring the layer set restores a sane view without needing a
 * new "controlled viewport" capability that does not exist yet.
 */
export type GeoSavedViewLayerState = {
  code: string;
  color: string;
  opacity: number;
  filters: GeoFeatureQueryFilterInput[];
};

export type GeoSavedViewState = {
  activeLayers: GeoSavedViewLayerState[];
};

export type GeoSavedView = {
  id: string;
  userId: string;
  name: string;
  viewState: GeoSavedViewState;
  createdAt: string;
  updatedAt: string;
};

/**
 * P1-5 — distribution of the current filtered result set for one field
 * (spec §12, "Mapa + BI"), never the current table page — the whole point
 * is that a chart of a 20-row page would misrepresent the real filtered
 * distribution. `kind` follows the field's own schema type (P0-3): string/
 * boolean/enum group by distinct value; number/date aggregate instead —
 * grouping raw numeric/date values isn't meaningful without binning, which
 * is out of scope here.
 */
export type GeoLayerFieldStatsGroup = { value: string; count: number };

export type GeoLayerFieldStats =
  | { field: string; kind: 'grouped'; groups: GeoLayerFieldStatsGroup[]; truncated: boolean }
  | { field: string; kind: 'numeric'; count: number; min: number | null; max: number | null; avg: number | null }
  | { field: string; kind: 'date'; count: number; min: string | null; max: string | null };
