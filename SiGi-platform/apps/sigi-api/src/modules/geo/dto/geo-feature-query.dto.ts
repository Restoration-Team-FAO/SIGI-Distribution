import { BadRequestException } from '@nestjs/common';

/**
 * Manual query-param validation, following this codebase's existing
 * convention (see geospatial-catalog.service.ts's normalize()/validate()
 * helpers) rather than introducing class-validator, which is not a
 * dependency of sigi-api. Every parser throws BadRequestException with a
 * message identifying the offending param — never accepts, coerces away, or
 * silently drops a malformed value.
 */

export type GeoExtentInput = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export type GeoFeatureQueryFilterInput = {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: unknown;
};

export type GeoSortInput = { field: string; direction: 'asc' | 'desc' };

export type GeoExportFormat = 'csv' | 'xlsx' | 'geojson';
const ALLOWED_EXPORT_FORMATS: GeoExportFormat[] = ['csv', 'xlsx', 'geojson'];

const MIN_LON = -180;
const MAX_LON = 180;
const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_ZOOM = 0;
const MAX_ZOOM = 22;

export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 1000;

const ALLOWED_OPERATORS = new Set<GeoFeatureQueryFilterInput['operator']>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
]);

/** `bbox=minLon,minLat,maxLon,maxLat` — the OGC API - Features convention. */
export function parseBboxParam(raw: string | undefined): GeoExtentInput | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }

  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new BadRequestException(
      'bbox debe tener el formato "minLon,minLat,maxLon,maxLat" con cuatro números.',
    );
  }

  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon < MIN_LON || maxLon > MAX_LON || minLat < MIN_LAT || maxLat > MAX_LAT) {
    throw new BadRequestException(
      `bbox fuera de rango geográfico válido (lon ${MIN_LON}..${MAX_LON}, lat ${MIN_LAT}..${MAX_LAT}).`,
    );
  }
  if (minLon >= maxLon || minLat >= maxLat) {
    throw new BadRequestException('bbox inválido: el mínimo debe ser menor que el máximo en cada eje.');
  }

  return { minLon, minLat, maxLon, maxLat };
}

export function parseZoomParam(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }

  const zoom = Number(raw);
  if (!Number.isFinite(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
    throw new BadRequestException(`zoom debe ser un número entre ${MIN_ZOOM} y ${MAX_ZOOM}.`);
  }

  return Math.floor(zoom);
}

export function parsePageParam(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }

  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) {
    throw new BadRequestException('page debe ser un entero mayor o igual a 1.');
  }

  return page;
}

/**
 * Clamped, never rejected outright — a caller asking for more than
 * MAX_PAGE_SIZE gets MAX_PAGE_SIZE, consistent with how this codebase
 * clamps other caller-supplied limits (e.g. SHAPEFILE_PREVIEW_LIMIT).
 * This is what makes "never return an unbounded layer" (docs/geo/postgis.md
 * §4) a server-side guarantee rather than a client convention.
 */
export function parsePageSizeParam(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }

  const pageSize = Number(raw);
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new BadRequestException('pageSize debe ser un entero mayor o igual a 1.');
  }

  return Math.min(pageSize, MAX_PAGE_SIZE);
}

/**
 * Shared per-filter validation, used both by `filters` query params
 * (`parseFiltersParam`) and by saved-view bodies (P1-4,
 * `parseSavedViewCreateInput`) — one definition of "what is a valid
 * filter", not two that could drift.
 */
function parseFilterArray(parsed: unknown, contextLabel: string): GeoFeatureQueryFilterInput[] {
  if (!Array.isArray(parsed)) {
    throw new BadRequestException(`${contextLabel} debe ser un arreglo.`);
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`${contextLabel}[${index}] debe ser un objeto.`);
    }

    const { field, operator, value } = item as Record<string, unknown>;
    if (typeof field !== 'string' || field.trim() === '') {
      throw new BadRequestException(`${contextLabel}[${index}].field debe ser un texto no vacío.`);
    }
    if (typeof operator !== 'string' || !ALLOWED_OPERATORS.has(operator as GeoFeatureQueryFilterInput['operator'])) {
      throw new BadRequestException(
        `${contextLabel}[${index}].operator debe ser uno de: ${Array.from(ALLOWED_OPERATORS).join(', ')}.`,
      );
    }
    if (value === undefined) {
      throw new BadRequestException(`${contextLabel}[${index}].value es requerido.`);
    }

    return { field: field.trim(), operator, value } as GeoFeatureQueryFilterInput;
  });
}

