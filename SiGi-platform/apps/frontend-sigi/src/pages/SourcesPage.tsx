import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DataSource, IntegrationConnector } from '@sigi/domain';
import {
  workspaceApi,
  type ImportBatch,
  type ImportBatchError,
  type ImportBatchRule,
  type OdooConnectionTestResult,
  type OdooMappingProfile,
  type OdooShapefileImportResult,
  type OdooShapefilePreview,
  type OdooSource,
  type OdooSourceBatchError,
  type OdooSourcePreviewResult,
  type SourceMappingProfile,
  type SyncJobResponse,
} from '../services/api';
import {
  DetailList,
  MessageBlock,
  MetricCard,
  MetricGrid,
  Panel,
  PanelGrid,
  StatPill,
} from '../components/section-kit';
import { ModuleWorkspaceHeader } from '../components/ModuleWorkspaceHeader';
import { DataWorkspaceHeader } from '../components/DataWorkspaceHeader';
import { useEgi } from '../contexts/EgiContext';
import { canUseGlobalView } from '../utils/global-view';
import { hasPermission } from '../utils/permissions';
import { DataTable, StatusBadge } from '../components/data-display';

type SourceViewModel = DataSource & {
  institutionName: string;
  connectorName: string | null;
};

type ImportFilterEntity = 'all' | ImportBatch['entityType'];
type ImportFilterStatus = 'all' | ImportBatch['status'];
type ImportAttentionFilter = 'all' | 'needs_review' | 'geographic';
type UploadEntityMode = 'auto' | ImportBatch['entityType'];
type OdooFormState = {
  sourceName: string;
  sourceCode: string;
  institutionId: string;
  baseUrl: string;
  databaseName: string;
  username: string;
  password: string;
  mappingProfileId: string;
  isActive: boolean;
};

type OdooIndicatorCoverage = {
  extractedRows: number;
  validRows: number;
  invalidRows: number;
  promotedRows: number;
  batchStatus: string;
};

const REQUIRED_HEADERS_BY_ENTITY: Record<ImportBatch['entityType'], string[]> = {
  institutions: ['institution_code', 'institution_name', 'country'],
  projects: [
    'project_code',
    'project_name',
    'lead_institution_code',
    'start_date',
    'end_date',
    'total_area_ha',
  ],
  project_indicators: ['project_code', 'indicator_code', 'unit'],
  project_territories: ['project_code', 'country', 'area_ha'],
};

const COLUMN_MAPPING_EXAMPLES: Record<ImportBatch['entityType'], string> = {
  institutions: JSON.stringify(
    {
      institution_code: 'id_productor',
      institution_name: 'opciones',
      country: 'provincia',
    },
    null,
    2,
  ),
  projects: JSON.stringify(
    {
      project_code: 'cod_finca',
      project_name: 'id_finca',
      lead_institution_code: 'id_productor',
      start_date: 'ano',
      end_date: 'ano',
      total_area_ha: 'area',
    },
    null,
    2,
  ),
  project_indicators: JSON.stringify(
    {
      project_code: 'cod_finca',
      indicator_code: 'id',
      indicator_name: 'opciones',
      unit: 'activa',
      value_numeric: 'area',
      observed_at: 'ano',
    },
    null,
    2,
  ),
  project_territories: JSON.stringify(
    {
      project_code: 'cod_finca',
      territory_code: 'distrito',
      territory_name: 'canton',
      territory_level: 'provincia',
      country: 'provincia',
      area_ha: 'area',
    },
    null,
    2,
  ),
};

const OPERATIONAL_MAG_INTA_SOURCE_CODE = 'excel-mag-inta-operativo';
const LEGACY_MAG_INTA_SOURCE_CODE = 'excel-demo-mag-inta';

const SOURCE_CODE_ALIASES: Record<string, string[]> = {
  [OPERATIONAL_MAG_INTA_SOURCE_CODE]: [OPERATIONAL_MAG_INTA_SOURCE_CODE, LEGACY_MAG_INTA_SOURCE_CODE],
  [LEGACY_MAG_INTA_SOURCE_CODE]: [LEGACY_MAG_INTA_SOURCE_CODE, OPERATIONAL_MAG_INTA_SOURCE_CODE],
};

const FRIENDLY_SOURCE_CODE_LABELS: Record<string, string> = {
  [LEGACY_MAG_INTA_SOURCE_CODE]: OPERATIONAL_MAG_INTA_SOURCE_CODE,
};

function getFriendlySourceCodeLabel(value: string) {
  const trimmed = value.trim();
  return FRIENDLY_SOURCE_CODE_LABELS[trimmed] ?? trimmed;
}

function matchesSourceCode(value: string | null | undefined, expectedCode: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }
  const aliases = SOURCE_CODE_ALIASES[expectedCode] ?? [expectedCode];
  return aliases.includes(normalized);
}

function getSourceTone(source: SourceViewModel): 'neutral' | 'good' | 'warn' {
  if (source.status === 'active' && source.connectorId) {
    return 'good';
  }
  if (source.status === 'active') {
    return 'neutral';
  }
  return 'warn';
}

function getConnectorTone(connector: IntegrationConnector): 'neutral' | 'good' | 'warn' {
  return connector.status === 'active' ? 'good' : 'warn';
}

function getOdooStatusTone(status: string): 'neutral' | 'good' | 'warn' | 'danger' {
  if (status === 'healthy' || status === 'configured') {
    return 'good';
  }
  if (status === 'syncing') {
    return 'neutral';
  }
  if (status === 'warning' || status === 'connection_error') {
    return 'warn';
  }
  if (status === 'sync_failed' || status === 'failed') {
    return 'danger';
  }
  return 'neutral';
}

function getImportTone(batch: ImportBatch): 'neutral' | 'good' | 'warn' | 'danger' {
  if (batch.status === 'failed') {
    return 'danger';
  }
  if (batch.invalidRows > 0 || batch.status === 'completed_with_errors') {
    return 'warn';
  }
  if (batch.status === 'completed') {
    return 'good';
  }
  return 'neutral';
}

function getSourceStatusLabel(status: string): string {
  return (
    {
      active: 'Activa',
      inactive: 'Inactiva',
    }[status] ?? status
  );
}

function getConnectorStatusLabel(status: string): string {
  return (
    {
      active: 'Activo',
      inactive: 'Inactivo',
    }[status] ?? status
  );
}

function getImportStatusLabel(status: ImportBatch['status']): string {
  return (
    {
      queued: 'En cola',
      received: 'Recibido',
      running: 'En ejecución',
      completed: 'Completado',
      completed_with_errors: 'Completado con observaciones',
      partial_failed: 'Completado con fallos parciales',
      failed: 'Fallido',
    }[status] ?? status
  );
}

function getRuleTone(rule: ImportBatchRule): 'good' | 'warn' | 'danger' | 'neutral' {
  if (rule.status === 'failed') {
    return 'danger';
  }
  if (rule.status === 'warning') {
    return 'warn';
  }
  if (rule.status === 'passed') {
    return 'good';
  }
  return 'neutral';
}

function getRuleLabel(ruleCode: string) {
  return (
    {
      row_validity: 'Validez de filas',
      required_fields_completeness: 'Campos requeridos',
      business_key_resolution: 'Resolución de claves',
      duplicate_keys_in_batch: 'Duplicidades en el lote',
      country_catalog_alignment: 'País contra catálogo operativo',
      source_country_scope_alignment: 'País dentro del alcance de la fuente',
      territory_level_catalog_alignment: 'Nivel territorial contra catálogo',
      territory_reference_consistency: 'Consistencia territorio / país / nivel',
    }[ruleCode] ?? ruleCode
  );
}

function getRuleSummaryText(rule: ImportBatchRule) {
  const prefix =
    rule.status === 'failed'
      ? 'Bloquea o deja observaciones'
      : rule.status === 'warning'
        ? 'Requiere revisión'
        : 'Sin observaciones';
  return `${prefix} · ${rule.affectedRows} fila(s) afectadas`;
}

function formatSourceScopeSummary(details: Record<string, unknown>) {
  const validationCatalog =
    details.validationCatalog && typeof details.validationCatalog === 'object'
      ? (details.validationCatalog as Record<string, unknown>)
      : null;
  const sourceScope =
    validationCatalog?.sourceScope && typeof validationCatalog.sourceScope === 'object'
      ? (validationCatalog.sourceScope as Record<string, unknown>)
      : null;

  if (!sourceScope) {
    return null;
  }

  const allowedCountries = Array.isArray(sourceScope.allowedCountries)
    ? sourceScope.allowedCountries.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const sourceCountry =
    typeof sourceScope.sourceCountry === 'string' && sourceScope.sourceCountry.trim().length > 0
      ? sourceScope.sourceCountry
      : null;
  const territorialScope =
    typeof sourceScope.territorialScope === 'string' && sourceScope.territorialScope.trim().length > 0
      ? sourceScope.territorialScope
      : null;
  const egiTerritorialScope =
    typeof sourceScope.egiTerritorialScope === 'string' && sourceScope.egiTerritorialScope.trim().length > 0
      ? sourceScope.egiTerritorialScope
      : null;

  return {
    sourceCountry,
    territorialScope,
    egiTerritorialScope,
    allowedCountries,
  };
}

function describeEgiScope(
  activeEgiName: string | null | undefined,
  activeEgiCode: string | null | undefined,
  globalViewScope: 'active' | 'global',
) {
  if (globalViewScope === 'global') {
    return 'vista global consolidada';
  }
  if (activeEgiName || activeEgiCode) {
    return `${activeEgiName ?? 'EGI'}${activeEgiCode ? ` (${activeEgiCode})` : ''}`;
  }
  return 'sin EGI activo';
}

function formatPreviewBbox(
  bbox:
    | {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
      }
    | null
    | undefined,
) {
  if (!bbox) {
    return 'No disponible';
  }
  return `${bbox.minLon}, ${bbox.minLat} → ${bbox.maxLon}, ${bbox.maxLat}`;
}

function formatBatchShapefilePreview(details: Record<string, unknown>) {
  const preview =
    details.shapefilePreview && typeof details.shapefilePreview === 'object'
      ? (details.shapefilePreview as Record<string, unknown>)
      : null;
  if (!preview) {
    return null;
  }

  const bbox =
    preview.bbox && typeof preview.bbox === 'object'
      ? (preview.bbox as {
          minLon: number;
          minLat: number;
          maxLon: number;
          maxLat: number;
        })
      : null;
  const geographicSummary =
    preview.geographicSummary && typeof preview.geographicSummary === 'object'
      ? (preview.geographicSummary as Record<string, unknown>)
      : null;
  const configuredNationalBBox =
    geographicSummary?.configuredNationalBBox &&
    typeof geographicSummary.configuredNationalBBox === 'object'
      ? (geographicSummary.configuredNationalBBox as {
          minLon: number;
          minLat: number;
          maxLon: number;
          maxLat: number;
        })
      : null;
  const countries = Array.isArray(preview.countries)
    ? preview.countries.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const territoryLevels = Array.isArray(preview.territoryLevels)
    ? preview.territoryLevels.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    fileName: typeof preview.fileName === 'string' ? preview.fileName : null,
    geometryType: typeof preview.geometryType === 'string' ? preview.geometryType : null,
    crs: typeof preview.crs === 'string' ? preview.crs : null,
    bbox,
    countries,
    territoryLevels,
    insideNationalBoundsRows:
      typeof geographicSummary?.insideNationalBoundsRows === 'number'
        ? geographicSummary.insideNationalBoundsRows
        : null,
    outsideNationalBoundsRows:
      typeof geographicSummary?.outsideNationalBoundsRows === 'number'
        ? geographicSummary.outsideNationalBoundsRows
        : null,
    configuredNationalBBox,
  };
}

function getShapefileIssueGuidance(code: string) {
  return {
    territory_code_not_found_in_catalog:
      'El código territorial no existe aún en SIGI. Revísalo o créalo antes de una promoción definitiva.',
    territory_name_mismatch:
      'El nombre no coincide con el catálogo SIGI. Homologarlo evita duplicidades o lecturas inconsistentes.',
    territory_level_mismatch:
      'El nivel territorial contradice el catálogo SIGI. Este caso debe corregirse antes de importar.',
    geometry_outside_national_bounds:
      'La geometría cae fuera del bbox nacional configurado. Revisa país, CRS o el archivo fuente.',
    project_code_required:
      'Falta project_code para poder vincular esta geometría con proyectos SIGI/Odoo.',
  }[code] ?? 'Revisa este hallazgo antes de continuar con el pipeline.';
}

function getBatchGeoGate(batch: ImportBatch) {
  if (batch.entityType !== 'project_territories') {
    return null;
  }

  const details = batch.details ?? {};
  const preview =
    details.shapefilePreview && typeof details.shapefilePreview === 'object'
      ? (details.shapefilePreview as Record<string, unknown>)
      : null;
  const geographicSummary =
    preview?.geographicSummary && typeof preview.geographicSummary === 'object'
      ? (preview.geographicSummary as Record<string, unknown>)
      : null;
  const outsideNationalBoundsRows =
    typeof geographicSummary?.outsideNationalBoundsRows === 'number'
      ? geographicSummary.outsideNationalBoundsRows
      : 0;

  if (batch.status === 'failed' || batch.invalidRows > 0) {
    return {
      tone: 'warn' as const,
      label: 'Geo bloqueado',
      hint: 'El lote conserva hallazgos que impiden una promoción geográfica confiable.',
    };
  }

  if (outsideNationalBoundsRows > 0) {
    return {
      tone: 'warn' as const,
      label: 'Geo con alerta',
      hint: 'Hay geometrías fuera del bbox nacional configurado.',
    };
  }

  return {
    tone: 'good' as const,
    label: 'Geo validado',
    hint: 'La capa pasó la validación geográfica visible para este lote.',
  };
}

function buildBatchErrorExportRows(errors: ImportBatchError[]) {
  const payloadKeys = Array.from(
    new Set(
      errors.flatMap((error) =>
        Object.keys(error.rawPayload ?? {}).filter((key) => key.trim().length > 0),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const rows = errors.map((error) => ({
    row_number: error.rowNumber,
    error_code: error.errorCode,
    error_message: error.errorMessage,
    ...Object.fromEntries(
      payloadKeys.map((key) => [key, formatCsvCell(error.rawPayload?.[key])]),
    ),
  }));

  return {
    headers: ['row_number', 'error_code', 'error_message', ...payloadKeys],
    rows,
  };
}

function extractBatchMissingHeaders(batch: ImportBatch | null) {
  if (!batch) {
    return [] as string[];
  }

  const details = batch.details ?? {};
  const detailsMissingHeaders = Array.isArray(details.missingHeaders)
    ? details.missingHeaders.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (detailsMissingHeaders.length > 0) {
    return detailsMissingHeaders;
  }

  const requiredHeaders = Array.isArray(details.requiredHeaders)
    ? details.requiredHeaders.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : REQUIRED_HEADERS_BY_ENTITY[batch.entityType];
  const mappedHeaders = Array.isArray(details.mappedHeaders)
    ? details.mappedHeaders.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return requiredHeaders.filter((header) => !mappedHeaders.includes(header));
}

function tokenizeHeader(value: string) {
  return normalizeHeader(value)
    .split('_')
    .map((token) => token.trim())
    .filter(Boolean);
}

function headerSimilarity(canonicalHeader: string, candidateHeader: string) {
  const canonical = normalizeHeader(canonicalHeader);
  const candidate = normalizeHeader(candidateHeader);
  if (!canonical || !candidate) {
    return 0;
  }
  if (canonical === candidate) {
    return 1;
  }

  const canonicalTokens = tokenizeHeader(canonical);
  const candidateTokens = tokenizeHeader(candidate);
  const matches = canonicalTokens.filter((token) => candidateTokens.includes(token)).length;
  const overlap = canonicalTokens.length > 0 ? matches / canonicalTokens.length : 0;

  const aliases: Record<string, string[]> = {
    country: ['pais', 'pais_id', 'provincia'],
    territory_level: ['level', 'nivel', 'provincia'],
    territory_code: ['territory', 'codigo_territorio', 'cod_territorio', 'distrito'],
    territory_name: ['name', 'nombre', 'canton', 'municipio'],
    project_code: ['code', 'codigo', 'cod_proy', 'cod_finca'],
    project_name: ['name', 'nombre', 'title', 'id_finca'],
    institution_code: ['code', 'codigo', 'id_productor'],
    institution_name: ['name', 'nombre', 'opciones'],
    lead_institution_code: ['institution_code', 'id_productor'],
    total_area_ha: ['area', 'area_ha'],
    area_ha: ['area', 'area_ha'],
    indicator_code: ['code', 'codigo', 'id'],
    indicator_name: ['name', 'nombre', 'opciones'],
    observed_at: ['fecha', 'ano'],
  };

  const aliasScore = (aliases[canonical] ?? []).some((alias) => normalizeHeader(alias) === candidate)
    ? 0.95
    : (aliases[canonical] ?? []).some((alias) => normalizeHeader(alias).includes(candidate) || candidate.includes(normalizeHeader(alias)))
      ? 0.75
      : 0;

  if (canonical.includes(candidate) || candidate.includes(canonical)) {
    return Math.max(overlap, 0.8, aliasScore);
  }

  return Math.max(overlap, aliasScore);
}

type MappingSuggestionConfidence = 'high' | 'medium' | 'low';

type BatchMappingSuggestionItem = {
  canonical: string;
  source: string;
  confidence: MappingSuggestionConfidence;
  score: number;
  autoApplicable: boolean;
  ambiguousSources: string[];
};

function extractBatchColumnMapping(batch: ImportBatch | null): Record<string, string> {
  if (!batch) {
    return {};
  }

  const details = batch.details ?? {};
  const rawMapping =
    details.columnMapping && typeof details.columnMapping === 'object'
      ? details.columnMapping
      : details.directColumnMapping && typeof details.directColumnMapping === 'object'
        ? details.directColumnMapping
        : null;

  if (!rawMapping) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawMapping as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
    ),
  );
}

function buildBatchMappingSuggestion(batch: ImportBatch | null, errors: ImportBatchError[]) {
  if (!batch) {
    return {
      missingHeaders: [] as string[],
      mapping: {} as Record<string, string>,
      candidates: [] as string[],
      suggestions: [] as BatchMappingSuggestionItem[],
    };
  }

  const details = batch.details ?? {};
  const missingHeaders = extractBatchMissingHeaders(batch);
  const rawDetectedHeaders = [
    ...(Array.isArray(details.detectedHeaders) ? details.detectedHeaders : []),
    ...(Array.isArray(details.preMappedHeaders) ? details.preMappedHeaders : []),
    ...(Array.isArray(details.mappedHeaders) ? details.mappedHeaders : []),
    ...errors.flatMap((error) => Object.keys(error.rawPayload ?? {})),
  ]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => normalizeHeader(item))
    .filter(Boolean);

  const currentMapping =
    details.columnMapping && typeof details.columnMapping === 'object'
      ? Object.fromEntries(
          Object.entries(details.columnMapping as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
          ),
        )
      : {};

  const uniqueCandidates = Array.from(new Set(rawDetectedHeaders));
  const usedSourceHeaders = new Set(Object.values(currentMapping).map((value) => normalizeHeader(value)));
  const autoApplicableMapping: Record<string, string> = {};
  const suggestions: BatchMappingSuggestionItem[] = [];

  for (const missingHeader of missingHeaders) {
    const rankedCandidates = uniqueCandidates
      .filter((candidate) => !usedSourceHeaders.has(candidate))
      .map((candidate) => ({
        candidate,
        score: headerSimilarity(missingHeader, candidate),
      }))
      .filter((entry) => entry.score >= 0.5)
      .sort((left, right) => right.score - left.score);

    const bestMatch = rankedCandidates[0];
    if (!bestMatch) {
      continue;
    }

    const ambiguousSources = rankedCandidates
      .filter(
        (entry) =>
          entry.candidate !== bestMatch.candidate &&
          entry.score >= Math.max(bestMatch.score - 0.08, 0.72),
      )
      .map((entry) => entry.candidate);

    let confidence: MappingSuggestionConfidence = 'low';
    if (bestMatch.score >= 0.92 && ambiguousSources.length === 0) {
      confidence = 'high';
    } else if (bestMatch.score >= 0.75) {
      confidence = 'medium';
    }

    const autoApplicable = confidence === 'high';
    suggestions.push({
      canonical: missingHeader,
      source: bestMatch.candidate,
      confidence,
      score: bestMatch.score,
      autoApplicable,
      ambiguousSources,
    });

    usedSourceHeaders.add(bestMatch.candidate);
    if (autoApplicable) {
      autoApplicableMapping[missingHeader] = bestMatch.candidate;
    }
  }

  return {
    missingHeaders,
    mapping: autoApplicableMapping,
    candidates: uniqueCandidates,
    suggestions,
  };
}

