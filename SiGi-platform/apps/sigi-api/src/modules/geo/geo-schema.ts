import { GeoLayerField, GeoLayerFieldType } from './geo.types';

/**
 * Derives a GeoLayerSchema from a layer's feature properties — the
 * mechanism spec §9 asks for so the frontend can auto-generate filters and
 * table columns instead of a hardcoded list per dataset (see the DNEA
 * filter definitions in GeoBiPage.tsx that this is meant to replace in a
 * later phase). Nothing here is invented: every field, and every inferred
 * type, comes from values actually observed in the layer's own data.
 */

/**
 * Every feature carries these — injected by gis-service's /geometry route
 * and mirrored here (services/gis-service/app/api/routes/geometry.py) — on
 * top of whatever the source dataset's properties_json contributes.
 * `level`'s enum values are the verified Territory.level domain
 * (libs/domain/src/index.ts), not a guess.
 */
export const BUILTIN_FIELD_NAMES = new Set(['code', 'name', 'level', 'areaHa']);

export const BUILTIN_FIELDS: GeoLayerField[] = [
  {
    name: 'name',
    label: 'Nombre',
    type: 'string',
    unit: null,
    enumValues: null,
    filterable: true,
    sortable: true,
    visible: true,
  },
  {
    name: 'code',
    label: 'Código',
    type: 'string',
    unit: null,
    enumValues: null,
    filterable: true,
    sortable: true,
    visible: true,
  },
  {
    name: 'level',
    label: 'Nivel',
    type: 'enum',
    unit: null,
    enumValues: ['country', 'region', 'province', 'district', 'custom'],
    filterable: true,
    sortable: true,
    visible: true,
  },
  {
    name: 'areaHa',
    label: 'Área',
    type: 'number',
    unit: 'ha',
    enumValues: null,
    filterable: true,
    sortable: true,
    visible: true,
  },
];

/** Bounded, cheap sample — schema derivation is never a full-layer scan. */
export const SCHEMA_SAMPLE_SIZE = 500;
const ENUM_DISTINCT_THRESHOLD = 15;
const ENUM_MIN_SAMPLE = 3;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;

export function deriveFieldsFromPropertySamples(
  samples: Array<Record<string, unknown>>,
): GeoLayerField[] {
  const observed = new Map<string, unknown[]>();

  for (const properties of samples) {
    for (const [key, value] of Object.entries(properties ?? {})) {
      if (BUILTIN_FIELD_NAMES.has(key)) {
        continue;
      }
      if (!observed.has(key)) {
        observed.set(key, []);
      }
      observed.get(key)!.push(value);
    }
  }

  const derivedFields = Array.from(observed.entries()).map(([name, values]) => inferField(name, values));

  return [...BUILTIN_FIELDS, ...derivedFields].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

function inferField(name: string, rawValues: unknown[]): GeoLayerField {
  const values = rawValues.filter((value) => value !== null && value !== undefined);
  const type = inferFieldType(values);
  const enumValues =
    type === 'enum' ? Array.from(new Set(values.map((value) => String(value)))).sort() : null;

  return {
    name,
    label: humanizeFieldName(name),
    type,
    unit: null,
    enumValues,
    filterable: true,
    sortable: true,
    visible: true,
  };
}

function inferFieldType(values: unknown[]): GeoLayerFieldType {
  if (values.length === 0) {
    return 'string';
  }
  if (values.every((value) => typeof value === 'boolean')) {
    return 'boolean';
  }
  if (values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return 'number';
  }
  if (values.every((value) => typeof value === 'string' && ISO_DATE_PATTERN.test(value))) {
    return 'date';
  }

  const distinct = new Set(values.map((value) => String(value)));
  if (distinct.size <= ENUM_DISTINCT_THRESHOLD && values.length >= ENUM_MIN_SAMPLE) {
    return 'enum';
  }

  return 'string';
}

/** Mechanical humanization only — never a translation, per "no inventar metadatos". */
function humanizeFieldName(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  return spaced.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