/** `filters` — a JSON-encoded array, URL-encoded as a single query param. */
export function parseFiltersParam(raw: string | undefined): GeoFeatureQueryFilterInput[] | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('filters debe ser un arreglo JSON válido codificado en la URL.');
  }

  return parseFilterArray(parsed, 'filters');
}

/** `sort=<fieldName>&order=asc|desc` (P0-7 attribute table). */
export function parseSortParam(sortRaw: string | undefined, orderRaw: string | undefined): GeoSortInput | undefined {
  if (sortRaw === undefined || sortRaw.trim() === '') {
    return undefined;
  }

  const direction = orderRaw?.trim().toLowerCase();
  if (direction !== undefined && direction !== '' && direction !== 'asc' && direction !== 'desc') {
    throw new BadRequestException('order debe ser "asc" o "desc".');
  }

  return { field: sortRaw.trim(), direction: direction === 'desc' ? 'desc' : 'asc' };
}

/**
 * `format=csv|xlsx|geojson` (P0-8 export). Required, not defaulted — a
 * download endpoint should never silently produce a format the caller
 * didn't ask for.
 */
export function parseFormatParam(raw: string | undefined): GeoExportFormat {
  const value = raw?.trim().toLowerCase();
  if (!value || !ALLOWED_EXPORT_FORMATS.includes(value as GeoExportFormat)) {
    throw new BadRequestException(
      `format debe ser uno de: ${ALLOWED_EXPORT_FORMATS.join(', ')}.`,
    );
  }
  return value as GeoExportFormat;
}

/**
 * `q=<term>` (P1-1 territorial search, spec §18). A minimum length avoids a
 * pattern-matching query over every territory/layer combination on every
 * keystroke — the frontend also debounces, but the server never trusts that
 * alone.
 */
export const MIN_SEARCH_TERM_LENGTH = 2;
export const MAX_SEARCH_RESULTS = 20;

export function parseSearchTermParam(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value || value.length < MIN_SEARCH_TERM_LENGTH) {
    throw new BadRequestException(`q debe tener al menos ${MIN_SEARCH_TERM_LENGTH} caracteres.`);
  }
  return value;
}

/**
 * `POST /geo/saved-views` body validation (P1-4, spec §19). `viewState` is
 * a UI-state snapshot the frontend captured itself — still validated here
 * exactly as strictly as any other client input, never trusted just
 * because it "came from our own frontend".
 */
export const MAX_SAVED_VIEW_NAME_LENGTH = 200;
export const MAX_SAVED_VIEW_LAYERS = 50;

export type GeoSavedViewLayerStateInput = {
  code: string;
  color: string;
  opacity: number;
  filters: GeoFeatureQueryFilterInput[];
};

export type GeoSavedViewCreateInput = {
  name: string;
  activeLayers: GeoSavedViewLayerStateInput[];
};

export function parseSavedViewCreateInput(body: unknown): GeoSavedViewCreateInput {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto.');
  }
  const { name, viewState } = body as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim() === '') {
    throw new BadRequestException('name debe ser un texto no vacío.');
  }
  if (name.trim().length > MAX_SAVED_VIEW_NAME_LENGTH) {
    throw new BadRequestException(`name no puede superar ${MAX_SAVED_VIEW_NAME_LENGTH} caracteres.`);
  }

  if (!viewState || typeof viewState !== 'object') {
    throw new BadRequestException('viewState debe ser un objeto.');
  }
  const { activeLayers } = viewState as Record<string, unknown>;
  if (!Array.isArray(activeLayers)) {
    throw new BadRequestException('viewState.activeLayers debe ser un arreglo.');
  }
  if (activeLayers.length > MAX_SAVED_VIEW_LAYERS) {
    throw new BadRequestException(`viewState.activeLayers no puede tener más de ${MAX_SAVED_VIEW_LAYERS} capas.`);
  }

  const parsedLayers = activeLayers.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`viewState.activeLayers[${index}] debe ser un objeto.`);
    }
    const { code, color, opacity, filters } = item as Record<string, unknown>;
    if (typeof code !== 'string' || code.trim() === '') {
      throw new BadRequestException(`viewState.activeLayers[${index}].code debe ser un texto no vacío.`);
    }
    if (typeof color !== 'string' || color.trim() === '') {
      throw new BadRequestException(`viewState.activeLayers[${index}].color debe ser un texto no vacío.`);
    }
    if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new BadRequestException(`viewState.activeLayers[${index}].opacity debe ser un número entre 0 y 1.`);
    }
    const parsedFilters = filters === undefined ? [] : parseFilterArray(filters, `viewState.activeLayers[${index}].filters`);

    return { code: code.trim(), color: color.trim(), opacity, filters: parsedFilters };
  });

  return { name: name.trim(), activeLayers: parsedLayers };
}

