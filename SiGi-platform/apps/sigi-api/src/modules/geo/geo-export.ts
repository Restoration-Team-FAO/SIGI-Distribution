import * as XLSX from 'xlsx';
import { GeoFeature, GeoLayer } from './geo.types';
import { GeoFeatureQueryFilterInput, GeoSortInput } from './dto/geo-feature-query.dto';

/**
 * P0-8 — CSV/Excel/GeoJSON export of the current filtered result set (spec
 * §17). Reuses the exact rows GeoService.exportFeatures already fetched —
 * no separate export-specific query path, no re-simplified geometry (export
 * always gets full-precision geometry; zoom-based simplification, P0-3, is
 * a map-rendering concern only).
 *
 * Every format carries fecha/usuario/fuente/filtros/dataset (spec §17's
 * "para exportaciones incluir siempre que sea viable"): XLSX as a second
 * "Metadata" sheet, GeoJSON as a top-level `metadata` foreign member
 * (valid per the GeoJSON spec, which allows additional top-level members),
 * CSV as a leading `#`-commented block — CSV has no native place for this,
 * so it is the one format where metadata is advisory text rather than
 * structured, but it is still present in the file itself, not only in the
 * audit log.
 */

export type GeoExportMeta = {
  layer: GeoLayer;
  generatedAt: string;
  actorLabel: string;
  filters: GeoFeatureQueryFilterInput[];
  sort: GeoSortInput | null;
  totalFeatures: number;
  exportedCount: number;
  truncated: boolean;
};

/** Always present on every feature (see geo.service.ts's mapFeatureRow) — listed first, in this order. */
const BUILTIN_COLUMNS = ['code', 'name', 'level', 'areaHa', 'updatedAt'];

function normalizeCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value as string | number | boolean;
}

function buildColumns(features: GeoFeature[]): string[] {
  const extraKeys = new Set<string>();
  for (const feature of features) {
    for (const key of Object.keys(feature.properties)) {
      if (!BUILTIN_COLUMNS.includes(key)) {
        extraKeys.add(key);
      }
    }
  }
  return [...BUILTIN_COLUMNS, ...Array.from(extraKeys).sort((a, b) => a.localeCompare(b))];
}

function buildRows(features: GeoFeature[]): Record<string, unknown>[] {
  const columns = buildColumns(features);
  return features.map((feature) => {
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      row[column] = normalizeCellValue(feature.properties[column]);
    }
    return row;
  });
}

function describeFilters(filters: GeoFeatureQueryFilterInput[]): string {
  if (filters.length === 0) {
    return 'ninguno';
  }
  return filters.map((filter) => `${filter.field} ${filter.operator} ${JSON.stringify(filter.value)}`).join(' · ');
}

function describeSort(sort: GeoSortInput | null): string {
  return sort ? `${sort.field} (${sort.direction})` : 'orden por defecto (nombre)';
}

export function buildCsvExport(features: GeoFeature[], meta: GeoExportMeta): string {
  const worksheet = XLSX.utils.json_to_sheet(buildRows(features));
  const csvBody = XLSX.utils.sheet_to_csv(worksheet);

  const header = [
    '# SIGI - Exportación geoespacial',
    `# Capa: ${meta.layer.name} (${meta.layer.code})`,
    `# Fecha: ${meta.generatedAt}`,
    `# Usuario: ${meta.actorLabel}`,
    '# Fuente: SIGI /geo/layers/:code/export',
    `# Filtros: ${describeFilters(meta.filters)}`,
    `# Orden: ${describeSort(meta.sort)}`,
    `# Registros exportados: ${meta.exportedCount} de ${meta.totalFeatures}${meta.truncated ? ' (resultado truncado, ver docs/geo/postgis.md)' : ''}`,
    '',
  ].join('\n');

  return `${header}\n${csvBody}`;
}

export function buildXlsxExport(features: GeoFeature[], meta: GeoExportMeta): Buffer {
  const dataSheet = XLSX.utils.json_to_sheet(buildRows(features));
  const metadataSheet = XLSX.utils.aoa_to_sheet([
    ['SIGI - Exportación geoespacial'],
    ['Capa', `${meta.layer.name} (${meta.layer.code})`],
    ['Fecha', meta.generatedAt],
    ['Usuario', meta.actorLabel],
    ['Fuente', 'SIGI /geo/layers/:code/export'],
    ['Filtros', describeFilters(meta.filters)],
    ['Orden', describeSort(meta.sort)],
    ['Registros exportados', meta.exportedCount],
    ['Total disponible', meta.totalFeatures],
    ['Truncado', meta.truncated ? 'Sí' : 'No'],
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Datos');
  XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildGeoJsonExport(features: GeoFeature[], meta: GeoExportMeta): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    features,
    // Foreign member — valid per the GeoJSON spec (RFC 7946 §6.1 allows
    // additional top-level members); most parsers ignore unknown keys.
    metadata: {
      capa: { codigo: meta.layer.code, nombre: meta.layer.name },
      fechaGeneracion: meta.generatedAt,
      usuario: meta.actorLabel,
      fuente: 'SIGI /geo/layers/:code/export',
      filtrosAplicados: meta.filters,
      orden: meta.sort,
      totalDisponible: meta.totalFeatures,
      totalExportado: meta.exportedCount,
      truncado: meta.truncated,
    },
  };
}
