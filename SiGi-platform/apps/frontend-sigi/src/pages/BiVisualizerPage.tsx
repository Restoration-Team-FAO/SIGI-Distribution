import { useEffect, useMemo, useRef, useState } from 'react';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { canConfigureModule, hasPermission } from '../utils/permissions';
import {
  DetailList,
  MessageBlock,
  MetricCard,
  MetricGrid,
  Panel,
  StatPill,
} from '../components/section-kit';

type ViewPreset = 'executive' | 'operations' | 'territorial';
type BuilderMode = 'edit' | 'read';
type BuilderPane = 'visuals' | 'data' | 'format';
type FilterKey = 'preset' | 'institution' | 'status';
type WidgetKey =
  | 'summary'
  | 'kpis'
  | 'status-chart'
  | 'institution-chart'
  | 'theme-chart'
  | 'area-analysis'
  | 'project-table'
  | 'narrative'
  | 'bridges';
type ChartVariant =
  | 'bar'
  | 'column'
  | 'lollipop'
  | 'stacked'
  | 'donut'
  | 'pie'
  | 'pareto'
  | 'histogram'
  | 'boxplot';
type WidgetSize = 'full' | 'half' | 'third';

type ProjectItem = {
  id: string;
  institutionId: string;
  institutionName?: string | null;
  title: string;
  status: string;
  theme?: string | null;
  visibility?: string | null;
  areaHa?: number | null;
};

type WidgetSettings = Partial<
  Record<
    WidgetKey,
    {
      title?: string;
      accentColor?: string;
      chartVariant?: ChartVariant;
      size?: WidgetSize;
      fieldKey?: string;
      measureKey?: MeasureKey;
    }
  >
>;

type BuilderConfig = {
  filters: FilterKey[];
  widgets: WidgetKey[];
  widgetSettings: WidgetSettings;
};

type DrillFilter = {
  fieldKey: string;
  value: string;
};

type MeasureKey = 'count_projects' | 'sum_area_ha';

type PageSnapshot = {
  builderConfig: BuilderConfig;
  institutionFilter: string;
  statusFilter: string;
  drillFilter: DrillFilter | null;
};

type PageSnapshotMap = Record<ViewPreset, PageSnapshot>;

const BI_VISUALIZER_STORAGE_KEY = 'sigi.bi.visualizer.builder.v4';
const BI_VISUALIZER_MODE_KEY = 'sigi.bi.visualizer.mode.v2';
const BI_VISUALIZER_PAGES_KEY = 'sigi.bi.visualizer.pages.v2';
const BI_VISUALIZER_ACTIVE_PAGE_KEY = 'sigi.bi.visualizer.active-page.v1';

const availableFilters: Array<{ key: FilterKey; title: string; description: string }> = [
  { key: 'preset', title: 'Vista', description: 'Ejecutivo, operaciones o mapa.' },
  { key: 'institution', title: 'Institución', description: 'Filtra por institución responsable.' },
  { key: 'status', title: 'Estado', description: 'Filtra por estado del proyecto.' },
];

const assignableFieldOptions = [
  { key: 'projects.status', label: 'Estado del proyecto' },
  { key: 'projects.institutionName', label: 'Institución responsable' },
  { key: 'projects.theme', label: 'Tema / actividad' },
  { key: 'projects.visibility', label: 'Visibilidad' },
] as const;

const measureOptions: Array<{ key: MeasureKey; label: string }> = [
  { key: 'count_projects', label: 'Conteo de proyectos' },
  { key: 'sum_area_ha', label: 'Suma de hectáreas' },
];

const workspacePages: Array<{
  key: ViewPreset;
  title: string;
  description: string;
}> = [
  {
    key: 'executive',
    title: 'Ejecutivo',
    description: 'KPIs, distribución y detalle para toma de decisiones.',
  },
  {
    key: 'operations',
    title: 'Operativa',
    description: 'Estados, carga institucional y seguimiento.',
  },
  {
    key: 'territorial',
    title: 'Mapa',
    description: 'Cobertura, capas y enfoque geoespacial.',
  },
];

const widgetCatalog: Record<
  WidgetKey,
  {
    title: string;
    description: string;
    defaultColor: string;
    chartOptions?: ChartVariant[];
  }
> = {
  summary: {
    title: 'Resumen combinado',
    description: 'Publicaciones, alertas y cobertura.',
    defaultColor: '#14532d',
  },
  kpis: {
    title: 'KPIs principales',
    description: 'Tarjetas ejecutivas de alto nivel.',
    defaultColor: '#14532d',
  },
  'status-chart': {
    title: 'Estado de proyectos',
    description: 'Distribución y mezcla por estado.',
    defaultColor: '#14532d',
    chartOptions: ['bar', 'column', 'stacked', 'donut', 'pie', 'pareto'],
  },
  'institution-chart': {
    title: 'Carga por institución',
    description: 'Comparativo de ejecución institucional.',
    defaultColor: '#0f766e',
    chartOptions: ['bar', 'column', 'lollipop', 'donut', 'pie', 'pareto'],
  },
  'theme-chart': {
    title: 'Temas dominantes',
    description: 'Agrupación temática del portafolio.',
    defaultColor: '#1d4ed8',
    chartOptions: ['bar', 'column', 'lollipop', 'donut', 'pie', 'pareto'],
  },
  'area-analysis': {
    title: 'Distribución de área',
    description: 'Histograma y resumen estadístico de hectáreas.',
    defaultColor: '#7c3aed',
    chartOptions: ['histogram', 'boxplot'],
  },
  'project-table': {
    title: 'Detalle de proyectos',
    description: 'Tabla operativa del subconjunto filtrado.',
    defaultColor: '#334155',
  },
  narrative: {
    title: 'Narrativa automática',
    description: 'Resumen textual contextual.',
    defaultColor: '#7c3aed',
  },
  bridges: {
    title: 'Puentes del análisis',
    description: 'Accesos a módulos relacionados.',
    defaultColor: '#334155',
  },
};

const defaultBuilderConfig: BuilderConfig = {
  filters: ['preset', 'institution', 'status'],
  widgets: ['kpis', 'status-chart', 'institution-chart', 'theme-chart', 'summary', 'project-table'],
  widgetSettings: {
    kpis: { size: 'full' },
    summary: { size: 'half' },
    'status-chart': { chartVariant: 'stacked', size: 'half' },
    'institution-chart': { chartVariant: 'lollipop', size: 'half' },
    'theme-chart': { chartVariant: 'bar', size: 'half' },
    'project-table': { size: 'full' },
  },
};

const defaultPageSnapshots: PageSnapshotMap = {
  executive: {
    builderConfig: {
      filters: ['preset', 'institution', 'status'],
      widgets: ['kpis', 'status-chart', 'institution-chart', 'summary', 'project-table'],
      widgetSettings: {
        kpis: { size: 'full' },
        'status-chart': { chartVariant: 'stacked', size: 'half', fieldKey: 'projects.status' },
        'institution-chart': { chartVariant: 'lollipop', size: 'half', fieldKey: 'projects.institutionName' },
        summary: { size: 'full' },
        'project-table': { size: 'full' },
      },
    },
    institutionFilter: 'all',
    statusFilter: 'all',
    drillFilter: null,
  },
  operations: {
    builderConfig: {
      filters: ['preset', 'institution', 'status'],
      widgets: ['kpis', 'status-chart', 'institution-chart', 'project-table', 'summary'],
      widgetSettings: {
        kpis: { size: 'full' },
        'status-chart': { chartVariant: 'bar', size: 'half', fieldKey: 'projects.status' },
        'institution-chart': { chartVariant: 'lollipop', size: 'half', fieldKey: 'projects.institutionName' },
        'project-table': { size: 'full' },
        summary: { size: 'full' },
      },
    },
    institutionFilter: 'all',
    statusFilter: 'all',
    drillFilter: null,
  },
  territorial: {
    builderConfig: {
      filters: ['preset', 'institution', 'status'],
      widgets: ['kpis', 'theme-chart', 'summary', 'project-table'],
      widgetSettings: {
        kpis: { size: 'full' },
        'theme-chart': { chartVariant: 'bar', size: 'full', fieldKey: 'projects.theme' },
        summary: { size: 'full' },
        'project-table': { size: 'full' },
      },
    },
    institutionFilter: 'all',
    statusFilter: 'all',
    drillFilter: null,
  },
};

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

function presetTone(preset: ViewPreset) {
  if (preset === 'executive') {
    return 'good' as const;
  }
  if (preset === 'operations') {
    return 'warn' as const;
  }
  return 'neutral' as const;
}

function normalizeWidgetSize(value: unknown): WidgetSize | undefined {
  if (value === 'full' || value === 'half' || value === 'third') {
    return value;
  }
  return undefined;
}

function widgetSpan(size: WidgetSize | undefined) {
  if (size === 'third') {
    return 'span 4';
  }
  if (size === 'half') {
    return 'span 6';
  }
  return 'span 12';
}

function widgetSizeLabel(size: WidgetSize | undefined) {
  if (size === 'third') {
    return 'Compacto';
  }
  if (size === 'half') {
    return 'Medio ancho';
  }
  return 'Ancho completo';
}

function chartVariantLabel(variant: ChartVariant) {
  const labels: Record<ChartVariant, string> = {
    bar: 'Barras horizontales',
    column: 'Columnas',
    lollipop: 'Lollipop',
    stacked: 'Barra apilada',
    donut: 'Dona',
    pie: 'Pastel',
    pareto: 'Pareto acumulado',
    histogram: 'Histograma',
    boxplot: 'Caja y bigotes',
  };
  return labels[variant];
}

function chartVariantIcon(variant: ChartVariant) {
  const icons: Record<ChartVariant, string> = {
    bar: '▰',
    column: '▥',
    lollipop: '⌾',
    stacked: '▤',
    donut: '◉',
    pie: '◕',
    pareto: '⌁',
    histogram: '▥',
    boxplot: '⊢▣⊣',
  };
  return icons[variant];
}