/**
 * `field=<name>` (P1-5 chart field, spec §12). Required — a stats endpoint
 * with no field would have to guess what to aggregate.
 */
export const MAX_STATS_GROUPS = 20;

export function parseStatsFieldParam(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) {
    throw new BadRequestException('field es requerido.');
  }
  return value;
}

/**
 * P1-6 — proximity search body validation (spec §10, "consultas
 * espaciales"). `ST_DWithin` on a geography cast is buffer + intersection
 * in one operation: "every feature whose distance to `geometry` is ≤
 * `radiusMeters`" is exactly "features intersecting a buffer(geometry,
 * radiusMeters)" — scoped to this single, well-defined operation rather
 * than exposing raw buffer/intersection primitives with no UI decision
 * yet made about what a user would do with them. See
 * docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.16 for the scope rationale.
 */
export const MAX_NEARBY_RADIUS_METERS = 50000;
export const MAX_NEARBY_RESULTS = 100;

const ALLOWED_GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

export type GeoNearbyQueryInput = {
  geometry: Record<string, unknown>;
  radiusMeters: number;
};

export function parseNearbyQueryInput(body: unknown): GeoNearbyQueryInput {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto.');
  }
  const { geometry, radiusMeters } = body as Record<string, unknown>;

  if (!geometry || typeof geometry !== 'object') {
    throw new BadRequestException('geometry debe ser un objeto GeoJSON.');
  }
  const geometryType = (geometry as Record<string, unknown>).type;
  if (typeof geometryType !== 'string' || !ALLOWED_GEOMETRY_TYPES.has(geometryType)) {
    throw new BadRequestException(
      `geometry.type debe ser uno de: ${Array.from(ALLOWED_GEOMETRY_TYPES).join(', ')}.`,
    );
  }
  if (!('coordinates' in (geometry as Record<string, unknown>))) {
    throw new BadRequestException('geometry.coordinates es requerido.');
  }

  if (typeof radiusMeters !== 'number' || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new BadRequestException('radiusMeters debe ser un número mayor que 0.');
  }
  if (radiusMeters > MAX_NEARBY_RADIUS_METERS) {
    throw new BadRequestException(`radiusMeters no puede superar ${MAX_NEARBY_RADIUS_METERS} metros.`);
  }

  return { geometry: geometry as Record<string, unknown>, radiusMeters };
}

/**
 * Layer-on-layer overlay analysis. Layer identifiers are resolved through
 * GeoService's visibility boundary; accepting codes here never bypasses the
 * caller's public/internal scope.
 */
export type GeoIntersectionQueryInput = {
  sourceLayerCode: string;
  targetLayerCode: string;
};

export function parseIntersectionQueryInput(body: unknown): GeoIntersectionQueryInput {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto.');
  }
  const { sourceLayerCode, targetLayerCode } = body as Record<string, unknown>;
  const normalizeCode = (value: unknown, field: string) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} es requerido.`);
    }
    const normalized = value.trim();
    if (normalized.length > 120 || !/^[a-zA-Z0-9_.:-]+$/.test(normalized)) {
      throw new BadRequestException(`${field} no contiene un código de capa válido.`);
    }
    return normalized;
  };

  const source = normalizeCode(sourceLayerCode, 'sourceLayerCode');
  const target = normalizeCode(targetLayerCode, 'targetLayerCode');
  if (source === target) {
    throw new BadRequestException('Selecciona dos capas diferentes para ejecutar el cruce.');
  }
  return { sourceLayerCode: source, targetLayerCode: target };
}
