import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  DataSource,
  GeoBiModule,
  GeoFeature,
  GeoFeatureCollection,
  GeoDatasetProfile,
  GeoLayer,
  GeoLayerField,
  GeoLayerFieldStats,
  GeoLayerMetadata,
  GeoNearbyTerritoryResult,
  GeoSavedView,
  GeoTerritorySearchResult,
  ProjectDetail,
} from '@sigi/domain';
import {
  workspaceApi,
  adminGeoServerConfig,
  type GeoServerPublishedLayer,
} from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission, hasSomePermission } from '../utils/permissions';
import { GeoBiLayerMap } from '../components/GeoBiLayerMap';
import { GeoSpatialAnalysisWorkbench } from '../components/GeoSpatialAnalysisWorkbench';
import { GeoLayerCatalogPanel, GeoLayerCatalogEntry } from '../components/GeoLayerCatalogPanel';
import {
  MultiLayerMap,
  MultiLayerMapEntry,
  MultiLayerMapHandle,
  MultiLayerMapWmsEntry,
} from '../components/MultiLayerMap';
import { FeatureIdentificationPanel } from '../components/FeatureIdentificationPanel';
import { GeoLayerAttributeTable } from '../components/GeoLayerAttributeTable';
import { buildFiltersFromForm, GeoLayerFilterFormState, GeoLayerFilterValue } from '../components/GeoLayerFilterControls';
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
import { ActivityList, CompactList, StatusBadge } from '../components/data-display';
import { MapFilterPanel, MapLayerPanel, MapSearch, MapWorkspace } from '../components/map-system';
import {
  parseTerritoryWorkspaceView,
  territoryWorkspacePath,
} from '../features/territory/territory-workspace';

/**
 * Admin-console parity for the country portal's P0-4..P0-7 layer catalog
 * (see docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.2/§9.3/§9.4/§9.6). Independent
 * of every other piece of state on this page — the existing single-layer
 * "Visor de mapas" below is untouched, only relabeled to "(vista clásica)".
 */
const CATALOG_FETCH_ZOOM = 7;
const CATALOG_PAGE_SIZE = 500;
const CATALOG_FILTER_DEBOUNCE_MS = 500;
const TABLE_PAGE_SIZE = 20;
const KOBO_GUATEMALA_WORKSHOP_LAYER_CODE = 'kobo_guate_taller_points';
const KOBO_GUATEMALA_WORKSHOP_DEMO_CUTOFF = 13;
/** P1-1 — territorial search debounce; server also enforces a minimum term length. */
const TERRITORY_SEARCH_DEBOUNCE_MS = 400;
const MIN_TERRITORY_SEARCH_LENGTH = 2;
/**
 * P1-3 — external layers (spec §16).
 * GeoJSON is fetched entirely client-side (no backend proxy — see
 * docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.13), so it needs its own bound.
 */
const MAX_EXTERNAL_GEOJSON_FEATURES = 2000;
const EXTERNAL_LAYER_COLOR = '#6d28d9';

type ExternalLayerKind = 'wms' | 'geojson';

type ExternalLayerEntry = {
  id: string;
  kind: ExternalLayerKind;
  name: string;
  url: string;
  wmsLayerName: string;
  opacity: number;
  visible: boolean;
  loading: boolean;
  error: string | null;
  featureCollection: GeoFeatureCollection | null;
};

type ExternalLayerFormState = {
  kind: ExternalLayerKind;
  name: string;
  url: string;
  wmsLayerName: string;
};

function normalizeExternalGeoJson(payload: unknown): GeoFeatureCollection | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const value = payload as { type?: unknown; features?: unknown };
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    return { type: 'FeatureCollection', features: value.features as GeoFeatureCollection['features'] };
  }
  if (value.type === 'Feature') {
    return { type: 'FeatureCollection', features: [payload as GeoFeatureCollection['features'][number]] };
  }
  return null;
}
// Paleta cualitativa con tonos bien diferenciables sobre fondo claro y satélite.
const catalogColorPalette = ['#d97706', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
// Estilo por defecto de las capas de contexto: los límites se ven tenues y los proyectos destacan.
const LAYER_DEFAULT_STYLE: Record<string, { color: string; opacity: number }> = {
  territories: { color: '#475569', opacity: 0.12 },
  project_polygons: { color: '#d97706', opacity: 0.5 },
};


const dneaFilterDefinitions = [
  { key: 'province', label: 'Provincia' },
  { key: 'canton', label: 'Cantón' },
  { key: 'district', label: 'Distrito' },
  { key: 'agency', label: 'Agencia' },
  { key: 'activityGeneral', label: 'Act. General' },
  { key: 'activity', label: 'Actividad' },
  { key: 'isPrimary', label: 'Es primaria' },
  { key: 'pympaType', label: 'Tipo PYMPA' },
  { key: 'sex', label: 'Sexo' },
] as const;

const dneaColorPalettes = {
  institucional: ['#0b5d1e', '#0f5c5a', '#0b3f73', '#5b21b6', '#92400e', '#9f1239', '#1d3f91', '#166534'],
  contrast: ['#14532d', '#1d4ed8', '#b91c1c', '#7c2d12', '#6d28d9', '#0f766e', '#a16207', '#0f172a'],
  tierra: ['#365314', '#3f6212', '#92400e', '#b45309', '#78350f', '#57534e', '#166534', '#155e75'],
  oceano: ['#0f172a', '#0b3f73', '#0369a1', '#0f766e', '#155e75', '#1d4ed8', '#164e63', '#334155'],
  magenta: ['#9f1239', '#be185d', '#7e22ce', '#5b21b6', '#1d4ed8', '#0f766e', '#92400e', '#14532d'],
} as const;

const dneaPaletteLabels: Record<keyof typeof dneaColorPalettes, string> = {
  institucional: 'Institucional',
  contrast: 'Alto contraste',
  tierra: 'Tierra',
  oceano: 'Océano',
  magenta: 'Magenta',
};

const levelOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'country', label: 'País' },
  { value: 'region', label: 'Región' },
  { value: 'province', label: 'Provincia' },
  { value: 'custom', label: 'Custom / capa base' },
] as const;

const OPERATIONAL_ANALYSIS_LAYER_CODE = 'kobo_dnea_operational_analysis';
const LEGACY_ANALYSIS_LAYER_CODE = 'kobo_dnea_demo_analysis';
const OPERATIONAL_ANALYSIS_GEOSERVER_LAYER = 'sigi:public_kobo_dnea_analysis';
const LEGACY_ANALYSIS_GEOSERVER_LAYER = 'sigi:public_kobo_dnea_demo_analysis';
const OPERATIONAL_POINTS_GEOSERVER_LAYER = 'sigi:public_kobo_dnea_points';
const LEGACY_POINTS_GEOSERVER_LAYER = 'sigi:public_kobo_dnea_demo_points';

const GEO_LAYER_CODE_ALIASES: Record<string, string[]> = {
  [OPERATIONAL_ANALYSIS_LAYER_CODE]: [OPERATIONAL_ANALYSIS_LAYER_CODE, LEGACY_ANALYSIS_LAYER_CODE],
  [LEGACY_ANALYSIS_LAYER_CODE]: [LEGACY_ANALYSIS_LAYER_CODE, OPERATIONAL_ANALYSIS_LAYER_CODE],
};

const GEOSERVER_LAYER_ALIASES: Record<string, string[]> = {
  [OPERATIONAL_ANALYSIS_GEOSERVER_LAYER]: [
    OPERATIONAL_ANALYSIS_GEOSERVER_LAYER,
    LEGACY_ANALYSIS_GEOSERVER_LAYER,
  ],
  [LEGACY_ANALYSIS_GEOSERVER_LAYER]: [
    LEGACY_ANALYSIS_GEOSERVER_LAYER,
    OPERATIONAL_ANALYSIS_GEOSERVER_LAYER,
  ],
  [OPERATIONAL_POINTS_GEOSERVER_LAYER]: [
    OPERATIONAL_POINTS_GEOSERVER_LAYER,
    LEGACY_POINTS_GEOSERVER_LAYER,
  ],
  [LEGACY_POINTS_GEOSERVER_LAYER]: [
    LEGACY_POINTS_GEOSERVER_LAYER,
    OPERATIONAL_POINTS_GEOSERVER_LAYER,
  ],
};

const roleDashboardPresets = {
  decision_maker: {
    label: 'Tomador de decisión',
    person: 'Roberto Azofeifa',
    badge: 'Ejecutivo',
    summary:
      'Prioriza lectura rápida: mapa, KPIs, cobertura, calidad y alertas para decidir dónde intervenir.',
    recommendedLayerCode: 'dnea_activity_points',
    recommendedLevel: 'all',
    recommendedGeoServerLayers: ['sigi:public_territories'],
    highlights: [
      'Ver distribución territorial y volumen de registros activos.',
      'Leer KPIs, calidad geoespacial y alertas sin entrar al detalle técnico.',
      'Usar filtros por provincia, agencia y actividad general.',
    ],
  },
  sig_technician: {
    label: 'Técnico SIG',
    person: 'Juan Pablo',
    badge: 'Analítico',
    summary:
      'Prioriza capas, intersecciones y superposición GeoServer para validar resultados espaciales y parámetros del visor.',
    recommendedLayerCode: OPERATIONAL_ANALYSIS_LAYER_CODE,
    recommendedLevel: 'all',
    recommendedGeoServerLayers: [OPERATIONAL_POINTS_GEOSERVER_LAYER, 'sigi:public_territories'],
    highlights: [
      'Abrir la capa analítica y revisar atributos de cruce territorial.',
      'Comparar puntos, análisis y territorios como overlays simultáneos.',
      'Usar WMS/WFS como puente con GeoServer y validación SIG.',
    ],
  },
  it_ops: {
    label: 'TI',
    person: 'Juan Luis',
    badge: 'Plataforma',
    summary:
      'Prioriza trazabilidad técnica: qué entra, dónde persiste y cómo sale hacia GeoServer, APIs y clientes GIS.',
    recommendedLayerCode: 'territories',
    recommendedLevel: 'region',
    recommendedGeoServerLayers: ['sigi:public_territories', OPERATIONAL_ANALYSIS_GEOSERVER_LAYER],
    highlights: [
      'Explicar Kobo -> SIGI -> PostGIS -> GeoServer -> visor/QGIS.',
      'Verificar publicaciones OGC, capas disponibles y auditoría reciente.',
      'Demostrar interoperabilidad sin rehacer arquitectura.',
    ],
  },
} as const;

const roleGuidedJourneys = {
  decision_maker: {
    objective: 'Entender rápido dónde están los registros, cuánto cubren y si hay alertas o brechas.',
    sections: [
      { id: 'geo-role-hero', label: 'Resumen ejecutivo' },
      { id: 'geo-map', label: 'Visor y filtros' },
      { id: 'geo-dnea-stats', label: 'Estadísticas del operativo' },
      { id: 'geo-kpis', label: 'KPIs e indicadores' },
      { id: 'geo-alerts', label: 'Monitoreo y alertas' },
    ],
  },
  sig_technician: {
    objective: 'Validar capas, superposiciones, intersecciones y publicaciones OGC sobre el visor.',
    sections: [
      { id: 'geo-map', label: 'Visor y overlays' },
      { id: 'geo-capabilities', label: 'GeoServer capabilities' },
      { id: 'geo-dnea-stats', label: 'Puntos y resultados analíticos' },
      { id: 'geo-coverage', label: 'Cobertura territorial' },
      { id: 'geo-catalog', label: 'Catálogo geoespacial' },
    ],
  },
  it_ops: {
    objective: 'Demostrar el flujo técnico de punta a punta, con trazabilidad entre SIGI, PostGIS y GeoServer.',
    sections: [
      { id: 'geo-capabilities', label: 'Publicación OGC' },
      { id: 'geo-excel', label: 'Ingesta controlada' },
      { id: 'geo-audit', label: 'Bitácora y auditoría' },
      { id: 'geo-data-bridge', label: 'Datos y fuentes' },
      { id: 'geo-ecosystem', label: 'Ecosistema SIGI' },
    ],
  },
} as const;

const FRIENDLY_TECHNICAL_LABELS: Record<string, string> = {
  dnea_activity_points: 'Puntos de actividades DNEA',
  [OPERATIONAL_ANALYSIS_LAYER_CODE]: 'Análisis territorial Kobo DNEA',
  [LEGACY_ANALYSIS_LAYER_CODE]: 'Análisis territorial Kobo DNEA',
  territories: 'Territorios públicos SIGI',
  project_polygons: 'Polígonos de proyectos',
  odoo_project_territories: 'Cobertura territorial Odoo',
  'sigi:public_territories': 'Territorios públicos SIGI',
  [OPERATIONAL_POINTS_GEOSERVER_LAYER]: 'Puntos Kobo DNEA publicados',
  [LEGACY_POINTS_GEOSERVER_LAYER]: 'Puntos Kobo DNEA publicados',
  [OPERATIONAL_ANALYSIS_GEOSERVER_LAYER]: 'Análisis Kobo DNEA publicado',
  [LEGACY_ANALYSIS_GEOSERVER_LAYER]: 'Análisis Kobo DNEA publicado',
};

function getFriendlyTechnicalLabel(value: string) {
  const trimmed = value.trim();
  return FRIENDLY_TECHNICAL_LABELS[trimmed] ?? trimmed;
}

function resolvePreferredLayerCode(preferredCode: string, availableCodes: readonly string[]) {
  const aliases = GEO_LAYER_CODE_ALIASES[preferredCode] ?? [preferredCode];
  return aliases.find((alias) => availableCodes.includes(alias)) ?? preferredCode;
}

function resolvePreferredGeoServerLayerNames(
  preferredNames: readonly string[],
  availableNames: readonly string[],
) {
  const resolved = preferredNames.map((name) => {
    const aliases = GEOSERVER_LAYER_ALIASES[name] ?? [name];
    return aliases.find((alias) => availableNames.includes(alias)) ?? name;
  });
  return deduplicateStrings(resolved);
}

function selectStyle() {
  return {
    border: '1px solid #d7dde5',
    borderRadius: 12,
    padding: '10px 12px',
    background: '#ffffff',
    color: '#10233f',
    fontSize: 14,
  };
}

function statusTone(status: string): 'good' | 'warn' | 'neutral' {
  if (status === 'Operativo') {
    return 'good';
  }
  if (status === 'Atencion') {
    return 'warn';
  }
  return 'neutral';
}

function visibilityLabel(value: string) {
  return (
    {
      public: 'Pública',
      private: 'Operativa',
      internal: 'Interna',
    }[value] ?? value
  );
}

function alertStatusLabel(value: string) {
  return (
    {
      open: 'Abierta',
      investigating: 'En investigación',
      in_progress: 'En seguimiento',
      resolved: 'Resuelta',
    }[value] ?? value
  );
}

function extractFeatureCollection(payload: any) {
  if (payload?.type === 'FeatureCollection' && Array.isArray(payload?.features)) {
    return payload;
  }

  if (payload?.data?.type === 'FeatureCollection' && Array.isArray(payload?.data?.features)) {
    return payload.data;
  }

  return null;
}

function deduplicateStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function clampOpacity(value: number) {
  if (Number.isNaN(value)) {
    return 0.72;
  }
  return Math.max(0.2, Math.min(1, value));
}

function geoserverLayerGroupLabel(layer: GeoServerPublishedLayer) {
  const fingerprint = `${layer.name} ${layer.title}`.toLowerCase();
  if (
    fingerprint.includes('secure') ||
    fingerprint.includes('segura') ||
    fingerprint.includes('private') ||
    fingerprint.includes('internal')
  ) {
    return 'Seguras';
  }
  if (
    fingerprint.includes('analysis') ||
    fingerprint.includes('anal') ||
    fingerprint.includes('kobo') ||
    fingerprint.includes('project') ||
    fingerprint.includes('territor') ||
    fingerprint.includes('pasto') ||
    fingerprint.includes('proteg')
  ) {
    return 'Analiticas';
  }
  return 'Publicas';
}

function buildGeoServerLayerCandidates(
  effectiveLayerCode: string,
  selectedLayerCode: string,
  selectedLevel: string,
) {
  const candidates: string[] = [];
  if (selectedLayerCode === 'territories' && selectedLevel !== 'custom') {
    candidates.push('territories');
  }
  if (effectiveLayerCode.trim().length > 0) {
    candidates.push(effectiveLayerCode);
    candidates.push(`public_${effectiveLayerCode}`);
    candidates.push(`sigi:${effectiveLayerCode}`);
    candidates.push(`sigi:public_${effectiveLayerCode}`);
  }
  return deduplicateStrings(candidates);
}

function pickPreferredLayerCode(layers: GeoBiModule['layers']) {
  const corredorSecoLayer = layers.find(
    (layer) => layer.code === 'corredor_seco' && layer.featureCount > 0,
  );
  if (corredorSecoLayer) {
    return corredorSecoLayer.code;
  }

  const firstOperationalLayer = layers.find(
    (layer) => layer.code !== 'territories' && layer.featureCount > 0,
  );
  if (firstOperationalLayer) {
    return firstOperationalLayer.code;
  }

  return layers[0]?.code ?? 'territories';
}

function parseMapViewParam(value: string | null) {
  const parts = (value ?? '').split(',').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [lat, lng, zoom] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || zoom < 1 || zoom > 20) return null;
  return { lat, lng, zoom: Math.round(zoom) };
}

const DEFAULT_VISIBLE_LAYER_CODES = ['territories', 'project_polygons'];