function widgetIcon(widgetKey: WidgetKey) {
  const icons: Record<WidgetKey, string> = {
    summary: '▦',
    kpis: '123',
    'status-chart': '▰',
    'institution-chart': '◉',
    'theme-chart': '▥',
    'area-analysis': '⌁',
    'project-table': '▤',
    narrative: '¶',
    bridges: '⇄',
  };
  return icons[widgetKey];
}

function loadBuilderConfig() {
  if (typeof window === 'undefined') {
    return defaultBuilderConfig;
  }

  try {
    const raw = window.localStorage.getItem(BI_VISUALIZER_STORAGE_KEY);
    if (!raw) {
      return defaultBuilderConfig;
    }
    const parsed = JSON.parse(raw) as Partial<BuilderConfig>;
    return loadBuilderConfigFromSnapshot(parsed);
  } catch {
    return defaultBuilderConfig;
  }
}

function saveBuilderConfig(config: BuilderConfig) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(BI_VISUALIZER_STORAGE_KEY, JSON.stringify(config));
}

function loadBuilderMode() {
  if (typeof window === 'undefined') {
    return 'edit' as BuilderMode;
  }
  const raw = window.localStorage.getItem(BI_VISUALIZER_MODE_KEY);
  return raw === 'edit' ? 'edit' : 'read';
}

function saveBuilderMode(mode: BuilderMode) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(BI_VISUALIZER_MODE_KEY, mode);
}

function loadActivePage(): ViewPreset {
  if (typeof window === 'undefined') return 'executive';
  const value = window.localStorage.getItem(BI_VISUALIZER_ACTIVE_PAGE_KEY);
  return value === 'operations' || value === 'territorial' ? value : 'executive';
}

function saveActivePage(preset: ViewPreset) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BI_VISUALIZER_ACTIVE_PAGE_KEY, preset);
  }
}

function cloneBuilderConfig(config: BuilderConfig): BuilderConfig {
  return {
    filters: [...config.filters],
    widgets: [...config.widgets],
    widgetSettings: JSON.parse(JSON.stringify(config.widgetSettings)) as WidgetSettings,
  };
}

function defaultPageSnapshotMap(): PageSnapshotMap {
  return {
    executive: {
      ...defaultPageSnapshots.executive,
      builderConfig: cloneBuilderConfig(defaultPageSnapshots.executive.builderConfig),
    },
    operations: {
      ...defaultPageSnapshots.operations,
      builderConfig: cloneBuilderConfig(defaultPageSnapshots.operations.builderConfig),
    },
    territorial: {
      ...defaultPageSnapshots.territorial,
      builderConfig: cloneBuilderConfig(defaultPageSnapshots.territorial.builderConfig),
    },
  };
}

function loadPageSnapshotMap() {
  if (typeof window === 'undefined') {
    return defaultPageSnapshotMap();
  }

  try {
    const raw = window.localStorage.getItem(BI_VISUALIZER_PAGES_KEY);
    if (!raw) {
      return defaultPageSnapshotMap();
    }
    const parsed = JSON.parse(raw) as Partial<PageSnapshotMap>;
    const fallback = defaultPageSnapshotMap();
    return {
      executive: parsed.executive
        ? {
            ...fallback.executive,
            ...parsed.executive,
            builderConfig: parsed.executive.builderConfig
              ? loadBuilderConfigFromSnapshot(parsed.executive.builderConfig)
              : fallback.executive.builderConfig,
          }
        : fallback.executive,
      operations: parsed.operations
        ? {
            ...fallback.operations,
            ...parsed.operations,
            builderConfig: parsed.operations.builderConfig
              ? loadBuilderConfigFromSnapshot(parsed.operations.builderConfig)
              : fallback.operations.builderConfig,
          }
        : fallback.operations,
      territorial: parsed.territorial
        ? {
            ...fallback.territorial,
            ...parsed.territorial,
            builderConfig: parsed.territorial.builderConfig
              ? loadBuilderConfigFromSnapshot(parsed.territorial.builderConfig)
              : fallback.territorial.builderConfig,
          }
        : fallback.territorial,
    };
  } catch {
    return defaultPageSnapshotMap();
  }
}

function loadBuilderConfigFromSnapshot(parsed: Partial<BuilderConfig>) {
  return {
    filters: Array.isArray(parsed.filters) ? parsed.filters : defaultBuilderConfig.filters,
    widgets: Array.isArray(parsed.widgets) ? parsed.widgets : defaultBuilderConfig.widgets,
    widgetSettings:
      parsed.widgetSettings && typeof parsed.widgetSettings === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.widgetSettings).map(([widgetKey, settings]) => [
              widgetKey,
              {
                ...(settings as Record<string, unknown>),
                size: normalizeWidgetSize((settings as Record<string, unknown>)?.size),
              },
            ]),
          )
        : defaultBuilderConfig.widgetSettings,
  };
}

function savePageSnapshotMap(pageSnapshots: PageSnapshotMap) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(BI_VISUALIZER_PAGES_KEY, JSON.stringify(pageSnapshots));
}