function formatCsvCell(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function escapeCsvCell(value: unknown) {
  const text = formatCsvCell(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsvFile(fileName: string, headers: string[], rows: Array<Record<string, unknown>>) {
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getSourceTypeLabel(sourceType: DataSource['sourceType']): string {
  return (
    {
      excel: 'Excel / CSV',
      api: 'Web Service / API',
      kobo: 'KoboToolbox',
      odoo: 'Odoo / ERP',
      postgis: 'SQL / PostGIS',
    }[sourceType] ?? sourceType
  );
}

function getEntityLabel(entityType: ImportBatch['entityType']): string {
  if (entityType === 'institutions') {
    return 'Instituciones';
  }
  if (entityType === 'projects') {
    return 'Proyectos';
  }
  if (entityType === 'project_indicators') {
    return 'Indicadores';
  }
  return 'Territorios';
}

function formatBatchTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'sin fecha';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatMappingValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (!value) {
    return '';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildMappingRows(mappingJson: Record<string, unknown> | undefined) {
  if (!mappingJson) {
    return [] as Array<{ canonicalField: string; sourceField: string }>;
  }
  return Object.entries(mappingJson)
    .map(([canonicalField, sourceField]) => ({
      canonicalField,
      sourceField: formatMappingValue(sourceField),
    }))
    .filter(
      (row) =>
        row.canonicalField.trim().length > 0 && row.sourceField.trim().length > 0,
    );
}

function normalizeHeader(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function inferEntityFromFileName(fileName: string): ImportBatch['entityType'] | null {
  const normalized = fileName.toLowerCase();
  if (normalized.includes('institution')) {
    return 'institutions';
  }
  if (normalized.includes('indicator')) {
    return 'project_indicators';
  }
  if (normalized.includes('territor')) {
    return 'project_territories';
  }
  if (normalized.includes('project')) {
    return 'projects';
  }
  return null;
}

function inferEntityFromHeaders(headers: string[]): ImportBatch['entityType'] | null {
  const matches = (Object.keys(REQUIRED_HEADERS_BY_ENTITY) as ImportBatch['entityType'][]).filter(
    (entityType) =>
      REQUIRED_HEADERS_BY_ENTITY[entityType].every((required) => headers.includes(required)),
  );
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

async function detectEntityFromFile(file: File): Promise<ImportBatch['entityType'] | null> {
  const fromName = inferEntityFromFileName(file.name);
  if (fromName) {
    return fromName;
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return null;
  }

  const text = await file.text();
  const [firstLineRaw] = text.split(/\r?\n/);
  if (!firstLineRaw) {
    return null;
  }
  const headers = firstLineRaw
    .split(',')
    .map((entry) => entry.replace(/^"+|"+$/g, ''))
    .map((entry) => normalizeHeader(entry))
    .filter((entry) => entry.length > 0);
  return inferEntityFromHeaders(headers);
}

function parseColumnMappingInput(rawText: string): Record<string, string> | undefined {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('El mapeo de columnas debe ser JSON válido.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El mapeo de columnas debe ser un objeto JSON.');
  }

  const mapping: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      throw new Error(
        `El valor de "${key}" debe ser texto con el nombre de la columna origen.`,
      );
    }
    const target = normalizeHeader(key);
    const source = normalizeHeader(value);
    if (!target || !source) {
      continue;
    }
    mapping[target] = source;
  }

  if (Object.keys(mapping).length === 0) {
    throw new Error('El mapeo no contiene columnas válidas.');
  }

  return mapping;
}

function inferEntityFromMapping(
  mapping: Record<string, string> | undefined,
): ImportBatch['entityType'] | null {
  if (!mapping) {
    return null;
  }
  return inferEntityFromHeaders(Object.keys(mapping));
}

function parseColumnMappingInputSafe(rawText: string): Record<string, string> {
  try {
    return parseColumnMappingInput(rawText) ?? {};
  } catch {
    return {};
  }
}

function buildColumnMappingValidationSummary(
  entityMode: UploadEntityMode,
  mappingText: string,
) {
  const trimmed = mappingText.trim();
  if (trimmed.length === 0) {
    return {
      resolvedEntity: entityMode === 'auto' ? null : entityMode,
      mapping: {} as Record<string, string>,
      missingCanonicalHeaders: [] as string[],
      duplicateSourceHeaders: [] as string[],
      error: null as string | null,
      hasMapping: false,
    };
  }

  try {
    const mapping = parseColumnMappingInput(trimmed) ?? {};
    const resolvedEntity =
      entityMode === 'auto' ? inferEntityFromMapping(mapping) : entityMode;
    const requiredHeaders = resolvedEntity ? REQUIRED_HEADERS_BY_ENTITY[resolvedEntity] : [];

    const sourceHeaderCounts = Object.values(mapping).reduce<Record<string, number>>((acc, source) => {
      acc[source] = (acc[source] ?? 0) + 1;
      return acc;
    }, {});

    return {
      resolvedEntity,
      mapping,
      missingCanonicalHeaders: requiredHeaders.filter((header) => !mapping[header]),
      duplicateSourceHeaders: Object.entries(sourceHeaderCounts)
        .filter((entry) => entry[1] > 1)
        .map((entry) => entry[0]),
      error: null as string | null,
      hasMapping: true,
    };
  } catch (error) {
    return {
      resolvedEntity: entityMode === 'auto' ? null : entityMode,
      mapping: {} as Record<string, string>,
      missingCanonicalHeaders: [] as string[],
      duplicateSourceHeaders: [] as string[],
      error: error instanceof Error ? error.message : 'No se pudo validar el JSON de mapeo.',
      hasMapping: true,
    };
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function extractIndicatorCoverageFromJob(job: SyncJobResponse | null): OdooIndicatorCoverage | null {
  if (!job) {
    return null;
  }
  const summary = asRecord(job.summary);
  const checkpoint = asRecord(summary?.checkpoint);
  const result = asRecord(checkpoint?.result);
  const entities = result?.entities;
  if (!Array.isArray(entities)) {
    return null;
  }

  for (const entry of entities) {
    const row = asRecord(entry);
    if (!row || row.entityType !== 'project_indicators') {
      continue;
    }
    return {
      extractedRows: asNumber(row.extractedRows),
      validRows: asNumber(row.validRows),
      invalidRows: asNumber(row.invalidRows),
      promotedRows: asNumber(row.promotedRows),
      batchStatus: typeof row.batchStatus === 'string' ? row.batchStatus : 'unknown',
    };
  }
  return null;
}

function buildOdooFormFromSource(source: OdooSource): OdooFormState {
  return {
    sourceName: source.sourceName,
    sourceCode: source.sourceCode,
    institutionId: source.institutionId,
    baseUrl: source.baseUrl,
    databaseName: source.databaseName,
    username: source.username,
    password: '',
    mappingProfileId: source.mappingProfileId ?? '',
    isActive: source.isActive,
  };
}

function buildDefaultOdooForm(institutionId: string): OdooFormState {
  return {
    sourceName: '',
    sourceCode: '',
    institutionId,
    baseUrl: '',
    databaseName: 'sima03',
    username: '',
    password: '',
    mappingProfileId: '',
    isActive: true,
  };
}

export function SourcesPage({
  mode = 'general',
  embedded = false,
}: {
  mode?: 'general' | 'odoo';
  embedded?: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const dataView = normalizeDataView(searchParams.get('view'));
  const { activeEgi, activeEgiId, currentUser, globalViewScope, setGlobalViewScope } = useEgi();
  const allowGlobalView = canUseGlobalView(currentUser);
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canReadConnectors = hasPermission(currentUser, 'connectors.read');
  const canReadInstitutions = hasPermission(currentUser, 'institutions.read');
  const canReadImports = hasPermission(currentUser, 'imports.read');
  const canUploadImports = hasPermission(currentUser, 'imports.upload');
  const canRunConnectors = hasPermission(currentUser, 'connectors.run');
  const canCreateSources = hasPermission(currentUser, 'sources.create');
  const canUpdateSources = hasPermission(currentUser, 'sources.update');
  const showGlobalViewControls = allowGlobalView && mode === 'general';
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([]);
  const [sources, setSources] = useState<SourceViewModel[]>([]);
  const [connectors, setConnectors] = useState<IntegrationConnector[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [importError, setImportError] = useState<string | null>(null);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [selectedBatchRules, setSelectedBatchRules] = useState<ImportBatchRule[]>([]);
  const [selectedBatchErrors, setSelectedBatchErrors] = useState<ImportBatchError[]>([]);
  const [isLoadingImportDetails, setIsLoadingImportDetails] = useState(false);

  const [filterEntity, setFilterEntity] = useState<ImportFilterEntity>(() => normalizeImportEntity(searchParams.get('entity')));
  const [filterStatus, setFilterStatus] = useState<ImportFilterStatus>(() => normalizeImportStatus(searchParams.get('status')));
  const [attentionFilter, setAttentionFilter] = useState<ImportAttentionFilter>(() => normalizeImportAttention(searchParams.get('attention')));
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '');

  function updateImportFilter(
    key: 'entity' | 'status' | 'attention' | 'q',
    value: string,
  ) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadEntityMode, setUploadEntityMode] = useState<UploadEntityMode>('auto');
  const [uploadSheetName, setUploadSheetName] = useState('');
  const [uploadSourceId, setUploadSourceId] = useState('');
  const [uploadColumnMappingText, setUploadColumnMappingText] = useState('');
  const [selectedUploadMappingProfileId, setSelectedUploadMappingProfileId] = useState('');
  const [sourceMappingProfiles, setSourceMappingProfiles] = useState<SourceMappingProfile[]>([]);
  const [uploadProfileName, setUploadProfileName] = useState('');
  const [uploadProfileInfo, setUploadProfileInfo] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<ImportBatch | null>(null);
  const [batchActionInfo, setBatchActionInfo] = useState<string | null>(null);
  const [batchMappingReviewDraft, setBatchMappingReviewDraft] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingImportProfile, setIsSavingImportProfile] = useState(false);
  const [connectorRunError, setConnectorRunError] = useState<string | null>(null);
  const [isRunningConnectorId, setIsRunningConnectorId] = useState<string | null>(null);
  const [syncJob, setSyncJob] = useState<SyncJobResponse | null>(null);

  const [odooSources, setOdooSources] = useState<OdooSource[]>([]);
  const [selectedOdooSourceId, setSelectedOdooSourceId] = useState<string | null>(null);
  const [selectedOdooSource, setSelectedOdooSource] = useState<OdooSource | null>(null);
  const [odooMappingProfiles, setOdooMappingProfiles] = useState<OdooMappingProfile[]>([]);
  const [odooForm, setOdooForm] = useState<OdooFormState>(() => buildDefaultOdooForm(''));
  const [odooConnectionResult, setOdooConnectionResult] =
    useState<OdooConnectionTestResult | null>(null);
  const [odooPanelError, setOdooPanelError] = useState<string | null>(null);
  const [odooPanelInfo, setOdooPanelInfo] = useState<string | null>(null);
  const [isSavingOdoo, setIsSavingOdoo] = useState(false);
  const [isTestingOdoo, setIsTestingOdoo] = useState(false);
  const [isRunningOdoo, setIsRunningOdoo] = useState(false);
  const [odooSyncJob, setOdooSyncJob] = useState<SyncJobResponse | null>(null);
  const [odooBatches, setOdooBatches] = useState<ImportBatch[]>([]);
  const [odooRecentErrors, setOdooRecentErrors] = useState<OdooSourceBatchError[]>([]);
  const [odooSelectedBatchId, setOdooSelectedBatchId] = useState<string | null>(null);
  const [odooSelectedBatchRules, setOdooSelectedBatchRules] = useState<ImportBatchRule[]>([]);
  const [odooSelectedBatchErrors, setOdooSelectedBatchErrors] = useState<ImportBatchError[]>([]);
  const [isLoadingOdooBatchDetail, setIsLoadingOdooBatchDetail] = useState(false);
  const [odooInstitutionLimit, setOdooInstitutionLimit] = useState('');
  const [odooPreview, setOdooPreview] = useState<OdooSourcePreviewResult | null>(null);
  const [isPreviewingOdoo, setIsPreviewingOdoo] = useState(false);
  const [odooShapefileFile, setOdooShapefileFile] = useState<File | null>(null);
  const [odooShapefileCountry, setOdooShapefileCountry] = useState('El Salvador');
  const [odooShapefileMappingText, setOdooShapefileMappingText] = useState('');
  const [odooShapefileCreateMissingProjects, setOdooShapefileCreateMissingProjects] =
    useState(true);
  const [odooShapefilePreview, setOdooShapefilePreview] = useState<OdooShapefilePreview | null>(
    null,
  );
  const [odooShapefileImportResult, setOdooShapefileImportResult] =
    useState<OdooShapefileImportResult | null>(null);
  const [isPreviewingOdooShapefile, setIsPreviewingOdooShapefile] = useState(false);
  const [isImportingOdooShapefile, setIsImportingOdooShapefile] = useState(false);

  useEffect(() => {
    Promise.all([
      canReadSources ? workspaceApi.getSources(globalViewScope) : Promise.resolve(null),
      canReadConnectors ? workspaceApi.getConnectors() : Promise.resolve(null),
      canReadInstitutions ? workspaceApi.getInstitutions() : Promise.resolve(null),
      mode === 'odoo' && canReadSources ? workspaceApi.getOdooSources() : Promise.resolve(null),
    ])
      .then(
        ([
          sourcesResponse,
          connectorsResponse,
          institutionsResponse,
          odooSourcesResponse,
        ]) => {
          const connectorsData = connectorsResponse?.data.connectors ?? [];
          const institutionsData = institutionsResponse?.data.institutions ?? [];
          setInstitutions(institutionsData);
          setConnectors(connectorsData);
          setSources(
            (sourcesResponse?.data.sources ?? []).map((source) => {
              const connector =
                connectorsData.find((item) => item.id === source.connectorId) ?? null;
              const institution =
                institutionsData.find((item) => item.id === source.institutionId) ?? null;
              return {
                ...source,
                institutionName: institution?.name ?? 'Institución no visible',
                connectorName: connector?.displayName ?? null,
              };
            }),
          );

          if (mode !== 'odoo') {
            return;
          }

          const odooSourceRows = odooSourcesResponse?.data.sources ?? [];
          setOdooSources(odooSourceRows);
          const defaultInstitutionId = institutionsData[0]?.id ?? '';
          const initialSourceId = odooSourceRows[0]?.sourceId ?? null;
          setSelectedOdooSourceId(initialSourceId);
          if (initialSourceId) {
            const initialSource =
              odooSourceRows.find((item) => item.sourceId === initialSourceId) ?? null;
            setSelectedOdooSource(initialSource);
            if (initialSource) {
              setOdooForm(buildOdooFormFromSource(initialSource));
            }
          } else {
            setOdooForm(buildDefaultOdooForm(defaultInstitutionId));
          }
        },
      )
      .catch((reason: Error) => setError(reason.message));
  }, [allowGlobalView, globalViewScope, mode]);

  async function refreshImportBatches(preferredBatchId?: string | null) {
    const response = await workspaceApi.getImportBatches(globalViewScope);
    const batches = response.data.batches;
    setImportBatches(batches);
    setSelectedBatchId((current) => preferredBatchId ?? current ?? batches[0]?.id ?? null);
  }

  async function refreshOdooSources(preferredSourceId?: string | null) {
    const response = await workspaceApi.getOdooSources();
    const rows = response.data.sources;
    setOdooSources(rows);
    setSelectedOdooSourceId((current) => preferredSourceId ?? current ?? rows[0]?.sourceId ?? null);
  }

  useEffect(() => {
    refreshImportBatches().catch((reason: Error) => setImportError(reason.message));
  }, [canReadConnectors, canReadInstitutions, canReadSources, globalViewScope, mode]);

  useEffect(() => {
    if (mode !== 'odoo') {
      return;
    }

    const sourceId = selectedOdooSourceId;
    if (!sourceId) {
      setSelectedOdooSource(null);
      setOdooBatches([]);
      setOdooRecentErrors([]);
      setOdooSelectedBatchId(null);
      setOdooPreview(null);
      return;
    }

    Promise.all([
      workspaceApi.getOdooSource(sourceId),
      workspaceApi.getOdooSourceBatches(sourceId),
      workspaceApi.getOdooSourceErrors(sourceId),
      workspaceApi.getOdooMappingProfiles({ sourceId }),
    ])
      .then(([sourceResponse, batchesResponse, errorsResponse, profilesResponse]) => {
        const source = sourceResponse.data.source;
        setSelectedOdooSource(source);
        setOdooForm(buildOdooFormFromSource(source));
        const sourceBatches = batchesResponse.data.batches;
        setOdooBatches(sourceBatches);
        setOdooSelectedBatchId((current) => current ?? sourceBatches[0]?.id ?? null);
        setOdooRecentErrors(errorsResponse.data.errors);
        setOdooMappingProfiles(profilesResponse.data.mappingProfiles);
      })
      .catch((reason: Error) => setOdooPanelError(reason.message));
  }, [mode, selectedOdooSourceId]);

  useEffect(() => {
    if (!selectedBatchId) {
      setSelectedBatch(null);
      setSelectedBatchRules([]);
      setSelectedBatchErrors([]);
      return;
    }

    setIsLoadingImportDetails(true);
    Promise.all([
      workspaceApi.getImportBatch(selectedBatchId, globalViewScope),
      workspaceApi.getImportBatchRules(selectedBatchId, globalViewScope),
      workspaceApi.getImportBatchErrors(selectedBatchId, globalViewScope),
    ])
      .then(([batchResponse, rulesResponse, errorsResponse]) => {
        setSelectedBatch(batchResponse.data.batch);
        setSelectedBatchRules(rulesResponse.data.rules);
        setSelectedBatchErrors(errorsResponse.data.errors);
      })
      .catch((reason: Error) => setImportError(reason.message))
      .finally(() => setIsLoadingImportDetails(false));
  }, [globalViewScope, selectedBatchId]);

  useEffect(() => {
    if (mode !== 'odoo') {
      return;
    }
    if (!odooSelectedBatchId) {
      setOdooSelectedBatchRules([]);
      setOdooSelectedBatchErrors([]);
      return;
    }

    setIsLoadingOdooBatchDetail(true);
    Promise.all([
      workspaceApi.getImportBatchErrors(odooSelectedBatchId),
      workspaceApi.getImportBatchRules(odooSelectedBatchId),
    ])
      .then(([errorsResponse, rulesResponse]) => {
        setOdooSelectedBatchErrors(errorsResponse.data.errors);
        setOdooSelectedBatchRules(rulesResponse.data.rules);
      })
      .catch((reason: Error) => setOdooPanelError(reason.message))
      .finally(() => setIsLoadingOdooBatchDetail(false));
  }, [mode, odooSelectedBatchId]);

  useEffect(() => {
    if (mode !== 'odoo') {
      return;
    }

    if (selectedOdooSourceId) {
      return;
    }
    if (!odooForm.institutionId) {
      setOdooMappingProfiles([]);
      return;
    }

    workspaceApi
      .getOdooMappingProfiles({ institutionId: odooForm.institutionId })
      .then((response) => setOdooMappingProfiles(response.data.mappingProfiles))
      .catch((reason: Error) => setOdooPanelError(reason.message));
  }, [mode, selectedOdooSourceId, odooForm.institutionId]);

  const activeSources = sources.filter((source) => source.status === 'active');
  const freshnessFilter = searchParams.get('freshness');
  const visibleSources = freshnessFilter === 'stale'
    ? sources.filter((source) => {
        if (source.status !== 'active' || !source.lastIngestedAt) return source.status === 'active';
        const timestamp = Date.parse(source.lastIngestedAt);
        return Number.isNaN(timestamp) || Date.now() - timestamp > 30 * 24 * 60 * 60 * 1000;
      })
    : sources;
  const sourcesWithConnector = sources.filter((source) => source.connectorId);
  const activeConnectors = connectors.filter((connector) => connector.status === 'active');
  const connectorTypes = new Set(connectors.map((connector) => connector.connectorType));

  const filteredBatches = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return importBatches.filter((batch) => {
      const entityOk = filterEntity === 'all' || batch.entityType === filterEntity;
      const statusOk = filterStatus === 'all' || batch.status === filterStatus;
      const effectiveAttentionFilter = dataView === 'pending' ? 'needs_review' : attentionFilter;
      const attentionOk =
        effectiveAttentionFilter === 'all' ||
        (effectiveAttentionFilter === 'needs_review' &&
          (batch.invalidRows > 0 ||
            batch.status === 'completed_with_errors' ||
            batch.status === 'failed')) ||
        (effectiveAttentionFilter === 'geographic' &&
          (batch.entityType === 'project_territories' ||
            batch.fileName.toLowerCase().includes('shape') ||
            batch.fileName.toLowerCase().includes('territor')));
      const searchOk =
        normalizedSearch.length === 0 ||
        batch.fileName.toLowerCase().includes(normalizedSearch) ||
        batch.id.toLowerCase().includes(normalizedSearch);
      return entityOk && statusOk && attentionOk && searchOk;
    });
  }, [attentionFilter, dataView, filterEntity, filterStatus, importBatches, searchTerm]);

  const importKpis = useMemo(() => {
    const total = importBatches.length;
    const completed = importBatches.filter(
      (batch) => batch.status === 'completed' || batch.status === 'completed_with_errors',
    ).length;
    const failed = importBatches.filter((batch) => batch.status === 'failed').length;
    const needsReview = importBatches.filter(
      (batch) =>
        batch.invalidRows > 0 ||
        batch.status === 'completed_with_errors' ||
        batch.status === 'failed',
    ).length;
    const geographic = importBatches.filter(
      (batch) =>
        batch.entityType === 'project_territories' ||
        batch.fileName.toLowerCase().includes('shape') ||
        batch.fileName.toLowerCase().includes('territor'),
    ).length;
    const promotedRows = importBatches.reduce((sum, batch) => sum + batch.promotedRows, 0);
    return { total, completed, failed, needsReview, geographic, promotedRows };
  }, [importBatches]);

  const selectedUploadSource = useMemo(
    () => sources.find((source) => source.id === uploadSourceId) ?? null,
    [sources, uploadSourceId],
  );

  const uploadMappingValidation = useMemo(
    () => buildColumnMappingValidationSummary(uploadEntityMode, uploadColumnMappingText),
    [uploadColumnMappingText, uploadEntityMode],
  );

  const resolvedUploadEntityType =
    uploadEntityMode === 'auto' ? uploadMappingValidation.resolvedEntity : uploadEntityMode;

  const selectedBatchMappingSuggestion = useMemo(
    () => buildBatchMappingSuggestion(selectedBatch, selectedBatchErrors),
    [selectedBatch, selectedBatchErrors],
  );

  const selectedBatchBaseMapping = useMemo(
    () => extractBatchColumnMapping(selectedBatch),
    [selectedBatch],
  );

  const selectedUploadMappingProfile = useMemo(
    () =>
      sourceMappingProfiles.find((profile) => profile.id === selectedUploadMappingProfileId) ??
      null,
    [selectedUploadMappingProfileId, sourceMappingProfiles],
  );

  useEffect(() => {
    if (!selectedUploadSource || !canReadImports) {
      setSourceMappingProfiles([]);
      setSelectedUploadMappingProfileId('');
      return;
    }

    workspaceApi
      .getImportMappingProfiles({
        sourceId: selectedUploadSource.id,
        entityType: resolvedUploadEntityType ?? undefined,
        scope: globalViewScope,
      })
      .then((response) => {
        const profiles = response.data.mappingProfiles;
        setSourceMappingProfiles(profiles);
        setSelectedUploadMappingProfileId((current) => {
          if (current && profiles.some((profile) => profile.id === current)) {
            return current;
          }
          return profiles.find((profile) => profile.isDefault)?.id ?? '';
        });
      })
      .catch((reason: Error) => {
        setUploadProfileInfo(`No se pudieron cargar perfiles guardados: ${reason.message}`);
        setSourceMappingProfiles([]);
        setSelectedUploadMappingProfileId('');
      });
  }, [canReadImports, globalViewScope, resolvedUploadEntityType, selectedUploadSource]);

  useEffect(() => {
    const nextDraft: Record<string, string> = { ...selectedBatchBaseMapping };
    for (const item of selectedBatchMappingSuggestion.suggestions) {
      if (!nextDraft[item.canonical]) {
        nextDraft[item.canonical] = item.source;
      }
    }
    setBatchMappingReviewDraft(nextDraft);
  }, [selectedBatchBaseMapping, selectedBatchMappingSuggestion]);

  const magIntaOperationalSource = useMemo(
    () => sources.find((source) => matchesSourceCode(source.code, OPERATIONAL_MAG_INTA_SOURCE_CODE)) ?? null,
    [sources],
  );

  const magIntaMappedBatch = useMemo(
    () =>
      importBatches.find(
        (batch) => batch.fileName === 'projects_template_mapped_headers_textdates.xlsx',
      ) ?? null,
    [importBatches],
  );

  const magIntaInvalidBatch = useMemo(
    () =>
      importBatches.find(
        (batch) => batch.fileName === 'projects_template_invalid_textdates.xlsx',
      ) ?? null,
    [importBatches],
  );

  const selectedOdooMappingProfile = useMemo(() => {
    if (!odooForm.mappingProfileId) {
      return null;
    }
    return (
      odooMappingProfiles.find((profile) => profile.id === odooForm.mappingProfileId) ?? null
    );
  }, [odooForm.mappingProfileId, odooMappingProfiles]);

  const selectedOdooMappingRows = useMemo(
    () => buildMappingRows(selectedOdooMappingProfile?.mappingJson),
    [selectedOdooMappingProfile],
  );

  const selectedOdooBatch = useMemo(
    () => odooBatches.find((batch) => batch.id === odooSelectedBatchId) ?? null,
    [odooBatches, odooSelectedBatchId],
  );

  const latestOdooIndicatorBatch = useMemo(
    () => odooBatches.find((batch) => batch.entityType === 'project_indicators') ?? null,
    [odooBatches],
  );

  const odooIndicatorCoverage = useMemo(() => {
    const fromJob = extractIndicatorCoverageFromJob(odooSyncJob);
    if (fromJob) {
      const coveragePercent =
        fromJob.extractedRows > 0
          ? Math.round((fromJob.validRows / fromJob.extractedRows) * 100)
          : 0;
      return {
        ...fromJob,
        coveragePercent,
        hasRows: fromJob.extractedRows > 0,
        isPerfect:
          fromJob.extractedRows > 0 &&
          fromJob.validRows === fromJob.extractedRows &&
          fromJob.invalidRows === 0,
        source: 'job' as const,
      };
    }
    if (!latestOdooIndicatorBatch) {
      return null;
    }
    const extractedRows = latestOdooIndicatorBatch.totalRows;
    const validRows = latestOdooIndicatorBatch.validRows;
    const invalidRows = latestOdooIndicatorBatch.invalidRows;
    const promotedRows = latestOdooIndicatorBatch.promotedRows;
    const coveragePercent =
      extractedRows > 0 ? Math.round((validRows / extractedRows) * 100) : 0;
    return {
      extractedRows,
      validRows,
      invalidRows,
      promotedRows,
      batchStatus: latestOdooIndicatorBatch.status,
      coveragePercent,
      hasRows: extractedRows > 0,
      isPerfect: extractedRows > 0 && validRows === extractedRows && invalidRows === 0,
      source: 'batch' as const,
    };
  }, [latestOdooIndicatorBatch, odooSyncJob]);

  const isOdooProfilePersisted = useMemo(() => {
    if (!selectedOdooSource) {
      return false;
    }
    const persisted = selectedOdooSource.mappingProfileId ?? '';
    const current = odooForm.mappingProfileId ?? '';
    return persisted === current;
  }, [selectedOdooSource, odooForm.mappingProfileId]);
  const odooEgiScopeLabel = describeEgiScope(
    activeEgi?.name ?? null,
    activeEgi?.code ?? null,
    globalViewScope,
  );

  const uploadMappingExample = useMemo(() => {
    if (uploadEntityMode === 'auto') {
      return COLUMN_MAPPING_EXAMPLES.projects;
    }
    return COLUMN_MAPPING_EXAMPLES[uploadEntityMode];
  }, [uploadEntityMode]);

  const uploadMappingNeedsReview =
    uploadMappingValidation.missingCanonicalHeaders.length > 0 ||
    uploadMappingValidation.duplicateSourceHeaders.length > 0;

  const uploadSubmitBlocked =
    isUploading ||
    !uploadFile ||
    !canUploadImports ||
    (uploadColumnMappingText.trim().length > 0 && Boolean(uploadMappingValidation.error));

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    setUploadResult(null);
    if (!uploadFile) {
      setUploadError('Selecciona un archivo CSV o XLSX antes de subir.');
      return;
    }
    if (uploadColumnMappingText.trim().length > 0 && uploadMappingValidation.error) {
      setUploadError(uploadMappingValidation.error);
      return;
    }
    if (uploadColumnMappingText.trim().length > 0 && uploadMappingNeedsReview) {
      const issues = [
        uploadMappingValidation.missingCanonicalHeaders.length > 0
          ? `${uploadMappingValidation.missingCanonicalHeaders.length} columna(s) canónica(s) pendiente(s)`
          : null,
        uploadMappingValidation.duplicateSourceHeaders.length > 0
          ? `${uploadMappingValidation.duplicateSourceHeaders.length} header(s) origen duplicado(s)`
          : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' y ');
      const shouldContinue = window.confirm(
        `El mapeo aún requiere revisión: ${issues}. Si continúas, el lote podría volver con observaciones. ¿Deseas subirlo de todas formas?`,
      );
      if (!shouldContinue) {
        setUploadError('Corrige o confirma el mapeo antes de reintentar la carga.');
        return;
      }
    }

    setIsUploading(true);
    try {
      const columnMapping = parseColumnMappingInput(uploadColumnMappingText);
      let resolvedEntity: ImportBatch['entityType'] | null =
        uploadEntityMode === 'auto' ? null : uploadEntityMode;
      if (!resolvedEntity) {
        resolvedEntity = await detectEntityFromFile(uploadFile);
      }
      if (!resolvedEntity) {
        resolvedEntity = inferEntityFromMapping(columnMapping);
      }
      if (!resolvedEntity) {
        throw new Error(
          'No se pudo detectar el tipo de entidad. Selecciónalo manualmente en el formulario.',
        );
      }

      const response = await workspaceApi.uploadImportBatch({
        file: uploadFile,
        entityType: resolvedEntity,
        sheetName: uploadSheetName.trim() || undefined,
        sourceId: uploadSourceId.trim() || undefined,
        mappingProfileId: selectedUploadMappingProfileId.trim() || undefined,
        columnMapping,
      });
      const batch = response.data.batch;
      setUploadResult(batch);
      setSelectedBatchId(batch.id);
      await refreshImportBatches(batch.id);
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'No se pudo subir el archivo.');
    } finally {
      setIsUploading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    setUploadResult(null);
    setUploadFile(event.target.files?.[0] ?? null);
  }

  async function handleRunConnector(connector: IntegrationConnector) {
    setConnectorRunError(null);
    setSyncJob(null);
    setIsRunningConnectorId(connector.id);
    try {
      const runResponse = await workspaceApi.runConnector(connector.id);
      let latestJob = await workspaceApi.getSyncJob(runResponse.data.jobId);
      setSyncJob(latestJob);

      const terminalStatuses: SyncJobResponse['status'][] = [
        'completed',
        'partial_failed',
        'failed',
      ];

      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (terminalStatuses.includes(latestJob.status)) {
          break;
        }
        await sleep(1200);
        latestJob = await workspaceApi.getSyncJob(runResponse.data.jobId);
        setSyncJob(latestJob);
      }

      await refreshImportBatches();
    } catch (reason) {
      setConnectorRunError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo ejecutar el conector.',
      );
    } finally {
      setIsRunningConnectorId(null);
    }
  }

  async function handleCopyBatchMapping() {
    if (!selectedBatch) {
      return;
    }

    const mapping = extractBatchColumnMapping(selectedBatch);
    if (Object.keys(mapping).length === 0) {
      setBatchActionInfo('Este lote no registró un mapeo explícito para copiar.');
      return;
    }

    const text = JSON.stringify(mapping, null, 2);
    setUploadColumnMappingText(text);
    try {
      await navigator.clipboard.writeText(text);
      setBatchActionInfo('Mapeo aplicado copiado al portapapeles y precargado en el formulario.');
    } catch {
      setBatchActionInfo('Mapeo aplicado precargado en el formulario. Copia manualmente si lo necesitas.');
    }
  }

  function handlePrepareBatchRetry() {
    if (!selectedBatch) {
      return;
    }

    setUploadEntityMode(selectedBatch.entityType);
    setUploadSourceId(selectedBatch.sourceId ?? '');
    setSelectedUploadMappingProfileId(selectedBatch.mappingProfileId ?? '');
    const mapping = extractBatchColumnMapping(selectedBatch);
    setUploadColumnMappingText(
      Object.keys(mapping).length > 0 ? JSON.stringify(mapping, null, 2) : '',
    );
    setUploadSheetName(selectedBatch.sheetName ?? '');
    setBatchActionInfo(
      'Formulario de reintento preparado con entidad, fuente, hoja y mapeo del lote seleccionado.',
    );
  }

  function handleExportBatchErrors() {
    if (!selectedBatch || selectedBatchErrors.length === 0) {
      setBatchActionInfo('Este lote no tiene filas fallidas para exportar.');
      return;
    }

    const exportRows = buildBatchErrorExportRows(selectedBatchErrors);
    const missingHeaders = selectedBatchMappingSuggestion.missingHeaders;
    const suggestedMapping = selectedBatchMappingSuggestion.mapping;
    const reviewSuggestions = selectedBatchMappingSuggestion.suggestions.filter((item) => !item.autoApplicable);
    const confidenceSummary = selectedBatchMappingSuggestion.suggestions
      .map((item) => `${item.canonical}:${item.source}:${item.confidence}`)
      .join(' | ');
    const enrichedRows = exportRows.rows.map((row) => ({
      ...row,
      missing_canonical_headers: missingHeaders.join(', '),
      suggested_mapping_auto_json:
        Object.keys(suggestedMapping).length > 0
          ? JSON.stringify(suggestedMapping)
          : '',
      suggested_mapping_review_json:
        reviewSuggestions.length > 0
          ? JSON.stringify(
              reviewSuggestions.map((item) => ({
                canonical: item.canonical,
                source: item.source,
                confidence: item.confidence,
                alternatives: item.ambiguousSources,
              })),
            )
          : '',
      suggested_mapping_confidence_summary: confidenceSummary,
      suggested_mapping_review_required: reviewSuggestions.length > 0 ? 'yes' : 'no',
    }));
    downloadCsvFile(
      `batch-errors-${selectedBatch.id.slice(0, 8)}.csv`,
      [
        ...exportRows.headers,
        'missing_canonical_headers',
        'suggested_mapping_auto_json',
        'suggested_mapping_review_json',
        'suggested_mapping_confidence_summary',
        'suggested_mapping_review_required',
      ],
      enrichedRows,
    );
    setBatchActionInfo('Se exportó un CSV con las filas fallidas y su payload original.');
  }

  function handleApplySuggestedMapping() {
    const suggestion = selectedBatchMappingSuggestion.mapping;
    if (Object.keys(suggestion).length === 0) {
      const reviewCount = selectedBatchMappingSuggestion.suggestions.filter((item) => !item.autoApplicable).length;
      setBatchActionInfo(
        reviewCount > 0
          ? 'No hubo sugerencias de alta confianza para aplicar automáticamente. Revisa las sugerencias marcadas para revisión manual.'
          : 'No se encontró una sugerencia automática de mapeo suficientemente confiable.',
      );
      return;
    }

    setUploadColumnMappingText(JSON.stringify(suggestion, null, 2));
    if (selectedBatch) {
      setUploadEntityMode(selectedBatch.entityType);
      setUploadSourceId(selectedBatch.sourceId ?? '');
      setSelectedUploadMappingProfileId(selectedBatch.mappingProfileId ?? '');
      setUploadSheetName(selectedBatch.sheetName ?? '');
    }
    const reviewCount = selectedBatchMappingSuggestion.suggestions.filter((item) => !item.autoApplicable).length;
    setBatchActionInfo(
      reviewCount > 0
        ? `Se aplicaron ${Object.keys(suggestion).length} sugerencias de alta confianza. ${reviewCount} campo(s) adicional(es) requieren revisión manual.`
        : 'Sugerencia automática aplicada al formulario de carga para corregir el lote.',
    );
  }

  function handleBatchReviewMappingChange(canonical: string, source: string) {
    setBatchMappingReviewDraft((current) => {
      const next = { ...current };
      if (source.trim().length === 0) {
        delete next[canonical];
      } else {
        next[canonical] = normalizeHeader(source);
      }
      return next;
    });
  }

  function handleResetBatchReviewDraft() {
    const nextDraft: Record<string, string> = { ...selectedBatchBaseMapping };
    for (const item of selectedBatchMappingSuggestion.suggestions) {
      if (!nextDraft[item.canonical]) {
        nextDraft[item.canonical] = item.source;
      }
    }
    setBatchMappingReviewDraft(nextDraft);
    setBatchActionInfo('Revisión de mapeo restablecida a la base del lote y a las sugerencias detectadas.');
  }

  function handleApplyReviewedMapping() {
    if (!selectedBatch) {
      return;
    }

    const existingFormMapping =
      uploadColumnMappingText.trim().length > 0
        ? parseColumnMappingInputSafe(uploadColumnMappingText)
        : {};
    const reviewedEntries = Object.entries(batchMappingReviewDraft).filter(
      (entry): entry is [string, string] => entry[0].trim().length > 0 && entry[1].trim().length > 0,
    );

    if (reviewedEntries.length === 0) {
      setBatchActionInfo('La revisión no contiene columnas seleccionadas para aplicar al formulario.');
      return;
    }

    const mergedMapping = {
      ...existingFormMapping,
      ...Object.fromEntries(reviewedEntries.map(([canonical, source]) => [normalizeHeader(canonical), normalizeHeader(source)])),
    };

    setUploadColumnMappingText(JSON.stringify(mergedMapping, null, 2));
    setUploadEntityMode(selectedBatch.entityType);
    setUploadSourceId(selectedBatch.sourceId ?? '');
    setSelectedUploadMappingProfileId(selectedBatch.mappingProfileId ?? '');
    setUploadSheetName(selectedBatch.sheetName ?? '');
    setBatchActionInfo(
      `Se aplicó la revisión visual al formulario con ${reviewedEntries.length} columna(s) canónica(s).`,
    );
  }

  function handleSelectUploadMappingProfile(profileId: string) {
    setSelectedUploadMappingProfileId(profileId);
    setUploadProfileInfo(null);
    if (!profileId) {
      return;
    }

    const profile = sourceMappingProfiles.find((item) => item.id === profileId);
    if (!profile) {
      setUploadProfileInfo('El perfil seleccionado ya no está disponible en la lista actual.');
      return;
    }

    setUploadColumnMappingText(JSON.stringify(profile.mappingJson ?? {}, null, 2));
    setUploadEntityMode(profile.entityType as UploadEntityMode);
    setUploadProfileName(profile.profileName);
    setUploadProfileInfo(`Perfil "${profile.profileName}" cargado en el formulario.`);
  }

  async function handleSaveUploadMappingProfile(makeDefault: boolean) {
    setUploadProfileInfo(null);
    if (!selectedUploadSource) {
      setUploadProfileInfo('Selecciona una fuente antes de guardar un perfil de mapeo.');
      return;
    }

    const targetEntity = resolvedUploadEntityType;
    if (!targetEntity) {
      setUploadProfileInfo('Define la entidad objetivo antes de guardar el perfil.');
      return;
    }

    if (!uploadProfileName.trim()) {
      setUploadProfileInfo('Asigna un nombre al perfil antes de guardarlo.');
      return;
    }

    if (uploadMappingValidation.error) {
      setUploadProfileInfo(uploadMappingValidation.error);
      return;
    }

    const mapping = parseColumnMappingInputSafe(uploadColumnMappingText);
    if (Object.keys(mapping).length === 0) {
      setUploadProfileInfo('El mapeo actual no contiene columnas válidas para guardar.');
      return;
    }

    setIsSavingImportProfile(true);
    try {
      const response = selectedUploadMappingProfile
        ? await workspaceApi.updateImportMappingProfile(selectedUploadMappingProfile.id, {
            profileName: uploadProfileName.trim(),
            mappingJson: mapping,
            isDefault: makeDefault,
            status: 'active',
          })
        : await workspaceApi.createImportMappingProfile({
            sourceId: selectedUploadSource.id,
            entityType: targetEntity,
            profileName: uploadProfileName.trim(),
            mappingJson: mapping,
            isDefault: makeDefault,
          });

      const savedProfile = response.data.mappingProfile;
      const refreshed = await workspaceApi.getImportMappingProfiles({
        sourceId: selectedUploadSource.id,
        entityType: targetEntity,
        scope: globalViewScope,
      });
      setSourceMappingProfiles(refreshed.data.mappingProfiles);
      setSelectedUploadMappingProfileId(savedProfile.id);
      setUploadProfileName(savedProfile.profileName);
      setUploadProfileInfo(
        selectedUploadMappingProfile
          ? `Perfil "${savedProfile.profileName}" actualizado correctamente.`
          : `Perfil "${savedProfile.profileName}" guardado correctamente.`,
      );
    } catch (reason) {
      setUploadProfileInfo(
        reason instanceof Error
          ? reason.message
          : 'No se pudo guardar el perfil de mapeo.',
      );
    } finally {
      setIsSavingImportProfile(false);
    }
  }

  async function handleCreateUploadMappingProfileVersion(makeDefault: boolean) {
    setUploadProfileInfo(null);
    if (!selectedUploadSource) {
      setUploadProfileInfo('Selecciona una fuente antes de crear una nueva versión.');
      return;
    }

    const targetEntity = resolvedUploadEntityType;
    if (!targetEntity) {
      setUploadProfileInfo('Define la entidad objetivo antes de crear una nueva versión.');
      return;
    }

    if (!uploadProfileName.trim()) {
      setUploadProfileInfo('Asigna un nombre al perfil antes de crear una nueva versión.');
      return;
    }

    if (uploadMappingValidation.error) {
      setUploadProfileInfo(uploadMappingValidation.error);
      return;
    }

    const mapping = parseColumnMappingInputSafe(uploadColumnMappingText);
    if (Object.keys(mapping).length === 0) {
      setUploadProfileInfo('El mapeo actual no contiene columnas válidas para versionar.');
      return;
    }

    setIsSavingImportProfile(true);
    try {
      const response = await workspaceApi.createImportMappingProfile({
        sourceId: selectedUploadSource.id,
        entityType: targetEntity,
        profileName: uploadProfileName.trim(),
        mappingJson: mapping,
        isDefault: makeDefault,
      });

      const savedProfile = response.data.mappingProfile;
      const refreshed = await workspaceApi.getImportMappingProfiles({
        sourceId: selectedUploadSource.id,
        entityType: targetEntity,
        scope: globalViewScope,
      });
      setSourceMappingProfiles(refreshed.data.mappingProfiles);
      setSelectedUploadMappingProfileId(savedProfile.id);
      setUploadProfileName(savedProfile.profileName);
      setUploadProfileInfo(
        `Nueva versión guardada: "${savedProfile.profileName}" v${savedProfile.version}.`,
      );
    } catch (reason) {
      setUploadProfileInfo(
        reason instanceof Error
          ? reason.message
          : 'No se pudo crear una nueva versión del perfil.',
      );
    } finally {
      setIsSavingImportProfile(false);
    }
  }

  async function handleDeactivateUploadMappingProfile(profileOverride?: SourceMappingProfile | null) {
    setUploadProfileInfo(null);
    const targetProfile = profileOverride ?? selectedUploadMappingProfile;
    if (!targetProfile) {
      setUploadProfileInfo('Selecciona un perfil para desactivarlo.');
      return;
    }

    const shouldContinue = window.confirm(
      `Se desactivará el perfil "${targetProfile.profileName}" v${targetProfile.version}. Ya no aparecerá como opción activa. ¿Deseas continuar?`,
    );
    if (!shouldContinue) {
      return;
    }

    setIsSavingImportProfile(true);
    try {
      await workspaceApi.updateImportMappingProfile(targetProfile.id, {
        status: 'inactive',
      });

      if (selectedUploadSource && resolvedUploadEntityType) {
        const refreshed = await workspaceApi.getImportMappingProfiles({
          sourceId: selectedUploadSource.id,
          entityType: resolvedUploadEntityType,
          scope: globalViewScope,
        });
        setSourceMappingProfiles(refreshed.data.mappingProfiles);
      } else {
        setSourceMappingProfiles([]);
      }

      if (selectedUploadMappingProfileId === targetProfile.id) {
        setSelectedUploadMappingProfileId('');
      }
      setUploadProfileInfo('Perfil desactivado correctamente.');
    } catch (reason) {
      setUploadProfileInfo(
        reason instanceof Error
          ? reason.message
          : 'No se pudo desactivar el perfil de mapeo.',
      );
    } finally {
      setIsSavingImportProfile(false);
    }
  }

  async function handleMarkUploadMappingProfileDefault(profile: SourceMappingProfile) {
    setUploadProfileInfo(null);
    setIsSavingImportProfile(true);
    try {
      await workspaceApi.updateImportMappingProfile(profile.id, {
        isDefault: true,
        status: 'active',
      });

      const refreshed = await workspaceApi.getImportMappingProfiles({
        sourceId: profile.sourceId,
        entityType: profile.entityType as ImportBatch['entityType'],
        scope: globalViewScope,
      });
      setSourceMappingProfiles(refreshed.data.mappingProfiles);
      setSelectedUploadMappingProfileId(profile.id);
      setUploadProfileInfo(`Perfil "${profile.profileName}" marcado como default.`);
    } catch (reason) {
      setUploadProfileInfo(
        reason instanceof Error
          ? reason.message
          : 'No se pudo marcar el perfil como default.',
      );
    } finally {
      setIsSavingImportProfile(false);
    }
  }

  function handlePrepareUploadProfileVersion(profile: SourceMappingProfile) {
    setSelectedUploadMappingProfileId(profile.id);
    setUploadProfileName(profile.profileName);
    setUploadColumnMappingText(JSON.stringify(profile.mappingJson ?? {}, null, 2));
    setUploadEntityMode(profile.entityType as UploadEntityMode);
    setUploadProfileInfo(
      `Perfil "${profile.profileName}" v${profile.version} cargado para crear una nueva versión.`,
    );
  }

  function handleSelectOdooSource(sourceId: string) {
    setOdooPanelError(null);
    setOdooPanelInfo(null);
    setOdooConnectionResult(null);
    setOdooPreview(null);
    setOdooShapefilePreview(null);
    setOdooShapefileImportResult(null);
    setOdooInstitutionLimit('');
    setSelectedOdooSourceId(sourceId);
  }

  function handleNewOdooSource() {
    setSelectedOdooSourceId(null);
    setSelectedOdooSource(null);
    setOdooConnectionResult(null);
    setOdooPanelError(null);
    setOdooPanelInfo('Creando nueva fuente Odoo.');
    setOdooBatches([]);
    setOdooRecentErrors([]);
    setOdooSyncJob(null);
    setOdooPreview(null);
    setOdooShapefilePreview(null);
    setOdooShapefileImportResult(null);
    setOdooShapefileFile(null);
    setOdooShapefileMappingText('');
    setOdooInstitutionLimit('');
    setOdooForm(buildDefaultOdooForm(institutions[0]?.id ?? ''));
  }

  async function handleSaveOdooSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOdooPanelError(null);
    setOdooPanelInfo(null);

    if (!odooForm.sourceName.trim()) {
      setOdooPanelError('El nombre de fuente es requerido.');
      return;
    }
    if (!odooForm.institutionId.trim()) {
      setOdooPanelError('Debes seleccionar una institución.');
      return;
    }
    if (!odooForm.baseUrl.trim() || !odooForm.databaseName.trim() || !odooForm.username.trim()) {
      setOdooPanelError('URL, base de datos y usuario son requeridos.');
      return;
    }
    if (!selectedOdooSourceId && !odooForm.password.trim()) {
      setOdooPanelError('Debes ingresar password para crear la fuente.');
      return;
    }

    setIsSavingOdoo(true);
    try {
      if (selectedOdooSourceId) {
        const response = await workspaceApi.updateOdooSource(selectedOdooSourceId, {
          sourceName: odooForm.sourceName.trim(),
          sourceCode: odooForm.sourceCode.trim() || undefined,
          institutionId: odooForm.institutionId,
          baseUrl: odooForm.baseUrl.trim(),
          databaseName: odooForm.databaseName.trim(),
          username: odooForm.username.trim(),
          password: odooForm.password.trim() || undefined,
          mappingProfileId: odooForm.mappingProfileId || null,
          isActive: odooForm.isActive,
        });
        const source = response.data.source;
        setOdooPanelInfo(`Fuente Odoo actualizada correctamente en ${odooEgiScopeLabel}.`);
        setOdooConnectionResult(null);
        setOdooPreview(null);
        setSelectedOdooSource(source);
        setOdooForm(buildOdooFormFromSource(source));
        await refreshOdooSources(source.sourceId);
      } else {
        const response = await workspaceApi.createOdooSource({
          sourceName: odooForm.sourceName.trim(),
          sourceCode: odooForm.sourceCode.trim() || undefined,
          institutionId: odooForm.institutionId,
          baseUrl: odooForm.baseUrl.trim(),
          databaseName: odooForm.databaseName.trim(),
          username: odooForm.username.trim(),
          password: odooForm.password,
          mappingProfileId: odooForm.mappingProfileId || null,
          isActive: odooForm.isActive,
        });
        const source = response.data.source;
        setOdooPanelInfo(`Fuente Odoo creada correctamente en ${odooEgiScopeLabel}.`);
        setOdooPreview(null);
        setSelectedOdooSourceId(source.sourceId);
        setSelectedOdooSource(source);
        setOdooForm(buildOdooFormFromSource(source));
        await refreshOdooSources(source.sourceId);
      }
    } catch (reason) {
      setOdooPanelError(reason instanceof Error ? reason.message : 'No se pudo guardar la fuente Odoo.');
    } finally {
      setIsSavingOdoo(false);
    }
  }

  async function handleTestOdooConnection() {
    setOdooPanelError(null);
    setOdooPanelInfo(null);
    setIsTestingOdoo(true);
    try {
      const hasInlineCredentials =
        Boolean(odooForm.baseUrl.trim()) &&
        Boolean(odooForm.databaseName.trim()) &&
        Boolean(odooForm.username.trim()) &&
        Boolean(odooForm.password.trim());

      const response = hasInlineCredentials
        ? await workspaceApi.testOdooConnection({
            baseUrl: odooForm.baseUrl.trim(),
            databaseName: odooForm.databaseName.trim(),
            username: odooForm.username.trim(),
            password: odooForm.password,
          })
        : selectedOdooSourceId
          ? await workspaceApi.testOdooConnectionById(selectedOdooSourceId)
          : await workspaceApi.testOdooConnection({
              baseUrl: odooForm.baseUrl.trim(),
              databaseName: odooForm.databaseName.trim(),
              username: odooForm.username.trim(),
              password: odooForm.password,
            });

      const result = response.data.result;
      setOdooConnectionResult(result);
      if (result.ok) {
        setOdooPanelInfo(`Conexión OK (${result.mode}). ${result.message} · contexto ${odooEgiScopeLabel}.`);
      } else {
        setOdooPanelError(result.message);
      }

      if (selectedOdooSourceId) {
        await refreshOdooSources(selectedOdooSourceId);
      }
    } catch (reason) {
      setOdooPanelError(
        reason instanceof Error ? reason.message : 'No se pudo probar la conexión Odoo.',
      );
    } finally {
      setIsTestingOdoo(false);
    }
  }

  function parseOdooInstitutionLimit(): number | undefined {
    const value = odooInstitutionLimit.trim();
    if (!value) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('El límite de instituciones debe ser un entero mayor a 0.');
    }
    return parsed;
  }

  async function handlePreviewOdooSync() {
    if (!selectedOdooSourceId) {
      setOdooPanelError('Primero guarda la fuente Odoo antes de previsualizar.');
      return;
    }

    setOdooPanelError(null);
    setOdooPanelInfo(null);
    setIsPreviewingOdoo(true);
    setOdooPreview(null);
    try {
      const institutionLimit = parseOdooInstitutionLimit();
      const previewResponse = await workspaceApi.previewOdooSource(selectedOdooSourceId, {
        institutionLimit,
      });
      const preview = previewResponse.data.preview;
      setOdooPreview(preview);
      setOdooPanelInfo(
        `Previsualización lista: ${preview.institutionsFound} instituciones detectadas, ${preview.institutionsSelected} seleccionadas · lectura sobre ${odooEgiScopeLabel}.`,
      );
    } catch (reason) {
      setOdooPanelError(
        reason instanceof Error ? reason.message : 'No se pudo previsualizar la fuente Odoo.',
      );
    } finally {
      setIsPreviewingOdoo(false);
    }
  }

  async function handleRunOdooSync() {
    if (!selectedOdooSourceId) {
      setOdooPanelError('Primero guarda la fuente Odoo antes de ejecutar sync.');
      return;
    }

    setIsRunningOdoo(true);
    setOdooPanelError(null);
    setOdooPanelInfo(null);
    setOdooSyncJob(null);
    try {
      const institutionLimit = parseOdooInstitutionLimit();
      const runResponse = await workspaceApi.runOdooSourceSyncWithOptions(selectedOdooSourceId, {
        institutionLimit,
      });
      let latestJob = await workspaceApi.getSyncJob(runResponse.data.jobId);
      setOdooSyncJob(latestJob);

      const terminalStatuses: SyncJobResponse['status'][] = [
        'completed',
        'partial_failed',
        'failed',
      ];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (terminalStatuses.includes(latestJob.status)) {
          break;
        }
        await sleep(1200);
        latestJob = await workspaceApi.getSyncJob(runResponse.data.jobId);
        setOdooSyncJob(latestJob);
      }

      await Promise.all([
        refreshImportBatches(),
        refreshOdooSources(selectedOdooSourceId),
      ]);
      const refreshedBatches = await workspaceApi.getOdooSourceBatches(selectedOdooSourceId);
      const refreshedErrors = await workspaceApi.getOdooSourceErrors(selectedOdooSourceId);
      const updatedBatches = refreshedBatches.data.batches;
      setOdooBatches(updatedBatches);
      setOdooSelectedBatchId(updatedBatches[0]?.id ?? null);
      setOdooRecentErrors(refreshedErrors.data.errors);

      setOdooPanelInfo(
        `Sincronización Odoo ejecutada sobre ${odooEgiScopeLabel}. Estado final: ${getImportStatusLabel(latestJob.status as ImportBatch['status'])}.`,
      );
    } catch (reason) {
      setOdooPanelError(reason instanceof Error ? reason.message : 'No se pudo ejecutar sync Odoo.');
    } finally {
      setIsRunningOdoo(false);
    }
  }

  function parseOdooShapefileMapping(): Record<string, string> | undefined {
    const raw = odooShapefileMappingText.trim();
    if (raw.length === 0) {
      return undefined;
    }
    return parseColumnMappingInput(raw);
  }

  async function handlePreviewOdooShapefile() {
    if (!selectedOdooSourceId) {
      setOdooPanelError('Primero guarda o selecciona una fuente Odoo.');
      return;
    }
    if (!odooShapefileFile) {
      setOdooPanelError('Selecciona un archivo .zip de shapefile para previsualizar.');
      return;
    }

    setOdooPanelError(null);
    setOdooPanelInfo(null);
    setIsPreviewingOdooShapefile(true);
    setOdooShapefilePreview(null);
    setOdooShapefileImportResult(null);
    try {
      const mappingJson = parseOdooShapefileMapping();
      const response = await workspaceApi.previewOdooShapefile(selectedOdooSourceId, {
        file: odooShapefileFile,
        mappingJson,
        country: odooShapefileCountry.trim() || undefined,
      });
      setOdooShapefilePreview(response.data.preview);
      setOdooPanelInfo(
        `Preview shapefile listo: ${response.data.preview.validationSummary.validRows} válidas, ${response.data.preview.validationSummary.invalidRows} inválidas · contexto ${odooEgiScopeLabel}.`,
      );
    } catch (reason) {
      setOdooPanelError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo generar preview del shapefile.',
      );
    } finally {
      setIsPreviewingOdooShapefile(false);
    }
  }

  async function handleImportOdooShapefile() {
    if (!selectedOdooSourceId) {
      setOdooPanelError('Primero guarda o selecciona una fuente Odoo.');
      return;
    }
    if (!odooShapefileFile) {
      setOdooPanelError('Selecciona un archivo .zip de shapefile para importar.');
      return;
    }

    setOdooPanelError(null);
    setOdooPanelInfo(null);
    setIsImportingOdooShapefile(true);
    setOdooShapefileImportResult(null);
    try {
      const mappingJson = parseOdooShapefileMapping();
      const response = await workspaceApi.importOdooShapefile(selectedOdooSourceId, {
        file: odooShapefileFile,
        mappingJson,
        country: odooShapefileCountry.trim() || undefined,
        createMissingProjects: odooShapefileCreateMissingProjects,
      });
      setOdooShapefileImportResult(response.data);
      setOdooPanelInfo(
        `Shapefile importado en ${odooEgiScopeLabel}. Lote ${response.data.batch.id.slice(0, 8)}... con estado ${getImportStatusLabel(response.data.batch.status)}.`,
      );
      await Promise.all([
        refreshImportBatches(response.data.batch.id),
        refreshOdooSources(selectedOdooSourceId),
      ]);
      const refreshedBatches = await workspaceApi.getOdooSourceBatches(selectedOdooSourceId);
      const updatedBatches = refreshedBatches.data.batches;
      setOdooBatches(updatedBatches);
      setOdooSelectedBatchId(response.data.batch.id);
    } catch (reason) {
      setOdooPanelError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo importar shapefile al pipeline.',
      );
    } finally {
      setIsImportingOdooShapefile(false);
    }
  }

  return (
    <section>
      {!embedded && mode === 'general' ? (
        <DataWorkspaceHeader description="Fuentes, importaciones, calidad, pendientes, documentos e historial dentro del EGI activo." />
      ) : null}
      {!embedded && mode === 'odoo' ? (
        <ModuleWorkspaceHeader
          eyebrow="Configuración · Odoo"
          title="SIGI ↔ Odoo"
          description="Pantalla especializada para configurar Odoo, validar conexión, previsualizar alcance, ejecutar sync y revisar trazabilidad completa del pipeline."
        />
      ) : null}

      {showGlobalViewControls ? (
        <div className="sigi-scope-switcher sigi-scope-switcher--tabs">
          <button
            type="button"
            onClick={() => setGlobalViewScope('active')}
            className={globalViewScope === 'active' ? 'is-active' : ''}
          >
            EGI activo
          </button>
          <button
            type="button"
            onClick={() => setGlobalViewScope('global')}
            className={globalViewScope === 'global' ? 'is-active' : ''}
          >
            Vista global
          </button>
          <span>
            {globalViewScope === 'active'
              ? 'Las fuentes y la bandeja de imports usan el EGI seleccionado.'
              : 'Las fuentes y los batches se muestran en vista global consolidada cuando el backend autoriza el alcance.'}
          </span>
        </div>
      ) : null}

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {importError ? <MessageBlock tone="danger">{importError}</MessageBlock> : null}
      {uploadError ? <MessageBlock tone="danger">{uploadError}</MessageBlock> : null}
      {connectorRunError ? <MessageBlock tone="danger">{connectorRunError}</MessageBlock> : null}
      {syncJob ? (
        <MessageBlock tone={syncJob.status === 'failed' ? 'danger' : 'neutral'}>
          Trabajo de sincronización {syncJob.jobId.slice(0, 8)}... · estado {getImportStatusLabel(syncJob.status as ImportBatch['status'])}
          {syncJob.finishedAt ? ` · finalizado ${formatBatchTimestamp(syncJob.finishedAt)}` : ''}
        </MessageBlock>
      ) : null}
      {showGlobalViewControls && globalViewScope === 'global' ? (
        <MessageBlock>
          Vista global activa. Esta lectura consolida fuentes e importaciones de los EGI accesibles con privilegio administrativo global.
        </MessageBlock>
      ) : null}

      <MetricGrid>
        {mode === 'odoo' || dataView === 'sources' ? <>
        <MetricCard
          label="Fuentes activas"
          value={String(activeSources.length)}
          hint="Entradas disponibles en la capa de integración."
        />
        <MetricCard
          label="Conectores activos"
          value={String(activeConnectors.length)}
          hint="Adaptadores técnicos listos para operación."
        />
        <MetricCard
          label="Tipos de conector"
          value={String(connectorTypes.size)}
          hint="Diversidad de canales de ingestión visibles."
        />
        </> : null}
        {mode === 'odoo' || dataView === 'imports' || dataView === 'history' ? <>
        <MetricCard
          label="Batches totales"
          value={String(importKpis.total)}
          hint="Lotes registrados en el pipeline universal."
        />
        <MetricCard
          label="Lotes completados"
          value={String(importKpis.completed)}
          hint="Procesados y cerrados (incluye cierre con advertencias)."
        />
        </> : null}
        {mode === 'odoo' || dataView === 'pending' ? <>
        <MetricCard
          label="Lotes fallidos"
          value={String(importKpis.failed)}
          hint="Lotes con fallo operativo para seguimiento."
        />
        <MetricCard
          label="Requieren revisión"
          value={String(importKpis.needsReview)}
          hint="Lotes fallidos, con observaciones o filas inválidas."
          tone={importKpis.needsReview ? 'warn' : 'good'}
        />
        </> : null}
        {mode === 'odoo' || dataView === 'imports' || dataView === 'history' ?
        <MetricCard
          label="Filas promovidas"
          value={String(importKpis.promotedRows)}
          hint="Filas promovidas a tablas finales desde importación."
        />
        : null}
      </MetricGrid>

      {mode === 'odoo' ? (
      <>
      <PanelGrid>
        <Panel
          title="Contexto EGI"
          subtitle="La fuente Odoo, sus previews, syncs y lotes operan dentro del alcance activo para no mezclar datos institucionales entre EGI."
          action={
            <StatPill tone={activeEgiId ? 'good' : 'warn'}>
              {globalViewScope === 'global' ? 'Vista global' : 'EGI activo'}
            </StatPill>
          }
        >
          <DetailList
            items={[
              { label: 'EGI activo', value: activeEgi?.name ?? 'Sin EGI seleccionado' },
              { label: 'Código', value: activeEgi?.code ?? 'n/d' },
              {
                label: 'Alcance',
                value:
                  globalViewScope === 'global'
                    ? 'Consolidado global'
                    : 'Operación del EGI activo',
              },
            ]}
          />
        </Panel>
        <Panel
          title="Conector Odoo administrable"
          subtitle="Configuración operativa de credenciales, mapeo y sincronización manual desde plataforma."
          action={<StatPill tone="neutral">{odooSources.length} fuentes Odoo</StatPill>}
        >
          {odooPanelError ? <MessageBlock tone="danger">{odooPanelError}</MessageBlock> : null}
          {odooPanelInfo ? <MessageBlock>{odooPanelInfo}</MessageBlock> : null}

          <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Fuente Odoo existente</span>
              <select
                value={selectedOdooSourceId ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    handleNewOdooSource();
                    return;
                  }
                  handleSelectOdooSource(value);
                }}
              >
                <option value="">Nueva fuente Odoo</option>
                {odooSources.map((source) => (
                  <option key={source.sourceId} value={source.sourceId}>
                    {source.sourceName} ({source.sourceCode})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleNewOdooSource}
              style={{
                justifySelf: 'start',
                border: '1px solid #d7dde5',
                borderRadius: 10,
                padding: '8px 12px',
                background: '#ffffff',
                color: '#10233f',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Nueva fuente
            </button>
          </div>

          <div
            style={{
              border: '1px solid #d7dde5',
              borderRadius: 12,
              background: '#f8fafc',
              padding: 10,
              display: 'grid',
              gap: 6,
              marginBottom: 12,
            }}
          >
            <strong style={{ color: '#10233f', fontSize: 13 }}>
              Conexión real y carga manual de credenciales
            </strong>
            <span style={{ fontSize: 12, color: '#5f6b7a' }}>
              Ingresa credenciales manualmente desde esta interfaz y guarda
              la fuente antes de probar conexión.
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <StatPill tone="neutral">URL recomendada: http://devsima.fiaes.org.sv/</StatPill>
              <StatPill tone="neutral">DB: sima03</StatPill>
              <StatPill tone="neutral">
                {isOdooProfilePersisted ? 'Perfil guardado' : 'Perfil pendiente de guardar'}
              </StatPill>
            </div>
          </div>

          <form onSubmit={handleSaveOdooSource} style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Nombre de fuente</span>
              <input
                value={odooForm.sourceName}
                onChange={(event) =>
                  setOdooForm((current) => ({ ...current, sourceName: event.target.value }))
                }
                placeholder="Ej: Odoo Cartera MAG"
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Código de fuente (opcional)</span>
              <input
                value={odooForm.sourceCode}
                onChange={(event) =>
                  setOdooForm((current) => ({ ...current, sourceCode: event.target.value }))
                }
                placeholder="Ej: odoo-cartera-mag"
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Institución asociada</span>
              <select
                value={odooForm.institutionId}
                onChange={(event) =>
                  setOdooForm((current) => ({
                    ...current,
                    institutionId: event.target.value,
                  }))
                }
              >
                <option value="">Selecciona institución</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </label>

            <div
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#5f6b7a' }}>URL</span>
                <input
                  value={odooForm.baseUrl}
                  onChange={(event) =>
                    setOdooForm((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  placeholder="https://odoo.ejemplo.org"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#5f6b7a' }}>Database</span>
                <input
                  value={odooForm.databaseName}
                  onChange={(event) =>
                    setOdooForm((current) => ({
                      ...current,
                      databaseName: event.target.value,
                    }))
                  }
                  placeholder="sima03"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#5f6b7a' }}>Username</span>
                <input
                  value={odooForm.username}
                  onChange={(event) =>
                    setOdooForm((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="usuario@dominio"
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>
                Password {selectedOdooSourceId ? '(solo si deseas reemplazar)' : ''}
              </span>
              <input
                type="password"
                value={odooForm.password}
                onChange={(event) =>
                  setOdooForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder={selectedOdooSourceId ? '********' : 'password'}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Perfil de mapeo</span>
              <select
                value={odooForm.mappingProfileId}
                onChange={(event) =>
                  setOdooForm((current) => ({
                    ...current,
                    mappingProfileId: event.target.value,
                  }))
                }
              >
                <option value="">Sin perfil</option>
                {odooMappingProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.profileName} · {profile.entityType} v{profile.version}
                  </option>
                ))}
              </select>
            </label>

            <div
              style={{
                border: '1px solid #d7dde5',
                borderRadius: 12,
                background: '#f8fafc',
                padding: 10,
                display: 'grid',
                gap: 8,
              }}
            >
              <strong style={{ color: '#10233f', fontSize: 13 }}>Mapeo visible</strong>
              {!odooForm.mappingProfileId ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#5f6b7a' }}>
                    Sin perfil asignado. El conector usará mapeo por inferencia del pipeline.
                  </span>
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: '#0f4c81' }}>
                      Ver mapeo sugerido base del conector Odoo
                    </summary>
                    <div
                      style={{
                        marginTop: 8,
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      }}
                    >
                      {(Object.keys(COLUMN_MAPPING_EXAMPLES) as ImportBatch['entityType'][]).map(
                        (entityType) => (
                          <article
                            key={entityType}
                            style={{
                              border: '1px solid #e6e9ef',
                              borderRadius: 10,
                              background: '#ffffff',
                              padding: 8,
                              display: 'grid',
                              gap: 6,
                            }}
                          >
                            <strong style={{ fontSize: 12, color: '#10233f' }}>
                              {getEntityLabel(entityType)}
                            </strong>
                            <pre
                              style={{
                                margin: 0,
                                fontSize: 11,
                                color: '#334155',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {COLUMN_MAPPING_EXAMPLES[entityType]}
                            </pre>
                          </article>
                        ),
                      )}
                    </div>
                  </details>
                </div>
              ) : !selectedOdooMappingProfile ? (
                <span style={{ fontSize: 12, color: '#b45309' }}>
                  El perfil seleccionado no se pudo cargar en esta sesión.
                </span>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <StatPill tone="neutral">
                      {selectedOdooMappingProfile.entityType}
                    </StatPill>
                    <StatPill tone={selectedOdooMappingProfile.isDefault ? 'good' : 'neutral'}>
                      {selectedOdooMappingProfile.isDefault ? 'default' : 'no default'}
                    </StatPill>
                    <StatPill tone="neutral">
                      v{selectedOdooMappingProfile.version}
                    </StatPill>
                  </div>
                  {selectedOdooMappingRows.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#5f6b7a' }}>
                      Este perfil no tiene pares de columnas en `mapping_json`.
                    </span>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          padding: '6px 8px',
                          borderRadius: 8,
                          background: '#eef2f7',
                          fontSize: 12,
                          color: '#5f6b7a',
                          fontWeight: 700,
                        }}
                      >
                        <span>Campo canónico</span>
                        <span>Columna origen</span>
                      </div>
                      {selectedOdooMappingRows.slice(0, 12).map((row) => (
                        <div
                          key={`${row.canonicalField}:${row.sourceField}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: '1px solid #e6e9ef',
                            background: '#ffffff',
                            fontSize: 12,
                            color: '#10233f',
                          }}
                        >
                          <span>{row.canonicalField}</span>
                          <span>{row.sourceField}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>
                Límite de instituciones a importar (opcional)
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={odooInstitutionLimit}
                onChange={(event) => setOdooInstitutionLimit(event.target.value)}
                placeholder="Ej: 5"
              />
              <span style={{ fontSize: 12, color: '#5f6b7a' }}>
                Si lo dejas vacío, se importan todas las instituciones encontradas.
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={odooForm.isActive}
                onChange={(event) =>
                  setOdooForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Fuente activa</span>
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={handleTestOdooConnection}
                disabled={isTestingOdoo || !canRunConnectors}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 12px',
                  background: isTestingOdoo ? '#94a3b8' : '#0f4c81',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: isTestingOdoo ? 'wait' : 'pointer',
                }}
              >
                {isTestingOdoo ? 'Probando...' : 'Probar conexión'}
              </button>
              <button
                type="submit"
                disabled={isSavingOdoo || !(selectedOdooSourceId ? canUpdateSources : canCreateSources)}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 12px',
                  background: isSavingOdoo ? '#94a3b8' : '#14532d',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: isSavingOdoo ? 'wait' : 'pointer',
                }}
              >
                {isSavingOdoo ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={handlePreviewOdooSync}
                disabled={isPreviewingOdoo || !selectedOdooSourceId || !canRunConnectors}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 12px',
                  background: isPreviewingOdoo ? '#94a3b8' : '#155e75',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor:
                    isPreviewingOdoo || !selectedOdooSourceId ? 'not-allowed' : 'pointer',
                }}
              >
                {isPreviewingOdoo ? 'Previsualizando...' : 'Previsualizar alcance'}
              </button>
              <button
                type="button"
                onClick={handleRunOdooSync}
                disabled={isRunningOdoo || !selectedOdooSourceId || !canRunConnectors}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 12px',
                  background: isRunningOdoo ? '#94a3b8' : '#7a271a',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: isRunningOdoo || !selectedOdooSourceId ? 'not-allowed' : 'pointer',
                }}
              >
                {isRunningOdoo ? 'Sincronizando...' : 'Ejecutar sync'}
              </button>
            </div>
          </form>

          {selectedOdooSource ? (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <StatPill tone={getOdooStatusTone(selectedOdooSource.status)}>
                  {selectedOdooSource.status}
                </StatPill>
                <StatPill tone="neutral">
                  modo {odooConnectionResult?.mode ?? 'no probado'}
                </StatPill>
                <StatPill tone={selectedOdooSource.credentialsConfigured ? 'good' : 'warn'}>
                  {selectedOdooSource.credentialsConfigured
                    ? 'Credenciales guardadas'
                    : 'Sin credenciales'}
                </StatPill>
                <StatPill tone={selectedOdooSource.mappingProfileId ? 'good' : 'warn'}>
                  {selectedOdooSource.mappingProfileId ? 'Perfil guardado' : 'Sin perfil'}
                </StatPill>
                <StatPill tone={selectedOdooSource.isActive ? 'good' : 'warn'}>
                  {selectedOdooSource.isActive ? 'Activo' : 'Inactivo'}
                </StatPill>
              </div>
              <DetailList
                items={[
                  {
                    label: 'Último test',
                    value:
                      selectedOdooSource.lastTestAt
                        ? formatBatchTimestamp(selectedOdooSource.lastTestAt)
                        : 'sin test visible',
                  },
                  {
                    label: 'Último sync',
                    value:
                      selectedOdooSource.lastSyncAt
                        ? formatBatchTimestamp(selectedOdooSource.lastSyncAt)
                        : 'sin sync',
                  },
                  {
                    label: 'Último job',
                    value: selectedOdooSource.lastSyncJobId ?? 'sin job',
                  },
                ]}
              />
            </div>
          ) : null}

          {odooConnectionResult ? (
            <div style={{ marginTop: 12 }}>
              <StatPill tone={odooConnectionResult.ok ? 'good' : 'danger'}>
                Test {odooConnectionResult.ok ? 'OK' : 'ERROR'} · {odooConnectionResult.mode}
                {odooConnectionResult.latencyMs
                  ? ` · ${odooConnectionResult.latencyMs}ms`
                  : ''}
              </StatPill>
            </div>
          ) : null}

          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gap: 8,
              border: '1px solid #d7dde5',
              borderRadius: 12,
              background: '#f8fafc',
              padding: 10,
            }}
          >
            <strong style={{ color: '#10233f', fontSize: 13 }}>
              Alcance antes de importar
            </strong>
            {!odooPreview ? (
              <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                Define el límite (si aplica) y pulsa “Previsualizar alcance” para estimar
                cuántas instituciones se detectan y cuántas se importarán.
              </span>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 8,
                  }}
                >
                  <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                    <strong style={{ color: '#10233f' }}>{odooPreview.institutionsFound}</strong>
                    <div style={{ fontSize: 12, color: '#5f6b7a' }}>Encontradas</div>
                  </article>
                  <article style={{ borderRadius: 10, background: '#ecfdf3', padding: 10 }}>
                    <strong style={{ color: '#14532d' }}>{odooPreview.institutionsSelected}</strong>
                    <div style={{ fontSize: 12, color: '#14532d' }}>A importar</div>
                  </article>
                  <article style={{ borderRadius: 10, background: '#f5f7fb', padding: 10 }}>
                    <strong style={{ color: '#10233f' }}>
                      {odooPreview.selectionApplied ? 'Sí' : 'No'}
                    </strong>
                    <div style={{ fontSize: 12, color: '#5f6b7a' }}>Filtro aplicado</div>
                  </article>
                  <article style={{ borderRadius: 10, background: '#f5f7fb', padding: 10 }}>
                    <strong style={{ color: '#10233f' }}>{odooPreview.projectsEstimated}</strong>
                    <div style={{ fontSize: 12, color: '#5f6b7a' }}>Proyectos detectados</div>
                  </article>
                </div>
                <span style={{ color: '#5f6b7a', fontSize: 12 }}>{odooPreview.message}</span>
              </>
            )}
          </div>

          {odooSyncJob ? (
            <div style={{ marginTop: 12 }}>
              <MessageBlock tone={odooSyncJob.status === 'failed' ? 'danger' : 'neutral'}>
                Trabajo de sincronización {odooSyncJob.jobId.slice(0, 8)}... · estado {getImportStatusLabel(odooSyncJob.status as ImportBatch['status'])}
                {odooSyncJob.finishedAt
                  ? ` · finalizado ${formatBatchTimestamp(odooSyncJob.finishedAt)}`
                  : ''}
              </MessageBlock>
            </div>
          ) : null}

          {odooIndicatorCoverage ? (
            <div
              style={{
                marginTop: 10,
                border:
                  odooIndicatorCoverage.isPerfect
                    ? '1px solid #bbf7d0'
                    : odooIndicatorCoverage.hasRows
                      ? '1px solid #fcd6a4'
                      : '1px solid #d7dde5',
                borderRadius: 12,
                padding: 10,
                background: odooIndicatorCoverage.isPerfect
                  ? '#ecfdf3'
                  : odooIndicatorCoverage.hasRows
                    ? '#fff7ed'
                    : '#f8fafc',
                display: 'grid',
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <strong style={{ color: '#10233f', fontSize: 13 }}>
                  Cobertura indicadores
                </strong>
                <StatPill
                  tone={
                    odooIndicatorCoverage.isPerfect
                      ? 'good'
                      : odooIndicatorCoverage.hasRows
                        ? 'warn'
                        : 'neutral'
                  }
                >
                  {odooIndicatorCoverage.hasRows
                    ? `${odooIndicatorCoverage.coveragePercent}%`
                    : 'sin filas'}
                </StatPill>
              </div>
              <span style={{ fontSize: 12, color: '#334155' }}>
                {odooIndicatorCoverage.hasRows
                  ? `Válidas ${odooIndicatorCoverage.validRows}/${odooIndicatorCoverage.extractedRows} · inválidas ${odooIndicatorCoverage.invalidRows} · promovidas ${odooIndicatorCoverage.promotedRows} · estado ${odooIndicatorCoverage.batchStatus}.`
                  : `No hubo filas de indicadores en este ${
                      odooIndicatorCoverage.source === 'job' ? 'sync job' : 'batch'
                    } (${odooIndicatorCoverage.batchStatus}).`}
              </span>
            </div>
          ) : null}

          <div
            style={{
              marginTop: 12,
              border: '1px solid #d7dde5',
              borderRadius: 12,
              background: '#f8fafc',
              padding: 10,
              display: 'grid',
              gap: 10,
            }}
          >
            <strong style={{ color: '#10233f', fontSize: 13 }}>
              Capa geoespacial (Shapefile .zip)
            </strong>
            <span style={{ fontSize: 12, color: '#5f6b7a' }}>
              Carga un `.zip` con `.shp`, `.shx`, `.dbf` (opcional `.prj`, `.cpg`) para
              inspección, validación y promoción en `project_territories`.
            </span>
            <span style={{ fontSize: 12, color: '#5f6b7a' }}>
              Se admite `project_code` canónico o alias técnico de Odoo (ej. `COD_PROY`) si ya
              fue registrado por el sync de proyectos.
            </span>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Archivo .zip</span>
              <input
                type="file"
                accept=".zip"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setOdooShapefileFile(file);
                  setOdooShapefilePreview(null);
                  setOdooShapefileImportResult(null);
                }}
                disabled={!selectedOdooSourceId}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>País (validación geográfica)</span>
              <input
                type="text"
                value={odooShapefileCountry}
                onChange={(event) => setOdooShapefileCountry(event.target.value)}
                placeholder="El Salvador"
                disabled={!selectedOdooSourceId}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>
                Mapeo de campos (opcional, JSON canónico)
              </span>
              <textarea
                rows={8}
                value={odooShapefileMappingText}
                onChange={(event) => setOdooShapefileMappingText(event.target.value)}
                placeholder={`{
  "project_code": "COD_PROY",
  "territory_code": "cod_parcela",
  "territory_name": "nombre_parcela",
  "country": "pais",
  "area_ha": "area_ha"
}`}
                disabled={!selectedOdooSourceId}
                style={{
                  borderRadius: 10,
                  border: '1px solid #d7dde5',
                  padding: 10,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 12,
                  color: '#10233f',
                  background: '#ffffff',
                }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={odooShapefileCreateMissingProjects}
                onChange={(event) => setOdooShapefileCreateMissingProjects(event.target.checked)}
              />
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>
                Crear proyectos faltantes en Odoo y bootstrap en SIGI antes de promover territorios
              </span>
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={handlePreviewOdooShapefile}
                disabled={
                  isPreviewingOdooShapefile ||
                  isImportingOdooShapefile ||
                  !selectedOdooSourceId ||
                  !odooShapefileFile
                }
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 12px',
                  background: isPreviewingOdooShapefile ? '#94a3b8' : '#0f4c81',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor:
                    isPreviewingOdooShapefile ||
                    isImportingOdooShapefile ||
                    !selectedOdooSourceId ||
                    !odooShapefileFile
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {isPreviewingOdooShapefile ? 'Previsualizando shapefile...' : 'Preview shapefile'}
              </button>
              <button
                type="button"
                onClick={handleImportOdooShapefile}
                disabled={
                  isImportingOdooShapefile ||
                  isPreviewingOdooShapefile ||
                  !selectedOdooSourceId ||
                  !odooShapefileFile ||
                  (odooShapefilePreview?.validationSummary.invalidRows ?? 0) > 0
                }
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 12px',
                  background: isImportingOdooShapefile ? '#94a3b8' : '#14532d',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor:
                    isImportingOdooShapefile ||
                    isPreviewingOdooShapefile ||
                    !selectedOdooSourceId ||
                    !odooShapefileFile ||
                    (odooShapefilePreview?.validationSummary.invalidRows ?? 0) > 0
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {isImportingOdooShapefile ? 'Importando shapefile...' : 'Importar al pipeline'}
              </button>
            </div>

            {odooShapefileFile ? (
              <span style={{ fontSize: 12, color: '#5f6b7a' }}>
                Archivo seleccionado: {odooShapefileFile.name} ·{' '}
                {Math.max(1, Math.round(odooShapefileFile.size / 1024))} KB
              </span>
            ) : null}

            {odooShapefilePreview ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 8,
                  }}
                >
                  <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                    <strong style={{ color: '#10233f' }}>{odooShapefilePreview.featureCount}</strong>
                    <div style={{ fontSize: 12, color: '#5f6b7a' }}>Registros</div>
                  </article>
                  <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                    <strong style={{ color: '#10233f' }}>{odooShapefilePreview.geometryType}</strong>
                    <div style={{ fontSize: 12, color: '#5f6b7a' }}>Geometría</div>
                  </article>
                  <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                    <strong style={{ color: '#10233f' }}>{odooShapefilePreview.crs}</strong>
                    <div style={{ fontSize: 12, color: '#5f6b7a' }}>CRS</div>
                  </article>
                  <article style={{ borderRadius: 10, background: '#ecfdf3', padding: 10 }}>
                    <strong style={{ color: '#14532d' }}>
                      {odooShapefilePreview.validationSummary.validRows}
                    </strong>
                    <div style={{ fontSize: 12, color: '#14532d' }}>Válidas</div>
                  </article>
                  <article style={{ borderRadius: 10, background: '#fff4e6', padding: 10 }}>
                    <strong style={{ color: '#b45309' }}>
                      {odooShapefilePreview.validationSummary.invalidRows}
                    </strong>
                    <div style={{ fontSize: 12, color: '#b45309' }}>Inválidas</div>
                  </article>
                  <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                    <strong style={{ color: '#10233f' }}>
                      {odooShapefilePreview.validationSummary.warningRows}
                    </strong>
                    <div style={{ fontSize: 12, color: '#5f6b7a' }}>Warnings</div>
                  </article>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <strong style={{ color: '#10233f', fontSize: 13 }}>
                    Resumen geográfico
                  </strong>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: 8,
                    }}
                  >
                    <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                      <strong style={{ color: '#10233f' }}>
                        {formatPreviewBbox(odooShapefilePreview.bbox)}
                      </strong>
                      <div style={{ fontSize: 12, color: '#5f6b7a' }}>BBox detectado</div>
                    </article>
                    <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                      <strong style={{ color: '#10233f' }}>
                        {odooShapefilePreview.countries?.join(', ') || odooShapefileCountry || 'n/d'}
                      </strong>
                      <div style={{ fontSize: 12, color: '#5f6b7a' }}>País detectado</div>
                    </article>
                    <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                      <strong style={{ color: '#10233f' }}>
                        {odooShapefilePreview.territoryLevels?.join(', ') || 'n/d'}
                      </strong>
                      <div style={{ fontSize: 12, color: '#5f6b7a' }}>Niveles territoriales</div>
                    </article>
                    <article
                      style={{
                        borderRadius: 10,
                        background:
                          (odooShapefilePreview.geographicSummary?.outsideNationalBoundsRows ?? 0) > 0
                            ? '#fff4e6'
                            : '#ecfdf3',
                        padding: 10,
                      }}
                    >
                      <strong
                        style={{
                          color:
                            (odooShapefilePreview.geographicSummary?.outsideNationalBoundsRows ?? 0) > 0
                              ? '#b45309'
                              : '#14532d',
                        }}
                      >
                        {odooShapefilePreview.geographicSummary?.outsideNationalBoundsRows ?? 0}
                      </strong>
                      <div
                        style={{
                          fontSize: 12,
                          color:
                            (odooShapefilePreview.geographicSummary?.outsideNationalBoundsRows ?? 0) > 0
                              ? '#b45309'
                              : '#14532d',
                        }}
                      >
                        Fuera del bbox nacional
                      </div>
                    </article>
                    <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                      <strong style={{ color: '#10233f' }}>
                        {formatPreviewBbox(
                          odooShapefilePreview.geographicSummary?.configuredNationalBBox,
                        )}
                      </strong>
                      <div style={{ fontSize: 12, color: '#5f6b7a' }}>BBox nacional configurado</div>
                    </article>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <strong style={{ color: '#10233f', fontSize: 13 }}>
                    Campos detectados ({odooShapefilePreview.detectedColumns.length})
                  </strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {odooShapefilePreview.detectedColumns.slice(0, 20).map((column) => (
                      <StatPill key={column} tone="neutral">
                        {column}
                      </StatPill>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <strong style={{ color: '#10233f', fontSize: 13 }}>Mapeo aplicado</strong>
                  {Object.keys(odooShapefilePreview.mappingApplied).length === 0 ? (
                    <MessageBlock>
                      No se detectó mapeo aplicado; define `mappingJson` para controlar el cruce.
                    </MessageBlock>
                  ) : (
                    Object.entries(odooShapefilePreview.mappingApplied).map(([canonical, source]) => (
                      <div
                        key={`${canonical}:${source}`}
                        style={{
                          border: '1px solid #d7dde5',
                          borderRadius: 8,
                          padding: '6px 8px',
                          background: '#ffffff',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: '#10233f' }}>{canonical}</span>
                        <span style={{ color: '#5f6b7a' }}>{source}</span>
                      </div>
                    ))
                  )}
                </div>

                {odooShapefilePreview.validationIssues.length > 0 ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <strong style={{ color: '#10233f', fontSize: 13 }}>
                      Hallazgos de validación ({odooShapefilePreview.validationIssues.length})
                    </strong>
                    {odooShapefilePreview.validationIssues.slice(0, 8).map((issue) => (
                      <article
                        key={`${issue.rowNumber}-${issue.code}-${issue.message}`}
                        style={{
                          border:
                            issue.severity === 'warning'
                              ? '1px solid #fcd6a4'
                              : '1px solid #f3d6d4',
                          borderRadius: 10,
                          padding: 10,
                          background: issue.severity === 'warning' ? '#fff7ed' : '#fff4f3',
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <strong
                          style={{
                            color: issue.severity === 'warning' ? '#b45309' : '#b42318',
                            fontSize: 13,
                          }}
                        >
                          fila {issue.rowNumber} · {issue.code}
                        </strong>
                        <span
                          style={{
                            color: issue.severity === 'warning' ? '#92400e' : '#7a271a',
                            fontSize: 13,
                          }}
                        >
                          {issue.message}
                        </span>
                        <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                          {getShapefileIssueGuidance(issue.code)}
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <MessageBlock>
                    Preview sin hallazgos: listo para importar al pipeline.
                  </MessageBlock>
                )}
              </div>
            ) : null}

            {odooShapefileImportResult ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <MessageBlock
                  tone={odooShapefileImportResult.batch.status === 'failed' ? 'danger' : 'neutral'}
                >
                  Batch shapefile {odooShapefileImportResult.batch.id.slice(0, 8)}... · estado{' '}
                  {getImportStatusLabel(odooShapefileImportResult.batch.status)} · promovidas{' '}
                  {odooShapefileImportResult.batch.promotedRows} · geometrías persistidas{' '}
                  {odooShapefileImportResult.geoFeaturesPersisted} (omitidas{' '}
                  {odooShapefileImportResult.geoFeaturesSkipped}).
                </MessageBlock>
                {odooShapefileImportResult.odooProjectUpsert ? (
                  <MessageBlock
                    tone={
                      odooShapefileImportResult.odooProjectUpsert.totals.failed > 0
                        ? 'danger'
                        : 'neutral'
                    }
                  >
                    Proyectos faltantes detectados:{' '}
                    {odooShapefileImportResult.missingProjectsDetected ?? 0} · creados en Odoo:{' '}
                    {odooShapefileImportResult.odooProjectUpsert.totals.created} · existentes:{' '}
                    {odooShapefileImportResult.odooProjectUpsert.totals.existing} · fallidos:{' '}
                    {odooShapefileImportResult.odooProjectUpsert.totals.failed}
                    {odooShapefileImportResult.projectBootstrapBatchId
                      ? ` · bootstrap batch ${odooShapefileImportResult.projectBootstrapBatchId.slice(0, 8)}...`
                      : ''}
                  </MessageBlock>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Trazabilidad Odoo"
          subtitle="Lotes y errores derivados de la última sincronización de la fuente seleccionada."
        >
          {!selectedOdooSourceId ? (
            <MessageBlock>Selecciona o crea una fuente Odoo para revisar trazabilidad.</MessageBlock>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <strong style={{ color: '#10233f' }}>
                  Batches relacionados ({odooBatches.length})
                </strong>
                {odooBatches.length === 0 ? (
                  <MessageBlock>Sin batches asociados todavía.</MessageBlock>
                ) : (
                  odooBatches.slice(0, 8).map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => setOdooSelectedBatchId(batch.id)}
                      style={{
                        border:
                          odooSelectedBatchId === batch.id
                            ? '1px solid #14532d'
                            : '1px solid #d7dde5',
                        borderRadius: 10,
                        padding: 10,
                        background:
                          odooSelectedBatchId === batch.id
                            ? 'linear-gradient(180deg, rgba(20,83,45,0.08) 0%, #ffffff 100%)'
                            : '#ffffff',
                        display: 'grid',
                        gap: 4,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ color: '#10233f' }}>{batch.fileName}</strong>
                        <StatPill tone={getImportTone(batch)}>{getImportStatusLabel(batch.status)}</StatPill>
                      </div>
                      <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                        {getEntityLabel(batch.entityType)} · {batch.validRows}/{batch.totalRows} válidas
                        · promovidas {batch.promotedRows} · calidad{' '}
                        {batch.qualityGrade ?? 'Pendiente'}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {selectedOdooBatch ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong style={{ color: '#10233f' }}>Detalle del batch seleccionado</strong>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: 8,
                    }}
                  >
                    <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                      <strong style={{ color: '#10233f' }}>{selectedOdooBatch.totalRows}</strong>
                      <div style={{ fontSize: 12, color: '#5f6b7a' }}>Procesadas</div>
                    </article>
                    <article style={{ borderRadius: 10, background: '#ecfdf3', padding: 10 }}>
                      <strong style={{ color: '#14532d' }}>{selectedOdooBatch.validRows}</strong>
                      <div style={{ fontSize: 12, color: '#14532d' }}>Válidas</div>
                    </article>
                    <article style={{ borderRadius: 10, background: '#fff4e6', padding: 10 }}>
                      <strong style={{ color: '#b45309' }}>{selectedOdooBatch.invalidRows}</strong>
                      <div style={{ fontSize: 12, color: '#b45309' }}>Inválidas</div>
                    </article>
                    <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                      <strong style={{ color: '#10233f' }}>{selectedOdooBatch.promotedRows}</strong>
                      <div style={{ fontSize: 12, color: '#5f6b7a' }}>Promovidas</div>
                    </article>
                    <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                      <strong style={{ color: '#10233f' }}>
                        {selectedOdooBatch.qualityScore ?? 'N/A'}
                      </strong>
                      <div style={{ fontSize: 12, color: '#5f6b7a' }}>Quality score</div>
                    </article>
                    <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                      <strong style={{ color: '#10233f' }}>
                        {selectedOdooBatch.qualityGrade ?? 'pending'}
                      </strong>
                      <div style={{ fontSize: 12, color: '#5f6b7a' }}>Quality grade</div>
                    </article>
                  </div>

                  {isLoadingOdooBatchDetail ? (
                    <MessageBlock>Cargando reglas y errores del batch...</MessageBlock>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <strong style={{ color: '#10233f' }}>
                          Reglas de validación ({odooSelectedBatchRules.length})
                        </strong>
                        {odooSelectedBatchRules.length === 0 ? (
                          <MessageBlock>Sin reglas registradas para este batch.</MessageBlock>
                        ) : (
                          odooSelectedBatchRules.slice(0, 10).map((rule) => (
                            <article
                              key={rule.id}
                              style={{
                                border: '1px solid #d7dde5',
                                borderRadius: 10,
                                padding: 10,
                                background: '#ffffff',
                                display: 'grid',
                                gap: 4,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: 8,
                                }}
                              >
                                <strong style={{ color: '#10233f' }}>{rule.ruleCode}</strong>
                                <StatPill
                                  tone={
                                    rule.status === 'failed'
                                      ? 'danger'
                                      : rule.status === 'warning'
                                        ? 'warn'
                                        : 'good'
                                  }
                                >
                                  {rule.status}
                                </StatPill>
                              </div>
                              <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                                {rule.message} · filas afectadas {rule.affectedRows}
                              </span>
                            </article>
                          ))
                        )}
                      </div>

                      <div style={{ display: 'grid', gap: 6 }}>
                        <strong style={{ color: '#10233f' }}>
                          Errores del batch ({odooSelectedBatchErrors.length})
                        </strong>
                        {odooSelectedBatchErrors.length === 0 ? (
                          <MessageBlock>Sin errores para este batch.</MessageBlock>
                        ) : (
                          odooSelectedBatchErrors.slice(0, 8).map((item) => (
                            <article
                              key={item.id}
                              style={{
                                border: '1px solid #f3d6d4',
                                borderRadius: 10,
                                padding: 10,
                                background: '#fff4f3',
                                display: 'grid',
                                gap: 4,
                              }}
                            >
                              <strong style={{ color: '#b42318', fontSize: 13 }}>
                                fila {item.rowNumber} · {item.errorCode}
                              </strong>
                              <span style={{ color: '#7a271a', fontSize: 13 }}>
                                {item.errorMessage}
                              </span>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 6 }}>
                <strong style={{ color: '#10233f' }}>
                  Errores recientes ({odooRecentErrors.length})
                </strong>
                {odooRecentErrors.length === 0 ? (
                  <MessageBlock>Sin errores recientes para esta fuente.</MessageBlock>
                ) : (
                  odooRecentErrors.slice(0, 8).map((item) => (
                    <article
                      key={item.id}
                      style={{
                        border: '1px solid #f3d6d4',
                        borderRadius: 10,
                        padding: 10,
                        background: '#fff4f3',
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <strong style={{ color: '#b42318', fontSize: 13 }}>
                        {item.batchFileName} · fila {item.rowNumber} · {item.errorCode}
                      </strong>
                      <span style={{ color: '#7a271a', fontSize: 13 }}>{item.errorMessage}</span>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}
        </Panel>
      </PanelGrid>

      <div style={{ height: 18 }} />

      <PanelGrid>
        <Panel
          title="Validación y reglas del pipeline"
          subtitle="Cobertura actual del conector Odoo en el proceso preprocesamiento → validación → promoción."
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <MessageBlock>
              Reglas activas hoy: columnas faltantes, áreas inválidas, proyecto no
              identificado, institución/persona no identificada según clave de negocio.
            </MessageBlock>
            <MessageBlock>
              Advertencia: la validación automática de coordenadas fuera del territorio nacional sigue
              en proceso de incorporación
              como regla automática dedicada en esta iteración.
            </MessageBlock>
            <MessageBlock>
              Resolución de proyecto en Odoo: el pipeline asocia por `project_code`; si el código no
              existe, el batch marca `project_not_found` y no promueve esa fila.
            </MessageBlock>
          </div>
        </Panel>
        <Panel
          title="Resultado en SIGI e interoperabilidad"
          subtitle="Fuentes y conectores disponibles para esta operación."
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <MessageBlock>
              El sync Odoo alimenta proyectos, indicadores y territorios en API/DB real; luego se
              refleja en los módulos habilitados del frontend único.
            </MessageBlock>
            <MessageBlock>
              Los perfiles de mapeo por fuente permiten integrar históricos 2021–2025 con plantillas
              variables manteniendo trazabilidad de batches y reglas.
            </MessageBlock>
            <MessageBlock>
              La misma estructura deja preparado el camino para exportaciones futuras, consolidación
              de reportes y articulación con plataformas externas (ej. UICN).
            </MessageBlock>
          </div>
        </Panel>
      </PanelGrid>

      <div style={{ height: 18 }} />
      </>
      ) : null}

      {mode === 'general' ? (
      <>
      {dataView === 'sources' ? <>
      <Panel
        title="Caso operativo MAG / INTA"
        subtitle="Lectura rápida del flujo operativo actual: Excel real, equivalencias, validación y trazabilidad por lote."
        action={<StatPill tone="good">Flujo operativo</StatPill>}
      >
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <article style={{ border: '1px solid #d7dde5', borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
            <strong style={{ color: '#10233f' }}>Fuente institucional preparada</strong>
            <span style={{ color: '#5f6b7a', fontSize: 13 }}>
              {magIntaOperationalSource
                ? `${magIntaOperationalSource.name} · ${getFriendlySourceCodeLabel(magIntaOperationalSource.code ?? '')}`
                : 'Fuente institucional aún no visible en catálogo.'}
            </span>
            <span style={{ color: '#5f6b7a', fontSize: 13 }}>
              Uso sugerido: fincas, localización geográfica y actividades asociadas para validación operativa.
            </span>
          </article>

          <article style={{ border: '1px solid #d7dde5', borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
            <strong style={{ color: '#10233f' }}>Lote de equivalencias</strong>
            <span style={{ color: '#5f6b7a', fontSize: 13 }}>
              `projects_template_mapped_headers_textdates.xlsx`
            </span>
            <span style={{ color: '#5f6b7a', fontSize: 13 }}>
              {magIntaMappedBatch
                ? `Estado ${getImportStatusLabel(magIntaMappedBatch.status)} · promovidas ${magIntaMappedBatch.promotedRows}/${magIntaMappedBatch.totalRows}.`
                : 'Pendiente de ejecución.'}
            </span>
          </article>

          <article style={{ border: '1px solid #d7dde5', borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
            <strong style={{ color: '#10233f' }}>Lote de validación</strong>
            <span style={{ color: '#5f6b7a', fontSize: 13 }}>
              `projects_template_invalid_textdates.xlsx`
            </span>
            <span style={{ color: '#5f6b7a', fontSize: 13 }}>
              {magIntaInvalidBatch
                ? `Estado ${getImportStatusLabel(magIntaInvalidBatch.status)} · válidas ${magIntaInvalidBatch.validRows}/${magIntaInvalidBatch.totalRows} · inválidas ${magIntaInvalidBatch.invalidRows}.`
                : 'Pendiente de ejecución.'}
            </span>
          </article>
        </div>
      </Panel>

      <div style={{ height: 18 }} />
      </> : null}

      <PanelGrid>
        {dataView === 'imports' ? <Panel
          title="Carga de importación"
          subtitle="Carga operativa mínima: archivo, entidad y ejecución inmediata."
          action={<StatPill tone="neutral">POST /admin/imports/upload</StatPill>}
        >
          <form onSubmit={handleUpload} style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Archivo CSV/XLSX</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                disabled={isUploading || !canUploadImports}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Tipo de entidad</span>
              <select
                value={uploadEntityMode}
                onChange={(event) => setUploadEntityMode(event.target.value as UploadEntityMode)}
                disabled={isUploading || !canUploadImports}
              >
                <option value="auto">Auto detectar</option>
                <option value="institutions">Instituciones</option>
                <option value="projects">Proyectos</option>
                <option value="project_indicators">Indicadores de proyecto</option>
                <option value="project_territories">Territorios de proyecto</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>ID de fuente (opcional)</span>
              <select
                value={uploadSourceId}
                onChange={(event) => {
                  setUploadSourceId(event.target.value);
                  setSelectedUploadMappingProfileId('');
                  setUploadProfileInfo(null);
                }}
                disabled={isUploading || !canUploadImports}
              >
                <option value="">Sin source explícito</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} ({getFriendlySourceCodeLabel(source.code ?? source.id)})
                  </option>
                ))}
              </select>
            </label>

            {selectedUploadSource ? (
              <div
                style={{
                  border: '1px solid #d7dde5',
                  borderRadius: 12,
                  background: '#f8fafc',
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <strong style={{ color: '#10233f', fontSize: 13 }}>Contexto activo de la fuente</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <StatPill tone="neutral">{selectedUploadSource.name}</StatPill>
                  {selectedUploadSource.country ? (
                    <StatPill tone="neutral">País base: {selectedUploadSource.country}</StatPill>
                  ) : null}
                  {selectedUploadSource.territorialScope ? (
                    <StatPill tone="neutral">{selectedUploadSource.territorialScope}</StatPill>
                  ) : null}
                  {(selectedUploadSource.allowedCountries?.length ?? 0) > 0 ? (
                    <StatPill tone="good">
                      Permitidos: {selectedUploadSource.allowedCountries!.join(', ')}
                    </StatPill>
                  ) : (
                    <StatPill tone="warn">Sin países permitidos explícitos</StatPill>
                  )}
                </div>
                <span style={{ fontSize: 12, color: '#5f6b7a' }}>
                  Si el archivo trae países o territorios fuera de este alcance, el batch quedará con observaciones y no promoverá esas filas.
                </span>
              </div>
            ) : null}

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Hoja XLSX (opcional)</span>
              <input
                type="text"
                placeholder="Ej: Sheet1"
                value={uploadSheetName}
                onChange={(event) => setUploadSheetName(event.target.value)}
                disabled={isUploading || !canUploadImports}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>
                Mapeo de columnas (opcional, JSON)
              </span>
              <textarea
                rows={8}
                placeholder={uploadMappingExample}
                value={uploadColumnMappingText}
                onChange={(event) => setUploadColumnMappingText(event.target.value)}
                disabled={isUploading || !canUploadImports}
                style={{
                  borderRadius: 10,
                  border: '1px solid #d7dde5',
                  padding: 10,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 12,
                  color: '#10233f',
                  background: '#ffffff',
                }}
              />
              <span style={{ fontSize: 12, color: '#5f6b7a' }}>
                Formato recomendado: {`{"columna_canonica":"columna_excel"}`}. También
                acepta el sentido inverso y lo normaliza automáticamente.
              </span>
            </label>

            {selectedUploadSource ? (
              <div
                style={{
                  border: '1px solid #d7dde5',
                  borderRadius: 12,
                  background: '#f8fafc',
                  padding: 12,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <strong style={{ color: '#10233f', fontSize: 13 }}>Perfiles guardados por fuente</strong>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#5f6b7a' }}>Perfil reutilizable</span>
                  <select
                    value={selectedUploadMappingProfileId}
                    onChange={(event) => handleSelectUploadMappingProfile(event.target.value)}
                    disabled={isUploading || isSavingImportProfile || !canUploadImports}
                  >
                    <option value="">Sin perfil aplicado</option>
                    {sourceMappingProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.profileName} · {profile.entityType} · v{profile.version}
                        {profile.isDefault ? ' · default' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {false ? <>
                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'minmax(0, 1fr) auto auto auto auto',
                    alignItems: 'end',
                  }}
                >
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#5f6b7a' }}>Nombre del perfil</span>
                    <input
                      type="text"
                      value={uploadProfileName}
                      onChange={(event) => setUploadProfileName(event.target.value)}
                      placeholder="Ej: MAG fincas 2026"
                      disabled={isUploading || isSavingImportProfile || !canUploadImports}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleSaveUploadMappingProfile(false)}
                    disabled={isUploading || isSavingImportProfile || !canUploadImports}
                    style={{
                      border: '1px solid #d7dde5',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: '#ffffff',
                      color: '#10233f',
                      fontWeight: 700,
                      cursor: isUploading || isSavingImportProfile || !canUploadImports ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {selectedUploadMappingProfileId ? 'Actualizar perfil' : 'Guardar perfil'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveUploadMappingProfile(true)}
                    disabled={isUploading || isSavingImportProfile || !canUploadImports}
                    style={{
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: '#14532d',
                      color: '#ffffff',
                      fontWeight: 700,
                      cursor: isUploading || isSavingImportProfile || !canUploadImports ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isSavingImportProfile ? 'Guardando...' : 'Guardar como default'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateUploadMappingProfileVersion(false)}
                    disabled={
                      isUploading ||
                      isSavingImportProfile ||
                      !canUploadImports ||
                      !selectedUploadMappingProfileId
                    }
                    style={{
                      border: '1px solid #d7dde5',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: '#ffffff',
                      color: '#10233f',
                      fontWeight: 700,
                      cursor:
                        isUploading ||
                        isSavingImportProfile ||
                        !canUploadImports ||
                        !selectedUploadMappingProfileId
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    Nueva versión
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeactivateUploadMappingProfile()}
                    disabled={
                      isUploading ||
                      isSavingImportProfile ||
                      !canUploadImports ||
                      !selectedUploadMappingProfileId
                    }
                    style={{
                      border: '1px solid #f3d6d4',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: '#fff4f3',
                      color: '#b42318',
                      fontWeight: 700,
                      cursor:
                        isUploading ||
                        isSavingImportProfile ||
                        !canUploadImports ||
                        !selectedUploadMappingProfileId
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    Desactivar
                  </button>
                </div>

                {uploadProfileInfo ? (
                  <span style={{ color: '#5f6b7a', fontSize: 12 }}>{uploadProfileInfo}</span>
                ) : (
                  <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                    Usa este bloque para persistir los mapeos corregidos y reutilizarlos en próximos lotes de la misma fuente.
                  </span>
                )}

                {sourceMappingProfiles.length > 0 ? (
                  <div
                    style={{
                      border: '1px solid #e6e9ef',
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: '#ffffff',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(180px, 1.2fr) 120px 110px 160px minmax(260px, 1fr)',
                        gap: 0,
                        padding: '10px 12px',
                        background: '#eef2f7',
                        color: '#5f6b7a',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <span>Perfil</span>
                      <span>Entidad</span>
                      <span>Estado</span>
                      <span>Actualizado</span>
                      <span>Acciones</span>
                    </div>

                    {sourceMappingProfiles.map((profile) => {
                      const isSelected = profile.id === selectedUploadMappingProfileId;
                      const actionsDisabled =
                        isUploading || isSavingImportProfile || !canUploadImports;
                      return (
                        <div
                          key={`profile-row:${profile.id}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(180px, 1.2fr) 120px 110px 160px minmax(260px, 1fr)',
                            gap: 0,
                            padding: '12px',
                            borderTop: '1px solid #eef2f7',
                            background: isSelected ? '#f8fafc' : '#ffffff',
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ display: 'grid', gap: 4 }}>
                            <strong style={{ color: '#10233f', fontSize: 13 }}>
                              {profile.profileName}
                            </strong>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <StatPill tone="neutral">v{profile.version}</StatPill>
                              {profile.isDefault ? <StatPill tone="good">default</StatPill> : null}
                              {isSelected ? <StatPill tone="warn">activo en formulario</StatPill> : null}
                            </div>
                          </div>

                          <span style={{ color: '#334155', fontSize: 12 }}>
                            {getEntityLabel(profile.entityType as ImportBatch['entityType'])}
                          </span>

                          <span>
                            <StatPill tone={profile.status === 'active' ? 'good' : 'warn'}>
                              {profile.status === 'active' ? 'Activo' : 'Inactivo'}
                            </StatPill>
                          </span>

                          <span style={{ color: '#334155', fontSize: 12 }}>
                            {formatBatchTimestamp(profile.updatedAt)}
                          </span>

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => handleSelectUploadMappingProfile(profile.id)}
                              disabled={actionsDisabled}
                              style={{
                                border: '1px solid #d7dde5',
                                borderRadius: 999,
                                padding: '6px 10px',
                                background: '#ffffff',
                                color: '#10233f',
                                fontWeight: 700,
                                cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Cargar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMarkUploadMappingProfileDefault(profile)}
                              disabled={actionsDisabled || profile.isDefault}
                              style={{
                                border: '1px solid #d7dde5',
                                borderRadius: 999,
                                padding: '6px 10px',
                                background: '#ffffff',
                                color: '#10233f',
                                fontWeight: 700,
                                cursor:
                                  actionsDisabled || profile.isDefault ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Default
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrepareUploadProfileVersion(profile)}
                              disabled={actionsDisabled}
                              style={{
                                border: '1px solid #d7dde5',
                                borderRadius: 999,
                                padding: '6px 10px',
                                background: '#ffffff',
                                color: '#10233f',
                                fontWeight: 700,
                                cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Preparar versión
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeactivateUploadMappingProfile(profile)}
                              disabled={actionsDisabled}
                              style={{
                                border: '1px solid #f3d6d4',
                                borderRadius: 999,
                                padding: '6px 10px',
                                background: '#fff4f3',
                                color: '#b42318',
                                fontWeight: 700,
                                cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Desactivar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                </> : (
                  <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                    Crear, versionar o desactivar perfiles se realiza en{' '}
                    <Link to="/admin/data/mappings">Configuración de Datos</Link>.
                  </span>
                )}
              </div>
            ) : null}

            {uploadColumnMappingText.trim().length > 0 ? (
              <div
                style={{
                  border: `1px solid ${
                    uploadMappingValidation.error
                      ? '#f3d6d4'
                      : uploadMappingValidation.missingCanonicalHeaders.length > 0 ||
                          uploadMappingValidation.duplicateSourceHeaders.length > 0
                        ? '#fcd6a4'
                        : '#cce7d0'
                  }`,
                  borderRadius: 12,
                  background: uploadMappingValidation.error
                    ? '#fff4f3'
                    : uploadMappingValidation.missingCanonicalHeaders.length > 0 ||
                        uploadMappingValidation.duplicateSourceHeaders.length > 0
                      ? '#fff7ed'
                      : '#f0fdf4',
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ color: '#10233f' }}>Validación previa del mapeo</strong>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <StatPill
                      tone={
                        uploadMappingValidation.error
                          ? 'danger'
                          : uploadMappingValidation.missingCanonicalHeaders.length > 0 ||
                              uploadMappingValidation.duplicateSourceHeaders.length > 0
                            ? 'warn'
                            : 'good'
                      }
                    >
                      {uploadMappingValidation.error
                        ? 'JSON inválido'
                        : uploadMappingValidation.missingCanonicalHeaders.length > 0 ||
                            uploadMappingValidation.duplicateSourceHeaders.length > 0
                          ? 'Requiere ajuste'
                          : 'Listo para reintento'}
                    </StatPill>
                    {uploadMappingValidation.resolvedEntity ? (
                      <StatPill tone="neutral">
                        {getEntityLabel(uploadMappingValidation.resolvedEntity)}
                      </StatPill>
                    ) : null}
                  </div>
                </div>

                {uploadMappingValidation.error ? (
                  <span style={{ color: '#7a271a', fontSize: 12 }}>
                    {uploadMappingValidation.error}
                  </span>
                ) : null}

                {!uploadMappingValidation.error ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {uploadMappingValidation.missingCanonicalHeaders.length > 0 ? (
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ color: '#9a3412', fontSize: 12, fontWeight: 700 }}>
                          Columnas canónicas pendientes
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {uploadMappingValidation.missingCanonicalHeaders.map((header) => (
                            <StatPill key={`missing:${header}`} tone="warn">
                              {header}
                            </StatPill>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {uploadMappingValidation.duplicateSourceHeaders.length > 0 ? (
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ color: '#9a3412', fontSize: 12, fontWeight: 700 }}>
                          Headers origen repetidos
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {uploadMappingValidation.duplicateSourceHeaders.map((header) => (
                            <StatPill key={`duplicate:${header}`} tone="warn">
                              {header}
                            </StatPill>
                          ))}
                        </div>
                        <span style={{ color: '#7c2d12', fontSize: 12 }}>
                          Un mismo header origen no debería alimentar varios campos canónicos sin una decisión explícita.
                        </span>
                      </div>
                    ) : null}

                    {uploadMappingValidation.missingCanonicalHeaders.length === 0 &&
                    uploadMappingValidation.duplicateSourceHeaders.length === 0 ? (
                      <span style={{ color: '#166534', fontSize: 12 }}>
                        El mapeo actual cubre los campos requeridos y no presenta duplicados obvios antes del reintento.
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={uploadSubmitBlocked}
              style={{
                border: 'none',
                borderRadius: 12,
                padding: '10px 14px',
                background: uploadSubmitBlocked ? '#94a3b8' : '#14532d',
                color: '#ffffff',
                fontWeight: 700,
                cursor: uploadSubmitBlocked ? 'not-allowed' : 'pointer',
              }}
            >
              {isUploading ? 'Subiendo lote...' : 'Subir y procesar'}
            </button>

            {uploadColumnMappingText.trim().length > 0 && uploadMappingValidation.error ? (
              <span style={{ color: '#7a271a', fontSize: 12 }}>
                Corrige el JSON del mapeo para habilitar el envío del lote.
              </span>
            ) : null}
          </form>

          {uploadResult ? (
            <div style={{ marginTop: 12 }}>
              <MessageBlock>
                Batch generado: {uploadResult.id} · estado {uploadResult.status} · válidas{' '}
                {uploadResult.validRows}/{uploadResult.totalRows}
              </MessageBlock>
            </div>
          ) : null}
        </Panel> : null}

        {dataView === 'pending' || dataView === 'history' ? <Panel
          title="Filtros de lotes"
          subtitle="Búsqueda operativa por entidad, estado o archivo."
        >
          <div
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              marginBottom: 12,
            }}
          >
            <article style={{ borderRadius: 12, background: '#f8fafc', padding: 10, display: 'grid', gap: 4 }}>
              <strong style={{ color: '#10233f' }}>{importKpis.total}</strong>
              <span style={{ color: '#5f6b7a', fontSize: 12 }}>Lotes totales</span>
            </article>
            <article style={{ borderRadius: 12, background: '#fff7ed', padding: 10, display: 'grid', gap: 4 }}>
              <strong style={{ color: '#b45309' }}>{importKpis.needsReview}</strong>
              <span style={{ color: '#b45309', fontSize: 12 }}>Requieren corrección</span>
            </article>
            <article style={{ borderRadius: 12, background: '#eef2f7', padding: 10, display: 'grid', gap: 4 }}>
              <strong style={{ color: '#10233f' }}>{importKpis.geographic}</strong>
              <span style={{ color: '#5f6b7a', fontSize: 12 }}>Con foco geográfico</span>
            </article>
          </div>
          <div
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Entidad</span>
              <select
                value={filterEntity}
                onChange={(event) => {
                  const value = event.target.value as ImportFilterEntity;
                  setFilterEntity(value);
                  updateImportFilter('entity', value);
                }}
              >
                <option value="all">Todas</option>
                <option value="institutions">Instituciones</option>
                <option value="projects">Proyectos</option>
                <option value="project_indicators">Indicadores</option>
                <option value="project_territories">Territorios</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Estado</span>
              <select
                value={filterStatus}
                onChange={(event) => {
                  const value = event.target.value as ImportFilterStatus;
                  setFilterStatus(value);
                  updateImportFilter('status', value);
                }}
              >
                <option value="all">Todos</option>
                <option value="received">Recibido</option>
                <option value="running">En ejecución</option>
                <option value="completed">Completado</option>
                <option value="completed_with_errors">Completado con observaciones</option>
                <option value="failed">Fallido</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Atención</span>
              <select
                value={dataView === 'pending' ? 'needs_review' : attentionFilter}
                disabled={dataView === 'pending'}
                onChange={(event) => {
                  const value = event.target.value as ImportAttentionFilter;
                  setAttentionFilter(value);
                  updateImportFilter('attention', value);
                }}
              >
                <option value="all">Todo el inventario</option>
                <option value="needs_review">Solo requiere corrección</option>
                <option value="geographic">Solo lotes geográficos</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Búsqueda</span>
              <input
                type="text"
                placeholder="archivo o batch id"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  updateImportFilter('q', event.target.value);
                }}
              />
            </label>
          </div>
        </Panel> : null}
      </PanelGrid>

      {dataView === 'pending' || dataView === 'history' ? <div style={{ height: 18 }} /> : null}

      {dataView === 'pending' || dataView === 'history' ? <PanelGrid>
        <Panel
          title="Lotes de importación"
          subtitle="Vista operativa diaria para seguimiento de cargas."
          action={<StatPill tone="neutral">{filteredBatches.length} visibles</StatPill>}
        >
          {filteredBatches.length === 0 ? (
            <MessageBlock>No hay lotes para los filtros aplicados.</MessageBlock>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1.2fr 0.9fr 0.9fr 1fr',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: '#eef2f7',
                  fontSize: 12,
                  color: '#5f6b7a',
                  fontWeight: 700,
                }}
              >
                <span>Archivo / ID</span>
                <span>Entidad</span>
                <span>Estado</span>
                <span>Rows</span>
                <span>Fecha</span>
              </div>
              {filteredBatches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => setSelectedBatchId(batch.id)}
                  style={{
                    textAlign: 'left',
                    border: batch.id === selectedBatchId ? '1px solid #14532d' : '1px solid #d7dde5',
                    borderRadius: 10,
                    padding: '10px',
                    background:
                      batch.id === selectedBatchId
                        ? 'linear-gradient(180deg, rgba(20,83,45,0.08) 0%, #ffffff 100%)'
                        : '#ffffff',
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1.2fr 0.9fr 0.9fr 1fr',
                    gap: 8,
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'grid', gap: 3 }}>
                    <strong style={{ color: '#10233f', fontSize: 13 }}>{batch.fileName}</strong>
                    <span style={{ color: '#5f6b7a', fontSize: 12 }}>{batch.id.slice(0, 8)}...</span>
                  </span>
                  <span style={{ color: '#10233f', fontSize: 13 }}>{getEntityLabel(batch.entityType)}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <StatPill tone={getImportTone(batch)}>{getImportStatusLabel(batch.status)}</StatPill>
                    {batch.invalidRows > 0 || batch.status === 'failed' ? (
                      <StatPill tone="warn">Corrección</StatPill>
                    ) : null}
                    {batch.entityType === 'project_territories' ? (
                      <StatPill tone="neutral">Geo</StatPill>
                    ) : null}
                    {getBatchGeoGate(batch) ? (
                      <StatPill tone={getBatchGeoGate(batch)?.tone ?? 'neutral'}>
                        {getBatchGeoGate(batch)?.label}
                      </StatPill>
                    ) : null}
                  </div>
                  <span style={{ color: '#10233f', fontSize: 13 }}>
                    {batch.validRows}/{batch.totalRows}
                  </span>
                  <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                    {formatBatchTimestamp(batch.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Detalle del lote"
          subtitle="Resumen visual, filas válidas/invalidas y errores por batch."
          action={
            selectedBatch ? (
              <StatPill tone={getImportTone(selectedBatch)}>{selectedBatch.status}</StatPill>
            ) : undefined
          }
        >
          {!selectedBatch && !isLoadingImportDetails ? (
            <MessageBlock>Selecciona un lote para revisar su detalle.</MessageBlock>
          ) : null}
          {isLoadingImportDetails ? <MessageBlock>Cargando detalle del batch...</MessageBlock> : null}

          {selectedBatch ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <DetailList
                items={[
                  { label: 'Batch ID', value: selectedBatch.id },
                  { label: 'Archivo', value: selectedBatch.fileName },
                  { label: 'Entidad', value: getEntityLabel(selectedBatch.entityType) },
                  { label: 'Formato', value: selectedBatch.sourceFormat.toUpperCase() },
                  { label: 'Fecha', value: formatBatchTimestamp(selectedBatch.createdAt) },
                  {
                    label: 'Gate geográfico',
                    value: getBatchGeoGate(selectedBatch)?.hint ?? 'No aplica',
                  },
                ]}
              />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  onClick={handlePrepareBatchRetry}
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 10,
                    padding: '8px 12px',
                    background: '#ffffff',
                    color: '#10233f',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Preparar reintento
                </button>
                <button
                  type="button"
                  onClick={handleCopyBatchMapping}
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 10,
                    padding: '8px 12px',
                    background: '#ffffff',
                    color: '#10233f',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Copiar mapeo aplicado
                </button>
                <button
                  type="button"
                  onClick={handleExportBatchErrors}
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 10,
                    padding: '8px 12px',
                    background: '#ffffff',
                    color: '#10233f',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Exportar filas fallidas
                </button>
                <button
                  type="button"
                  onClick={handleApplySuggestedMapping}
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 10,
                    padding: '8px 12px',
                    background: '#ffffff',
                    color: '#10233f',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Aplicar sugerencia automática
                </button>
              </div>

              {batchActionInfo ? <MessageBlock>{batchActionInfo}</MessageBlock> : null}

              {selectedBatchMappingSuggestion.missingHeaders.length > 0 ? (
                <div
                  style={{
                    border: '1px solid #fcd6a4',
                    borderRadius: 12,
                    background: '#fff7ed',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <strong style={{ color: '#9a3412' }}>Columnas canónicas faltantes</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedBatchMappingSuggestion.missingHeaders.map((header) => (
                      <StatPill key={header} tone="warn">
                        {header}
                      </StatPill>
                    ))}
                  </div>
                  <span style={{ color: '#7c2d12', fontSize: 12 }}>
                    Estas columnas no quedaron resueltas en el lote. Puedes usar la sugerencia automática o ajustar el JSON de mapeo manualmente.
                  </span>
                </div>
              ) : null}

              {selectedBatchMappingSuggestion.suggestions.length > 0 ? (
                <div
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 12,
                    background: '#f8fafc',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <strong style={{ color: '#10233f' }}>Sugerencia automática de mapeo</strong>
                  <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                    Solo las sugerencias con confianza alta se aplican automáticamente. Las demás quedan visibles para revisión manual.
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gap: 8,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    }}
                  >
                    {selectedBatchMappingSuggestion.suggestions.map((item) => (
                      <article
                        key={`${item.canonical}:${item.source}`}
                        style={{
                          border:
                            item.confidence === 'high'
                              ? '1px solid #bbf7d0'
                              : item.confidence === 'medium'
                                ? '1px solid #fde68a'
                                : '1px solid #fecaca',
                          borderRadius: 10,
                          background: '#ffffff',
                          padding: 10,
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <strong style={{ color: '#10233f', fontSize: 13 }}>{item.canonical}</strong>
                          <StatPill
                            tone={
                              item.confidence === 'high'
                                ? 'good'
                                : item.confidence === 'medium'
                                  ? 'warn'
                                  : 'danger'
                            }
                          >
                            {item.confidence === 'high'
                              ? 'Alta'
                              : item.confidence === 'medium'
                                ? 'Media'
                                : 'Baja'}
                          </StatPill>
                        </div>
                        <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                          {item.autoApplicable
                            ? 'Aplicable automáticamente'
                            : 'Requiere revisión antes de aplicar'}
                        </span>
                        <code style={{ color: '#14532d', fontSize: 12 }}>{item.source}</code>
                        {item.ambiguousSources.length > 0 ? (
                          <span style={{ color: '#9a3412', fontSize: 12 }}>
                            Alternativas cercanas: {item.ambiguousSources.join(', ')}
                          </span>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedBatchMappingSuggestion.suggestions.length > 0 ? (
                <div
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 12,
                    background: '#ffffff',
                    padding: 12,
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 4 }}>
                      <strong style={{ color: '#10233f' }}>Revisión visual de mapeo</strong>
                      <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                        Ajusta cada columna canónica desde un selector y luego aplica el resultado al formulario de carga.
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleResetBatchReviewDraft}
                        style={{
                          border: '1px solid #d7dde5',
                          borderRadius: 10,
                          padding: '8px 12px',
                          background: '#ffffff',
                          color: '#10233f',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Restablecer
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyReviewedMapping}
                        style={{
                          border: 'none',
                          borderRadius: 10,
                          padding: '8px 12px',
                          background: '#14532d',
                          color: '#ffffff',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Aplicar revisión al formulario
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {selectedBatchMappingSuggestion.suggestions.map((item) => {
                      const availableOptions = Array.from(
                        new Set([
                          item.source,
                          ...(item.ambiguousSources ?? []),
                          ...(selectedBatchMappingSuggestion.candidates ?? []),
                        ]),
                      );
                      const selectedValue = batchMappingReviewDraft[item.canonical] ?? '';
                      return (
                        <article
                          key={`review:${item.canonical}`}
                          style={{
                            border: '1px solid #e6e9ef',
                            borderRadius: 12,
                            background: '#f8fafc',
                            padding: 12,
                            display: 'grid',
                            gap: 8,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ color: '#10233f', fontSize: 13 }}>{item.canonical}</strong>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <StatPill tone={item.autoApplicable ? 'good' : 'warn'}>
                                {item.autoApplicable ? 'Auto' : 'Revisión'}
                              </StatPill>
                              <StatPill
                                tone={
                                  item.confidence === 'high'
                                    ? 'good'
                                    : item.confidence === 'medium'
                                      ? 'warn'
                                      : 'danger'
                                }
                              >
                                {item.confidence === 'high'
                                  ? 'Alta'
                                  : item.confidence === 'medium'
                                    ? 'Media'
                                    : 'Baja'}
                              </StatPill>
                            </div>
                          </div>

                          <label style={{ display: 'grid', gap: 6 }}>
                            <span style={{ fontSize: 12, color: '#5f6b7a' }}>Header origen seleccionado</span>
                            <select
                              value={selectedValue}
                              onChange={(event) =>
                                handleBatchReviewMappingChange(item.canonical, event.target.value)
                              }
                            >
                              <option value="">Sin asignar</option>
                              {availableOptions.map((candidate) => (
                                <option key={`${item.canonical}:${candidate}`} value={candidate}>
                                  {candidate}
                                </option>
                              ))}
                            </select>
                          </label>

                          {item.ambiguousSources.length > 0 ? (
                            <span style={{ color: '#9a3412', fontSize: 12 }}>
                              Revisión sugerida: hay alternativas similares ({item.ambiguousSources.join(', ')}).
                            </span>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {formatSourceScopeSummary(selectedBatch.details) ? (
                <div
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 12,
                    background: '#f8fafc',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <strong style={{ color: '#10233f' }}>Contexto territorial aplicado</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {formatSourceScopeSummary(selectedBatch.details)?.sourceCountry ? (
                      <StatPill tone="neutral">
                        País base: {formatSourceScopeSummary(selectedBatch.details)?.sourceCountry}
                      </StatPill>
                    ) : null}
                    {formatSourceScopeSummary(selectedBatch.details)?.territorialScope ? (
                      <StatPill tone="neutral">
                        Fuente: {formatSourceScopeSummary(selectedBatch.details)?.territorialScope}
                      </StatPill>
                    ) : null}
                    {formatSourceScopeSummary(selectedBatch.details)?.egiTerritorialScope ? (
                      <StatPill tone="neutral">
                        EGI: {formatSourceScopeSummary(selectedBatch.details)?.egiTerritorialScope}
                      </StatPill>
                    ) : null}
                    {(formatSourceScopeSummary(selectedBatch.details)?.allowedCountries.length ?? 0) > 0 ? (
                      <StatPill tone="good">
                        Permitidos: {formatSourceScopeSummary(selectedBatch.details)?.allowedCountries.join(', ')}
                      </StatPill>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {formatBatchShapefilePreview(selectedBatch.details) ? (
                <div
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 12,
                    background: '#f8fafc',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <strong style={{ color: '#10233f' }}>Resumen geográfico del shapefile</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {formatBatchShapefilePreview(selectedBatch.details)?.geometryType ? (
                      <StatPill tone="neutral">
                        Geometría: {formatBatchShapefilePreview(selectedBatch.details)?.geometryType}
                      </StatPill>
                    ) : null}
                    {formatBatchShapefilePreview(selectedBatch.details)?.crs ? (
                      <StatPill tone="neutral">
                        CRS: {formatBatchShapefilePreview(selectedBatch.details)?.crs}
                      </StatPill>
                    ) : null}
                    {(formatBatchShapefilePreview(selectedBatch.details)?.countries.length ?? 0) > 0 ? (
                      <StatPill tone="good">
                        Países: {formatBatchShapefilePreview(selectedBatch.details)?.countries.join(', ')}
                      </StatPill>
                    ) : null}
                    {(formatBatchShapefilePreview(selectedBatch.details)?.territoryLevels.length ?? 0) > 0 ? (
                      <StatPill tone="neutral">
                        Niveles: {formatBatchShapefilePreview(selectedBatch.details)?.territoryLevels.join(', ')}
                      </StatPill>
                    ) : null}
                    {typeof formatBatchShapefilePreview(selectedBatch.details)?.outsideNationalBoundsRows === 'number' ? (
                      <StatPill
                        tone={
                          (formatBatchShapefilePreview(selectedBatch.details)?.outsideNationalBoundsRows ?? 0) > 0
                            ? 'warn'
                            : 'good'
                        }
                      >
                        Fuera bbox: {formatBatchShapefilePreview(selectedBatch.details)?.outsideNationalBoundsRows}
                      </StatPill>
                    ) : null}
                  </div>
                  <DetailList
                    items={[
                      {
                        label: 'BBox detectado',
                        value: formatPreviewBbox(formatBatchShapefilePreview(selectedBatch.details)?.bbox),
                      },
                      {
                        label: 'BBox nacional configurado',
                        value: formatPreviewBbox(
                          formatBatchShapefilePreview(selectedBatch.details)?.configuredNationalBBox,
                        ),
                      },
                    ]}
                  />
                </div>
              ) : null}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: 8,
                }}
              >
                <article style={{ borderRadius: 10, background: '#f5f7fb', padding: 10 }}>
                  <strong style={{ color: '#10233f' }}>{selectedBatch.totalRows}</strong>
                  <div style={{ fontSize: 12, color: '#5f6b7a' }}>total_rows</div>
                </article>
                <article style={{ borderRadius: 10, background: '#ecfdf3', padding: 10 }}>
                  <strong style={{ color: '#14532d' }}>{selectedBatch.validRows}</strong>
                  <div style={{ fontSize: 12, color: '#14532d' }}>valid_rows</div>
                </article>
                <article style={{ borderRadius: 10, background: '#fff4e6', padding: 10 }}>
                  <strong style={{ color: '#b45309' }}>{selectedBatch.invalidRows}</strong>
                  <div style={{ fontSize: 12, color: '#b45309' }}>invalid_rows</div>
                </article>
                <article style={{ borderRadius: 10, background: '#eef2f7', padding: 10 }}>
                  <strong style={{ color: '#10233f' }}>{selectedBatch.promotedRows}</strong>
                  <div style={{ fontSize: 12, color: '#5f6b7a' }}>promoted_rows</div>
                </article>
              </div>

              {selectedBatchRules.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong style={{ color: '#10233f' }}>
                    Reglas evaluadas ({selectedBatchRules.length})
                  </strong>
                  <div
                    style={{
                      display: 'grid',
                      gap: 8,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    }}
                  >
                    {selectedBatchRules.map((rule) => (
                      <article
                        key={rule.id}
                        style={{
                          borderRadius: 12,
                          border:
                            rule.status === 'failed'
                              ? '1px solid #f3d6d4'
                              : rule.status === 'warning'
                                ? '1px solid #fcd6a4'
                                : '1px solid #d7dde5',
                          background:
                            rule.status === 'failed'
                              ? '#fff4f3'
                              : rule.status === 'warning'
                                ? '#fff7ed'
                                : '#f8fafc',
                          padding: 10,
                          display: 'grid',
                          gap: 5,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <strong style={{ color: '#10233f', fontSize: 13 }}>
                            {getRuleLabel(rule.ruleCode)}
                          </strong>
                          <StatPill tone={getRuleTone(rule)}>{rule.status}</StatPill>
                        </div>
                        <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                          {getRuleSummaryText(rule)}
                        </span>
                        <span style={{ color: '#334155', fontSize: 12 }}>{rule.message}</span>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedBatchErrors.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong style={{ color: '#10233f' }}>
                    Errores del batch ({selectedBatchErrors.length})
                  </strong>
                  {selectedBatchErrors.slice(0, 12).map((row) => (
                    <article
                      key={row.id}
                      style={{
                        borderRadius: 10,
                        border: '1px solid #f3d6d4',
                        background: '#fff4f3',
                        padding: 10,
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <span style={{ color: '#b42318', fontWeight: 700, fontSize: 13 }}>
                        fila {row.rowNumber} · {row.errorCode}
                      </span>
                      <span style={{ color: '#7a271a', fontSize: 13 }}>{row.errorMessage}</span>
                      {row.errorCode.includes('country') || row.errorCode.includes('territory') ? (
                        <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                          Revisa país, alcance de fuente y catálogo territorial antes de reintentar la promoción.
                        </span>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <MessageBlock>
                  Sin errores por fila. Validación y promoción completadas en este lote.
                </MessageBlock>
              )}
            </div>
          ) : null}
        </Panel>
      </PanelGrid> : null}

      {dataView === 'sources' ? <div style={{ height: 18 }} /> : null}

      {dataView === 'sources' ? <PanelGrid>
        <Panel
          title="Inventario de fuentes"
          subtitle={freshnessFilter === 'stale' ? 'Fuentes activas sin ingestión o con más de 30 días, filtradas desde Inicio 360.' : 'Cruce entre institución, fuente y conector visible.'}
          action={<StatPill tone={freshnessFilter === 'stale' ? 'warn' : 'good'}>{freshnessFilter === 'stale' ? `${visibleSources.length} desactualizadas` : `${activeSources.length} activas`}</StatPill>}
        >
          <DataTable rows={visibleSources} rowKey={(source) => source.id} empty="No hay fuentes que coincidan con el filtro de la URL." columns={[
            { id: 'source', header: 'Fuente', cell: (source) => <div className="sigi-table-primary"><strong>{source.name}</strong><span>{getSourceTypeLabel(source.sourceType)} · {source.code ? getFriendlySourceCodeLabel(source.code) : 'Sin código'}</span></div>, sortValue: (source) => source.name },
            { id: 'institution', header: 'Institución', cell: (source) => source.institutionName, sortValue: (source) => source.institutionName },
            { id: 'connector', header: 'Canal técnico', cell: (source) => source.connectorName ?? 'Sin conector' },
            { id: 'country', header: 'País / alcance', cell: (source) => <div className="sigi-table-primary"><span>{source.country ?? 'No configurado'}</span><span>{source.territorialScope ?? 'Sin alcance territorial'}</span></div> },
            { id: 'countries', header: 'Países permitidos', cell: (source) => source.allowedCountries?.length ? source.allowedCountries.join(', ') : 'Sin restricción' },
            { id: 'status', header: 'Estado', cell: (source) => <StatusBadge status={source.status} label={getSourceStatusLabel(source.status)} tone={getSourceTone(source)} /> },
          ]} />
        </Panel>

      </PanelGrid> : null}
      </>
      ) : null}
    </section>
  );
}

type DataView = 'sources' | 'imports' | 'pending' | 'history';

function normalizeDataView(value: string | null): DataView {
  return value && ['sources', 'imports', 'pending', 'history'].includes(value)
    ? value as DataView
    : 'sources';
}

function normalizeImportEntity(value: string | null): ImportFilterEntity {
  return value && ['institutions', 'projects', 'project_indicators', 'project_territories'].includes(value)
    ? value as ImportFilterEntity
    : 'all';
}

function normalizeImportStatus(value: string | null): ImportFilterStatus {
  return value && ['received', 'running', 'completed', 'completed_with_errors', 'failed'].includes(value)
    ? value as ImportFilterStatus
    : 'all';
}

function normalizeImportAttention(value: string | null): ImportAttentionFilter {
  return value && ['needs_review', 'geographic'].includes(value)
    ? value as ImportAttentionFilter
    : 'all';
}