export function GeoBiModulePage() {
  const [searchParams] = useSearchParams();
  const territoryView = parseTerritoryWorkspaceView(searchParams.get('view'));
  // v2.1.0: "Catálogo" se integró en el Visor; los enlaces antiguos (?view=catalog) abren el Visor.
  const isMapViewer = territoryView === 'viewer' || territoryView === 'catalog';
  const [showLegacyAnalysis, setShowLegacyAnalysis] = useState(false);
  const navigateToCanonicalView = useNavigate();
  useEffect(() => {
    // Enlaces antiguos ?view=catalog → Visor (misma vista, pestaña marcada correctamente).
    if (territoryView !== 'catalog') return;
    const params = new URLSearchParams(searchParams);
    params.set('view', 'viewer');
    navigateToCanonicalView(`/admin/geobi?${params.toString()}`, { replace: true });
  }, [territoryView, searchParams, navigateToCanonicalView]);
  const legacyAnalysisVisible = territoryView === 'analysis' && showLegacyAnalysis;
  // Vista compartible: ?at=lat,lng,zoom (se actualiza sin recargar la página).
  const initialMapView = useMemo(() => parseMapViewParam(searchParams.get('at')), []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleMapViewChange = useCallback((view: { lat: number; lng: number; zoom: number }) => {
    const url = new URL(window.location.href);
    // Solo el Visor guarda su encuadre (una animación tardía no debe escribir en otra pestaña).
    if (url.pathname !== '/admin/geobi' || !['viewer', 'catalog', null].includes(url.searchParams.get('view'))) return;
    url.searchParams.set('at', `${view.lat.toFixed(5)},${view.lng.toFixed(5)},${view.zoom}`);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const requestedProjectId = searchParams.get('projectId');
  const { globalViewScope, currentUser } = useEgi();
  const canReadGeoBi = hasSomePermission(currentUser, [
    'validations.read',
    'connectors.read',
    'sources.read',
    'imports.read',
    'audit.read',
  ]);
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canUploadImports = hasPermission(currentUser, 'imports.upload');
  const canReadProjects = hasPermission(currentUser, 'projects.read');
  const [projectContext, setProjectContext] = useState<ProjectDetail | null>(null);
  const [projectContextError, setProjectContextError] = useState(false);
  const [module, setModule] = useState<GeoBiModule | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [featureCollection, setFeatureCollection] = useState<any | null>(null);
  const [selectedLayerCode, setSelectedLayerCode] = useState<string>('territories');
  const [selectedLevel, setSelectedLevel] = useState<string>('region');
  const [selectedCustomBaseLayerCode, setSelectedCustomBaseLayerCode] =
    useState<string>('project_polygons');
  const [selectedFeatureCode, setSelectedFeatureCode] = useState<string | null>(null);
  const [selectedGeoServerLayerNames, setSelectedGeoServerLayerNames] = useState<string[]>([]);
  const [geoServerLayerOpacities, setGeoServerLayerOpacities] = useState<Record<string, number>>({});
  const [dneaFilters, setDneaFilters] = useState<Record<string, string>>({});
  const [dneaColorBy, setDneaColorBy] = useState<string>('activityGeneral');
  const [dneaPaletteKey, setDneaPaletteKey] =
    useState<keyof typeof dneaColorPalettes>('institucional');
  const [roleDashboardKey, setRoleDashboardKey] =
    useState<keyof typeof roleDashboardPresets>('decision_maker');
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [geoExcelFile, setGeoExcelFile] = useState<File | null>(null);
  const [geoExcelSourceId, setGeoExcelSourceId] = useState<string>('');
  const [projectSheetName, setProjectSheetName] = useState<string>('projects');
  const [territorySheetName, setTerritorySheetName] = useState<string>('project_territories');
  const [isImportingGeoExcel, setIsImportingGeoExcel] = useState(false);
  const [geoServerSnapshot, setGeoServerSnapshot] = useState<{
    ok: boolean;
    workspace: string | null;
    serviceUrl: string;
    wfsServiceUrl: string;
    capabilitiesUrl: string;
    publishedLayers: GeoServerPublishedLayer[];
  } | null>(null);
  const [geoServerError, setGeoServerError] = useState<string | null>(null);
  const [geoServerNotice, setGeoServerNotice] = useState<string | null>(null);
  const [geoExcelError, setGeoExcelError] = useState<string | null>(null);
  const [geoExcelInfo, setGeoExcelInfo] = useState<string | null>(null);
  const [geoExcelResult, setGeoExcelResult] = useState<{
    projectBatchId: string;
    territoryBatchId: string;
    projectStatus: string;
    territoryStatus: string;
    projectRows: string;
    territoryRows: string;
  } | null>(null);

  // ---- P0-4/P0-5/P0-6/P0-7 — new layer catalog, independent of the legacy
  // single-layer state above. See docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.2-§9.6.
  const navigate = useNavigate();
  const canReadInstitutionsForGeo = hasPermission(currentUser, 'institutions.read');
  const [geoLayers, setGeoLayers] = useState<GeoLayer[] | null>(null);
  const [geoLayersLoading, setGeoLayersLoading] = useState(true);
  const [geoLayersError, setGeoLayersError] = useState<string | null>(null);
  // P0-9 — catalog toolbar: client-side name search over the already-fetched
  // catalog.
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [activeCatalogCodes, setActiveCatalogCodes] = useState<string[]>([]);
  const [catalogColorByCode, setCatalogColorByCode] = useState<Record<string, string>>({});
  const [catalogOpacityByCode, setCatalogOpacityByCode] = useState<Record<string, number>>({});
  const [catalogFeaturesByCode, setCatalogFeaturesByCode] = useState<
    Record<
      string,
      { loading: boolean; error: string | null; data: GeoFeatureCollection | null; totalFeatures: number }
    >
  >({});
  const multiLayerMapRef = useRef<MultiLayerMapHandle>(null);

  const [selectedGeoFeature, setSelectedGeoFeature] = useState<{ layerCode: string; feature: GeoFeature } | null>(
    null,
  );
  const [layerMetadataByCode, setLayerMetadataByCode] = useState<
    Record<string, { loading: boolean; error: string | null; data: GeoLayerMetadata | null }>
  >({});
  const [geoInstitutions, setGeoInstitutions] = useState<Array<{ id: string; name: string }> | null>(null);

  const [catalogSchemaByCode, setCatalogSchemaByCode] = useState<
    Record<string, { loading: boolean; error: string | null; fields: GeoLayerField[] | null }>
  >({});
  // P1-2 — per-layer profile (spec §11).
  const [catalogProfileByCode, setCatalogProfileByCode] = useState<
    Record<string, { loading: boolean; error: string | null; data: GeoDatasetProfile | null; fetched: boolean }>
  >({});
  const [catalogFilterFormByCode, setCatalogFilterFormByCode] = useState<
    Record<string, GeoLayerFilterFormState>
  >({});
  const catalogFiltersByCode = useMemo(() => {
    const result: Record<string, ReturnType<typeof buildFiltersFromForm>> = {};
    for (const code of Object.keys(catalogFilterFormByCode)) {
      const fields = catalogSchemaByCode[code]?.fields;
      if (!fields) {
        continue;
      }
      const filters = buildFiltersFromForm(fields, catalogFilterFormByCode[code]);
      if (filters.length > 0) {
        result[code] = filters;
      }
    }
    return result;
  }, [catalogFilterFormByCode, catalogSchemaByCode]);
  const [debouncedCatalogFiltersByCode, setDebouncedCatalogFiltersByCode] = useState<
    Record<string, ReturnType<typeof buildFiltersFromForm>>
  >({});
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedCatalogFiltersByCode(catalogFiltersByCode),
      CATALOG_FILTER_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [catalogFiltersByCode]);
  const lastFetchedFiltersKeyRef = useRef<Record<string, string>>({});

  const [tableLayerCode, setTableLayerCode] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [tableSort, setTableSort] = useState<string | null>(null);
  const [tableOrder, setTableOrder] = useState<'asc' | 'desc'>('asc');
  const [tableData, setTableData] = useState<{
    loading: boolean;
    error: string | null;
    features: GeoFeature[];
    totalFeatures: number;
  }>({ loading: false, error: null, features: [], totalFeatures: 0 });

  // Extracted to a callback (P0-9) so the toolbar's "Actualizar catálogo"
  // button can re-run the same fetch, not just the initial mount.
  const fetchGeoLayers = useCallback(() => {
    if (!canReadGeoBi) {
      return;
    }
    setGeoLayersLoading(true);
    setGeoLayersError(null);
    workspaceApi
      .getGeoLayers()
      .then((response) => {
        setGeoLayers(response.data.layers);
        setGeoLayersLoading(false);
      })
      .catch((reason: Error) => {
        setGeoLayersError(reason.message);
        setGeoLayersLoading(false);
      });
  }, [canReadGeoBi]);

  useEffect(() => {
    fetchGeoLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReadGeoBi]);

  useEffect(() => {
    if (!canReadInstitutionsForGeo) {
      setGeoInstitutions([]);
      return;
    }
    workspaceApi
      .getInstitutions()
      .then((response) => setGeoInstitutions(response.data.institutions))
      .catch(() => setGeoInstitutions([]));
  }, [canReadInstitutionsForGeo]);

  const handleToggleCatalogLayer = useCallback((code: string) => {
    setActiveCatalogCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
    setCatalogColorByCode((current) => {
      if (current[code]) {
        return current;
      }
      const used = new Set(Object.values(current));
      const color =
        LAYER_DEFAULT_STYLE[code]?.color ??
        catalogColorPalette.find((candidate) => !used.has(candidate)) ??
        catalogColorPalette[Object.keys(current).length % catalogColorPalette.length];
      return { ...current, [code]: color };
    });
    setCatalogOpacityByCode((current) =>
      current[code] !== undefined ? current : { ...current, [code]: LAYER_DEFAULT_STYLE[code]?.opacity ?? 0.45 },
    );
  }, []);

  // Activación idempotente (no alterna): segura aunque varios efectos la pidan en el mismo ciclo.
  const activateCatalogLayer = useCallback(
    (code: string) => {
      setActiveCatalogCodes((current) => (current.includes(code) ? current : [...current, code]));
      setCatalogColorByCode((current) => {
        if (current[code]) return current;
        const used = new Set(Object.values(current));
        const color =
          LAYER_DEFAULT_STYLE[code]?.color ??
          catalogColorPalette.find((candidate) => !used.has(candidate)) ??
          catalogColorPalette[Object.keys(current).length % catalogColorPalette.length];
        return { ...current, [code]: color };
      });
      setCatalogOpacityByCode((current) =>
        current[code] !== undefined ? current : { ...current, [code]: LAYER_DEFAULT_STYLE[code]?.opacity ?? 0.45 },
      );
    },
    [],
  );

  const handleCatalogOpacityChange = useCallback((code: string, opacity: number) => {
    setCatalogOpacityByCode((current) => ({ ...current, [code]: opacity }));
  }, []);

  // Al abrir el Visor sin capas activas se muestran las capas de contexto (regiones y proyectos).
  const defaultLayersAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultLayersAppliedRef.current || !geoLayers || geoLayers.length === 0) return;
    defaultLayersAppliedRef.current = true;
    if (activeCatalogCodes.length > 0) return;
    const available = new Set(geoLayers.map((layer) => layer.code));
    const defaults = DEFAULT_VISIBLE_LAYER_CODES.filter((code) => available.has(code));
    (defaults.length > 0 ? defaults : [geoLayers[0].code]).forEach((code) => activateCatalogLayer(code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoLayers]);

  // ?projectId=… : activa la capa de proyectos; MultiLayerMap resalta y encuadra el polígono (focusFeature).
  useEffect(() => {
    if (!requestedProjectId || !geoLayers?.some((layer) => layer.code === 'project_polygons')) return;
    activateCatalogLayer('project_polygons');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProjectId, geoLayers]);
  const projectFocusFeature = useMemo(
    () => (requestedProjectId ? { layerCode: 'project_polygons', property: 'projectId', value: requestedProjectId } : null),
    [requestedProjectId],
  );

  const handleZoomToCatalogLayer = useCallback((code: string) => {
    multiLayerMapRef.current?.zoomToLayer(code);
  }, []);

  useEffect(() => {
    activeCatalogCodes.forEach((code) => {
      const filtersKey = JSON.stringify(debouncedCatalogFiltersByCode[code] ?? []);
      if (lastFetchedFiltersKeyRef.current[code] === filtersKey) {
        return;
      }
      lastFetchedFiltersKeyRef.current[code] = filtersKey;
      setCatalogFeaturesByCode((current) => ({
        ...current,
        [code]: { loading: true, error: null, data: null, totalFeatures: 0 },
      }));
    });
  }, [activeCatalogCodes, debouncedCatalogFiltersByCode]);

  useEffect(() => {
    const pendingCodes = activeCatalogCodes.filter(
      (code) => catalogFeaturesByCode[code]?.loading && catalogFeaturesByCode[code]?.data === null,
    );

    pendingCodes.forEach((code) => {
      workspaceApi
        .getGeoLayerFeatures(code, {
          zoom: CATALOG_FETCH_ZOOM,
          pageSize: CATALOG_PAGE_SIZE,
          filters: debouncedCatalogFiltersByCode[code],
        })
        .then((response) => {
          setCatalogFeaturesByCode((current) => ({
            ...current,
            [code]: {
              loading: false,
              error: null,
              data: response.data.featureCollection,
              totalFeatures: response.data.totalFeatures,
            },
          }));
        })
        .catch((reason: Error) => {
          setCatalogFeaturesByCode((current) => ({
            ...current,
            [code]: { loading: false, error: reason.message, data: null, totalFeatures: 0 },
          }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCatalogCodes, catalogFeaturesByCode, debouncedCatalogFiltersByCode]);

  useEffect(() => {
    activeCatalogCodes.forEach((code) => {
      setCatalogSchemaByCode((current) => {
        if (current[code]) {
          return current;
        }
        return { ...current, [code]: { loading: true, error: null, fields: null } };
      });
    });
  }, [activeCatalogCodes]);

  useEffect(() => {
    const pendingCodes = activeCatalogCodes.filter(
      (code) => catalogSchemaByCode[code]?.loading && catalogSchemaByCode[code]?.fields === null,
    );

    pendingCodes.forEach((code) => {
      workspaceApi
        .getGeoLayerSchema(code)
        .then((response) => {
          setCatalogSchemaByCode((current) => ({
            ...current,
            [code]: { loading: false, error: null, fields: response.data.fields },
          }));
        })
        .catch((reason: Error) => {
          setCatalogSchemaByCode((current) => ({
            ...current,
            [code]: { loading: false, error: reason.message, fields: null },
          }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCatalogCodes, catalogSchemaByCode]);

  // P1-2 — profile per active layer.
  useEffect(() => {
    activeCatalogCodes.forEach((code) => {
      setCatalogProfileByCode((current) => {
        if (current[code]) {
          return current;
        }
        return { ...current, [code]: { loading: true, error: null, data: null, fetched: false } };
      });
    });
  }, [activeCatalogCodes]);

  useEffect(() => {
    const pendingCodes = activeCatalogCodes.filter(
      (code) => catalogProfileByCode[code]?.loading && !catalogProfileByCode[code]?.fetched,
    );

    pendingCodes.forEach((code) => {
      workspaceApi
        .getGeoLayerProfile(code)
        .then((response) => {
          setCatalogProfileByCode((current) => ({
            ...current,
            [code]: { loading: false, error: null, data: response.data.profile, fetched: true },
          }));
        })
        .catch((reason: Error) => {
          setCatalogProfileByCode((current) => ({
            ...current,
            [code]: { loading: false, error: reason.message, data: null, fetched: true },
          }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCatalogCodes, catalogProfileByCode]);

  const handleFilterFieldChange = useCallback(
    (code: string, fieldName: string, value: GeoLayerFilterValue) => {
      setCatalogFilterFormByCode((current) => ({
        ...current,
        [code]: { ...(current[code] ?? {}), [fieldName]: value },
      }));
    },
    [],
  );

  const handleClearFilters = useCallback((code: string) => {
    setCatalogFilterFormByCode((current) => ({ ...current, [code]: {} }));
  }, []);

  const catalogEntries: GeoLayerCatalogEntry[] = useMemo(
    () =>
      (geoLayers ?? []).map((layer) => {
        const active = activeCatalogCodes.includes(layer.code);
        const cached = catalogFeaturesByCode[layer.code];
        const schemaState = catalogSchemaByCode[layer.code];
        const profileState = catalogProfileByCode[layer.code];
        return {
          layer,
          active,
          // Sin color asignado todavía (capa nunca activada): gris neutro, no un color de otra capa.
          color: catalogColorByCode[layer.code] ?? '#94a3b8',
          opacity: catalogOpacityByCode[layer.code] ?? 0.6,
          loading: Boolean(cached?.loading),
          error: cached?.error ?? null,
          truncated: Boolean(cached?.data && cached.totalFeatures > cached.data.features.length),
          schema: schemaState?.fields ?? null,
          schemaLoading: Boolean(schemaState?.loading),
          filterForm: catalogFilterFormByCode[layer.code] ?? {},
          activeFilterCount: (catalogFiltersByCode[layer.code] ?? []).length,
          profile: profileState?.fetched ? profileState.data : null,
          profileLoading: Boolean(profileState?.loading),
        };
      }),
    [
      activeCatalogCodes,
      catalogColorByCode,
      catalogFeaturesByCode,
      catalogFilterFormByCode,
      catalogFiltersByCode,
      catalogOpacityByCode,
      catalogProfileByCode,
      catalogSchemaByCode,
      geoLayers,
    ],
  );

  // P0-9 — toolbar name search filters the rendered catalog only; it never
  // touches activeCatalogCodes, so hiding a row from the list does not
  // deactivate it.
  const filteredCatalogEntries = useMemo(() => {
    const query = catalogSearchQuery.trim().toLowerCase();
    if (!query) {
      return catalogEntries;
    }
    return catalogEntries.filter(
      (entry) =>
        entry.layer.name.toLowerCase().includes(query) ||
        (entry.layer.description ?? '').toLowerCase().includes(query),
    );
  }, [catalogEntries, catalogSearchQuery]);

  const handleRefreshCatalog = useCallback(() => {
    fetchGeoLayers();
  }, [fetchGeoLayers]);

  const handleDeactivateAllLayers = useCallback(() => {
    setActiveCatalogCodes([]);
  }, []);

  const handleZoomToAllActiveLayers = useCallback(() => {
    multiLayerMapRef.current?.zoomToAll();
  }, []);

  // P1-1 — cross-layer territorial search (spec §18).
  const [territorySearchQuery, setTerritorySearchQuery] = useState('');
  const [territorySearchResults, setTerritorySearchResults] = useState<GeoTerritorySearchResult[] | null>(
    null,
  );
  const [territorySearchLoading, setTerritorySearchLoading] = useState(false);
  const [territorySearchError, setTerritorySearchError] = useState<string | null>(null);
  const [pendingSearchSelection, setPendingSearchSelection] = useState<{
    layerCode: string;
    territoryCode: string;
  } | null>(null);

  useEffect(() => {
    const term = territorySearchQuery.trim();
    if (term.length < MIN_TERRITORY_SEARCH_LENGTH) {
      setTerritorySearchResults(null);
      setTerritorySearchError(null);
      setTerritorySearchLoading(false);
      return;
    }

    setTerritorySearchLoading(true);
    const timer = window.setTimeout(() => {
      workspaceApi
        .searchGeoTerritories(term)
        .then((response) => {
          setTerritorySearchResults(response.data.results);
          setTerritorySearchError(null);
          setTerritorySearchLoading(false);
        })
        .catch((reason: Error) => {
          setTerritorySearchError(reason.message);
          setTerritorySearchResults(null);
          setTerritorySearchLoading(false);
        });
    }, TERRITORY_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [territorySearchQuery]);

  const handleSelectSearchResult = useCallback((result: GeoTerritorySearchResult) => {
    setActiveCatalogCodes((current) =>
      current.includes(result.layerCode) ? current : [...current, result.layerCode],
    );
    setCatalogColorByCode((current) => {
      if (current[result.layerCode]) {
        return current;
      }
      const assignedCount = Object.keys(current).length;
      return { ...current, [result.layerCode]: catalogColorPalette[assignedCount % catalogColorPalette.length] };
    });
    setCatalogOpacityByCode((current) =>
      current[result.layerCode] !== undefined ? current : { ...current, [result.layerCode]: 0.6 },
    );
    setPendingSearchSelection({ layerCode: result.layerCode, territoryCode: result.territoryCode });
    setTerritorySearchQuery('');
    setTerritorySearchResults(null);
  }, []);

  useEffect(() => {
    if (!pendingSearchSelection) {
      return;
    }
    const state = catalogFeaturesByCode[pendingSearchSelection.layerCode];
    if (state && !state.loading && state.data) {
      multiLayerMapRef.current?.selectFeature(pendingSearchSelection.layerCode, pendingSearchSelection.territoryCode);
      setPendingSearchSelection(null);
    }
  }, [pendingSearchSelection, catalogFeaturesByCode]);

  // P1-3 — user-added external layers (spec §16). Ephemeral — kept in
  // page state only, not persisted.
  const [externalLayers, setExternalLayers] = useState<ExternalLayerEntry[]>([]);
  const [externalForm, setExternalForm] = useState<ExternalLayerFormState>({
    kind: 'wms',
    name: '',
    url: '',
    wmsLayerName: '',
  });
  const [externalFormError, setExternalFormError] = useState<string | null>(null);

  const handleAddExternalLayer = useCallback(() => {
    const name = externalForm.name.trim();
    const url = externalForm.url.trim();
    if (!name) {
      setExternalFormError('Ingresa un nombre para identificar la capa.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setExternalFormError('La URL debe comenzar con http:// o https://.');
      return;
    }
    if (externalForm.kind === 'wms' && !externalForm.wmsLayerName.trim()) {
      setExternalFormError('Ingresa el nombre de la capa WMS (p. ej. "workspace:capa").');
      return;
    }

    setExternalFormError(null);
    const id = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setExternalLayers((current) => [
      ...current,
      {
        id,
        kind: externalForm.kind,
        name,
        url,
        wmsLayerName: externalForm.wmsLayerName.trim(),
        opacity: 0.7,
        visible: true,
        loading: externalForm.kind === 'geojson',
        error: null,
        featureCollection: null,
      },
    ]);
    setExternalForm({ kind: externalForm.kind, name: '', url: '', wmsLayerName: '' });
  }, [externalForm]);

  const handleRemoveExternalLayer = useCallback((id: string) => {
    setExternalLayers((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const handleToggleExternalLayerVisible = useCallback((id: string) => {
    setExternalLayers((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, visible: !entry.visible } : entry)),
    );
  }, []);

  const handleExternalLayerOpacityChange = useCallback((id: string, opacity: number) => {
    setExternalLayers((current) => current.map((entry) => (entry.id === id ? { ...entry, opacity } : entry)));
  }, []);

  useEffect(() => {
    const pending = externalLayers.filter((entry) => entry.kind === 'geojson' && entry.loading);
    pending.forEach((entry) => {
      fetch(entry.url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`La solicitud falló con código ${response.status}.`);
          }
          return response.json();
        })
        .then((payload) => {
          const collection = normalizeExternalGeoJson(payload);
          if (!collection) {
            throw new Error('La URL no devolvió un GeoJSON válido (se esperaba un Feature o FeatureCollection).');
          }
          const truncated = collection.features.length > MAX_EXTERNAL_GEOJSON_FEATURES;
          setExternalLayers((current) =>
            current.map((item) =>
              item.id === entry.id
                ? {
                    ...item,
                    loading: false,
                    error: truncated
                      ? `Se muestran los primeros ${MAX_EXTERNAL_GEOJSON_FEATURES.toLocaleString('es-CR')} elementos de ${collection.features.length.toLocaleString('es-CR')}.`
                      : null,
                    featureCollection: {
                      type: 'FeatureCollection',
                      features: collection.features.slice(0, MAX_EXTERNAL_GEOJSON_FEATURES),
                    },
                  }
                : item,
            ),
          );
        })
        .catch((reason: Error) => {
          setExternalLayers((current) =>
            current.map((item) =>
              item.id === entry.id ? { ...item, loading: false, error: reason.message, featureCollection: null } : item,
            ),
          );
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalLayers]);

  const externalGeoJsonMapEntries: MultiLayerMapEntry[] = useMemo(
    () =>
      externalLayers
        .filter((entry) => entry.kind === 'geojson' && entry.visible && entry.featureCollection)
        .map((entry) => ({
          code: `external:${entry.id}`,
          name: entry.name,
          color: EXTERNAL_LAYER_COLOR,
          opacity: entry.opacity,
          featureCollection: entry.featureCollection,
        })),
    [externalLayers],
  );

  const externalWmsMapEntries: MultiLayerMapWmsEntry[] = useMemo(
    () =>
      externalLayers
        .filter((entry) => entry.kind === 'wms' && entry.visible)
        .map((entry) => ({ id: entry.id, url: entry.url, wmsLayerName: entry.wmsLayerName, opacity: entry.opacity })),
    [externalLayers],
  );

  const multiLayerMapEntries: MultiLayerMapEntry[] = useMemo(
    () =>
      activeCatalogCodes
        .map((code) => {
          const layer = geoLayers?.find((item) => item.code === code);
          const cached = catalogFeaturesByCode[code];
          if (!layer) {
            return null;
          }
          return {
            code,
            name: layer.name,
            color: catalogColorByCode[code] ?? catalogColorPalette[0],
            opacity: catalogOpacityByCode[code] ?? 0.6,
            featureCollection: cached?.data ?? null,
          };
        })
        .filter((entry): entry is MultiLayerMapEntry => entry !== null)
        .concat(externalGeoJsonMapEntries),
    [
      activeCatalogCodes,
      catalogColorByCode,
      catalogFeaturesByCode,
      catalogOpacityByCode,
      externalGeoJsonMapEntries,
      geoLayers,
    ],
  );

  // P1-4 — saved views (spec §19): persist which layers were active, with
  // what color/opacity/filters, and restore that later. Backend-persisted,
  // owned by the signed-in user.
  // Filters are captured and stored, but restoring a view does not yet
  // reconstruct the filter *form* state (form state's shape depends on
  // field type; converting wire-format filters back into it is real work
  // deferred, not silently dropped — see docs/geo/MAPA_SIGI_DIAGNOSTICO.md
  // §9.14) — loading a view restores layers/color/opacity only.
  const [savedViews, setSavedViews] = useState<GeoSavedView[] | null>(null);
  const [savedViewsLoading, setSavedViewsLoading] = useState(true);
  const [savedViewsError, setSavedViewsError] = useState<string | null>(null);
  const [saveViewName, setSaveViewName] = useState('');
  const [saveViewSaving, setSaveViewSaving] = useState(false);
  const [saveViewError, setSaveViewError] = useState<string | null>(null);

  const fetchSavedViews = useCallback(() => {
    setSavedViewsLoading(true);
    workspaceApi
      .getGeoSavedViews()
      .then((response) => {
        setSavedViews(response.data.views);
        setSavedViewsError(null);
        setSavedViewsLoading(false);
      })
      .catch((reason: Error) => {
        setSavedViewsError(reason.message);
        setSavedViewsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (canReadGeoBi) {
      fetchSavedViews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReadGeoBi]);

  const handleSaveCurrentView = useCallback(() => {
    const name = saveViewName.trim();
    if (!name) {
      setSaveViewError('Ingresa un nombre para la vista.');
      return;
    }
    if (activeCatalogCodes.length === 0) {
      setSaveViewError('Activa al menos una capa antes de guardar la vista.');
      return;
    }

    setSaveViewSaving(true);
    setSaveViewError(null);
    workspaceApi
      .createGeoSavedView({
        name,
        viewState: {
          activeLayers: activeCatalogCodes.map((code) => ({
            code,
            color: catalogColorByCode[code] ?? catalogColorPalette[0],
            opacity: catalogOpacityByCode[code] ?? 0.6,
            filters: catalogFiltersByCode[code] ?? [],
          })),
        },
      })
      .then((response) => {
        setSavedViews((current) => [response.data.view, ...(current ?? [])]);
        setSaveViewName('');
        setSaveViewSaving(false);
      })
      .catch((reason: Error) => {
        setSaveViewError(reason.message);
        setSaveViewSaving(false);
      });
  }, [activeCatalogCodes, catalogColorByCode, catalogFiltersByCode, catalogOpacityByCode, saveViewName]);

  const handleLoadSavedView = useCallback((view: GeoSavedView) => {
    const codes = view.viewState.activeLayers.map((entry) => entry.code);
    setActiveCatalogCodes(codes);
    setCatalogColorByCode((current) => {
      const next = { ...current };
      view.viewState.activeLayers.forEach((entry) => {
        next[entry.code] = entry.color;
      });
      return next;
    });
    setCatalogOpacityByCode((current) => {
      const next = { ...current };
      view.viewState.activeLayers.forEach((entry) => {
        next[entry.code] = entry.opacity;
      });
      return next;
    });
  }, []);

  const handleDeleteSavedView = useCallback((id: string) => {
    workspaceApi
      .deleteGeoSavedView(id)
      .then(() => {
        setSavedViews((current) => (current ?? []).filter((view) => view.id !== id));
      })
      .catch((reason: Error) => {
        setSavedViewsError(reason.message);
      });
  }, []);

  const handleGeoFeatureClick = useCallback(
    (event: { layerCode: string; feature: GeoFeature }) => setSelectedGeoFeature(event),
    [],
  );
  const handleCloseGeoFeaturePanel = useCallback(() => setSelectedGeoFeature(null), []);

  // P1-6 — proximity search (spec §10).
  // Reuses handleSelectSearchResult from P1-1 for result selection.
  const [nearbyLayerCode, setNearbyLayerCode] = useState<string | null>(null);
  const [nearbyRadiusMeters, setNearbyRadiusMeters] = useState(1000);
  const [nearbyState, setNearbyState] = useState<{
    loading: boolean;
    error: string | null;
    results: GeoNearbyTerritoryResult[] | null;
  }>({ loading: false, error: null, results: null });

  useEffect(() => {
    setNearbyLayerCode(selectedGeoFeature?.layerCode ?? null);
    setNearbyRadiusMeters(1000);
    setNearbyState({ loading: false, error: null, results: null });
  }, [selectedGeoFeature]);

  const handleSearchNearby = useCallback(() => {
    if (!selectedGeoFeature || !nearbyLayerCode) {
      return;
    }
    setNearbyState({ loading: true, error: null, results: null });
    workspaceApi
      .findNearbyTerritories(nearbyLayerCode, selectedGeoFeature.feature.geometry, nearbyRadiusMeters)
      .then((response) => setNearbyState({ loading: false, error: null, results: response.data.results }))
      .catch((reason: Error) => setNearbyState({ loading: false, error: reason.message, results: null }));
  }, [selectedGeoFeature, nearbyLayerCode, nearbyRadiusMeters]);

  const handleViewProject = useCallback(
    (projectId: string) => navigate(`/projects/${encodeURIComponent(projectId)}`),
    [navigate],
  );
  const handleViewProjectIndicators = useCallback(
    (projectId: string) => navigate(`/projects/${encodeURIComponent(projectId)}/indicators`),
    [navigate],
  );
  const handleViewProjectDocuments = useCallback(
    (projectId: string) => navigate(`/projects/${encodeURIComponent(projectId)}/documents`),
    [navigate],
  );

  useEffect(() => {
    if (!requestedProjectId || !canReadProjects) {
      setProjectContext(null);
      setProjectContextError(false);
      return;
    }
    let cancelled = false;
    setProjectContextError(false);
    workspaceApi.getProjectDetail(requestedProjectId, globalViewScope)
      .then((response) => {
        if (!cancelled) setProjectContext(response.data);
      })
      .catch(() => {
        if (!cancelled) {
          setProjectContext(null);
          setProjectContextError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canReadProjects, globalViewScope, requestedProjectId]);

  useEffect(() => {
    if (selectedGeoFeature && !activeCatalogCodes.includes(selectedGeoFeature.layerCode)) {
      setSelectedGeoFeature(null);
    }
  }, [activeCatalogCodes, selectedGeoFeature]);

  useEffect(() => {
    const code = selectedGeoFeature?.layerCode;
    if (!code || layerMetadataByCode[code]) {
      return;
    }
    setLayerMetadataByCode((current) => ({ ...current, [code]: { loading: true, error: null, data: null } }));
    workspaceApi
      .getGeoLayerMetadata(code)
      .then((response) => {
        setLayerMetadataByCode((current) => ({
          ...current,
          [code]: { loading: false, error: null, data: response.data.metadata },
        }));
      })
      .catch((reason: Error) => {
        setLayerMetadataByCode((current) => ({
          ...current,
          [code]: { loading: false, error: reason.message, data: null },
        }));
      });
  }, [layerMetadataByCode, selectedGeoFeature]);

  const selectedGeoFeatureLayer = useMemo(
    () =>
      selectedGeoFeature ? geoLayers?.find((layer) => layer.code === selectedGeoFeature.layerCode) ?? null : null,
    [geoLayers, selectedGeoFeature],
  );
  const selectedGeoFeatureMetadataState = selectedGeoFeature
    ? layerMetadataByCode[selectedGeoFeature.layerCode]
    : undefined;
  const selectedGeoFeatureInstitutionName = useMemo(() => {
    const institutionId = selectedGeoFeatureMetadataState?.data?.institutionId;
    if (!institutionId || !geoInstitutions) {
      return null;
    }
    return geoInstitutions.find((institution) => institution.id === institutionId)?.name ?? null;
  }, [geoInstitutions, selectedGeoFeatureMetadataState]);

  const handleShowTable = useCallback((code: string) => {
    setTableLayerCode((current) => (current === code ? null : code));
    setTablePage(1);
    setTableSort(null);
    setTableOrder('asc');
  }, []);
  const handleCloseTable = useCallback(() => setTableLayerCode(null), []);
  const handleTablePageChange = useCallback((page: number) => setTablePage(page), []);
  const handleTableSortChange = useCallback(
    (field: string) => {
      if (tableSort === field) {
        setTableOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      } else {
        setTableSort(field);
        setTableOrder('asc');
      }
      setTablePage(1);
    },
    [tableSort],
  );
  const handleTableRowSelect = useCallback(
    (feature: GeoFeature) => {
      if (!tableLayerCode) {
        return;
      }
      const code = typeof feature.properties.code === 'string' ? feature.properties.code : String(feature.id ?? '');
      multiLayerMapRef.current?.selectFeature(tableLayerCode, code);
    },
    [tableLayerCode],
  );

  useEffect(() => {
    if (tableLayerCode && !activeCatalogCodes.includes(tableLayerCode)) {
      setTableLayerCode(null);
    }
  }, [activeCatalogCodes, tableLayerCode]);

  // P0-8 — export the table's current filtered/sorted result set (spec
  // §17).
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'geojson'>('csv');
  const [exportState, setExportState] = useState<{ exporting: boolean; error: string | null; notice: string | null }>(
    { exporting: false, error: null, notice: null },
  );

  useEffect(() => {
    setExportState({ exporting: false, error: null, notice: null });
  }, [tableLayerCode]);

  const tableFilters = tableLayerCode ? debouncedCatalogFiltersByCode[tableLayerCode] : undefined;
  const tableFiltersSignature = JSON.stringify(tableFilters ?? []);

  const handleExport = useCallback(async () => {
    if (!tableLayerCode) {
      return;
    }
    setExportState({ exporting: true, error: null, notice: null });
    try {
      const result = await workspaceApi.exportGeoLayerFeatures(tableLayerCode, {
        format: exportFormat,
        filters: tableFilters,
        sort: tableSort ?? undefined,
        order: tableOrder,
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportState({
        exporting: false,
        error: null,
        notice: result.truncated
          ? `La exportación se limitó a ${result.exportedCount.toLocaleString('es-CR')} de ${result.totalFeatures.toLocaleString('es-CR')} registros. Aplica filtros adicionales para exportar el resto.`
          : null,
      });
    } catch (reason) {
      setExportState({
        exporting: false,
        error: reason instanceof Error ? reason.message : String(reason),
        notice: null,
      });
    }
  }, [tableLayerCode, exportFormat, tableFilters, tableSort, tableOrder]);

  useEffect(() => {
    setTablePage(1);
  }, [tableLayerCode, tableFiltersSignature]);

  useEffect(() => {
    if (!tableLayerCode) {
      return;
    }
    let cancelled = false;
    setTableData((current) => ({ ...current, loading: true, error: null }));

    workspaceApi
      .getGeoLayerFeatures(tableLayerCode, {
        page: tablePage,
        pageSize: TABLE_PAGE_SIZE,
        filters: tableFilters,
        sort: tableSort ?? undefined,
        order: tableOrder,
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setTableData({
          loading: false,
          error: null,
          features: response.data.featureCollection.features,
          totalFeatures: response.data.totalFeatures,
        });
      })
      .catch((reason: Error) => {
        if (cancelled) {
          return;
        }
        setTableData({ loading: false, error: reason.message, features: [], totalFeatures: 0 });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableLayerCode, tablePage, tableSort, tableOrder, tableFiltersSignature]);

  const tableLayer = useMemo(
    () => (tableLayerCode ? geoLayers?.find((layer) => layer.code === tableLayerCode) ?? null : null),
    [geoLayers, tableLayerCode],
  );
  const tableSchemaState = tableLayerCode ? catalogSchemaByCode[tableLayerCode] : undefined;
  const tableSelectedFeatureCode =
    selectedGeoFeature && selectedGeoFeature.layerCode === tableLayerCode
      ? typeof selectedGeoFeature.feature.properties.code === 'string'
        ? selectedGeoFeature.feature.properties.code
        : String(selectedGeoFeature.feature.id ?? '')
      : null;

  // P1-5 — distribution chart (spec §12).
  const [chartField, setChartField] = useState<string | null>(null);
  const [chartState, setChartState] = useState<{
    loading: boolean;
    error: string | null;
    data: GeoLayerFieldStats | null;
  }>({ loading: false, error: null, data: null });

  useEffect(() => {
    setChartField(null);
    setChartState({ loading: false, error: null, data: null });
  }, [tableLayerCode]);

  useEffect(() => {
    if (!tableLayerCode || !chartField) {
      return;
    }
    let cancelled = false;
    setChartState((current) => ({ ...current, loading: true, error: null }));

    workspaceApi
      .getGeoLayerStats(tableLayerCode, chartField, tableFilters)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setChartState({ loading: false, error: null, data: response.data.stats });
      })
      .catch((reason: Error) => {
        if (cancelled) {
          return;
        }
        setChartState({ loading: false, error: reason.message, data: null });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableLayerCode, chartField, tableFiltersSignature]);
  // ---- end P0-4/P0-5/P0-6/P0-7 catalog state ----

  async function loadModuleSnapshot() {
    if (!canReadGeoBi) {
      setModule(null);
      setSources([]);
      return;
    }
    const [moduleResponse, sourcesResponse, geoServerResponse] = await Promise.all([
      workspaceApi.getGeoBiModule(),
      canReadSources
        ? workspaceApi.getSources(globalViewScope)
        : Promise.resolve({ data: { sources: [] as DataSource[] } }),
      workspaceApi.getGeoServerCapabilities().catch((reason: Error) => {
        setGeoServerError(reason.message);
        return null;
      }),
    ]);
    const nextModule = moduleResponse.data.module;
    const nextSources = sourcesResponse.data.sources;
    setModule(nextModule);
    setSources(nextSources);
    if (geoServerResponse?.data) {
      setGeoServerSnapshot(geoServerResponse.data);
      setGeoServerError(null);
    }
    setSelectedLayerCode((current) => current || pickPreferredLayerCode(nextModule.layers));
    setSelectedCustomBaseLayerCode((current) => {
      if (current) {
        return current;
      }
      const firstCustomLayer = nextModule.layers.find(
        (layer) =>
          layer.code !== 'territories' &&
          layer.code !== 'dnea_activity_points' &&
          layer.featureCount > 0,
      );
      return firstCustomLayer?.code ?? 'project_polygons';
    });
    setGeoExcelSourceId((current) => {
      if (current) {
        return current;
      }
      const firstExcelSource = nextSources.find((item) => item.sourceType === 'excel');
      return firstExcelSource?.id ?? nextSources[0]?.id ?? '';
    });
  }

  useEffect(() => {
    if (canReadSources) {
      workspaceApi
        .getSources(globalViewScope)
        .then((response) => {
          setSources(response.data.sources);
        })
        .catch(() => {
          setSources([]);
        });
    } else {
      setSources([]);
    }

    loadModuleSnapshot()
      .catch((reason: Error) => setError(reason.message));
  }, [canReadGeoBi, canReadSources, globalViewScope]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedLayerCode) {
      return () => {
        cancelled = true;
      };
    }

    if (selectedLayerCode !== 'territories' && selectedLevel !== 'all') {
      setSelectedLevel('all');
      return () => {
        cancelled = true;
      };
    }

    const effectiveLayerCode =
      selectedLayerCode === 'territories' && selectedLevel === 'custom'
        ? selectedCustomBaseLayerCode
        : selectedLayerCode;
    const level =
      selectedLayerCode === 'territories' &&
      selectedLevel !== 'all' &&
      selectedLevel !== 'custom'
        ? selectedLevel
        : undefined;

    workspaceApi
      .getTerritoryFeatures(level, effectiveLayerCode)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const nextCollection = extractFeatureCollection(response);
        setFeatureCollection(nextCollection);
        setSelectedFeatureCode(null);
        setMapError(null);
      })
      .catch((reason: Error) => {
        if (cancelled) {
          return;
        }
        setFeatureCollection(null);
        setSelectedFeatureCode(null);
        setMapError(reason.message);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomBaseLayerCode, selectedLayerCode, selectedLevel]);

  const isDneaLayerActive = selectedLayerCode === 'dnea_activity_points';
  const isKoboGuatemalaWorkshopActive = selectedLayerCode === KOBO_GUATEMALA_WORKSHOP_LAYER_CODE;
  const dneaFilterOptions = useMemo(() => {
    const features = featureCollection?.features ?? [];
    const entries = dneaFilterDefinitions.map((definition) => {
      const values = Array.from(
        new Set(
          features
            .map((feature: any) => feature?.properties?.[definition.key])
            .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0),
        ),
      ) as string[];
      values.sort((left, right) => left.localeCompare(right, 'es-CR'));
      return [definition.key, values] as const;
    });
    return Object.fromEntries(entries) as Record<string, string[]>;
  }, [featureCollection]);

  const filteredFeatureCollection = useMemo(() => {
    if (!featureCollection) {
      return null;
    }

    const nextFeatures = featureCollection.features.filter((feature: any) =>
      dneaFilterDefinitions.every((definition) => {
        const selectedValue = dneaFilters[definition.key];
        if (!isDneaLayerActive || !selectedValue) {
          return true;
        }
        return String(feature?.properties?.[definition.key] ?? '') === selectedValue;
      }),
    );

    if (!isDneaLayerActive || !dneaColorBy) {
      return {
        ...featureCollection,
        features: nextFeatures,
      };
    }

    const uniqueValues = Array.from(
      new Set(
        nextFeatures
          .map((feature: any) => String(feature?.properties?.[dneaColorBy] ?? '').trim())
          .filter((value: string) => value.length > 0),
      ),
    ) as string[];
    uniqueValues.sort((left, right) => left.localeCompare(right, 'es-CR'));
    const activePalette = dneaColorPalettes[dneaPaletteKey] ?? dneaColorPalettes.institucional;
    const colorMap = new Map(
      uniqueValues.map((value, index) => [value, activePalette[index % activePalette.length]]),
    );

    return {
      ...featureCollection,
      features: nextFeatures.map((feature: any) => {
        const colorKey = String(feature?.properties?.[dneaColorBy] ?? '').trim();
        return {
          ...feature,
          properties: {
            ...feature.properties,
            __fillColor: colorMap.get(colorKey) ?? '#6883a0',
          },
        };
      }),
    };
  }, [dneaColorBy, dneaFilters, dneaPaletteKey, featureCollection, isDneaLayerActive]);

  const dneaLegendItems = useMemo(() => {
    if (!isDneaLayerActive || !filteredFeatureCollection || !dneaColorBy) {
      return [];
    }
    const seen = new Map<string, string>();
    filteredFeatureCollection.features.forEach((feature: any) => {
      const label = String(feature?.properties?.[dneaColorBy] ?? '').trim();
      const color = String(feature?.properties?.__fillColor ?? '').trim();
      if (label && color && !seen.has(label)) {
        seen.set(label, color);
      }
    });
    return Array.from(seen.entries())
      .slice(0, 8)
      .map(([label, color]) => ({ label, color }));
  }, [dneaColorBy, filteredFeatureCollection, isDneaLayerActive]);

  const dneaStats = useMemo(() => {
    if (!isDneaLayerActive || !filteredFeatureCollection) {
      return null;
    }

    const features = filteredFeatureCollection.features;
    const areas = features.map((feature: any) => Number(feature?.properties?.areaHa ?? 0) || 0);
    const totalArea = areas.reduce((sum: number, value: number) => sum + value, 0);
    const uniqueActivities = new Set(
      features
        .map((feature: any) => String(feature?.properties?.activity ?? '').trim())
        .filter((value: string) => value.length > 0),
    );
    const uniqueAgencies = new Set(
      features
        .map((feature: any) => String(feature?.properties?.agency ?? '').trim())
        .filter((value: string) => value.length > 0),
    );
    const uniqueDistricts = new Set(
      features
        .map((feature: any) => String(feature?.properties?.district ?? '').trim())
        .filter((value: string) => value.length > 0),
    );
    const primaryCount = features.filter(
      (feature: any) => String(feature?.properties?.isPrimary ?? '').trim().toLowerCase() === 'sí',
    ).length;

    const topBy = (key: string) => {
      const counts = new Map<string, number>();
      features.forEach((feature: any) => {
        const value = String(feature?.properties?.[key] ?? '').trim();
        if (!value) {
          return;
        }
        counts.set(value, (counts.get(value) ?? 0) + 1);
      });
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
    };

    const breakdownBy = (key: string) => {
      const counts = new Map<string, number>();
      features.forEach((feature: any) => {
        const value = String(feature?.properties?.[key] ?? '').trim();
        if (!value) {
          return;
        }
        counts.set(value, (counts.get(value) ?? 0) + 1);
      });
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    };

    return {
      totalFeatures: features.length,
      totalArea,
      uniqueActivities: uniqueActivities.size,
      uniqueAgencies: uniqueAgencies.size,
      uniqueDistricts: uniqueDistricts.size,
      primaryCount,
      topActivity: topBy('activity'),
      topAgency: topBy('agency'),
      topProvince: topBy('province'),
      activityBreakdown: breakdownBy('activity'),
      provinceBreakdown: breakdownBy('province'),
    };
  }, [filteredFeatureCollection, isDneaLayerActive]);

  const koboGuatemalaWorkshopStats = useMemo(() => {
    if (!isKoboGuatemalaWorkshopActive || !filteredFeatureCollection) {
      return null;
    }

    const features = [...filteredFeatureCollection.features]
      .sort((left: any, right: any) =>
        String(left?.properties?.submissionTime ?? '').localeCompare(
          String(right?.properties?.submissionTime ?? ''),
        ),
      )
      .slice(0, KOBO_GUATEMALA_WORKSHOP_DEMO_CUTOFF);

    const rawSubmission = (feature: any): Record<string, unknown> => {
      const value = feature?.properties?.rawSubmission;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    };
    const normalizeInstitution = (value: unknown) => {
      const institution = String(value ?? '').trim();
      const normalized = institution
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      if (normalized.includes('INSTITUTO NACIONAL DE BOSQUES') || normalized === 'INAB') {
        return 'INAB';
      }
      if (normalized === 'FAO' || normalized === 'FAOGT' || normalized === 'FAO-GT') {
        return 'FAO';
      }
      if (normalized.includes('CONAP')) {
        return 'CONAP';
      }
      if (normalized.includes('MARN')) {
        return 'MARN';
      }
      return institution || 'Sin especificar';
    };
    const institutionCounts = new Map<string, number>();
    let withPhoto = 0;
    let withGps = 0;
    let consistentDates = 0;
    const accuracies: number[] = [];

    features.forEach((feature: any) => {
      const submission = rawSubmission(feature);
      const institution = normalizeInstitution(submission.Institucion);
      institutionCounts.set(institution, (institutionCounts.get(institution) ?? 0) + 1);

      if (String(submission.Imagen ?? '').trim().length > 0) {
        withPhoto += 1;
      }

      const locationParts = String(submission.Ubicacion ?? '')
        .trim()
        .split(/\s+/)
        .map(Number);
      if (locationParts.length >= 2 && Number.isFinite(locationParts[0]) && Number.isFinite(locationParts[1])) {
        withGps += 1;
      }
      if (locationParts.length >= 4 && Number.isFinite(locationParts[3])) {
        accuracies.push(locationParts[3]);
      }

      const enteredDate = String(submission.Enter_a_date ?? '').trim();
      const submissionDate = String(
        submission._submission_time ?? feature?.properties?.submissionTime ?? '',
      ).slice(0, 10);
      if (enteredDate && enteredDate === submissionDate) {
        consistentDates += 1;
      }
    });

    const institutionBreakdown = Array.from(institutionCounts.entries()).sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'es-GT'),
    );
    const totalFeatures = features.length;

    return {
      totalFeatures,
      availableFeatures: filteredFeatureCollection.features.length,
      institutionCount: institutionCounts.size,
      institutionBreakdown,
      withPhoto,
      withoutPhoto: totalFeatures - withPhoto,
      withGps,
      consistentDates,
      anomalousDates: totalFeatures - consistentDates,
      averageAccuracy:
        accuracies.length > 0
          ? accuracies.reduce((sum, accuracy) => sum + accuracy, 0) / accuracies.length
          : null,
    };
  }, [filteredFeatureCollection, isKoboGuatemalaWorkshopActive]);

  useEffect(() => {
    if (!filteredFeatureCollection) {
      setSelectedFeatureCode(null);
      return;
    }
    if (!selectedFeatureCode || selectedFeatureCode.trim().length === 0) {
      return;
    }
    const currentExists = filteredFeatureCollection.features.some(
      (feature: any) =>
        String(feature?.properties?.code ?? '').trim().toLowerCase() ===
        String(selectedFeatureCode ?? '').trim().toLowerCase(),
    );
    if (!currentExists) {
      setSelectedFeatureCode(null);
    }
  }, [filteredFeatureCollection, selectedFeatureCode]);

  const selectedLayer = useMemo(
    () =>
      module?.layers.find(
        (layer) =>
          layer.code ===
          (selectedLayerCode === 'territories' && selectedLevel === 'custom'
            ? selectedCustomBaseLayerCode
            : selectedLayerCode),
      ) ?? null,
    [module, selectedCustomBaseLayerCode, selectedLayerCode, selectedLevel],
  );
  const effectiveLayerCode = useMemo(
    () =>
      selectedLayerCode === 'territories' && selectedLevel === 'custom'
        ? selectedCustomBaseLayerCode
        : selectedLayerCode,
    [selectedCustomBaseLayerCode, selectedLayerCode, selectedLevel],
  );
  const customBaseLayers = useMemo(
    () =>
      (module?.layers ?? []).filter(
        (layer) =>
          layer.code !== 'territories' &&
          layer.code !== 'dnea_activity_points' &&
          layer.featureCount > 0,
      ),
    [module],
  );
  const defaultGeoServerLayerNames = useMemo(() => {
    if (!adminGeoServerConfig) {
      return [];
    }

    const defaults: string[] = [];

    if (selectedLayerCode === 'territories' && selectedLevel !== 'custom') {
      defaults.push(adminGeoServerConfig.territoriesLayerName);
    }

    if (effectiveLayerCode === 'project_polygons') {
      defaults.push(adminGeoServerConfig.projectLayerName);
    }

    return deduplicateStrings(defaults);
  }, [effectiveLayerCode, selectedLayerCode, selectedLevel]);
  const geoServerPublishedLayerGroups = useMemo(() => {
    if (!geoServerSnapshot?.publishedLayers?.length) {
      return [];
    }

    const order = ['Publicas', 'Analiticas', 'Seguras'];
    const grouped = geoServerSnapshot.publishedLayers.reduce<Record<string, GeoServerPublishedLayer[]>>(
      (accumulator, layer) => {
        const group = geoserverLayerGroupLabel(layer);
        if (!accumulator[group]) {
          accumulator[group] = [];
        }
        accumulator[group].push(layer);
        return accumulator;
      },
      {},
    );

    return order
      .filter((group) => Array.isArray(grouped[group]) && grouped[group].length > 0)
      .map((group) => ({
        group,
        layers: grouped[group].sort((left, right) => left.title.localeCompare(right.title, 'es')),
      }));
  }, [geoServerSnapshot]);
  useEffect(() => {
    setSelectedGeoServerLayerNames(defaultGeoServerLayerNames);
  }, [defaultGeoServerLayerNames]);
  useEffect(() => {
    if (!geoServerSnapshot?.publishedLayers?.length) {
      return;
    }

    setGeoServerLayerOpacities((current) => {
      const next = { ...current };
      for (const layer of geoServerSnapshot.publishedLayers) {
        if (typeof next[layer.name] !== 'number') {
          next[layer.name] = defaultGeoServerLayerNames.includes(layer.name) ? 0.72 : 0.68;
        }
      }
      return next;
    });
  }, [defaultGeoServerLayerNames, geoServerSnapshot]);
  const primaryGeoServerLayer = useMemo(() => {
    if (!adminGeoServerConfig || !geoServerSnapshot?.publishedLayers?.length) {
      return null;
    }

    // DNEA debe renderizarse desde SIGI para respetar la normalización lat/lon -> Point
    // y mantener la simbología analítica del visor.
    if (selectedLayerCode === 'dnea_activity_points') {
      return null;
    }

    const publishedLayerMap = new Map(
      geoServerSnapshot.publishedLayers.map((layer) => [layer.name, layer] as const),
    );
    const candidates = [
      ...defaultGeoServerLayerNames,
      ...buildGeoServerLayerCandidates(effectiveLayerCode, selectedLayerCode, selectedLevel),
    ];
    const publishedLayerName = candidates.find((candidate) => publishedLayerMap.has(candidate)) ?? null;
    if (!publishedLayerName) {
      return null;
    }
    const layer = publishedLayerMap.get(publishedLayerName);
    return {
      label: layer?.title ?? selectedLayer?.name ?? publishedLayerName,
      wmsUrl: toPublicGeoServerUrl(adminGeoServerConfig.wmsUrl),
      wfsUrl: toPublicGeoServerUrl(geoServerSnapshot.wfsServiceUrl),
      layerName: publishedLayerName,
      enabled: true,
      opacity: 0.72,
    };
  }, [
    defaultGeoServerLayerNames,
    effectiveLayerCode,
    geoServerSnapshot,
    selectedLayer,
    selectedLayerCode,
    selectedLevel,
  ]);
  const geoserverOverlays = useMemo(() => {
    if (!adminGeoServerConfig || !geoServerSnapshot) {
      return null;
    }
    const geoserverConfig = adminGeoServerConfig;

    const publishedLayerMap = new Map(
      geoServerSnapshot.publishedLayers.map((layer) => [layer.name, layer] as const),
    );
    const overlays = deduplicateStrings(selectedGeoServerLayerNames)
      .filter((layerName) => layerName !== primaryGeoServerLayer?.layerName)
      .map((layerName) => {
        const layer = publishedLayerMap.get(layerName);
        return {
          label: layer?.title ?? layerName,
          wmsUrl: toPublicGeoServerUrl(geoserverConfig.wmsUrl),
          wfsUrl: toPublicGeoServerUrl(geoServerSnapshot.wfsServiceUrl),
          layerName,
          enabled: true,
          opacity: clampOpacity(geoServerLayerOpacities[layerName] ?? 0.72),
        };
      })
      .filter((overlay) => overlay.layerName.trim().length > 0);

    return overlays.length > 0 ? overlays : null;
  }, [geoServerLayerOpacities, geoServerSnapshot, primaryGeoServerLayer?.layerName, selectedGeoServerLayerNames]);
  const availableLevelOptions = useMemo(
    () =>
      levelOptions.filter(
        (option) => option.value !== 'custom' || customBaseLayers.length > 0,
      ),
    [customBaseLayers],
  );
  const excelSources = sources.filter((source) => source.sourceType === 'excel');
  const activeRolePreset = roleDashboardPresets[roleDashboardKey];
  const activeGuidedJourney = roleGuidedJourneys[roleDashboardKey];
  const isDecisionView = roleDashboardKey === 'decision_maker';
  const isSigView = roleDashboardKey === 'sig_technician';
  const isItView = roleDashboardKey === 'it_ops';
  const activePointCount = koboGuatemalaWorkshopStats?.totalFeatures ?? dneaStats?.totalFeatures;
  const activeRoleDashboardCards = useMemo(() => {
    if (!module) {
      return [];
    }

    if (isDecisionView) {
      return [
        {
          label: 'Registros visibles',
          value: String(activePointCount ?? module.summary.datasets),
          hint: 'Volumen visible para lectura ejecutiva.',
        },
        {
          label: 'Cobertura total',
          value: `${module.summary.totalAreaHa.toLocaleString('es-CR')} ha`,
          hint: 'Superficie integrada en el módulo.',
        },
        {
          label: 'Calidad',
          value: `${module.summary.qualityScore}%`,
          hint: 'Señal rápida de confianza del dato.',
        },
        {
          label: 'Alertas',
          value: String(module.summary.alerts),
          hint: 'Incidencias activas que requieren seguimiento.',
        },
      ];
    }

    if (isSigView) {
      return [
        {
          label: 'Capas GeoServer',
          value: String(geoServerSnapshot?.publishedLayers.length ?? 0),
          hint: 'Capas OGC listas para superposición.',
        },
        {
          label: 'Overlays activos',
          value: String(selectedGeoServerLayerNames.length),
          hint: 'Capas simultáneas visibles en el visor.',
        },
        {
          label: 'Puntos analíticos',
          value: String(activePointCount ?? 0),
          hint: 'Registros filtrados con lectura SIG.',
        },
        {
          label: 'Territorios',
          value: String(module.coverage.coveredTerritories),
          hint: 'Unidades territoriales enlazadas.',
        },
      ];
    }

    return [
      {
        label: 'Fuentes enlazadas',
        value: String(module.linkedData.sources),
        hint: 'Orígenes que alimentan Geo/BI.',
      },
      {
        label: 'Datasets',
        value: String(module.linkedData.datasets),
        hint: 'Conjuntos trazables en el almacén.',
      },
      {
        label: 'Publicaciones',
        value: String(module.publications.published),
        hint: 'Salidas visibles hacia consumidores externos.',
      },
      {
        label: 'Eventos de auditoría',
        value: String(module.audit.events),
        hint: 'Rastro técnico reciente del módulo.',
      },
    ];
  }, [
    activePointCount,
    dneaStats,
    geoServerSnapshot,
    isDecisionView,
    isItView,
    isSigView,
    module,
    selectedGeoServerLayerNames.length,
  ]);

  async function handleGeoExcelImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeoExcelError(null);
    setGeoExcelInfo(null);
    setGeoExcelResult(null);

    if (!geoExcelFile) {
      setGeoExcelError('Selecciona un archivo Excel para continuar.');
      return;
    }
    if (!geoExcelSourceId) {
      setGeoExcelError('Selecciona una fuente Excel para asociar la carga.');
      return;
    }

    setIsImportingGeoExcel(true);
    try {
      const projectUpload = await workspaceApi.uploadImportBatch({
        file: geoExcelFile,
        entityType: 'projects',
        sourceId: geoExcelSourceId,
        sheetName: projectSheetName.trim() || undefined,
      });

      const territoryUpload = await workspaceApi.uploadImportBatch({
        file: geoExcelFile,
        entityType: 'project_territories',
        sourceId: geoExcelSourceId,
        sheetName: territorySheetName.trim() || undefined,
      });

      await loadModuleSnapshot();

      setGeoExcelResult({
        projectBatchId: projectUpload.data.batch.id,
        territoryBatchId: territoryUpload.data.batch.id,
        projectStatus: projectUpload.data.batch.status,
        territoryStatus: territoryUpload.data.batch.status,
        projectRows: `${projectUpload.data.batch.validRows}/${projectUpload.data.batch.totalRows}`,
        territoryRows: `${territoryUpload.data.batch.validRows}/${territoryUpload.data.batch.totalRows}`,
      });
      setGeoExcelInfo(
        'El workbook se integró al modelo Geo/BI. Si los territory_code del Excel coinciden con el catálogo territorial de SIGI, la cobertura ya se refleja en el visor y en los KPIs.',
      );
    } catch (reason) {
      setGeoExcelError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo procesar el Excel para Geo/BI.',
      );
    } finally {
      setIsImportingGeoExcel(false);
    }
  }

  function handleGeoExcelFileChange(event: ChangeEvent<HTMLInputElement>) {
    setGeoExcelError(null);
    setGeoExcelInfo(null);
    setGeoExcelResult(null);
    setGeoExcelFile(event.target.files?.[0] ?? null);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setGeoServerNotice(`${label} copiado al portapapeles.`);
      window.setTimeout(() => setGeoServerNotice(null), 2200);
    } catch {
      setGeoServerNotice(`No se pudo copiar ${label.toLowerCase()}.`);
      window.setTimeout(() => setGeoServerNotice(null), 2200);
    }
  }

  function toPublicGeoServerUrl(value: string) {
    try {
      const targetUrl = new URL(value);
      if (targetUrl.hostname === 'geoserver') {
        return new URL(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`, window.location.origin).toString();
      }
      return value;
    } catch {
      return value;
    }
  }

  function buildWmsPreviewUrl(layerName: string) {
    if (!geoServerSnapshot) {
      return '';
    }
    const url = new URL(toPublicGeoServerUrl(geoServerSnapshot.serviceUrl));
    url.searchParams.set('service', 'WMS');
    url.searchParams.set('version', '1.1.1');
    url.searchParams.set('request', 'GetMap');
    url.searchParams.set('layers', layerName);
    url.searchParams.set('styles', '');
    url.searchParams.set('format', 'image/png');
    url.searchParams.set('transparent', 'true');
    url.searchParams.set('srs', 'EPSG:3857');
    url.searchParams.set('width', '1024');
    url.searchParams.set('height', '768');
    url.searchParams.set('bbox', '-9583200,884000,-9096000,1252000');
    return url.toString();
  }

  function buildWfsPreviewUrl(layerName: string) {
    if (!geoServerSnapshot) {
      return '';
    }
    const url = new URL(toPublicGeoServerUrl(geoServerSnapshot.wfsServiceUrl));
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('version', '1.0.0');
    url.searchParams.set('request', 'GetFeature');
    url.searchParams.set('typeName', layerName);
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('maxFeatures', '50');
    return url.toString();
  }

  function toggleGeoServerLayer(layerName: string) {
    setSelectedGeoServerLayerNames((current) =>
      current.includes(layerName)
        ? current.filter((item) => item !== layerName)
        : [...current, layerName],
    );
  }

  function setGeoServerLayerOpacity(layerName: string, opacity: number) {
    setGeoServerLayerOpacities((current) => ({
      ...current,
      [layerName]: clampOpacity(opacity),
    }));
  }

  function isGeoServerLayerActive(layerName: string) {
    return selectedGeoServerLayerNames.includes(layerName);
  }

  function isDefaultGeoServerLayer(layerName: string) {
    return defaultGeoServerLayerNames.includes(layerName);
  }

  function applyRoleDashboardPreset(roleKey: keyof typeof roleDashboardPresets) {
    const preset = roleDashboardPresets[roleKey];
    const availableLayerCodes = (module?.layers ?? []).map((layer) => layer.code);
    const availableGeoServerLayerNames = (geoServerSnapshot?.publishedLayers ?? []).map(
      (layer) => layer.name,
    );
    const resolvedRecommendedLayerCode = resolvePreferredLayerCode(
      preset.recommendedLayerCode,
      availableLayerCodes,
    );
    const resolvedRecommendedGeoServerLayers = resolvePreferredGeoServerLayerNames(
      preset.recommendedGeoServerLayers,
      availableGeoServerLayerNames,
    );
    setRoleDashboardKey(roleKey);
    setSelectedLayerCode(resolvedRecommendedLayerCode);
    setSelectedLevel(preset.recommendedLevel);
    setSelectedFeatureCode(null);
    setSelectedGeoServerLayerNames(resolvedRecommendedGeoServerLayers);
    if (resolvedRecommendedLayerCode === 'dnea_activity_points') {
      setDneaColorBy('activityGeneral');
    }
  }

  return (
    <section>
      {!canReadGeoBi ? (
        <MessageBlock tone="danger" icon="alert">
          Tu perfil no tiene permisos para consultar el módulo Geo/BI del EGI activo.
        </MessageBlock>
      ) : null}
      <ModuleWorkspaceHeader
        eyebrow="Operación · Mapa"
        title="Mapa"
        description={`${module?.summary.layers ?? 0} capas disponibles`}
        configurationPath="/admin/geobi/config"
        configurationPermissions={['gis.configure', 'publications.publish']}
        tabs={[
          { label: 'Visor', to: territoryWorkspacePath('viewer', requestedProjectId) },
          { label: 'Análisis', to: territoryWorkspacePath('analysis', requestedProjectId) },
          { label: 'Publicaciones', to: '/admin/publications', requiredPermissions: ['publications.read'] },
        ]}
      />

      {/* En el Visor el contexto de proyecto es una barra de una línea para que el mapa quepa en pantalla. */}
      {requestedProjectId && canReadProjects && isMapViewer ? (
        <div className="sigi-map-project-bar" role="status">
          <span className="sigi-map-project-bar__label">Proyecto enfocado</span>
          {projectContext ? (
            <>
              <strong>{projectContext.project.title}</strong>
              <span>{projectContext.project.code ?? 'Sin código'}{projectContext.project.institutionName ? ` · ${projectContext.project.institutionName}` : ''}</span>
              <span className="sigi-map-project-bar__links">
                <Link to={`/projects/${encodeURIComponent(projectContext.project.id)}`}>Proyecto</Link>
                <Link to={`/projects/${encodeURIComponent(projectContext.project.id)}/indicators`}>Indicadores ({projectContext.indicators.length})</Link>
                <Link to={`/projects/${encodeURIComponent(projectContext.project.id)}/documents`}>Documentos ({projectContext.documents.length})</Link>
              </span>
            </>
          ) : projectContextError ? (
            <span className="sigi-map-project-bar__error">El proyecto indicado no está disponible dentro del alcance autorizado.</span>
          ) : (
            <span>Cargando proyecto…</span>
          )}
        </div>
      ) : null}

      {requestedProjectId && canReadProjects && !isMapViewer ? (
        <Panel
          title={projectContext?.project.title ?? 'Contexto de proyecto'}
          subtitle={projectContext
            ? `${projectContext.project.code ?? 'Sin código'} · ${projectContext.project.institutionName ?? 'Sin institución'}`
            : 'Resolviendo la relación territorial solicitada desde Proyectos.'}
          icon="flow"
          tone={projectContextError ? 'warn' : 'good'}
          action={projectContext ? <StatPill tone="good">Proyecto relacionado</StatPill> : undefined}
        >
          {projectContext ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link style={contextLinkStyle} to={`/projects/${encodeURIComponent(projectContext.project.id)}`}>Proyecto</Link>
              <Link style={contextLinkStyle} to={`/projects/${encodeURIComponent(projectContext.project.id)}/indicators`}>Indicadores ({projectContext.indicators.length})</Link>
              <Link style={contextLinkStyle} to={`/projects/${encodeURIComponent(projectContext.project.id)}/documents`}>Documentos ({projectContext.documents.length})</Link>
            </div>
          ) : projectContextError ? (
            <MessageBlock tone="danger">El proyecto indicado no está disponible dentro del alcance autorizado.</MessageBlock>
          ) : (
            <MessageBlock>Cargando contexto relacionado...</MessageBlock>
          )}
        </Panel>
      ) : null}

      {error ? <MessageBlock tone="danger" icon="alert">{error}</MessageBlock> : null}

      {canReadGeoBi && !error && !module ? (
        <MessageBlock icon="map">Cargando información del mapa...</MessageBlock>
      ) : null}

      {canReadGeoBi && module ? (
        <>
          {territoryView === 'analysis' ? (
          <>
          <GeoSpatialAnalysisWorkbench layers={geoLayers ?? []} canUploadImports={canUploadImports} />

          <div className="sigi-map-legacy-toggle">
            <button type="button" onClick={() => setShowLegacyAnalysis((value) => !value)} aria-expanded={showLegacyAnalysis}>
              {showLegacyAnalysis ? 'Ocultar' : 'Mostrar'} panel ejecutivo del módulo
            </button>
            <span>Indicadores, cobertura, calidad, perfiles y monitoreo del módulo Mapa.</span>
          </div>
          {showLegacyAnalysis ? (
          <>

          <MetricGrid>
            <MetricCard
              label="Capas activas"
              value={String(module.summary.layers)}
              hint="Capas publicables y operativas visibles en el módulo."
              icon="map"
              tone="good"
            />
            <MetricCard
              label="Datos enlazados"
              value={String(module.summary.datasets)}
              hint="Conjuntos de datos conectados con fuentes y gobernanza."
              icon="database"
              tone="neutral"
            />
            <MetricCard
              label="Territorios"
              value={String(module.summary.territories)}
              hint="Base territorial disponible para análisis y cobertura."
              icon="globe"
              tone="neutral"
            />
            <MetricCard
              label="Calidad geoespacial"
              value={`${module.summary.qualityScore}%`}
              hint="Validaciones aprobadas sobre el universo procesado."
              icon="validation"
              tone="warn"
            />
          </MetricGrid>

          <Panel
            title="Análisis geoespacial"
            subtitle="Vistas según el perfil y alcance activo."
            action={<StatPill tone="good">{activeRolePreset.badge}</StatPill>}
            icon="overview"
            tone="good"
          >
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(roleDashboardPresets).map(([key, preset]) => {
                  const isActive = roleDashboardKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyRoleDashboardPreset(key as keyof typeof roleDashboardPresets)}
                      style={{
                        border: isActive ? '1px solid #14532d' : '1px solid #d7dde5',
                        borderRadius: 999,
                        padding: '10px 14px',
                        background: isActive ? '#e8f3ec' : '#ffffff',
                        color: isActive ? '#14532d' : '#10233f',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 14,
                  gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)',
                  alignItems: 'start',
                }}
              >
                <div
                  style={{
                    borderRadius: 18,
                    padding: 18,
                    background:
                      'linear-gradient(135deg, rgba(15,76,129,0.08) 0%, rgba(255,255,255,0.98) 72%)',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'grid', gap: 4 }}>
                    <strong style={{ fontSize: 20, color: '#10233f' }}>
                      {activeRolePreset.label}
                    </strong>
                    <span style={metaStyle}>{activeRolePreset.person}</span>
                  </div>
                  <span style={{ color: '#334155', fontSize: 14 }}>
                    {activeRolePreset.summary}
                  </span>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {activeRolePreset.highlights.map((item) => (
                      <article key={item} style={softArticleStyle}>
                        <strong style={{ color: '#10233f', fontSize: 13 }}>{item}</strong>
                      </article>
                    ))}
                  </div>
                </div>

                <DetailList
                  items={[
                    {
                      label: 'Perfil activo',
                      value: activeRolePreset.person,
                    },
                    {
                      label: 'Capa sugerida',
                      value:
                        module.layers.find(
                          (layer) => layer.code === activeRolePreset.recommendedLayerCode,
                        )?.name ?? getFriendlyTechnicalLabel(activeRolePreset.recommendedLayerCode),
                    },
                    {
                      label: 'Escala sugerida',
                      value: activeRolePreset.recommendedLevel,
                    },
                    {
                      label: 'Overlays sugeridos',
                      value: String(activeRolePreset.recommendedGeoServerLayers.length),
                    },
                  ]}
                />
              </div>
            </div>
          </Panel>

          <div id="geo-role-hero" style={{ display: 'grid', gap: 18, marginBottom: 18 }}>
            <Panel
              title={activeRolePreset.label}
              subtitle="Indicadores disponibles para el perfil seleccionado."
              action={<StatPill tone="good">{activeRolePreset.person}</StatPill>}
            >
              <div
                style={{
                  display: 'grid',
                  gap: 18,
                  gridTemplateColumns: 'minmax(0, 1.2fr) minmax(300px, 0.8fr)',
                  alignItems: 'start',
                }}
              >
                <div
                  style={{
                    borderRadius: 20,
                    padding: 20,
                    background:
                      isDecisionView
                        ? 'linear-gradient(135deg, rgba(20,83,45,0.12) 0%, rgba(255,255,255,0.96) 68%)'
                        : isSigView
                          ? 'linear-gradient(135deg, rgba(15,118,110,0.12) 0%, rgba(255,255,255,0.96) 68%)'
                          : 'linear-gradient(135deg, rgba(15,63,115,0.12) 0%, rgba(255,255,255,0.96) 68%)',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <strong style={{ fontSize: 20, color: '#10233f' }}>
                    {activeGuidedJourney.objective}
                  </strong>
                  <span style={metaStyle}>
                    Esta vista ya no es un preset decorativo: oculta paneles secundarios y deja al
                    frente únicamente las secciones que este perfil necesita para operar o exponer.
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {activeGuidedJourney.sections.map((section, index) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        style={{
                          border: '1px solid #d7dde5',
                          borderRadius: 999,
                          padding: '8px 12px',
                          background: '#ffffff',
                          color: '#14532d',
                          fontWeight: 700,
                          fontSize: 12,
                          textDecoration: 'none',
                        }}
                      >
                        {index + 1}. {section.label}
                      </a>
                    ))}
                  </div>
                </div>

                <DetailList
                  items={[
                    {
                      label: 'Perfil activo',
                      value: activeRolePreset.person,
                    },
                    {
                      label: 'Capa inicial',
                      value: selectedLayer?.name ?? 'Territorios públicos SIGI',
                    },
                    {
                      label: 'Vista visible',
                      value: isDecisionView
                        ? 'Ejecutiva y analítica'
                        : isSigView
                          ? 'SIG y geoespacial'
                          : 'Técnica y trazable',
                    },
                    {
                      label: 'Paneles guiados',
                      value: String(activeGuidedJourney.sections.length),
                    },
                  ]}
                />
              </div>
            </Panel>

            <Panel
              title={`Resumen: ${activeRolePreset.label}`}
              subtitle="Indicadores y estado de cobertura."
              action={<StatPill tone={isDecisionView ? 'good' : isSigView ? 'neutral' : 'warn'}>{activeRolePreset.badge}</StatPill>}
            >
              <div style={{ display: 'grid', gap: 16 }}>
                <MetricGrid>
                  {activeRoleDashboardCards.map((card) => (
                    <MetricCard
                      key={`${roleDashboardKey}-${card.label}`}
                      label={card.label}
                      value={card.value}
                      hint={card.hint}
                    />
                  ))}
                </MetricGrid>
                <DetailList
                  items={[
                    {
                      label: 'Objetivo del perfil',
                      value: activeGuidedJourney.objective,
                    },
                    {
                      label: 'Capa recomendada',
                      value:
                        module.layers.find((layer) => layer.code === activeRolePreset.recommendedLayerCode)?.name ??
                        getFriendlyTechnicalLabel(activeRolePreset.recommendedLayerCode),
                    },
                    {
                      label: 'Escala base',
                      value: activeRolePreset.recommendedLevel,
                    },
                    {
                      label: 'Recorrido guiado',
                      value: `${activeGuidedJourney.sections.length} pasos`,
                    },
                  ]}
                />
              </div>
            </Panel>

            <div
              style={{
                display: 'grid',
                gap: 18,
                gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
              }}
            >
            <Panel
              title="Resumen ejecutivo"
              subtitle="Estado de capas, cobertura y calidad."
              action={<StatPill tone="good">Operativo para presentación</StatPill>}
            >
                <div
                  style={{
                    borderRadius: 20,
                    padding: 20,
                    background:
                      'linear-gradient(135deg, rgba(20,83,45,0.12) 0%, rgba(255,255,255,0.96) 68%)',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <strong style={{ fontSize: 20, color: '#10233f' }}>
                    Geo/BI ya conecta cartografía, datasets, calidad, alertas y salidas públicas
                    sobre una misma superficie institucional.
                  </strong>
                  <span style={metaStyle}>
                    En esta vista administrativa se puede presentar catálogo de capas, cobertura por
                    escala, datos enlazados, publicaciones, bitácora y la relación directa con el
                    módulo de proyectos.
                  </span>
                </div>
                <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                  <DetailList
                    items={[
                      {
                        label: 'Capa prioritaria',
                        value: selectedLayer?.name ?? 'Territorios públicos SIGI',
                      },
                      {
                        label: 'Cobertura integrada',
                        value: `${module.summary.totalAreaHa.toLocaleString('es-CR')} ha`,
                      },
                      {
                        label: 'Señal de calidad',
                        value: `${module.summary.qualityScore}%`,
                      },
                      {
                        label: 'Publicaciones activas',
                        value: String(module.summary.publications),
                      },
                    ]}
                  />
                </div>
              </Panel>

              <Panel
                title="Acciones sugeridas"
                subtitle="Siguientes tareas para el perfil activo."
                action={<StatPill tone="neutral">{activeGuidedJourney.sections.length} pasos</StatPill>}
              >
                <div style={{ display: 'grid', gap: 10 }}>
                  {activeGuidedJourney.sections.map((section, index) => (
                    <article key={section.id} style={softArticleStyle}>
                      <strong style={{ color: '#10233f' }}>
                        {index + 1}. {section.label}
                      </strong>
                      <span style={metaStyle}>Ir a la sección real de esta vista guiada.</span>
                    </article>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          </>
          ) : null}
          </>
          ) : null}

          <div id="geo-map" style={{ display: 'grid', gap: 18, marginBottom: 18 }}>
            {isMapViewer ? (
            <section className="sigi-map-viewer" aria-label="Visor del mapa">
              {geoLayersError ? <MessageBlock tone="danger">{geoLayersError}</MessageBlock> : null}
              {geoLayersLoading && !geoLayers ? <MessageBlock>Cargando las capas del mapa…</MessageBlock> : null}
              {geoLayers ? (
                <div className="sigi-map-viewer__body">
                  <aside className="sigi-map-viewer__sidebar" aria-label="Capas y herramientas del mapa">
                    <div className="sigi-map-viewer__section">
                      <span className="sigi-map-viewer__label">Buscar un lugar</span>
                      <div className="sigi-map-catalog-search" style={{ position: 'relative', marginBottom: 16, maxWidth: 420 }}>
                    <input
                      type="text"
                      value={territorySearchQuery}
                      onChange={(event) => setTerritorySearchQuery(event.target.value)}
                      placeholder="Buscar territorio en el mapa (nombre o código)..."
                      style={{ ...catalogSearchInputStyle, width: '100%', minWidth: 0 }}
                      aria-label="Buscar territorio en el mapa"
                    />
                    {territorySearchLoading ? (
                      <div style={territorySearchStatusStyle}>Buscando…</div>
                    ) : null}
                    {territorySearchError ? (
                      <div style={{ ...territorySearchStatusStyle, color: '#b91c1c' }}>{territorySearchError}</div>
                    ) : null}
                    {!territorySearchLoading && territorySearchResults !== null ? (
                      territorySearchResults.length === 0 ? (
                        <div style={territorySearchDropdownStyle}>
                          <div style={territorySearchEmptyStyle}>
                            Sin resultados para "{territorySearchQuery}".
                          </div>
                        </div>
                      ) : (
                        <div style={territorySearchDropdownStyle}>
                          {territorySearchResults.map((result) => (
                            <button
                              key={`${result.layerCode}:${result.territoryCode}`}
                              type="button"
                              onClick={() => handleSelectSearchResult(result)}
                              style={territorySearchResultStyle}
                            >
                              <strong style={{ color: '#10233f', fontSize: 13 }}>{result.territoryName}</strong>
                              <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                                {result.layerName} · {result.territoryLevel}
                              </span>
                            </button>
                          ))}
                        </div>
                      )
                    ) : null}
                  </div>
                    </div>

                    <div className="sigi-map-viewer__section sigi-map-viewer__section--layers">
                      <div className="sigi-map-viewer__section-head">
                        <span className="sigi-map-viewer__label">Capas</span>
                        <span className="sigi-map-viewer__count">{activeCatalogCodes.length} de {geoLayers.length} visibles</span>
                      </div>
                      <div className="sigi-map-viewer__layer-tools">
                        <input
                          type="search"
                          value={catalogSearchQuery}
                          onChange={(event) => setCatalogSearchQuery(event.target.value)}
                          placeholder="Filtrar capas…"
                          aria-label="Filtrar capas por nombre"
                        />
                        <button type="button" onClick={handleDeactivateAllLayers} disabled={activeCatalogCodes.length === 0}>
                          Ocultar
                        </button>
                        <button type="button" onClick={handleRefreshCatalog} disabled={geoLayersLoading} title="Volver a consultar el catálogo">
                          {geoLayersLoading ? '…' : '↻'}
                        </button>
                      </div>
                      {catalogEntries.length > 0 && filteredCatalogEntries.length === 0 ? (
                        <MessageBlock>Ninguna capa coincide con "{catalogSearchQuery}".</MessageBlock>
                      ) : catalogEntries.length === 0 ? (
                        <MessageBlock>El EGI activo todavía no tiene capas geoespaciales.</MessageBlock>
                      ) : (
                        <GeoLayerCatalogPanel
                          entries={filteredCatalogEntries}
                          onToggle={handleToggleCatalogLayer}
                          onOpacityChange={handleCatalogOpacityChange}
                          onZoomToLayer={handleZoomToCatalogLayer}
                          onFilterFieldChange={handleFilterFieldChange}
                          onClearFilters={handleClearFilters}
                          onShowTable={handleShowTable}
                          tableLayerCode={tableLayerCode}
                        />
                      )}
                    </div>

                    <div className="sigi-map-viewer__section sigi-map-viewer__section--advanced">
                      {/* P1-3 — external WMS/GeoJSON layers (spec §16), fetched entirely client-side. */}
                  <details className="sigi-map-catalog-advanced" style={externalLayersDetailsStyle}>
                    <summary style={externalLayersSummaryStyle}>
                      Capas externas (WMS/GeoJSON){externalLayers.length > 0 ? ` — ${externalLayers.length}` : ''}
                    </summary>
                    <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                      <div style={externalLayerFormRowStyle}>
                        <select
                          value={externalForm.kind}
                          onChange={(event) =>
                            setExternalForm((current) => ({ ...current, kind: event.target.value as ExternalLayerKind }))
                          }
                          style={catalogToolbarButtonStyle(false)}
                          aria-label="Tipo de capa externa"
                        >
                          <option value="wms">WMS</option>
                          <option value="geojson">GeoJSON</option>
                        </select>
                        <input
                          type="text"
                          value={externalForm.name}
                          onChange={(event) => setExternalForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Nombre para identificarla..."
                          style={{ ...catalogSearchInputStyle, flex: '1 1 160px' }}
                          aria-label="Nombre de la capa externa"
                        />
                        <input
                          type="text"
                          value={externalForm.url}
                          onChange={(event) => setExternalForm((current) => ({ ...current, url: event.target.value }))}
                          placeholder={
                            externalForm.kind === 'wms'
                              ? 'URL del servicio WMS (https://...)'
                              : 'URL del GeoJSON (https://...)'
                          }
                          style={{ ...catalogSearchInputStyle, flex: '2 1 240px' }}
                          aria-label="URL de la capa externa"
                        />
                        {externalForm.kind === 'wms' ? (
                          <input
                            type="text"
                            value={externalForm.wmsLayerName}
                            onChange={(event) =>
                              setExternalForm((current) => ({ ...current, wmsLayerName: event.target.value }))
                            }
                            placeholder="Nombre de la capa WMS (workspace:capa)"
                            style={{ ...catalogSearchInputStyle, flex: '1 1 200px' }}
                            aria-label="Nombre de la capa WMS"
                          />
                        ) : null}
                        <button type="button" onClick={handleAddExternalLayer} style={catalogToolbarButtonStyle(false)}>
                          Agregar
                        </button>
                      </div>
                      {externalFormError ? <MessageBlock tone="danger">{externalFormError}</MessageBlock> : null}

                      {externalLayers.length > 0 ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {externalLayers.map((entry) => (
                            <div key={entry.id} style={externalLayerRowStyle}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <input
                                  type="checkbox"
                                  checked={entry.visible}
                                  onChange={() => handleToggleExternalLayerVisible(entry.id)}
                                />
                                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                                  <strong style={{ color: '#10233f', fontSize: 13 }}>
                                    {entry.name} <span style={{ color: '#5f6b7a', fontWeight: 400 }}>({entry.kind.toUpperCase()})</span>
                                  </strong>
                                  {entry.loading ? <span style={statusMutedStyleExternal}>Cargando…</span> : null}
                                  {entry.error ? <span style={statusWarnStyleExternal}>{entry.error}</span> : null}
                                </span>
                              </label>
                              <input
                                type="range"
                                min={0.1}
                                max={1}
                                step={0.1}
                                value={entry.opacity}
                                onChange={(event) => handleExternalLayerOpacityChange(entry.id, Number(event.target.value))}
                                style={{ width: 80 }}
                                aria-label={`Transparencia de ${entry.name}`}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveExternalLayer(entry.id)}
                                style={catalogToolbarButtonStyle(false)}
                              >
                                Quitar
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                      {/* P1-4 — saved views (spec §19): persist active layers + color/opacity/filters, restore later. */}
                  <details className="sigi-map-catalog-advanced" style={externalLayersDetailsStyle}>
                    <summary style={externalLayersSummaryStyle}>
                      Vistas guardadas{savedViews && savedViews.length > 0 ? ` — ${savedViews.length}` : ''}
                    </summary>
                    <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                      <div style={externalLayerFormRowStyle}>
                        <input
                          type="text"
                          value={saveViewName}
                          onChange={(event) => setSaveViewName(event.target.value)}
                          placeholder="Nombre de la vista..."
                          style={{ ...catalogSearchInputStyle, flex: '1 1 220px' }}
                          aria-label="Nombre de la vista guardada"
                        />
                        <button
                          type="button"
                          onClick={handleSaveCurrentView}
                          disabled={saveViewSaving}
                          style={catalogToolbarButtonStyle(saveViewSaving)}
                        >
                          {saveViewSaving ? 'Guardando…' : 'Guardar vista actual'}
                        </button>
                      </div>
                      {saveViewError ? <MessageBlock tone="danger">{saveViewError}</MessageBlock> : null}
                      {savedViewsLoading ? <span style={statusMutedStyleExternal}>Cargando vistas guardadas…</span> : null}
                      {savedViewsError ? <MessageBlock tone="danger">{savedViewsError}</MessageBlock> : null}
                      {!savedViewsLoading && savedViews && savedViews.length === 0 ? (
                        <span style={statusMutedStyleExternal}>Todavía no has guardado ninguna vista.</span>
                      ) : null}
                      {savedViews && savedViews.length > 0 ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {savedViews.map((view) => (
                            <div key={view.id} style={externalLayerRowStyle}>
                              <span style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
                                <strong style={{ color: '#10233f', fontSize: 13 }}>{view.name}</strong>
                                <span style={statusMutedStyleExternal}>
                                  {view.viewState.activeLayers.length} capa(s) ·{' '}
                                  {new Date(view.updatedAt).toLocaleDateString('es-CR', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleLoadSavedView(view)}
                                style={catalogToolbarButtonStyle(false)}
                              >
                                Cargar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSavedView(view.id)}
                                style={catalogToolbarButtonStyle(false)}
                              >
                                Eliminar
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                    </div>

                    <div className="sigi-map-viewer__links">
                      <Link to={territoryWorkspacePath('analysis', requestedProjectId)}>∩ Cruce de capas</Link>
                      {canUploadImports ? <Link to="/admin/geospatial-catalog">＋ Cargar datos</Link> : null}
                    </div>
                  </aside>

                  <div className="sigi-map-viewer__map">
                    <MultiLayerMap
                      ref={multiLayerMapRef}
                      layers={multiLayerMapEntries}
                      wmsLayers={externalWmsMapEntries}
                      emptyMessage="Activa una capa en el panel de la izquierda para verla en el mapa."
                      onFeatureClick={handleGeoFeatureClick}
                      onSelectionCleared={handleCloseGeoFeaturePanel}
                      initialView={initialMapView}
                      focusFeature={projectFocusFeature}
                      onViewChange={handleMapViewChange}
                      ariaLabel="Mapa del SIGI"
                    >
                      {multiLayerMapEntries.length > 0 ? (
                        <div className="sigi-map-legend-float" aria-label="Leyenda">
                          <strong>Leyenda</strong>
                          {multiLayerMapEntries.map((entry) => (
                            <span key={entry.code}>
                              <i style={{ background: entry.color }} aria-hidden="true" />
                              {entry.name}
                              {catalogFeaturesByCode[entry.code]?.loading ? ' · cargando…' : ''}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {selectedGeoFeature ? (
                        <div className="sigi-map-catalog-inspector">
                          <FeatureIdentificationPanel
                        layerName={selectedGeoFeatureLayer?.name ?? selectedGeoFeature.layerCode}
                        feature={selectedGeoFeature.feature}
                        layer={selectedGeoFeatureLayer}
                        metadata={selectedGeoFeatureMetadataState?.data ?? null}
                        metadataLoading={Boolean(selectedGeoFeatureMetadataState?.loading)}
                        metadataError={selectedGeoFeatureMetadataState?.error ?? null}
                        institutionName={selectedGeoFeatureInstitutionName}
                        onClose={handleCloseGeoFeaturePanel}
                        onViewProject={handleViewProject}
                        onViewProjectIndicators={handleViewProjectIndicators}
                        onViewProjectDocuments={handleViewProjectDocuments}
                        nearbyLayerOptions={geoLayers ?? []}
                        nearbyLayerCode={nearbyLayerCode}
                        onNearbyLayerChange={setNearbyLayerCode}
                        nearbyRadiusMeters={nearbyRadiusMeters}
                        onNearbyRadiusChange={setNearbyRadiusMeters}
                        onSearchNearby={handleSearchNearby}
                        nearbyLoading={nearbyState.loading}
                        nearbyError={nearbyState.error}
                        nearbyResults={nearbyState.results}
                        onSelectNearbyResult={handleSelectSearchResult}
                      />

                        </div>
                      ) : null}
                    </MultiLayerMap>
                  </div>
                </div>
              ) : null}

              {tableLayerCode && tableLayer ? (
                <>
                  <div style={{ height: 18 }} />
                  <GeoLayerAttributeTable
                    layer={tableLayer}
                    schema={tableSchemaState?.fields ?? null}
                    schemaLoading={Boolean(tableSchemaState?.loading)}
                    features={tableData.features}
                    page={tablePage}
                    pageSize={TABLE_PAGE_SIZE}
                    totalFeatures={tableData.totalFeatures}
                    loading={tableData.loading}
                    error={tableData.error}
                    sort={tableSort}
                    order={tableOrder}
                    selectedFeatureCode={tableSelectedFeatureCode}
                    onPageChange={handleTablePageChange}
                    onSortChange={handleTableSortChange}
                    onSelectRow={handleTableRowSelect}
                    onClose={handleCloseTable}
                    exportFormat={exportFormat}
                    onExportFormatChange={setExportFormat}
                    onExport={handleExport}
                    exporting={exportState.exporting}
                    exportError={exportState.error}
                    exportNotice={exportState.notice}
                    chartField={chartField}
                    onChartFieldChange={setChartField}
                    chartData={chartState.data}
                    chartLoading={chartState.loading}
                    chartError={chartState.error}
                  />
                </>
              ) : null}
            </section>
            ) : null}

            {legacyAnalysisVisible && (isSigView || isItView) ? (
            <div id="geo-capabilities">
            <Panel
              title="GeoServer capabilities"
              subtitle="Capas publicadas actualmente por GeoServer y visibles para integración admin."
              action={
                <StatPill tone={geoServerSnapshot?.publishedLayers?.length ? 'good' : 'neutral'}>
                  {geoServerSnapshot?.publishedLayers?.length ?? 0} capas
                </StatPill>
              }
            >
              {geoServerError ? <MessageBlock tone="danger">{geoServerError}</MessageBlock> : null}
              {!geoServerError && !geoServerSnapshot ? (
                <MessageBlock>Cargando capacidades publicadas de GeoServer...</MessageBlock>
              ) : null}
              {geoServerSnapshot ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <DetailList
                    items={[
                      { label: 'Workspace', value: geoServerSnapshot.workspace ?? 'No detectado' },
                      { label: 'Servicio WMS', value: toPublicGeoServerUrl(geoServerSnapshot.serviceUrl) },
                      { label: 'Servicio WFS', value: toPublicGeoServerUrl(geoServerSnapshot.wfsServiceUrl) },
                      {
                        label: 'Capabilities',
                        value: toPublicGeoServerUrl(geoServerSnapshot.capabilitiesUrl),
                      },
                    ]}
                  />
                  {geoServerNotice ? <MessageBlock>{geoServerNotice}</MessageBlock> : null}
                  <div style={{ display: 'grid', gap: 10 }}>
                    {geoServerSnapshot.publishedLayers.length > 0 ? (
                      geoServerSnapshot.publishedLayers.map((layer) => (
                        <article key={layer.name} style={articleStyle}>
                          <div style={articleHeaderStyle}>
                            <strong>{layer.title}</strong>
                            <StatPill tone="good">{layer.workspace}</StatPill>
                          </div>
                          <span style={metaStyle}>{layer.name}</span>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => toggleGeoServerLayer(layer.name)}
                              style={{
                                ...endpointButtonStyle,
                                background: isGeoServerLayerActive(layer.name) ? '#e8f3ec' : '#f8fbff',
                                border: isGeoServerLayerActive(layer.name)
                                  ? '1px solid #14532d'
                                  : '1px solid #d7dde5',
                                color: isGeoServerLayerActive(layer.name) ? '#14532d' : '#10233f',
                              }}
                            >
                              {isGeoServerLayerActive(layer.name)
                                ? 'Quitar del visor'
                                : 'Agregar al visor'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <a
                              href={buildWmsPreviewUrl(layer.name)}
                              target="_blank"
                              rel="noreferrer"
                              style={endpointLinkStyle}
                            >
                              Preview WMS
                            </a>
                            <button
                              type="button"
                              onClick={() => void copyText(buildWmsPreviewUrl(layer.name), `WMS de ${layer.title}`)}
                              style={endpointButtonStyle}
                            >
                              Copiar WMS
                            </button>
                            <a
                              href={buildWfsPreviewUrl(layer.name)}
                              target="_blank"
                              rel="noreferrer"
                              style={endpointLinkStyle}
                            >
                              Preview WFS
                            </a>
                            <button
                              type="button"
                              onClick={() => void copyText(buildWfsPreviewUrl(layer.name), `WFS de ${layer.title}`)}
                              style={endpointButtonStyle}
                            >
                              Copiar WFS
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <MessageBlock>No hay capas publicadas detectadas en GeoServer.</MessageBlock>
                    )}
                  </div>
                </div>
              ) : null}
            </Panel>
            </div>
            ) : null}
          </div>

          {legacyAnalysisVisible && koboGuatemalaWorkshopStats && (isDecisionView || isSigView) ? (
            <>
              <div id="geo-kobo-guatemala-workshop-stats">
                <Panel
                  title="Estadísticas BI · Taller Guatemala 1"
                  subtitle="Corte inicial de 13 respuestas Kobo, sin datos personales de participantes."
                  action={
                    <StatPill tone="good">
                      {koboGuatemalaWorkshopStats.totalFeatures} de{' '}
                      {koboGuatemalaWorkshopStats.availableFeatures} puntos
                    </StatPill>
                  }
                >
                  <MetricGrid>
                    <MetricCard
                      label="Respuestas analizadas"
                      value={String(koboGuatemalaWorkshopStats.totalFeatures)}
                      hint="13 respuestas incluidas en el corte actual."
                    />
                    <MetricCard
                      label="Instituciones"
                      value={String(koboGuatemalaWorkshopStats.institutionCount)}
                      hint="Instituciones normalizadas: FAO, INAB, CONAP y MARN."
                    />
                    <MetricCard
                      label="Con fotografía"
                      value={`${koboGuatemalaWorkshopStats.withPhoto} (${Math.round(
                        (koboGuatemalaWorkshopStats.withPhoto /
                          Math.max(koboGuatemalaWorkshopStats.totalFeatures, 1)) *
                          100,
                      )}%)`}
                      hint="Respuestas que incluyen evidencia fotográfica."
                    />
                    <MetricCard
                      label="Con ubicación GPS"
                      value={`${koboGuatemalaWorkshopStats.withGps} (${Math.round(
                        (koboGuatemalaWorkshopStats.withGps /
                          Math.max(koboGuatemalaWorkshopStats.totalFeatures, 1)) *
                          100,
                      )}%)`}
                      hint="Registros con coordenadas válidas para su representación en el mapa."
                    />
                  </MetricGrid>
                  <div style={{ height: 12 }} />
                  <DetailList
                    items={[
                      {
                        label: 'Precisión GPS promedio',
                        value:
                          koboGuatemalaWorkshopStats.averageAccuracy === null
                            ? 'Sin dato'
                            : `${koboGuatemalaWorkshopStats.averageAccuracy.toLocaleString('es-GT', {
                                maximumFractionDigits: 1,
                              })} m`,
                      },
                      {
                        label: 'Fechas consistentes',
                        value: `${koboGuatemalaWorkshopStats.consistentDates} de ${koboGuatemalaWorkshopStats.totalFeatures}`,
                      },
                      {
                        label: 'Fechas para revisar',
                        value: String(koboGuatemalaWorkshopStats.anomalousDates),
                      },
                      {
                        label: 'Respuestas fuera del corte',
                        value: String(
                          Math.max(
                            koboGuatemalaWorkshopStats.availableFeatures -
                              koboGuatemalaWorkshopStats.totalFeatures,
                            0,
                          ),
                        ),
                      },
                    ]}
                  />
                </Panel>
              </div>

              <div style={{ height: 18 }} />

              <PanelGrid>
                <Panel
                  title="Participación por institución"
                  subtitle="Distribución normalizada de las 13 respuestas del taller."
                  action={<StatPill tone="good">4 instituciones</StatPill>}
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    {koboGuatemalaWorkshopStats.institutionBreakdown.map(([label, value]) => (
                      <BarRow
                        key={`kobo-institution-${label}`}
                        label={label}
                        value={value}
                        maxValue={koboGuatemalaWorkshopStats.institutionBreakdown[0]?.[1] ?? value}
                        color="#14532d"
                      />
                    ))}
                  </div>
                </Panel>

                <Panel
                  title="Evidencia fotográfica"
                  subtitle="Completitud del soporte visual enviado desde Kobo."
                  action={<StatPill tone="good">13 respuestas</StatPill>}
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    <BarRow
                      label="Con fotografía"
                      value={koboGuatemalaWorkshopStats.withPhoto}
                      maxValue={koboGuatemalaWorkshopStats.totalFeatures}
                      color="#0f766e"
                    />
                    <BarRow
                      label="Sin fotografía"
                      value={koboGuatemalaWorkshopStats.withoutPhoto}
                      maxValue={koboGuatemalaWorkshopStats.totalFeatures}
                      color="#b45309"
                    />
                  </div>
                </Panel>
              </PanelGrid>

              <div style={{ height: 18 }} />
            </>
          ) : null}

          {legacyAnalysisVisible && dneaStats && (isDecisionView || isSigView) ? (
            <>
              <div id="geo-dnea-stats">
              <Panel
                title="Estadísticas de la capa DNEA"
                subtitle="Resumen analítico de los puntos visibles según los filtros aplicados."
                action={<StatPill tone="good">{dneaStats.totalFeatures} puntos</StatPill>}
              >
                <MetricGrid>
                  <MetricCard
                    label="Puntos visibles"
                    value={String(dneaStats.totalFeatures)}
                    hint="Registros georreferenciados actualmente visibles en el mapa."
                  />
                  <MetricCard
                    label="Área declarada"
                    value={`${dneaStats.totalArea.toLocaleString('es-CR', {
                      maximumFractionDigits: 2,
                    })} ha`}
                    hint="Suma de área declarada por los registros filtrados."
                  />
                  <MetricCard
                    label="Actividades"
                    value={String(dneaStats.uniqueActivities)}
                    hint="Número de actividades distintas presentes en la selección."
                  />
                  <MetricCard
                    label="Distritos"
                    value={String(dneaStats.uniqueDistricts)}
                    hint="Cobertura distrital del subconjunto visible."
                  />
                </MetricGrid>
                <div style={{ height: 12 }} />
                <DetailList
                  items={[
                    {
                      label: 'Agencias visibles',
                      value: String(dneaStats.uniqueAgencies),
                    },
                    {
                      label: 'Registros primarios',
                      value: `${dneaStats.primaryCount} de ${dneaStats.totalFeatures}`,
                    },
                    {
                      label: 'Actividad dominante',
                      value: dneaStats.topActivity
                        ? `${dneaStats.topActivity[0]} (${dneaStats.topActivity[1]})`
                        : 'Sin dato',
                    },
                    {
                      label: 'Agencia dominante',
                      value: dneaStats.topAgency
                        ? `${dneaStats.topAgency[0]} (${dneaStats.topAgency[1]})`
                        : 'Sin dato',
                    },
                    {
                      label: 'Provincia dominante',
                      value: dneaStats.topProvince
                        ? `${dneaStats.topProvince[0]} (${dneaStats.topProvince[1]})`
                        : 'Sin dato',
                    },
                  ]}
                />
              </Panel>
              </div>

              <div style={{ height: 18 }} />

              <PanelGrid>
                <Panel
                  title="Gráfico por actividad"
                  subtitle="Distribución de registros visibles por actividad."
                  action={<StatPill tone="good">Top 8</StatPill>}
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    {dneaStats.activityBreakdown.length > 0 ? (
                      dneaStats.activityBreakdown.map(([label, value]) => (
                        <BarRow
                          key={`activity-${label}`}
                          label={label}
                          value={value}
                          maxValue={dneaStats.activityBreakdown[0]?.[1] ?? value}
                          color="#14532d"
                        />
                      ))
                    ) : (
                      <MessageBlock>No hay datos suficientes para graficar actividades.</MessageBlock>
                    )}
                  </div>
                </Panel>

                <Panel
                  title="Gráfico por provincia"
                  subtitle="Distribución territorial de registros visibles por provincia."
                  action={<StatPill tone="good">Top 8</StatPill>}
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    {dneaStats.provinceBreakdown.length > 0 ? (
                      dneaStats.provinceBreakdown.map(([label, value]) => (
                        <BarRow
                          key={`province-${label}`}
                          label={label}
                          value={value}
                          maxValue={dneaStats.provinceBreakdown[0]?.[1] ?? value}
                          color="#0f766e"
                        />
                      ))
                    ) : (
                      <MessageBlock>No hay datos suficientes para graficar provincias.</MessageBlock>
                    )}
                  </div>
                </Panel>
              </PanelGrid>

              <div style={{ height: 18 }} />
            </>
          ) : null}

          {legacyAnalysisVisible ? (
          <Panel
            title="Datos MAG / INTA"
            subtitle="Carga institucional y resultados territoriales."
            action={<StatPill tone="good">Mapa + tablero</StatPill>}
          >
            <DetailList
              items={[
                {
                  label: 'Qué probar',
                  value:
                    'Cruce entre lotes integrados, capas territoriales publicadas y cobertura operativa SSP.',
                },
                {
                  label: 'Qué mostrar',
                  value:
                    'Capas, áreas, cobertura, calidad, alertas y salidas listas para reporte.',
                },
                {
                  label: 'Mensaje clave',
                  value:
                    'SIGI integra ingestión, validación, transformación geoespacial y lectura para decisión en un mismo entorno.',
                },
              ]}
            />
          </Panel>
          ) : null}

          <div style={{ height: 18 }} />

          {legacyAnalysisVisible && isItView ? (
          <div id="geo-excel">
          <Panel
            title="Importar Excel"
            subtitle="Carga datos para actualizar cobertura e indicadores."
            action={<StatPill tone="good">Importación geográfica</StatPill>}
          >
            <form onSubmit={handleGeoExcelImport} style={{ display: 'grid', gap: 14 }}>
              {!canUploadImports ? (
                <MessageBlock tone="danger" icon="alert">
                  Tu perfil puede revisar Geo/BI, pero no cargar workbooks Excel hacia este flujo.
                </MessageBlock>
              ) : null}
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Fuente Excel</span>
                  <select
                    value={geoExcelSourceId}
                    onChange={(event) => setGeoExcelSourceId(event.target.value)}
                    style={selectStyle()}
                    disabled={!canUploadImports || isImportingGeoExcel}
                  >
                    <option value="">Selecciona fuente</option>
                    {excelSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} ({getFriendlyTechnicalLabel(source.code ?? source.id)})
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Hoja de proyectos</span>
                  <input
                    type="text"
                    value={projectSheetName}
                    onChange={(event) => setProjectSheetName(event.target.value)}
                    style={selectStyle()}
                    disabled={!canUploadImports || isImportingGeoExcel}
                    placeholder="projects"
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Hoja de territorios</span>
                  <input
                    type="text"
                    value={territorySheetName}
                    onChange={(event) => setTerritorySheetName(event.target.value)}
                    style={selectStyle()}
                    disabled={!canUploadImports || isImportingGeoExcel}
                    placeholder="project_territories"
                  />
                </label>
              </div>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#5f6b7a', fontSize: 13 }}>Workbook Excel</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleGeoExcelFileChange}
                  disabled={!canUploadImports || isImportingGeoExcel}
                />
              </label>

              <MessageBlock>
                Usa un workbook con una hoja `projects` y otra `project_territories`. Para que se vea en el mapa, el Excel debe traer `territory_code` compatible con territorios ya publicados por SIGI.
              </MessageBlock>

              <MessageBlock>
                Encabezados mínimos recomendados:
                `projects`: `project_code`, `project_name`, `lead_institution_code`, `start_date`, `end_date`, `total_area_ha`.
                `project_territories`: `project_code`, `territory_code`, `territory_name`, `country`, `area_ha`.
              </MessageBlock>

              <button
                type="submit"
                disabled={
                  !canUploadImports ||
                  isImportingGeoExcel ||
                  !geoExcelFile ||
                  !geoExcelSourceId
                }
                style={{
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 14px',
                  background: isImportingGeoExcel ? '#94a3b8' : '#14532d',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: isImportingGeoExcel ? 'wait' : 'pointer',
                }}
              >
                {isImportingGeoExcel ? 'Procesando workbook...' : 'Cargar a Geo/BI'}
              </button>
            </form>

            {geoExcelError ? <div style={{ marginTop: 12 }}><MessageBlock tone="danger">{geoExcelError}</MessageBlock></div> : null}
            {geoExcelInfo ? <div style={{ marginTop: 12 }}><MessageBlock>{geoExcelInfo}</MessageBlock></div> : null}
            {geoExcelResult ? (
              <div style={{ marginTop: 12 }}>
                <DetailList
                  items={[
                    { label: 'Batch proyectos', value: `${geoExcelResult.projectBatchId} · ${geoExcelResult.projectStatus}` },
                    { label: 'Filas válidas proyectos', value: geoExcelResult.projectRows },
                    { label: 'Batch territorios', value: `${geoExcelResult.territoryBatchId} · ${geoExcelResult.territoryStatus}` },
                    { label: 'Filas válidas territorios', value: geoExcelResult.territoryRows },
                  ]}
                />
              </div>
            ) : null}
          </Panel>
          </div>
          ) : null}

          <div style={{ height: 18 }} />

          {legacyAnalysisVisible ? (
          <PanelGrid>
            {isDecisionView ? (
            <div id="geo-kpis">
            <Panel
              title="Dashboards e indicadores"
              subtitle="KPIs ejecutivos y distribuciones temáticas para lectura comparativa."
              action={<StatPill tone="good">{module.dashboards.kpis.length} KPIs</StatPill>}
            >
              <div style={{ display: 'grid', gap: 14 }}>
                {module.dashboards.kpis.map((kpi) => (
                  <article key={kpi.label} style={softArticleStyle}>
                    <strong>{kpi.label}</strong>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#10233f' }}>{kpi.value}</div>
                    <span style={metaStyle}>{kpi.hint}</span>
                  </article>
                ))}
                <DetailList
                  items={module.dashboards.institutions.map((item) => ({
                    label: item.label,
                    value: String(item.value),
                  }))}
                />
              </div>
            </Panel>
            </div>
            ) : null}

            {(isDecisionView || isSigView) ? (
            <div id="geo-coverage">
            <Panel
              title="Cobertura geográfica"
              subtitle="Cobertura, alcance y número de proyectos enlazados por escala."
              action={<StatPill tone="good">{module.coverage.visibleProjects} proyectos</StatPill>}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <DetailList
                  items={[
                    {
                      label: 'Territorios cubiertos',
                      value: String(module.coverage.coveredTerritories),
                    },
                    {
                      label: 'Área integrada',
                      value: `${module.coverage.totalAreaHa.toLocaleString('es-CR')} ha`,
                    },
                  ]}
                />
                <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
                  {module.coverage.levels.map((level) => (
                    <article key={level.level} style={articleStyle}>
                      <div style={articleHeaderStyle}>
                        <strong>{level.level}</strong>
                        <StatPill tone="neutral">{level.featureCount} features</StatPill>
                      </div>
                      <span style={metaStyle}>
                        {level.territoryCount} territorios · {level.projectCount} proyectos ·{' '}
                        {level.totalAreaHa.toLocaleString('es-CR')} ha
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            </Panel>
            </div>
            ) : null}

            {(isSigView || isItView) ? (
            <div id="geo-catalog">
            <Panel
              title="Catálogo de capas y datos"
              subtitle="Capas geoespaciales, fuentes institucionales y densidad de conjuntos asociados."
              action={<StatPill tone="good">{module.layers.length} capas</StatPill>}
              icon="map"
              tone="good"
            >
              <div style={{ display: 'grid', gap: 12 }}>
                {module.layers.map((layer) => (
                  <article key={layer.id} style={articleStyle}>
                    <div style={articleHeaderStyle}>
                      <strong>{layer.name}</strong>
                      <StatPill tone={layer.visibility === 'public' ? 'good' : 'neutral'}>
                        {visibilityLabel(layer.visibility)}
                      </StatPill>
                    </div>
                    <span style={metaStyle}>
                      {layer.layerType} · {layer.featureCount} elementos ·{' '}
                      {layer.totalAreaHa.toLocaleString('es-CR')} ha
                    </span>
                  </article>
                ))}
                <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
                  {module.datasetCatalog.slice(0, 6).map((item) => (
                    <article key={item.sourceId} style={softArticleStyle}>
                      <strong>{item.sourceName}</strong>
                      <span style={metaStyle}>
                        {item.institutionName} · {item.sourceType} · {item.datasetCount} conjuntos
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            </Panel>
            </div>
            ) : null}

            {isDecisionView ? (
            <div id="geo-alerts">
            <Panel
              title="Monitoreo y alertas"
              subtitle="Cambios, incidencias y seguimiento del módulo."
              action={
                <StatPill tone={module.summary.alerts > 0 ? 'warn' : 'good'}>
                  {module.summary.alerts} activas
                </StatPill>
              }
              icon="alert"
              tone={module.summary.alerts > 0 ? 'warn' : 'good'}
            >
              <DetailList
                items={[
                  { label: 'Abiertas', value: String(module.alerts.open) },
                  { label: 'Investigando', value: String(module.alerts.investigating) },
                  { label: 'Resueltas', value: String(module.alerts.resolved) },
                ]}
              />
              <div style={{ marginTop: 10 }}><CompactList empty="No hay incidencias recientes visibles para Geo/BI." items={module.alerts.recent.map((incident) => ({ id: incident.id, title: incident.title, meta: incident.severity, status: <StatusBadge status={incident.status} label={alertStatusLabel(incident.status)} /> }))} /></div>
            </Panel>
            </div>
            ) : null}

            {(isDecisionView || isSigView) ? (
            <Panel
              title="Calidad geoespacial"
              subtitle="Validaciones, consistencia y nivel actual de reglas activas."
              action={<StatPill tone="good">{module.quality.score}% calidad</StatPill>}
              icon="validation"
              tone="warn"
            >
              <DetailList
                items={[
                  { label: 'Pasadas', value: String(module.quality.passed) },
                  { label: 'Advertencias', value: String(module.quality.warning) },
                  { label: 'Fallidas', value: String(module.quality.failed) },
                  { label: 'Reglas activas', value: String(module.quality.activeRules) },
                ]}
              />
            </Panel>
            ) : null}

            {(isDecisionView || isItView) ? (
            <Panel
              title="Publicación y componentes"
              subtitle="Salidas, paneles, informes y capacidades de publicación."
              action={<StatPill tone="good">{module.publications.published} publicadas</StatPill>}
              icon="publication"
              tone="good"
            >
              <div style={{ display: 'grid', gap: 10 }}>
                {module.publications.outputs.map((item) => (
                  <article key={item.id} style={articleStyle}>
                    <div style={articleHeaderStyle}>
                      <strong>{publicationTargetLabel(item.target)}</strong>
                      <StatPill tone={item.status === 'published' ? 'good' : 'neutral'}>
                        {publicationStatusLabel(item.status)}
                      </StatPill>
                    </div>
                    <span style={metaStyle}>Dataset asociado: {item.datasetId ?? 'sin dataset'}</span>
                  </article>
                ))}
                <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
                  {module.reports.latest.map((report) => (
                    <article key={report.id} style={softArticleStyle}>
                      <strong>{report.name}</strong>
                      <span style={metaStyle}>
                        {report.target} · {reportStatusLabel(report.latestRun?.status ?? 'sin ejecución reciente')}
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            </Panel>
            ) : null}

            {isItView ? (
            <div id="geo-audit">
            <Panel
              title="Bitácora y auditoría"
              subtitle="Rastro reciente de cambios y movimientos del entorno."
              action={<StatPill tone="neutral">{module.audit.events} eventos</StatPill>}
            >
              <ActivityList empty="No hay eventos recientes cargados para la bitácora Geo/BI." items={module.audit.recent.map((event) => ({ id: event.id, event: event.action, actor: event.actorEmail ?? 'Sistema', timestamp: event.createdAt, status: event.result, entity: event.entityType, metadata: event.details }))} />
            </Panel>
            </div>
            ) : null}

            {isItView ? (
            <div id="geo-data-bridge">
            <Panel
              title="Datos y fuentes asociadas"
              subtitle="Magnitud del almacén de datos y trazabilidad conectada al módulo."
              action={<StatPill tone="good">Servicios listos</StatPill>}
            >
              <DetailList
                items={[
                  { label: 'Fuentes', value: String(module.linkedData.sources) },
                  { label: 'Datasets', value: String(module.linkedData.datasets) },
                  { label: 'Versiones', value: String(module.linkedData.datasetVersions) },
                  { label: 'Validaciones', value: String(module.linkedData.validations) },
                  { label: 'Exportaciones', value: String(module.linkedData.exports) },
                ]}
              />
            </Panel>
            </div>
            ) : null}

            {isItView ? (
            <div id="geo-ecosystem">
            <Panel
              title="Servicios relacionados"
              subtitle="Datos, proyectos, calidad y publicaciones vinculadas."
              action={<StatPill tone="good">Transversal</StatPill>}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                {module.ecosystem.map((item) => (
                  <article key={item.id} style={articleStyle}>
                    <div style={articleHeaderStyle}>
                      <strong>{item.name}</strong>
                      <StatPill tone={statusTone(item.status)}>{item.status}</StatPill>
                    </div>
                    <span style={metaStyle}>{item.metric}</span>
                    <span style={metaStyle}>{item.description}</span>
                  </article>
                ))}
              </div>
            </Panel>
            </div>
            ) : null}
          </PanelGrid>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

const endpointLinkStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#14532d',
  fontWeight: 700,
  fontSize: 12,
  textDecoration: 'none',
};

const contextLinkStyle = {
  ...endpointLinkStyle,
  display: 'inline-flex',
  alignItems: 'center',
};

const endpointButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#f8fbff',
  color: '#10233f',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const articleStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 16,
  padding: 14,
  display: 'grid',
  gap: 8,
};

const softArticleStyle = {
  borderRadius: 16,
  padding: 14,
  background: '#f5f7fb',
  display: 'grid',
  gap: 6,
};

const articleHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
};

const metaStyle = {
  color: '#5f6b7a',
  fontSize: 13,
};

// P0-9 — catalog toolbar styles.
const catalogToolbarStyle = {
  display: 'flex' as const,
  flexWrap: 'wrap' as const,
  gap: 8,
  alignItems: 'center' as const,
  marginBottom: 16,
};

const catalogSearchInputStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '8px 14px',
  fontSize: 13,
  color: '#0b4f3a',
  minWidth: 220,
  flex: '1 1 220px',
};

function catalogToolbarButtonStyle(disabled: boolean) {
  return {
    border: '1px solid #d7dde5',
    borderRadius: 999,
    padding: '8px 14px',
    background: disabled ? '#f5f7fb' : '#ffffff',
    color: disabled ? '#9aa4b2' : '#0b4f3a',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap' as const,
  };
}

// P1-3 — external layers (WMS/GeoJSON) form/list styles.
const externalLayersDetailsStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 14,
  padding: '10px 14px',
  marginBottom: 16,
  background: '#ffffff',
};

const externalLayersSummaryStyle = {
  cursor: 'pointer',
  color: '#0b4f3a',
  fontSize: 13,
  fontWeight: 700,
};

const externalLayerFormRowStyle = {
  display: 'flex' as const,
  flexWrap: 'wrap' as const,
  gap: 8,
  alignItems: 'center' as const,
};

const externalLayerRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  border: '1px solid #d7dde5',
  borderRadius: 10,
  padding: '8px 10px',
};

const statusMutedStyleExternal = { color: '#5f6b7a', fontSize: 11 };
const statusWarnStyleExternal = { color: '#b45309', fontSize: 11 };

// P1-1 — territorial search dropdown styles.
const territorySearchStatusStyle = {
  marginTop: 6,
  color: '#5f6b7a',
  fontSize: 12,
};

const territorySearchDropdownStyle = {
  marginTop: 6,
  border: '1px solid #d7dde5',
  borderRadius: 12,
  background: '#ffffff',
  boxShadow: '0 8px 20px rgba(11, 79, 58, 0.12)',
  maxHeight: 260,
  overflowY: 'auto' as const,
  display: 'grid',
  gap: 2,
  padding: 4,
  position: 'absolute' as const,
  zIndex: 600,
  width: '100%',
};

const territorySearchEmptyStyle = {
  padding: '10px 12px',
  color: '#5f6b7a',
  fontSize: 12,
};

const territorySearchResultStyle = {
  display: 'grid',
  gap: 2,
  textAlign: 'left' as const,
  border: 'none',
  borderRadius: 8,
  padding: '8px 10px',
  background: 'transparent',
  cursor: 'pointer',
};

const summaryChipStyle = {
  borderRadius: 999,
  padding: '6px 10px',
  background: '#ffffff',
  border: '1px solid #d7dde5',
  color: '#334155',
  fontSize: 12,
  fontWeight: 700,
};

const helperBadgeStyle = {
  display: 'inline-flex',
  width: 'fit-content',
  borderRadius: 999,
  padding: '4px 8px',
  background: '#e8f3ec',
  color: '#14532d',
  fontSize: 11,
  fontWeight: 700,
};

function publicationTargetLabel(value: string) {
  return (
    {
      public_portal: 'Portal público',
      geo_bi: 'Panel Geo/BI',
      ferm: 'Exportación formato FERM (manual)',
      api: 'Servicio API',
      boletin_nacional: 'Boletín nacional',
    }[value] ?? value
  );
}

function publicationStatusLabel(value: string) {
  return (
    {
      published: 'Publicada',
      queued: 'En cola',
      failed: 'Fallida',
      draft: 'Borrador',
    }[value] ?? value
  );
}

function reportStatusLabel(value: string) {
  return (
    {
      completed: 'Completado',
      running: 'En ejecución',
      queued: 'En cola',
      failed: 'Fallido',
    }[value] ?? value
  );
}

function BarRow(props: { label: string; value: number; maxValue: number; color: string }) {
  const width = props.maxValue > 0 ? Math.max((props.value / props.maxValue) * 100, 6) : 0;

  return (
    <article style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ color: '#10233f', fontSize: 13 }}>{props.label}</strong>
        <span style={{ color: '#475569', fontSize: 13 }}>{props.value}</span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: '#e5e7eb',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: '100%',
            borderRadius: 999,
            background: props.color,
          }}
        />
      </div>
    </article>
  );
}