export function BiVisualizerPage() {
  const { globalViewScope, currentUser } = useEgi();
  const canReadProjects = hasPermission(currentUser, 'projects.read');
  const canReadInstitutions = hasPermission(currentUser, 'institutions.read');
  const canReadConnectors = hasPermission(currentUser, 'connectors.read');
  const canReadPublications = hasPermission(currentUser, 'publications.read');
  const canReadIncidents = hasPermission(currentUser, 'incidents.read');
  const canConfigureDashboard = canConfigureModule(currentUser, ['reports.config.manage']);
  const [mode, setMode] = useState<BuilderMode>(() => loadBuilderMode());
  const [builderPane, setBuilderPane] = useState<BuilderPane>('visuals');
  const [preset, setPreset] = useState<ViewPreset>(() => loadActivePage());
  const [pageSnapshots, setPageSnapshots] = useState<PageSnapshotMap>(() => loadPageSnapshotMap());
  const [institutionFilter, setInstitutionFilter] = useState<string>(() => loadPageSnapshotMap()[preset].institutionFilter);
  const [statusFilter, setStatusFilter] = useState<string>(() => loadPageSnapshotMap()[preset].statusFilter);
  const [builderConfig, setBuilderConfig] = useState<BuilderConfig>(() => loadPageSnapshotMap()[preset].builderConfig);
  const [drillFilter, setDrillFilter] = useState<DrillFilter | null>(() => loadPageSnapshotMap()[preset].drillFilter);
  const [draggingFilter, setDraggingFilter] = useState<FilterKey | null>(null);
  const [draggingWidget, setDraggingWidget] = useState<WidgetKey | null>(null);
  const [draggingFieldKey, setDraggingFieldKey] = useState<string | null>(null);
  const [selectedWidgetKey, setSelectedWidgetKey] = useState<WidgetKey | null>('summary');
  const [selectedFilterKey, setSelectedFilterKey] = useState<FilterKey | null>(null);
  const [builderNotice, setBuilderNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([]);
  const [geoBi, setGeoBi] = useState<any | null>(null);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [publications, setPublications] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const dashboardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (
      !canReadProjects &&
      !canReadInstitutions &&
      !canReadConnectors &&
      !canReadPublications &&
      !canReadIncidents
    ) {
      setProjects([]);
      setInstitutions([]);
      setGeoBi(null);
      setConnectors([]);
      setPublications([]);
      setIncidents([]);
      setLoading(false);
      return;
    }

    Promise.all([
      canReadProjects ? workspaceApi.getProjects() : Promise.resolve({ data: { projects: [] } }),
      canReadInstitutions ? workspaceApi.getInstitutions() : Promise.resolve({ data: { institutions: [] } }),
      canReadConnectors ? workspaceApi.getGeoBiModule() : Promise.resolve({ data: { module: null } }),
      canReadConnectors ? workspaceApi.getConnectors() : Promise.resolve({ data: { connectors: [] } }),
      canReadPublications ? workspaceApi.getPublications(globalViewScope) : Promise.resolve({ data: { publications: [] } }),
      canReadIncidents ? workspaceApi.getIncidents(globalViewScope) : Promise.resolve({ data: { incidents: [] } }),
    ])
      .then(
        ([
          projectsResponse,
          institutionsResponse,
          geoBiResponse,
          connectorsResponse,
          publicationsResponse,
          incidentsResponse,
        ]) => {
          setProjects(projectsResponse.data.projects as ProjectItem[]);
          setInstitutions(
            institutionsResponse.data.institutions.map((item) => ({
              id: item.id,
              name: item.name,
            })),
          );
          setGeoBi(geoBiResponse.data.module);
          setConnectors(connectorsResponse.data.connectors);
          setPublications(publicationsResponse.data.publications);
          setIncidents(incidentsResponse.data.incidents);
          setLoading(false);
        },
      )
      .catch((reason: Error) => {
        setError(reason.message);
        setLoading(false);
      });
  }, [canReadConnectors, canReadIncidents, canReadInstitutions, canReadProjects, canReadPublications, globalViewScope]);

  useEffect(() => {
    saveBuilderConfig(builderConfig);
  }, [builderConfig]);

  useEffect(() => {
    setPageSnapshots((current) => ({
      ...current,
      [preset]: {
        builderConfig: cloneBuilderConfig(builderConfig),
        institutionFilter,
        statusFilter,
        drillFilter,
      },
    }));
  }, [builderConfig, drillFilter, institutionFilter, preset, statusFilter]);

  useEffect(() => {
    savePageSnapshotMap(pageSnapshots);
  }, [pageSnapshots]);

  useEffect(() => {
    saveBuilderMode(mode);
  }, [mode]);

  useEffect(() => {
    saveActivePage(preset);
  }, [preset]);

  useEffect(() => {
    if (!canConfigureDashboard && mode === 'edit') {
      setMode('read');
    }
  }, [canConfigureDashboard, mode]);

  useEffect(() => {
    const finishPrint = () => document.body.classList.remove('bi-print-dashboard');
    window.addEventListener('afterprint', finishPrint);
    return () => {
      window.removeEventListener('afterprint', finishPrint);
      finishPrint();
    };
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (institutionFilter !== 'all' && project.institutionId !== institutionFilter) {
        return false;
      }
      if (statusFilter !== 'all' && project.status !== statusFilter) {
        return false;
      }
      if (drillFilter && getProjectFieldValue(project, drillFilter.fieldKey) !== drillFilter.value) {
        return false;
      }
      return true;
    });
  }, [drillFilter, institutionFilter, projects, statusFilter]);

  const totalAreaHa = filteredProjects.reduce(
    (sum, project) => sum + (Number(project.areaHa ?? 0) || 0),
    0,
  );

  const projectsByStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of filteredProjects) {
      const key = project.status || 'sin estado';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredProjects]);

  const projectsByInstitution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of filteredProjects) {
      const key = project.institutionName?.trim() || 'Institución no visible';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filteredProjects]);

  const topThemes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of filteredProjects) {
      const key = project.theme?.trim() || 'Sin tema';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filteredProjects]);

  const fieldCatalog = useMemo(() => {
    return [
      {
        group: 'Portafolio SIGI',
        fields: [
          { key: 'projects.title', label: `Título del proyecto (${filteredProjects.length})`, assignable: false },
          { key: 'projects.status', label: 'Estado del proyecto', assignable: true },
          { key: 'projects.theme', label: 'Tema / actividad', assignable: true },
          { key: 'projects.areaHa', label: 'Área (ha)', assignable: false },
          { key: 'projects.visibility', label: 'Visibilidad', assignable: true },
        ],
      },
      {
        group: 'Instituciones',
        fields: [
          { key: 'institutions.name', label: `Instituciones (${institutions.length})`, assignable: false },
          { key: 'projects.institutionName', label: 'Institución responsable', assignable: true },
          { key: 'projects.institutionId', label: 'Id de institución', assignable: false },
        ],
      },
      {
        group: 'Geo/BI',
        fields: [
          { key: 'geobi.layers', label: `Capas Geo/BI (${geoBi?.summary?.layers ?? 0})`, assignable: false },
          {
            key: 'geobi.coverage',
            label: `Cobertura territorial (${geoBi?.coverage?.coveredTerritories ?? 0})`,
            assignable: false,
          },
          { key: 'geobi.qualityScore', label: 'Calidad Geo/BI', assignable: false },
        ],
      },
      {
        group: 'Operación',
        fields: [
          { key: 'connectors.status', label: `Conectores (${connectors.length})`, assignable: false },
          { key: 'publications.status', label: `Publicaciones (${publications.length})`, assignable: false },
          { key: 'incidents.status', label: `Incidentes (${incidents.length})`, assignable: false },
        ],
      },
    ];
  }, [connectors.length, filteredProjects.length, geoBi, incidents.length, institutions.length, publications.length]);

  const openIncidents = incidents.filter((incident) => incident.status !== 'resolved').length;
  const resolvedIncidents = incidents.filter((incident) => incident.status === 'resolved').length;
  const activeConnectors = connectors.filter((connector) => connector.status === 'active').length;
  const publishedOutputs = publications.filter((publication) => publication.status === 'published').length;
  const qualityScore = geoBi?.quality?.score ?? geoBi?.summary?.qualityScore ?? 0;
  const activeInstitutionLabel =
    institutionFilter === 'all'
      ? 'Todas las instituciones'
      : institutions.find((item) => item.id === institutionFilter)?.name ?? 'Institución filtrada';
  const dominantStatus = projectsByStatus[0]?.[0] ?? 'sin estado';
  const dominantStatusValue = projectsByStatus[0]?.[1] ?? 0;
  const territorialCoverage = geoBi?.coverage?.coveredTerritories ?? 0;
  const visibleLayers = geoBi?.summary?.layers ?? 0;
  const executiveSignal = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        qualityScore * 0.5 +
          (publishedOutputs > 0 ? 20 : 0) +
          (activeConnectors > 0 ? 15 : 0) -
          openIncidents * 3,
      ),
    ),
  );

  const selectedWidgetSettings = selectedWidgetKey
    ? builderConfig.widgetSettings[selectedWidgetKey] ?? {}
    : null;

  function addFilter(filterKey: FilterKey) {
    const alreadyAdded = builderConfig.filters.includes(filterKey);
    setBuilderConfig((current) => ({
      ...current,
      filters: current.filters.includes(filterKey) ? current.filters : [...current.filters, filterKey],
    }));
    setSelectedFilterKey(filterKey);
    setSelectedWidgetKey(null);
    setBuilderPane('format');
    announceBuilderChange(
      alreadyAdded
        ? `${availableFilters.find((item) => item.key === filterKey)?.title ?? 'Filtro'} ya estaba agregado; lo seleccionamos.`
        : `${availableFilters.find((item) => item.key === filterKey)?.title ?? 'Filtro'} agregado al tablero.`,
    );
  }

  function removeFilter(filterKey: FilterKey) {
    setBuilderConfig((current) => ({
      ...current,
      filters: current.filters.filter((item) => item !== filterKey),
    }));
    if (selectedFilterKey === filterKey) {
      setSelectedFilterKey(null);
    }
  }

  function addWidget(widgetKey: WidgetKey) {
    const alreadyAdded = builderConfig.widgets.includes(widgetKey);
    setBuilderConfig((current) => ({
      ...current,
      widgets: current.widgets.includes(widgetKey) ? current.widgets : [...current.widgets, widgetKey],
    }));
    setSelectedWidgetKey(widgetKey);
    setSelectedFilterKey(null);
    setBuilderPane('format');
    announceBuilderChange(
      alreadyAdded
        ? `${widgetCatalog[widgetKey].title} ya estaba agregado; lo seleccionamos.`
        : `${widgetCatalog[widgetKey].title} agregado al tablero.`,
    );
    window.setTimeout(() => {
      document.querySelector(`[data-bi-widget="${widgetKey}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 50);
  }

  function announceBuilderChange(message: string) {
    setBuilderNotice(message);
    window.setTimeout(() => {
      setBuilderNotice((current) => (current === message ? null : current));
    }, 3500);
  }

  function removeWidget(widgetKey: WidgetKey) {
    setBuilderConfig((current) => ({
      ...current,
      widgets: current.widgets.filter((item) => item !== widgetKey),
    }));
    if (selectedWidgetKey === widgetKey) {
      setSelectedWidgetKey(null);
    }
  }

  function moveWidget(widgetKey: WidgetKey, targetWidgetKey: WidgetKey) {
    if (widgetKey === targetWidgetKey) {
      return;
    }
    setBuilderConfig((current) => {
      const sourceIndex = current.widgets.indexOf(widgetKey);
      const targetIndex = current.widgets.indexOf(targetWidgetKey);
      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }
      const next = [...current.widgets];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, widgetKey);
      return { ...current, widgets: next };
    });
  }

  function updateWidgetSettings(widgetKey: WidgetKey, patch: Partial<NonNullable<WidgetSettings[WidgetKey]>>) {
    setBuilderConfig((current) => ({
      ...current,
      widgetSettings: {
        ...current.widgetSettings,
        [widgetKey]: {
          ...current.widgetSettings[widgetKey],
          ...patch,
        },
      },
    }));
  }

  function resetBuilder() {
    const snapshot = defaultPageSnapshots[preset];
    setBuilderConfig(cloneBuilderConfig(snapshot.builderConfig));
    setInstitutionFilter(snapshot.institutionFilter);
    setStatusFilter(snapshot.statusFilter);
    setDrillFilter(snapshot.drillFilter);
    setSelectedWidgetKey(snapshot.builderConfig.widgets[0] ?? 'summary');
    setSelectedFilterKey(null);
  }

  function resetWidgetSettings(widgetKey: WidgetKey) {
    setBuilderConfig((current) => {
      const nextSettings = { ...current.widgetSettings };
      delete nextSettings[widgetKey];
      return {
        ...current,
        widgetSettings: nextSettings,
      };
    });
  }

  function widgetTitle(widgetKey: WidgetKey) {
    return builderConfig.widgetSettings[widgetKey]?.title?.trim() || widgetCatalog[widgetKey].title;
  }

  function widgetColor(widgetKey: WidgetKey) {
    return builderConfig.widgetSettings[widgetKey]?.accentColor?.trim() || widgetCatalog[widgetKey].defaultColor;
  }

  function widgetVariant(widgetKey: WidgetKey) {
    return builderConfig.widgetSettings[widgetKey]?.chartVariant;
  }

  function widgetSize(widgetKey: WidgetKey) {
    return builderConfig.widgetSettings[widgetKey]?.size ?? defaultBuilderConfig.widgetSettings[widgetKey]?.size;
  }

  function widgetFieldKey(widgetKey: WidgetKey) {
    return builderConfig.widgetSettings[widgetKey]?.fieldKey ?? defaultFieldForWidget(widgetKey);
  }

  function widgetMeasureKey(widgetKey: WidgetKey) {
    return builderConfig.widgetSettings[widgetKey]?.measureKey ?? defaultMeasureForWidget(widgetKey);
  }

  function activateWorkspacePage(nextPreset: ViewPreset) {
    const nextSnapshot = pageSnapshots[nextPreset];
    setPreset(nextPreset);
    setBuilderConfig(cloneBuilderConfig(nextSnapshot.builderConfig));
    setInstitutionFilter(nextSnapshot.institutionFilter);
    setStatusFilter(nextSnapshot.statusFilter);
    setDrillFilter(nextSnapshot.drillFilter);
    setSelectedFilterKey('preset');
    setSelectedWidgetKey(null);
  }

  function publishCurrentDashboard() {
    const currentSnapshot: PageSnapshot = {
      builderConfig: cloneBuilderConfig(builderConfig),
      institutionFilter,
      statusFilter,
      drillFilter,
    };
    const nextSnapshots = { ...pageSnapshots, [preset]: currentSnapshot };
    setPageSnapshots(nextSnapshots);
    saveBuilderConfig(currentSnapshot.builderConfig);
    savePageSnapshotMap(nextSnapshots);
    setMode('read');
  }

  function printDashboard() {
    publishCurrentDashboard();
    document.body.classList.add('bi-print-dashboard');
    window.setTimeout(() => window.print(), 120);
  }

  function getProjectFieldValue(project: ProjectItem, fieldKey: string) {
    if (fieldKey === 'projects.status') {
      return project.status || 'sin estado';
    }
    if (fieldKey === 'projects.institutionName') {
      return project.institutionName?.trim() || 'Institución no visible';
    }
    if (fieldKey === 'projects.theme') {
      return project.theme?.trim() || 'Sin tema';
    }
    if (fieldKey === 'projects.visibility') {
      return project.visibility?.trim() || 'Sin visibilidad';
    }
    return 'Sin valor';
  }

  function applyCrossFilter(fieldKey: string, value: string) {
    setDrillFilter((current) =>
      current?.fieldKey === fieldKey && current.value === value ? null : { fieldKey, value },
    );
  }

  function aggregateProjectsByField(fieldKey: string, measureKey: MeasureKey, limit?: number) {
    const counts = new Map<string, number>();
    for (const project of filteredProjects) {
      const key = getProjectFieldValue(project, fieldKey);
      const increment =
        measureKey === 'sum_area_ha' ? Number(project.areaHa ?? 0) || 0 : 1;
      counts.set(key, (counts.get(key) ?? 0) + increment);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }

  function assignFieldToWidget(widgetKey: WidgetKey, fieldKey: string) {
    if (!assignableFieldOptions.some((option) => option.key === fieldKey)) {
      return;
    }
    updateWidgetSettings(widgetKey, { fieldKey });
    setSelectedWidgetKey(widgetKey);
    setSelectedFilterKey(null);
  }

  function renderFilterControl(filterKey: FilterKey, compact = false) {
    const spacing = compact ? 4 : 6;
    const fieldStyle = compact
      ? {
          ...selectStyle(),
          padding: '8px 10px',
          fontSize: 13,
        }
      : selectStyle();

    if (filterKey === 'preset') {
      return (
        <label key={filterKey} style={{ display: 'grid', gap: spacing }}>
          <span style={{ color: '#5f6b7a', fontSize: 13 }}>Vista</span>
          <select
            value={preset}
            onChange={(event) => activateWorkspacePage(event.target.value as ViewPreset)}
            style={fieldStyle}
          >
            <option value="executive">Ejecutivo</option>
            <option value="operations">Operaciones</option>
            <option value="territorial">Territorial</option>
          </select>
        </label>
      );
    }

    if (filterKey === 'institution') {
      return (
        <label key={filterKey} style={{ display: 'grid', gap: spacing }}>
          <span style={{ color: '#5f6b7a', fontSize: 13 }}>Institución</span>
          <select
            value={institutionFilter}
            onChange={(event) => setInstitutionFilter(event.target.value)}
            style={fieldStyle}
          >
            <option value="all">Todas</option>
            {institutions.map((institution) => (
              <option key={institution.id} value={institution.id}>
                {institution.name}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label key={filterKey} style={{ display: 'grid', gap: spacing }}>
        <span style={{ color: '#5f6b7a', fontSize: 13 }}>Estado de proyecto</span>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={fieldStyle}
        >
          <option value="all">Todos</option>
          {Array.from(new Set(projects.map((project) => project.status)))
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
        </select>
      </label>
    );
  }

  function renderWidget(widgetKey: WidgetKey) {
    const title = widgetTitle(widgetKey);
    const accentColor = widgetColor(widgetKey);
    const variant = widgetVariant(widgetKey);
    const fieldKey = widgetFieldKey(widgetKey);
    const measureKey = widgetMeasureKey(widgetKey);
    const widgetData =
      widgetKey === 'theme-chart'
        ? aggregateProjectsByField(fieldKey, measureKey, 6)
        : widgetKey === 'institution-chart'
          ? aggregateProjectsByField(fieldKey, measureKey, 8)
          : widgetKey === 'status-chart'
            ? aggregateProjectsByField(fieldKey, measureKey)
            : [];

    if (widgetKey === 'kpis') {
      return (
        <MetricGrid>
          <MetricCard
            label="Proyectos visibles"
            value={String(filteredProjects.length)}
            hint="Resultado del filtro actual sobre el portafolio SIGI."
          />
          <MetricCard
            label="Área total"
            value={`${totalAreaHa.toLocaleString('es-CR', { maximumFractionDigits: 1 })} ha`}
            hint="Superficie acumulada de los proyectos filtrados."
          />
          <MetricCard
            label="Conectores activos"
            value={String(activeConnectors)}
            hint="Canales técnicos operativos dentro del ecosistema."
          />
          <MetricCard
            label="Calidad Geo/BI"
            value={`${qualityScore}%`}
            hint="Señal consolidada de calidad geoespacial y validación."
          />
        </MetricGrid>
      );
    }

    if (widgetKey === 'summary') {
      return (
        <Panel
          title={title}
          subtitle="Lectura ejecutiva con los componentes más importantes del ciclo."
          action={<StatPill tone="good">Vista unificada</StatPill>}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              }}
            >
              <MiniInsightCard label="Publicaciones" value={String(publishedOutputs)} tone="green" />
              <MiniInsightCard label="Alertas abiertas" value={String(openIncidents)} tone="amber" />
              <MiniInsightCard label="Capas Geo/BI" value={String(visibleLayers)} tone="blue" />
              <MiniInsightCard label="Territorios" value={String(territorialCoverage)} tone="slate" />
            </div>
            <DetailList
              items={[
                { label: 'Institución activa', value: activeInstitutionLabel },
                { label: 'Estado dominante', value: `${dominantStatus} (${dominantStatusValue})` },
                { label: 'Señal ejecutiva', value: `${executiveSignal}%` },
                {
                  label: 'Área filtrada',
                  value: `${totalAreaHa.toLocaleString('es-CR', { maximumFractionDigits: 1 })} ha`,
                },
              ]}
            />
          </div>
        </Panel>
      );
    }

    if (widgetKey === 'status-chart') {
      return (
        <Panel
          title={title}
          subtitle={`Composición visual del portafolio actual por ${fieldLabel(fieldKey).toLowerCase()}.`}
          action={<StatPill tone="neutral">{widgetData.length} grupos</StatPill>}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={heroChipStyle}>Campo: {fieldLabel(fieldKey)}</span>
              <span style={heroChipStyle}>Medida: {measureLabel(measureKey)}</span>
            </div>
            <CategoryVisualization
              data={widgetData}
              variant={variant ?? 'bar'}
              accentColor={accentColor}
              activeValue={drillFilter?.fieldKey === fieldKey ? drillFilter.value : null}
              onSelect={(label) => applyCrossFilter(fieldKey, label)}
            />
          </div>
        </Panel>
      );
    }

    if (widgetKey === 'institution-chart') {
      return (
        <Panel
          title={title}
          subtitle={`Comparativo estilo BI usando ${fieldLabel(fieldKey).toLowerCase()}.`}
          action={<StatPill tone="warn">Top {widgetData.length}</StatPill>}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={heroChipStyle}>Campo: {fieldLabel(fieldKey)}</span>
              <span style={heroChipStyle}>Medida: {measureLabel(measureKey)}</span>
            </div>
            <CategoryVisualization
              data={widgetData}
              variant={variant ?? 'lollipop'}
              accentColor={accentColor}
              activeValue={drillFilter?.fieldKey === fieldKey ? drillFilter.value : null}
              onSelect={(label) => applyCrossFilter(fieldKey, label)}
            />
          </div>
        </Panel>
      );
    }

    if (widgetKey === 'theme-chart') {
      return (
        <Panel
          title={title}
          subtitle={`Agrupación transversal usando ${fieldLabel(fieldKey).toLowerCase()}.`}
          action={<StatPill tone="neutral">Top {widgetData.length}</StatPill>}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={heroChipStyle}>Campo: {fieldLabel(fieldKey)}</span>
              <span style={heroChipStyle}>Medida: {measureLabel(measureKey)}</span>
            </div>
            <CategoryVisualization
              data={widgetData}
              variant={variant ?? 'bar'}
              accentColor={accentColor}
              activeValue={drillFilter?.fieldKey === fieldKey ? drillFilter.value : null}
              onSelect={(label) => applyCrossFilter(fieldKey, label)}
            />
          </div>
        </Panel>
      );
    }

    if (widgetKey === 'area-analysis') {
      return (
        <AreaDistribution
          title={title}
          values={filteredProjects.map((project) => Number(project.areaHa ?? 0)).filter((value) => value > 0)}
          variant={variant === 'boxplot' ? 'boxplot' : 'histogram'}
          accentColor={accentColor}
        />
      );
    }

    if (widgetKey === 'project-table') {
      return (
        <section className="bi-detail-table" aria-label={title}>
          <header>
            <div><strong>{title}</strong><span>{filteredProjects.length} proyectos en el contexto actual</span></div>
            <a href="/projects">Abrir cartera</a>
          </header>
          <div>
            <table>
              <thead><tr><th>Proyecto</th><th>Institución</th><th>Estado</th><th>Área</th></tr></thead>
              <tbody>
                {filteredProjects.slice(0, 12).map((project) => (
                  <tr key={project.id}>
                    <td><a href={`/projects/${encodeURIComponent(project.id)}`}>{project.title}</a></td>
                    <td>{project.institutionName || 'Sin institución visible'}</td>
                    <td><span className="bi-status"><i />{project.status || 'Sin estado'}</span></td>
                    <td>{Number(project.areaHa ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 1 })} ha</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredProjects.length > 12 ? <small>Se muestran 12 de {filteredProjects.length}. Usa la cartera para revisar el detalle completo.</small> : null}
        </section>
      );
    }

    if (widgetKey === 'narrative') {
      return (
        <Panel
          title={title}
          subtitle="Lectura analítica rápida para exponer el estado actual sin navegar módulo por módulo."
          action={<StatPill tone={presetTone(preset)}>Preset {preset}</StatPill>}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <MessageBlock>
              {preset === 'executive'
                ? `La vista ejecutiva muestra ${filteredProjects.length} proyectos filtrados, ${publishedOutputs} publicaciones activas y ${openIncidents} alertas abiertas, con una señal de calidad Geo/BI de ${qualityScore}%.`
                : preset === 'operations'
                  ? `La vista de operaciones prioriza ${activeConnectors} conectores activos, ${projectsByStatus.length} estados de proyecto visibles y la carga institucional por volumen de ejecución.`
                  : `La vista de mapa combina ${visibleLayers} capas Geo/BI, ${territorialCoverage} lugares cubiertos y ${totalAreaHa.toLocaleString('es-CR', { maximumFractionDigits: 1 })} ha filtradas para lectura espacial.`}
            </MessageBlock>
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              }}
            >
              <DonutStat label="Calidad" value={qualityScore} suffix="%" color={accentColor} />
              <DonutStat
                label="Publicación"
                value={publishedOutputs}
                total={Math.max(publications.length, 1)}
                suffix={`/${publications.length || 0}`}
                color="#1d4ed8"
              />
              <DonutStat
                label="Incidentes resueltos"
                value={resolvedIncidents}
                total={Math.max(incidents.length, 1)}
                suffix={`/${incidents.length || 0}`}
                color="#b45309"
              />
            </div>
          </div>
        </Panel>
      );
    }

    return (
      <Panel
        title={title}
        subtitle="Accesos sugeridos para seguir explorando desde esta vista BI."
        action={<StatPill tone="good">Integrado</StatPill>}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href="/admin/geobi" style={linkChipStyle}>
            Abrir Geo/BI
          </a>
          <a href="/projects" style={linkChipStyle}>
            Abrir Proyectos
          </a>
          <a href="/admin/connectors" style={linkChipStyle}>
            Abrir Conectores
          </a>
          <a href="/admin/publications" style={linkChipStyle}>
            Abrir Publicaciones
          </a>
        </div>
      </Panel>
    );
  }

  function openPresentation() {
    publishCurrentDashboard();
    window.setTimeout(() => {
      void dashboardRef.current?.requestFullscreen?.();
    }, 0);
  }

  return (
    <section>

      {!canReadProjects &&
      !canReadInstitutions &&
      !canReadConnectors &&
      !canReadPublications &&
      !canReadIncidents ? (
        <MessageBlock tone="danger" icon="alert">
          Tu perfil no tiene permisos para consultar el tablero BI del EGI activo.
        </MessageBlock>
      ) : null}
      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {loading ? <MessageBlock>Cargando el módulo BI con información combinada del SIGI...</MessageBlock> : null}

      {!loading && !error ? (
        <>
          <header className="bi-command-bar">
            <div className="bi-command-bar__identity">
              <span>Inteligencia institucional</span>
              <h1>Visualizador BI</h1>
              <p>{workspacePages.find((page) => page.key === preset)?.description}</p>
            </div>
            <div className="bi-command-bar__actions">
              <span className="bi-save-state">✓ Guardado en este navegador</span>
              <button type="button" className={mode === 'read' ? 'is-active' : ''} onClick={publishCurrentDashboard}>Vista previa</button>
              {canConfigureDashboard ? (
                <button type="button" className={mode === 'edit' ? 'is-active' : ''} onClick={() => setMode('edit')}>Editar tablero</button>
              ) : null}
              <button type="button" onClick={openPresentation}>⛶ Presentar</button>
              <button type="button" onClick={printDashboard}>Exportar PDF</button>
            </div>
          </header>

          <nav className="bi-page-tabs" aria-label="Páginas del tablero">
            {workspacePages.map((page, index) => (
              <button
                key={page.key}
                type="button"
                className={page.key === preset ? 'is-active' : ''}
                aria-current={page.key === preset ? 'page' : undefined}
                onClick={() => activateWorkspacePage(page.key)}
              >
                <span>{index + 1}</span>
                <div><strong>{page.title}</strong><small>{page.description}</small></div>
              </button>
            ))}
          </nav>

          <Panel
            title="Filtros"
            subtitle={`${filteredProjects.length} proyectos en el contexto actual.`}
            action={<StatPill tone={presetTone(preset)}>{drillFilter ? 'Cruce aplicado' : 'Contexto global'}</StatPill>}
          >
            <div style={{ display: 'grid', gap: 14 }}>
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                {builderConfig.filters.map((filterKey) => (
                  <div
                    key={`global-filter-${filterKey}`}
                    className="bi-filter-control"
                    style={{
                      border: '1px solid #d7dde5',
                      borderRadius: 18,
                      padding: 14,
                      background:
                        selectedFilterKey === filterKey && mode === 'edit'
                          ? 'linear-gradient(180deg, #eef8f1 0%, #ffffff 100%)'
                          : 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
                      textAlign: 'left',
                      display: 'grid',
                      gap: 8,
                      boxShadow: '0 10px 24px rgba(16, 35, 63, 0.04)',
                    }}
                  >
                    {renderFilterControl(filterKey, true)}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={heroChipStyle}>Vista: {preset}</span>
                <span style={heroChipStyle}>Institución: {activeInstitutionLabel}</span>
                <span style={heroChipStyle}>Estado: {statusFilter === 'all' ? 'Todos' : statusFilter}</span>
                {drillFilter ? (
                  <span style={heroChipStyle}>
                    Cruce: {fieldLabel(drillFilter.fieldKey)} = {drillFilter.value}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setInstitutionFilter('all');
                    setStatusFilter('all');
                    setDrillFilter(null);
                  }}
                  style={smallActionButtonStyle}
                >
                  Limpiar filtros
                </button>
                {drillFilter ? (
                  <button type="button" onClick={() => setDrillFilter(null)} style={smallActionButtonStyle}>
                    Limpiar cruce
                  </button>
                ) : null}
              </div>
            </div>
          </Panel>

          <div style={{ height: 18 }} />

          <section ref={dashboardRef} className={`bi-dashboard-surface bi-dashboard-surface--${mode}`}>
          <Panel
            title={mode === 'edit' ? 'Constructor del tablero' : workspacePages.find((page) => page.key === preset)?.title ?? 'Tablero'}
            subtitle={mode === 'edit' ? 'Agrega visuales, asígnales datos y ajusta su diseño.' : `Actualizado con ${filteredProjects.length} proyectos visibles.`}
            action={
              <StatPill tone={mode === 'edit' ? 'warn' : 'good'}>
                {mode === 'edit' ? 'Edición local' : 'Vista de lectura'}
              </StatPill>
            }
          >
            {mode === 'edit' && canConfigureDashboard ? (
              <>
              <div className="bi-builder-toolbar" role="toolbar" aria-label="Herramientas del tablero">
                <div className="bi-builder-toolbar__identity">
                  <strong>Diseña tu informe visual</strong>
                  <span>Agrega componentes, selecciónalos en el lienzo y configura sus propiedades.</span>
                </div>
                <div className="bi-builder-toolbar__actions">
                  <button type="button" className="is-primary" onClick={() => setBuilderPane('visuals')}>＋ Agregar visual</button>
                  <button type="button" onClick={() => setBuilderPane('visuals')}>＋ Agregar filtro</button>
                  <button type="button" onClick={resetBuilder}>Restablecer</button>
                </div>
              </div>
              {builderNotice ? <div className="bi-builder-notice" role="status">✓ {builderNotice}</div> : null}
              <div
                className="bi-builder-layout"
                style={{
                  display: 'grid',
                  gap: 18,
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(285px, 320px)',
                  alignItems: 'start',
                }}
              >
                <aside className="bi-builder-sidebar"
                  style={{
                    display: 'grid',
                    gap: 14,
                    position: 'sticky',
                    top: 16,
                    alignSelf: 'start',
                  }}
                >
                  {builderPane === 'data' ? <div style={builderPaletteStyle}>
                    <div className="bi-inspector-tabs" role="tablist" aria-label="Configuración del visual">
                      <button type="button" role="tab" aria-selected="true" className="is-active">Datos</button>
                      <button type="button" role="tab" aria-selected="false" onClick={() => setBuilderPane('format')}>Diseño</button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={builderSectionLabelStyle}>Modelo</span>
                        <strong style={{ color: '#10233f' }}>Campos disponibles</strong>
                      </div>
                      <span style={metaStyle}>{fieldCatalog.reduce((sum, group) => sum + group.fields.length, 0)} campos</span>
                    </div>
                    {selectedWidgetKey ? (
                      <>
                        <MessageBlock>
                          Datos de: <strong>{widgetCatalog[selectedWidgetKey].title}</strong>
                        </MessageBlock>
                        {selectedWidgetKey === 'status-chart' ||
                        selectedWidgetKey === 'institution-chart' ||
                        selectedWidgetKey === 'theme-chart' ? (
                          <>
                            <label style={{ display: 'grid', gap: 6 }}>
                              <span style={{ color: '#5f6b7a', fontSize: 13 }}>Campo principal</span>
                              <select
                                value={widgetFieldKey(selectedWidgetKey)}
                                onChange={(event) => updateWidgetSettings(selectedWidgetKey, { fieldKey: event.target.value })}
                                style={selectStyle()}
                              >
                                {assignableFieldOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                              </select>
                            </label>
                            <label style={{ display: 'grid', gap: 6 }}>
                              <span style={{ color: '#5f6b7a', fontSize: 13 }}>Medida</span>
                              <select
                                value={widgetMeasureKey(selectedWidgetKey)}
                                onChange={(event) => updateWidgetSettings(selectedWidgetKey, { measureKey: event.target.value as MeasureKey })}
                                style={selectStyle()}
                              >
                                {measureOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                              </select>
                            </label>
                          </>
                        ) : (
                          <span style={metaStyle}>Este visual utiliza datos calculados del contexto actual.</span>
                        )}
                      </>
                    ) : <MessageBlock>Selecciona un visual del lienzo para asignarle datos.</MessageBlock>}
                    <div style={{ display: 'grid', gap: 12 }}>
                      {fieldCatalog.map((group) => (
                        <div key={group.group} style={{ display: 'grid', gap: 8 }}>
                          <span style={{ color: '#475569', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                            {group.group}
                          </span>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {group.fields.map((field) => (
                              <button
                                key={field.key}
                                type="button"
                                draggable={field.assignable}
                                onDragStart={() => {
                                  if (field.assignable) {
                                    setDraggingFieldKey(field.key);
                                  }
                                }}
                                onDragEnd={() => setDraggingFieldKey(null)}
                                onClick={() => {
                                  if (field.assignable && selectedWidgetKey) {
                                    assignFieldToWidget(selectedWidgetKey, field.key);
                                  }
                                }}
                                style={fieldChipStyle(field.assignable, draggingFieldKey === field.key)}
                              >
                                {field.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div> : null}

                  {builderPane === 'visuals' ? <><div style={builderPaletteStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={builderSectionLabelStyle}>Galería</span>
                        <strong style={{ color: '#10233f' }}>Agregar al tablero</strong>
                      </div>
                      <button type="button" onClick={() => setBuilderPane('format')} style={smallActionButtonStyle}>Cerrar</button>
                    </div>
                    <span className="bi-gallery-section-title">Filtros</span>
                    <div className="bi-visual-gallery">
                      {availableFilters.map((filterItem) => {
                        const added = builderConfig.filters.includes(filterItem.key);
                        return (
                        <div
                          key={filterItem.key}
                          draggable={!added}
                          onDragStart={() => setDraggingFilter(filterItem.key)}
                          onDragEnd={() => setDraggingFilter(null)}
                          className={`bi-visual-gallery__item${added ? ' is-added' : ''}`}
                        >
                          <span className="bi-visual-gallery__icon">⌄</span>
                          <strong>{filterItem.title}</strong>
                          <span>{filterItem.description}</span>
                          <button
                            type="button"
                            onClick={() => addFilter(filterItem.key)}
                            className={added ? 'is-added' : ''}
                          >
                            {added ? '✓ Agregado · seleccionar' : '+ Agregar'}
                          </button>
                        </div>
                        );
                      })}
                    </div>
                    <span className="bi-gallery-section-title">Visuales</span>
                    <div className="bi-visual-gallery">
                      {(Object.keys(widgetCatalog) as WidgetKey[]).map((widgetKey) => {
                        const added = builderConfig.widgets.includes(widgetKey);
                        return (
                        <div className={`bi-visual-gallery__item${added ? ' is-added' : ''}`}
                          key={widgetKey}
                          draggable={!added}
                          onDragStart={() => setDraggingWidget(widgetKey)}
                          onDragEnd={() => setDraggingWidget(null)}
                        >
                          <span className="bi-visual-gallery__icon">{widgetIcon(widgetKey)}</span>
                          <strong>{widgetCatalog[widgetKey].title}</strong>
                          <span>{widgetCatalog[widgetKey].description}</span>
                          <button
                            type="button"
                            aria-label={`Agregar ${widgetCatalog[widgetKey].title}`}
                            onClick={() => addWidget(widgetKey)}
                            className={added ? 'is-added' : ''}
                          >
                            {added ? '✓ Agregado · seleccionar' : '+ Agregar'}
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  </> : null}
                </aside>

                <div className="bi-builder-canvas" style={{ display: 'grid', gap: 18 }}>
                  <section
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggingFilter) {
                        addFilter(draggingFilter);
                      }
                    }}
                    style={builderZoneStyle}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={builderSectionLabelStyle}>Composición</span>
                        <strong style={{ color: '#10233f' }}>Zona de filtros</strong>
                      </div>
                      <span style={metaStyle}>Arrastra filtros aquí</span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 12,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      }}
                    >
                      {builderConfig.filters.map((filterKey) => (
                        <button
                          key={filterKey}
                          type="button"
                          onClick={() => {
                            setSelectedFilterKey(filterKey);
                            setSelectedWidgetKey(null);
                            setBuilderPane('format');
                          }}
                          style={{
                            ...builderFilterItemStyle,
                            textAlign: 'left',
                            border:
                              selectedFilterKey === filterKey
                                ? '1px solid #14532d'
                                : builderFilterItemStyle.border,
                            background:
                              selectedFilterKey === filterKey
                                ? '#eef8f1'
                                : builderFilterItemStyle.background,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                            <strong style={{ color: '#10233f', fontSize: 13 }}>
                              {availableFilters.find((item) => item.key === filterKey)?.title ?? filterKey}
                            </strong>
                            <span
                              onClick={(event) => {
                                event.stopPropagation();
                                removeFilter(filterKey);
                              }}
                              style={removeButtonStyle}
                            >
                              Quitar
                            </span>
                          </div>
                          {renderFilterControl(filterKey)}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggingWidget) {
                        addWidget(draggingWidget);
                      }
                    }}
                    style={builderZoneStyle}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={builderSectionLabelStyle}>Composición</span>
                        <strong style={{ color: '#10233f' }}>Lienzo del dashboard</strong>
                      </div>
                      <span style={metaStyle}>Selecciona para configurar · arrastra para reordenar</span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gap: 16,
                        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                        alignItems: 'start',
                      }}
                    >
                      {builderConfig.widgets.map((widgetKey) => (
                        <article
                          key={widgetKey}
                          data-bi-widget={widgetKey}
                          draggable
                          onClick={() => {
                            setSelectedWidgetKey(widgetKey);
                            setSelectedFilterKey(null);
                            setBuilderPane('format');
                          }}
                          onDragStart={() => setDraggingWidget(widgetKey)}
                          onDragEnd={() => setDraggingWidget(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (draggingFieldKey) {
                              assignFieldToWidget(widgetKey, draggingFieldKey);
                              setDraggingFieldKey(null);
                            } else if (draggingWidget) {
                              moveWidget(draggingWidget, widgetKey);
                            }
                          }}
                          style={{
                            display: 'grid',
                            gap: 12,
                            padding: 16,
                            gridColumn: widgetSpan(widgetSize(widgetKey)),
                            borderRadius: 20,
                            border:
                              selectedWidgetKey === widgetKey
                                ? '1px solid #14532d'
                                : draggingWidget === widgetKey
                                  ? '1px solid #14532d'
                                  : '1px solid #d7dde5',
                            background:
                              selectedWidgetKey === widgetKey || draggingWidget === widgetKey
                                ? 'linear-gradient(180deg, #eef8f1 0%, #ffffff 100%)'
                                : 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
                            cursor: 'pointer',
                            boxShadow: '0 14px 28px rgba(16, 35, 63, 0.05)',
                          }}
                        >
                          {draggingFieldKey &&
                          (widgetKey === 'status-chart' ||
                            widgetKey === 'institution-chart' ||
                            widgetKey === 'theme-chart') ? (
                            <div style={widgetDropHintStyle}>
                              Suelta aquí para asignar {fieldLabel(draggingFieldKey)}
                            </div>
                          ) : null}
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <strong style={{ color: '#10233f' }}>{widgetTitle(widgetKey)}</strong>
                              <span style={metaStyle}>
                                {widgetCatalog[widgetKey].description} · {widgetSizeLabel(widgetSize(widgetKey))}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeWidget(widgetKey);
                              }}
                              style={removeButtonStyle}
                            >
                              Quitar
                            </button>
                          </div>
                          {renderWidget(widgetKey)}
                        </article>
                      ))}
                      {builderConfig.widgets.length === 0 ? (
                        <div className="bi-builder-empty">
                          <span>▦</span>
                          <strong>El lienzo está vacío</strong>
                          <small>Usa “Agregar visual” para comenzar a construir el informe.</small>
                          <button type="button" onClick={() => setBuilderPane('visuals')}>Agregar primer visual</button>
                        </div>
                      ) : null}
                    </div>
                  </section>
                </div>

                {builderPane === 'format' ? <aside className="bi-builder-inspector"
                  style={{
                    display: 'grid',
                    gap: 14,
                    position: 'sticky',
                    top: 16,
                    alignSelf: 'start',
                  }}
                >
                  <div style={builderPaletteStyle}>
                    {selectedWidgetKey ? (
                      <div className="bi-inspector-tabs" role="tablist" aria-label="Configuración del visual">
                        <button type="button" role="tab" aria-selected="false" onClick={() => setBuilderPane('data')}>Datos</button>
                        <button type="button" role="tab" aria-selected="true" className="is-active">Diseño</button>
                      </div>
                    ) : null}
                    <div style={{ display: 'grid', gap: 4 }}>
                      <span style={builderSectionLabelStyle}>Inspector</span>
                      <strong style={{ color: '#10233f' }}>Configuración</strong>
                    </div>

                    {selectedWidgetKey ? (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <MessageBlock>
                          Configurando widget: <strong>{widgetCatalog[selectedWidgetKey].title}</strong>
                        </MessageBlock>
                        <div style={inspectorBadgeRowStyle}>
                          <span style={inspectorBadgeStyle}>Visual</span>
                          <span style={inspectorBadgeStyle}>{widgetSizeLabel(widgetSize(selectedWidgetKey))}</span>
                          {widgetVariant(selectedWidgetKey) ? (
                            <span style={inspectorBadgeStyle}>{chartVariantLabel(widgetVariant(selectedWidgetKey) as ChartVariant)}</span>
                          ) : null}
                        </div>
                        <DetailList
                          items={[
                            {
                              label: 'Ubicación',
                              value: `${builderConfig.widgets.indexOf(selectedWidgetKey) + 1} de ${builderConfig.widgets.length}`,
                            },
                            {
                              label: 'Tamaño actual',
                              value: widgetSizeLabel(widgetSize(selectedWidgetKey)),
                            },
                            {
                              label: 'Color activo',
                              value: widgetColor(selectedWidgetKey),
                            },
                          ]}
                        />
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ color: '#5f6b7a', fontSize: 13 }}>Título</span>
                          <input
                            type="text"
                            aria-label="Título del visual"
                            value={selectedWidgetSettings?.title ?? ''}
                            onChange={(event) =>
                              updateWidgetSettings(selectedWidgetKey, { title: event.target.value })
                            }
                            style={selectStyle()}
                            placeholder={widgetCatalog[selectedWidgetKey].title}
                          />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ color: '#5f6b7a', fontSize: 13 }}>Color de acento</span>
                          <input
                            type="color"
                            value={widgetColor(selectedWidgetKey)}
                            onChange={(event) =>
                              updateWidgetSettings(selectedWidgetKey, { accentColor: event.target.value })
                            }
                            style={{
                              width: '100%',
                              height: 42,
                              borderRadius: 12,
                              border: '1px solid #d7dde5',
                              background: '#ffffff',
                            }}
                          />
                        </label>
                        <div className="bi-format-group">
                          <span>Tamaño del visual</span>
                          <div className="bi-segmented-control">
                            {(['third', 'half', 'full'] as WidgetSize[]).map((size) => (
                              <button key={size} type="button" className={widgetSize(selectedWidgetKey) === size ? 'is-active' : ''} onClick={() => updateWidgetSettings(selectedWidgetKey, { size })}>
                                {size === 'third' ? '1/3' : size === 'half' ? '1/2' : 'Completo'}
                              </button>
                            ))}
                          </div>
                        </div>
                        {widgetCatalog[selectedWidgetKey].chartOptions ? (
                          <div className="bi-format-group">
                            <span>Tipo de gráfico</span>
                            <div className="bi-chart-type-grid" role="radiogroup" aria-label="Tipo de gráfico">
                              {widgetCatalog[selectedWidgetKey].chartOptions?.map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  role="radio"
                                  aria-checked={(widgetVariant(selectedWidgetKey) ?? widgetCatalog[selectedWidgetKey].chartOptions?.[0]) === option}
                                  className={(widgetVariant(selectedWidgetKey) ?? widgetCatalog[selectedWidgetKey].chartOptions?.[0]) === option ? 'is-active' : ''}
                                  onClick={() => updateWidgetSettings(selectedWidgetKey, { chartVariant: option })}
                                  title={chartVariantLabel(option)}
                                >
                                  <i>{chartVariantIcon(option)}</i><span>{chartVariantLabel(option)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => resetWidgetSettings(selectedWidgetKey)}
                          style={smallActionButtonStyle}
                        >
                          Restablecer widget
                        </button>
                      </div>
                    ) : selectedFilterKey ? (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <MessageBlock>
                          Filtro seleccionado: <strong>{availableFilters.find((item) => item.key === selectedFilterKey)?.title ?? selectedFilterKey}</strong>
                        </MessageBlock>
                        <DetailList
                          items={[
                            {
                              label: 'Tipo',
                              value: availableFilters.find((item) => item.key === selectedFilterKey)?.title ?? selectedFilterKey,
                            },
                            {
                              label: 'Descripción',
                              value: availableFilters.find((item) => item.key === selectedFilterKey)?.description ?? 'Filtro del tablero',
                            },
                          ]}
                        />
                      </div>
                    ) : (
                      <MessageBlock>
                        Selecciona un widget o un slicer para editar sus propiedades.
                      </MessageBlock>
                    )}
                  </div>
                </aside> : null}
              </div>
              </>
            ) : (
              <div
                className="bi-dashboard-grid"
                style={{
                  display: 'grid',
                  gap: 16,
                  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                  alignItems: 'start',
                }}
              >
                {builderConfig.widgets.map((widgetKey) => (
                  <div
                    className={`bi-dashboard-widget bi-dashboard-widget--${widgetSize(widgetKey) ?? 'full'}`}
                    key={`read-${widgetKey}`}
                    style={{
                      gridColumn: widgetSpan(widgetSize(widgetKey)),
                    }}
                  >
                    {renderWidget(widgetKey)}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          </section>
        </>
      ) : null}
    </section>
  );
}

function BarRow(props: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const width = props.maxValue > 0 ? Math.max(10, (props.value / props.maxValue) * 100) : 0;
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        display: 'grid',
        gap: 6,
        border: props.active ? '1px solid rgba(20,83,45,0.35)' : '1px solid transparent',
        borderRadius: 14,
        padding: 8,
        background: props.active ? 'rgba(232,243,236,0.72)' : 'transparent',
        textAlign: 'left',
        cursor: props.onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ color: '#10233f', fontSize: 13 }}>{props.label}</strong>
        <span style={{ color: '#5f6b7a', fontSize: 13 }}>{props.value}</span>
      </div>
      <div
        style={{
          width: '100%',
          height: 12,
          borderRadius: 999,
          background: '#e2e8f0',
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
    </button>
  );
}

function LollipopRow(props: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const width = props.maxValue > 0 ? Math.max(12, (props.value / props.maxValue) * 100) : 0;
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        display: 'grid',
        gap: 6,
        border: props.active ? '1px solid rgba(20,83,45,0.35)' : '1px solid transparent',
        borderRadius: 14,
        padding: 8,
        background: props.active ? 'rgba(232,243,236,0.72)' : 'transparent',
        textAlign: 'left',
        cursor: props.onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ color: '#10233f', fontSize: 13 }}>{props.label}</strong>
        <span style={{ color: '#5f6b7a', fontSize: 13 }}>{props.value}</span>
      </div>
      <div style={{ position: 'relative', height: 18 }}>
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 0,
            right: 0,
            height: 2,
            background: '#dbe4ee',
            borderRadius: 999,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 0,
            width: `${width}%`,
            height: 2,
            background: props.color,
            borderRadius: 999,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: `calc(${width}% - 10px)`,
            width: 12,
            height: 12,
            borderRadius: 999,
            background: props.color,
            boxShadow: '0 0 0 3px rgba(255,255,255,0.92)',
          }}
        />
      </div>
    </button>
  );
}

const chartColors = ['#14532d', '#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#475569', '#0891b2'];

function CategoryVisualization(props: {
  data: Array<[string, number]>;
  variant: ChartVariant;
  accentColor: string;
  activeValue: string | null;
  onSelect: (label: string) => void;
}) {
  if (props.data.length === 0) {
    return <MessageBlock>No hay proyectos visibles con los filtros actuales.</MessageBlock>;
  }
  const colors = props.data.map((_, index) => index === 0 ? props.accentColor : chartColors[index % chartColors.length]);
  const maxValue = Math.max(...props.data.map(([, value]) => value), 1);

  if (props.variant === 'stacked') {
    return <StackedShareBar segments={props.data.slice(0, 8).map(([label, value], index) => ({ label, value, color: colors[index] }))} />;
  }

  if (props.variant === 'donut' || props.variant === 'pie') {
    const total = props.data.reduce((sum, [, value]) => sum + value, 0);
    let cursor = 0;
    const stops = props.data.map(([, value], index) => {
      const start = cursor;
      cursor += total > 0 ? (value / total) * 100 : 0;
      return `${colors[index]} ${start}% ${cursor}%`;
    });
    return (
      <div className="bi-share-chart">
        <div
          className={`bi-share-chart__plot bi-share-chart__plot--${props.variant}`}
          style={{ background: `conic-gradient(${stops.join(', ')})` }}
          aria-label={`${chartVariantLabel(props.variant)} con total ${total.toLocaleString('es-CR')}`}
        >
          {props.variant === 'donut' ? <span><strong>{total.toLocaleString('es-CR')}</strong><small>Total</small></span> : null}
        </div>
        <div className="bi-share-chart__legend">
          {props.data.map(([label, value], index) => (
            <button key={label} type="button" className={props.activeValue === label ? 'is-active' : ''} onClick={() => props.onSelect(label)}>
              <i style={{ background: colors[index] }} /><span>{label}</span><strong>{value.toLocaleString('es-CR')}</strong>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (props.variant === 'column') {
    return (
      <div className="bi-column-chart">
        {props.data.map(([label, value], index) => (
          <button key={label} type="button" className={props.activeValue === label ? 'is-active' : ''} onClick={() => props.onSelect(label)} title={`${label}: ${value}`}>
            <strong>{value.toLocaleString('es-CR')}</strong>
            <i style={{ height: `${Math.max(8, (value / maxValue) * 100)}%`, background: colors[index] }} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (props.variant === 'pareto') {
    const total = props.data.reduce((sum, [, value]) => sum + value, 0);
    let accumulated = 0;
    return (
      <div className="bi-pareto-chart">
        {props.data.map(([label, value], index) => {
          accumulated += value;
          const cumulativePercent = total > 0 ? Math.round((accumulated / total) * 100) : 0;
          return (
            <button key={label} type="button" className={props.activeValue === label ? 'is-active' : ''} onClick={() => props.onSelect(label)}>
              <span>{label}</span>
              <div><i style={{ width: `${(value / maxValue) * 100}%`, background: colors[index] }} /></div>
              <strong>{value.toLocaleString('es-CR')} · {cumulativePercent}% acum.</strong>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {props.data.map(([label, value], index) =>
        props.variant === 'lollipop' ? (
          <LollipopRow key={label} label={label} value={value} maxValue={maxValue} color={colors[index]} onClick={() => props.onSelect(label)} active={props.activeValue === label} />
        ) : (
          <BarRow key={label} label={label} value={value} maxValue={maxValue} color={colors[index]} onClick={() => props.onSelect(label)} active={props.activeValue === label} />
        ),
      )}
    </div>
  );
}

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) return 0;
  const position = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function AreaDistribution(props: {
  title: string;
  values: number[];
  variant: 'histogram' | 'boxplot';
  accentColor: string;
}) {
  const values = [...props.values].sort((a, b) => a - b);
  if (values.length === 0) {
    return <Panel title={props.title}><MessageBlock>No existen áreas positivas en el subconjunto actual.</MessageBlock></Panel>;
  }
  const minimum = values[0];
  const maximum = values[values.length - 1];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = percentile(values, .5);
  const q1 = percentile(values, .25);
  const q3 = percentile(values, .75);
  const range = Math.max(maximum - minimum, 1);
  const binsCount = Math.min(7, Math.max(3, Math.ceil(Math.sqrt(values.length))));
  const binWidth = range / binsCount;
  const bins = Array.from({ length: binsCount }, (_, index) => ({
    start: minimum + index * binWidth,
    end: index === binsCount - 1 ? maximum : minimum + (index + 1) * binWidth,
    count: 0,
  }));
  values.forEach((value) => {
    const index = Math.min(Math.floor((value - minimum) / binWidth), binsCount - 1);
    bins[index].count += 1;
  });
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);

  return (
    <Panel title={props.title} subtitle={`${values.length} proyectos con área reportada.`} action={<StatPill tone="neutral">Área (ha)</StatPill>}>
      <div className="bi-area-analysis">
        <div className="bi-area-analysis__stats">
          <span><small>Mínimo</small><strong>{minimum.toLocaleString('es-CR', { maximumFractionDigits: 1 })}</strong></span>
          <span><small>Promedio</small><strong>{average.toLocaleString('es-CR', { maximumFractionDigits: 1 })}</strong></span>
          <span><small>Mediana</small><strong>{median.toLocaleString('es-CR', { maximumFractionDigits: 1 })}</strong></span>
          <span><small>Máximo</small><strong>{maximum.toLocaleString('es-CR', { maximumFractionDigits: 1 })}</strong></span>
        </div>
        {props.variant === 'boxplot' ? (
          <div className="bi-boxplot" aria-label={`Caja y bigotes de ${minimum} a ${maximum} hectáreas`}>
            <div className="bi-boxplot__axis"><i style={{ left: '0%', width: '100%', background: props.accentColor }} /></div>
            <div className="bi-boxplot__box" style={{ left: `${((q1 - minimum) / range) * 100}%`, width: `${Math.max(2, ((q3 - q1) / range) * 100)}%`, borderColor: props.accentColor }}>
              <i style={{ left: `${((median - q1) / Math.max(q3 - q1, 1)) * 100}%`, background: props.accentColor }} />
            </div>
            <div className="bi-boxplot__labels"><span>{minimum.toFixed(1)}</span><span>Q1 {q1.toFixed(1)}</span><span>Mediana {median.toFixed(1)}</span><span>Q3 {q3.toFixed(1)}</span><span>{maximum.toFixed(1)}</span></div>
          </div>
        ) : (
          <div className="bi-histogram">
            {bins.map((bin, index) => (
              <div key={index} title={`${bin.start.toFixed(1)}–${bin.end.toFixed(1)} ha: ${bin.count} proyectos`}>
                <strong>{bin.count}</strong><i style={{ height: `${Math.max(4, (bin.count / maxCount) * 100)}%`, background: props.accentColor }} /><span>{bin.start.toFixed(0)}–{bin.end.toFixed(0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function MiniInsightCard(props: { label: string; value: string; tone: 'green' | 'amber' | 'blue' | 'slate' }) {
  return (
    <article
      style={{
        ...miniInsightTone(props.tone),
        borderRadius: 18,
        padding: 14,
        display: 'grid',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {props.label}
      </span>
      <strong style={{ fontSize: 28, lineHeight: 1 }}>{props.value}</strong>
    </article>
  );
}

function DonutStat(props: {
  label: string;
  value: number;
  total?: number;
  suffix?: string;
  color: string;
}) {
  const total = props.total ?? 100;
  const ratio = total > 0 ? Math.max(0, Math.min(100, (props.value / total) * 100)) : 0;
  return (
    <article
      style={{
        border: '1px solid #d7dde5',
        borderRadius: 18,
        padding: 14,
        background: '#f8fbff',
        display: 'grid',
        gap: 10,
        justifyItems: 'center',
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: `conic-gradient(${props.color} 0 ${ratio}%, #e2e8f0 ${ratio}% 100%)`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: '50%',
            background: '#ffffff',
            display: 'grid',
            placeItems: 'center',
            color: '#10233f',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {Math.round(ratio)}%
        </div>
      </div>
      <div style={{ display: 'grid', gap: 3, textAlign: 'center' }}>
        <strong style={{ color: '#10233f', fontSize: 13 }}>{props.label}</strong>
        <span style={{ color: '#475569', fontSize: 13 }}>
          {props.value}
          {props.suffix ? ` ${props.suffix}` : ''}
        </span>
      </div>
    </article>
  );
}

function StackedShareBar(props: {
  segments: Array<{ label: string; value: number; color: string }>;
}) {
  const total = props.segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) {
    return null;
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 14,
          borderRadius: 999,
          overflow: 'hidden',
          background: '#e2e8f0',
        }}
      >
        {props.segments.map((segment) => (
          <div
            key={segment.label}
            style={{
              width: `${(segment.value / total) * 100}%`,
              background: segment.color,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {props.segments.map((segment) => (
          <span key={`legend-${segment.label}`} style={legendChipStyle(segment.color)}>
            {segment.label}: {segment.value}
          </span>
        ))}
      </div>
    </div>
  );
}

const metaStyle = {
  color: '#5f6b7a',
  fontSize: 13,
};

const eyebrowStyle = {
  color: '#14532d',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

const heroChipStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.92)',
  color: '#10233f',
  fontSize: 12,
  fontWeight: 700,
};

const builderSectionLabelStyle = {
  color: '#64748b',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

function fieldChipStyle(isAssignable: boolean, isDragging: boolean) {
  return {
    border: isDragging ? '1px solid #14532d' : '1px solid #d7dde5',
    borderRadius: 999,
    padding: '7px 10px',
    background: isAssignable ? '#ffffff' : '#f8fafc',
    color: isAssignable ? '#10233f' : '#64748b',
    fontSize: 12,
    fontWeight: 600,
    boxShadow: isAssignable ? '0 6px 14px rgba(16, 35, 63, 0.03)' : 'none',
    cursor: isAssignable ? 'grab' : 'default',
    opacity: isAssignable ? 1 : 0.72,
  };
}

const inspectorBadgeRowStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap' as const,
};

const inspectorBadgeStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '6px 10px',
  background: '#f8fbff',
  color: '#10233f',
  fontSize: 12,
  fontWeight: 700,
};

const widgetDropHintStyle = {
  border: '1px dashed #14532d',
  borderRadius: 14,
  padding: '10px 12px',
  background: '#eef8f1',
  color: '#14532d',
  fontSize: 12,
  fontWeight: 700,
};

const builderPaletteStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 20,
  padding: 18,
  background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
  display: 'grid',
  gap: 12,
  boxShadow: '0 14px 28px rgba(16, 35, 63, 0.05)',
};

const builderZoneStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 22,
  padding: 20,
  background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
  display: 'grid',
  gap: 14,
  boxShadow: '0 20px 38px rgba(16, 35, 63, 0.06)',
};

const builderFilterItemStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 18,
  padding: 14,
  background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
  display: 'grid',
  gap: 10,
  boxShadow: '0 10px 24px rgba(16, 35, 63, 0.04)',
};

const smallActionButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#14532d',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  width: 'fit-content',
};

const removeButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '6px 10px',
  background: '#fff5f4',
  color: '#b42318',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const linkChipStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '10px 14px',
  background: '#ffffff',
  color: '#14532d',
  fontWeight: 700,
  fontSize: 13,
  textDecoration: 'none',
};

function defaultFieldForWidget(widgetKey: WidgetKey) {
  if (widgetKey === 'institution-chart') {
    return 'projects.institutionName';
  }
  if (widgetKey === 'theme-chart') {
    return 'projects.theme';
  }
  return 'projects.status';
}

function defaultMeasureForWidget(widgetKey: WidgetKey): MeasureKey {
  if (widgetKey === 'theme-chart') {
    return 'sum_area_ha';
  }
  return 'count_projects';
}

function fieldLabel(fieldKey: string) {
  return assignableFieldOptions.find((option) => option.key === fieldKey)?.label ?? fieldKey;
}

function measureLabel(measureKey: MeasureKey) {
  return measureOptions.find((option) => option.key === measureKey)?.label ?? measureKey;
}

function miniInsightTone(tone: 'green' | 'amber' | 'blue' | 'slate') {
  if (tone === 'green') {
    return { background: 'linear-gradient(180deg, #edf9f0 0%, #ffffff 100%)', color: '#14532d' };
  }
  if (tone === 'amber') {
    return { background: 'linear-gradient(180deg, #fff7e8 0%, #ffffff 100%)', color: '#b45309' };
  }
  if (tone === 'blue') {
    return { background: 'linear-gradient(180deg, #edf5ff 0%, #ffffff 100%)', color: '#1d4ed8' };
  }
  return { background: 'linear-gradient(180deg, #f1f5f9 0%, #ffffff 100%)', color: '#334155' };
}

function legendChipStyle(color: string) {
  return {
    border: '1px solid #d7dde5',
    borderRadius: 999,
    padding: '6px 10px',
    background: '#ffffff',
    color: '#10233f',
    fontSize: 12,
    fontWeight: 700,
    boxShadow: `inset 0 0 0 2px ${color}`,
  };
}
