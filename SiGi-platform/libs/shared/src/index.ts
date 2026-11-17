export type Identifier = string;

export type Timestamp = string;

export const SIGI_ROLES = [
  'superadmin',
  'national_admin',
  'institution_editor',
  'technical_validator',
  'read_consumer',
  'technical_integration',
] as const;

export type SigiRoleCode = (typeof SIGI_ROLES)[number] | (string & {});

export const SYNC_JOB_STATUSES = [
  'queued',
  'dispatching',
  'running',
  'completed',
  'partial_failed',
  'failed',
] as const;

export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];

const MOJIBAKE_PATTERN = /(?:Ã.|Â.|â.|¤|�)/;

export function normalizeApiText<T>(value: T): T {
  if (typeof value === 'string') {
    return normalizeString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeApiText(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeApiText(nestedValue),
      ]),
    ) as T;
  }

  return value;
}

/**
 * P0-6/P0-7 dynamic filter form → server filter conversion used by the
 * authenticated Mapa SIGI catalog.
 * Deliberately duck-typed against @sigi/domain's GeoLayerField/
 * GeoFeatureQueryFilter (structurally compatible, not imported) — @sigi/domain
 * already imports from @sigi/shared, so importing @sigi/domain back here
 * would be circular.
 */
export type GeoFilterableFieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum';

export type GeoFilterableField = {
  name: string;
  type: GeoFilterableFieldType;
  filterable: boolean;
  enumValues?: string[] | null;
};

export type GeoFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';

export type GeoFilterValue = string | string[] | { min: string; max: string } | undefined;
export type GeoFilterFormState = Record<string, GeoFilterValue>;

export type GeoFilterResult = { field: string; operator: GeoFilterOperator; value: unknown };

export function buildGeoFiltersFromForm(
  fields: GeoFilterableField[],
  form: GeoFilterFormState,
): GeoFilterResult[] {
  const filters: GeoFilterResult[] = [];

  for (const field of fields) {
    if (!field.filterable) {
      continue;
    }
    const raw = form[field.name];
    if (raw === undefined) {
      continue;
    }

    switch (field.type) {
      case 'string': {
        const text = typeof raw === 'string' ? raw.trim() : '';
        if (text) {
          filters.push({ field: field.name, operator: 'contains', value: text });
        }
        break;
      }
      case 'number':
      case 'date': {
        const range = raw as { min: string; max: string } | undefined;
        if (range?.min) {
          filters.push({
            field: field.name,
            operator: 'gte',
            value: field.type === 'number' ? Number(range.min) : range.min,
          });
        }
        if (range?.max) {
          filters.push({
            field: field.name,
            operator: 'lte',
            value: field.type === 'number' ? Number(range.max) : range.max,
          });
        }
        break;
      }
      case 'boolean': {
        if (raw === 'true' || raw === 'false') {
          filters.push({ field: field.name, operator: 'eq', value: raw === 'true' });
        }
        break;
      }
      case 'enum': {
        const selected = raw as string[] | undefined;
        if (selected && selected.length > 0 && field.enumValues && selected.length < field.enumValues.length) {
          filters.push({ field: field.name, operator: 'in', value: selected });
        }
        break;
      }
      default:
        break;
    }
  }

  return filters;
}

function normalizeString(value: string): string {
  if (!MOJIBAKE_PATTERN.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded.includes('\u0000') ? value : decoded;
  } catch {
    return value;
  }
}
