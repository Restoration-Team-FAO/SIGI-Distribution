import type { Identifier, SigiRoleCode, Timestamp } from '@sigi/shared';

export type Institution = {
  id: Identifier;
  code: string;
  name: string;
  status: 'active' | 'inactive';
};

export type EgiSpace = {
  id: Identifier;
  institutionId: Identifier | null;
  institutionName?: string | null;
  code: string;
  name: string;
  description?: string | null;
  responsible?: string | null;
  territorialScope?: string | null;
  thematicScope?: string | null;
  visibility: 'public' | 'institutional' | 'internal' | string;
  status: 'draft' | 'active' | 'inactive' | 'archived' | string;
  activeUserRole?: string | null;
  effectivePermissions?: string[];
  isSelected?: boolean;
  lastSelectedAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type EgiSummary = {
  egi: EgiSpace;
  summary: {
    users: number;
    sources: number;
    projects: number;
    documents: number;
    imports: number;
    validationsPending: number;
    publications: number;
    alerts: number;
    recentAudit: number;
  };
};

export type DataSource = {
  id: Identifier;
  egiId?: Identifier | null;
  institutionId: Identifier;
  connectorId?: Identifier | null;
  code?: string;
  name: string;
  sourceType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  status: 'active' | 'inactive';
  assetUid?: string | null;
  description?: string | null;
  userName?: string | null;
  country?: string | null;
  territorialScope?: string | null;
  allowedCountries?: string[];
  config?: Record<string, unknown>;
  lastIngestedAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Dataset = {
  id: Identifier;
  egiId?: Identifier | null;
  institutionId: Identifier;
  sourceId: Identifier;
  schemaCode: string;
  status: 'draft' | 'validating' | 'validated' | 'published' | 'rejected';
  latestVersionId: Identifier | null;
  createdAt: Timestamp;
};

export type DatasetVersion = {
  id: Identifier;
  datasetId: Identifier;
  versionNumber: number;
  status: 'received' | 'validated' | 'published' | 'failed';
  submittedByUserId: Identifier | null;
  createdAt: Timestamp;
};

export type Project = {
  id: Identifier;
  egiId?: Identifier | null;
  datasetId: Identifier | null;
  institutionId: Identifier;
  portfolioId?: Identifier | null;
  code?: string | null;
  title: string;
  objective?: string | null;
  summary?: string | null;
  description?: string | null;
  theme?: string | null;
  priority?: 'critical' | 'high' | 'medium' | 'low' | string;
  visibility?: 'public' | 'internal' | string;
  status: 'draft' | 'active' | 'completed' | 'published';
  startDate?: Timestamp | null;
  endDate?: Timestamp | null;
  progressPct?: number | null;
  featured?: boolean;
  financialManagementMode?: 'none' | 'planning' | 'execution' | 'external' | string;
  financialBaseCurrency?: string | null;
  actualEndDate?: Timestamp | null;
  areaHa?: number | null;
  institutionName?: string | null;
  portfolioName?: string | null;
  indicatorCount?: number;
  territoryCount?: number;
  deliverableCount?: number;
  incidentCount?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectPortfolio = {
  id: Identifier;
  code: string;
  name: string;
  description?: string | null;
  objective?: string | null;
  status: 'active' | 'inactive' | string;
  visibility?: 'public' | 'internal' | string;
  priorityLabel?: string | null;
  projectCount?: number;
  activeProjectCount?: number;
  publishedProjectCount?: number;
  totalAreaHa?: number | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectActor = {
  id: Identifier;
  projectId: Identifier;
  actorType: 'leader' | 'partner' | 'responsible' | 'approver' | string;
  institutionId?: Identifier | null;
  institutionName?: string | null;
  displayName: string;
  roleLabel?: string | null;
  status: 'active' | 'inactive' | string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectMilestone = {
  id: Identifier;
  projectId: Identifier;
  activityCode?: string | null;
  title: string;
  description?: string | null;
  dueDate?: Timestamp | null;
  completedAt?: Timestamp | null;
  status: 'planned' | 'in_progress' | 'done' | 'blocked' | string;
  progressPct?: number | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectTask = {
  id: Identifier;
  projectId: Identifier;
  parentTaskId?: Identifier | null;
  ownerActorId?: Identifier | null;
  ownerName?: string | null;
  taskType: 'phase' | 'activity' | 'task';
  code: string;
  title: string;
  description?: string | null;
  startDate?: Timestamp | null;
  endDate?: Timestamp | null;
  status: 'planned' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
  progressPct: number;
  weight: number;
  sortOrder: number;
  predecessorIds: Identifier[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectBudgetItem = {
  id: Identifier;
  projectId: Identifier;
  taskId?: Identifier | null;
  code: string;
  category: string;
  name: string;
  fundingSource?: string | null;
  currency: string;
  plannedAmount: number;
  committedAmount: number;
  actualAmount: number;
  notes?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectRisk = {
  id: Identifier;
  projectId: Identifier;
  ownerActorId?: Identifier | null;
  ownerName?: string | null;
  code: string;
  title: string;
  description?: string | null;
  category?: string | null;
  probability: number;
  impact: number;
  score: number;
  status: 'open' | 'monitoring' | 'mitigated' | 'closed' | 'accepted';
  responseStrategy: 'avoid' | 'mitigate' | 'transfer' | 'accept';
  mitigation?: string | null;
  reviewDate?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectFinancialSettings = {
  mode: 'none' | 'planning' | 'execution' | 'external' | string;
  baseCurrency: string | null;
  sourceSystem: string | null;
  externalProjectCode: string | null;
  externalUrl: string | null;
  dataSource: string | null;
  updateMethod: 'manual' | 'api' | 'connector' | null;
  syncStatus: string | null;
  dataCutoffDate: Timestamp | null;
  dataLastUpdatedAt: Timestamp | null;
  externalBudgetAmount: number | null;
  externalCommittedAmount: number | null;
  externalExecutedAmount: number | null;
  externalAvailableAmount: number | null;
  actualEndDate: Timestamp | null;
  closureSummary: string | null;
  lessonsLearned: string | null;
};

export type ProjectFinancialSummary = {
  applicable: boolean;
  source: 'none' | 'sigi' | 'external';
  currency: string | null;
  initialBudget: number | null;
  currentBudget: number | null;
  committed: number | null;
  executed: number | null;
  available: number | null;
  executionPct: number | null;
  commitmentPct: number | null;
  variance: number | null;
  cutoffDate: Timestamp | null;
};

export type ProjectFundingSource = { id:Identifier;projectId:Identifier;code:string;name:string;sourceType:string;funder:string|null;currency:string;approvedAmount:number|null;receivedAmount:number|null;validFrom:Timestamp|null;validTo:Timestamp|null;restrictions:string|null;observations:string|null;status:string;createdAt:Timestamp;updatedAt:Timestamp };
export type ProjectBudgetVersion = { id:Identifier;projectId:Identifier;versionNumber:number;name:string;reason:string|null;status:string;effectiveDate:Timestamp;totalAmount:number;changeAmount:number;approvalNotes:string|null;approvedAt:Timestamp|null;createdAt:Timestamp;updatedAt:Timestamp };
export type ProjectFinancialMovement = { id:Identifier;projectId:Identifier;budgetItemId:Identifier|null;destinationBudgetItemId:Identifier|null;fundingSourceId:Identifier|null;taskId:Identifier|null;movementType:string;budgetEffect:string;movementDate:Timestamp;amount:number;currency:string;exchangeRate:number;baseAmount:number;supplierOrBeneficiary:string|null;concept:string;externalReference:string|null;documentNumber:string|null;supportFileId:Identifier|null;status:string;approvedAt:Timestamp|null;createdAt:Timestamp;updatedAt:Timestamp };
export type ProjectManagementRecord = { id:Identifier;projectId:Identifier;recordType:'issue'|'decision'|'change_request'|string;code:string;title:string;description:string|null;status:string;priority:string;requesterActorId:Identifier|null;ownerActorId:Identifier|null;ownerName:string|null;approverActorId:Identifier|null;requestedAt:Timestamp|null;decidedAt:Timestamp|null;dueDate:Timestamp|null;impactScope:string|null;impactScheduleDays:number|null;impactAmount:number|null;previousValue:Record<string,unknown>|null;proposedValue:Record<string,unknown>|null;resolution:string|null;supportFileId:Identifier|null;createdAt:Timestamp;updatedAt:Timestamp };
export type ProjectStatusUpdate = { id:Identifier;projectId:Identifier;cutoffDate:Timestamp;periodLabel:string;physicalProgressPct:number|null;financialProgressPct:number|null;financialDataMode:string|null;executiveSummary:string;achievements:string|null;delays:string|null;mainRisks:string|null;issues:string|null;decisionsRequired:string|null;nextSteps:string|null;status:string;responsibleActorId:Identifier|null;responsibleName:string|null;approvedAt:Timestamp|null;createdAt:Timestamp;updatedAt:Timestamp };
export type ProjectAlert = { code:string;severity:'low'|'medium'|'high'|'critical';title:string;detail:string;targetView:string };

export type ProjectIndicator = {
  id: Identifier;
  projectId: Identifier;
  indicatorCode: string;
  indicatorName?: string | null;
  unit: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  category?: string | null;
  observedAt?: Timestamp | null;
  baselineValue?: number | null;
  targetValue?: number | null;
  progressPct?: number | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectTerritory = {
  id: Identifier;
  projectId: Identifier;
  territoryId?: Identifier | null;
  territoryCode: string;
  territoryName?: string | null;
  country: string;
  level?: string | null;
  areaHa: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectDeliverable = {
  id: Identifier;
  projectId: Identifier;
  code: string;
  title: string;
  deliverableType: string;
  description?: string | null;
  status: 'planned' | 'in_progress' | 'published' | 'completed' | string;
  dueDate?: Timestamp | null;
  publishedAt?: Timestamp | null;
  outputUrl?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectDocument = {
  id: Identifier;
  projectId: Identifier;
  code: string;
  title: string;
  documentType: string;
  fileUrl?: string | null;
  status: 'draft' | 'approved' | 'published' | string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectDatasetLink = {
  id: Identifier;
  projectId: Identifier;
  datasetId: Identifier;
  datasetTitle?: string | null;
  datasetStatus?: string | null;
  latestVersionId?: Identifier | null;
  relationshipType: string;
  validationStatus?: string | null;
  evidenceNote?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProjectDetail = {
  project: Project;
  portfolio: ProjectPortfolio | null;
  actors: ProjectActor[];
  milestones: ProjectMilestone[];
  tasks: ProjectTask[];
  budgetItems: ProjectBudgetItem[];
  risks: ProjectRisk[];
  financialSettings: ProjectFinancialSettings;
  financialSummary: ProjectFinancialSummary;
  fundingSources: ProjectFundingSource[];
  budgetVersions: ProjectBudgetVersion[];
  financialMovements: ProjectFinancialMovement[];
  managementRecords: ProjectManagementRecord[];
  statusUpdates: ProjectStatusUpdate[];
  alerts: ProjectAlert[];
  indicators: ProjectIndicator[];
  territories: ProjectTerritory[];
  deliverables: ProjectDeliverable[];
  documents: ProjectDocument[];
  incidents: Incident[];
  datasets: ProjectDatasetLink[];
  audit: AuditEvent[];
};

export type Indicator = {
  id: Identifier;
  code: string;
  name: string;
  unit: string;
  category: string;
  currentValue?: number | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type GlobalSearchResultType = 'project' | 'indicator' | 'report' | 'file';

export type GlobalSearchItem = {
  type: GlobalSearchResultType;
  id: Identifier;
  code: string | null;
  title: string;
  subtitle: string | null;
  status: string | null;
  path: string;
  updatedAt: Timestamp | null;
};

export type AskSigiCitation = GlobalSearchItem & {
  citation: number;
};

export type AskSigiAnswer = {
  question: string;
  answer: string;
  mode: 'evidence_retrieval';
  evidenceStatus: 'supported' | 'no_evidence';
  scope: 'active' | 'global';
  citations: AskSigiCitation[];
  limitations: string[];
  auditId: Identifier;
  answeredAt: Timestamp;
};

export type IndicatorWorkspaceItem = Indicator & {
  projectCount: number;
  observationCount: number;
  latestObservedAt?: Timestamp | null;
  latestValue?: number | null;
  baselineValue?: number | null;
  targetValue?: number | null;
  progressPct?: number | null;
  status: 'on_track' | 'attention' | 'without_target' | 'without_data';
};

export type IndicatorObservation = {
  id: Identifier;
  indicatorCode: string;
  projectId: Identifier;
  projectCode?: string | null;
  projectTitle: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit: string;
  baselineValue?: number | null;
  targetValue?: number | null;
  progressPct?: number | null;
  observedAt?: Timestamp | null;
  updatedAt?: Timestamp;
};

export type IndicatorTerritory = {
  projectId: Identifier;
  projectCode?: string | null;
  projectTitle: string;
  territoryId?: Identifier | null;
  territoryCode: string;
  territoryName?: string | null;
  country: string;
  areaHa: number;
};

export type IndicatorEvidence = {
  projectId: Identifier;
  projectCode?: string | null;
  projectTitle: string;
  datasetId: Identifier;
  datasetTitle?: string | null;
  relationshipType: string;
  validationStatus?: string | null;
  evidenceNote?: string | null;
};

export type IndicatorWorkspaceDetail = {
  indicator: IndicatorWorkspaceItem;
  observations: IndicatorObservation[];
  territories: IndicatorTerritory[];
  evidence: IndicatorEvidence[];
  audit: AuditEvent[];
};

export type Territory = {
  id: Identifier;
  code: string;
  name: string;
  level: 'country' | 'region' | 'province' | 'district' | 'custom';
};

export type GeoFeature = {
  id?: Identifier | string;
  type: 'Feature';
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
};

export type GeoFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoFeature[];
};

/**
 * Contracts for the Mapa SIGI / Visor Inteligente work (P0-2 foundation,
 * P0-3 implementation). None of these are served by an endpoint yet — they
 * exist so the /geo/* API introduced in P0-3 has a stable, reviewed shape
 * to implement against instead of improvising one per handler.
 * See docs/geo/MAPA_SIGI_DIAGNOSTICO.md and docs/geo/permissions.md.
 */

/** Visibility tiers formalized in gis.geo_visibility_rank() (P0-2). */
export type GeoVisibility = 'public' | 'institutional' | 'restricted' | 'private' | 'internal';

export type GeoLayer = {
  id: Identifier;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  groupName?: string | null;
  layerType: string;
  geometryType?: string | null;
  crs: string;
  visibility: GeoVisibility;
  status: string;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * Institutional/provenance metadata (spec §13's "ficha de metadatos").
 * A missing field, or a missing GeoLayerMetadata altogether, must render as
 * "No disponible" — never inferred or invented. See gis.geo_layer_metadata.
 */
export type GeoLayerMetadata = {
  layerId: Identifier;
  institutionId?: Identifier | null;
  sourceName?: string | null;
  owner?: string | null;
  responsible?: string | null;
  dataDate?: string | null;
  updateFrequency?: string | null;
  license?: string | null;
  classification?: string | null;
  accessLevel?: string | null;
  serviceUrl?: string | null;
  qualityStatus?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * One attribute of a layer's feature schema, driving auto-generated
 * filters/table columns on the frontend (spec §9) — the mechanism that lets
 * P0-3 remove the hardcoded DNEA filter list.
 */
export type GeoLayerField = {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  unit?: string | null;
  enumValues?: string[] | null;
  filterable: boolean;
  sortable: boolean;
  visible: boolean;
};

export type GeoLayerSchema = {
  layerId: Identifier;
  fields: GeoLayerField[];
};

export type GeoExtent = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

/**
 * Cached, persisted profile of a layer — see gis.geo_layer_profile and
 * gis.refresh_geo_layer_profile(). Never computed inline on a request path.
 * validGeometryCount = featureCount - nullGeometryCount - invalidGeometryCount.
 */
export type GeoDatasetProfile = {
  layerId: Identifier;
  featureCount: number;
  nullGeometryCount: number;
  invalidGeometryCount: number;
  geometryType?: string | null;
  crs?: string | null;
  extent?: GeoExtent | null;
  profiledAt?: Timestamp | null;
};

export type GeoFeatureQueryFilter = {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: unknown;
};

/**
 * The request shape /geo/layers/:id/features (P0-3) accepts. Never resolves
 * to an unbounded full-layer read — pageSize is always capped server-side,
 * and bbox/zoom are how the map viewport limits what is fetched.
 */
export type GeoFeatureQuery = {
  bbox?: GeoExtent;
  zoom?: number;
  filters?: GeoFeatureQueryFilter[];
  page?: number;
  pageSize?: number;
};

export type GeoFeatureQueryResult = {
  featureCollection: GeoFeatureCollection;
  page: number;
  pageSize: number;
  totalFeatures: number;
};

/**
 * P1-1 — one (territory, layer) match for cross-layer territorial search
 * (spec §18, GET /geo/search). A territory can legitimately appear in more
 * than one layer; each pair is its own result.
 */
export type GeoTerritorySearchResult = {
  territoryCode: string;
  territoryName: string;
  territoryLevel: string;
  layerCode: string;
  layerName: string;
};

/**
 * P1-6 — one proximity-search result (spec §10, "consultas espaciales",
 * POST /geo/layers/:code/nearby). Same shape as GeoTerritorySearchResult
 * plus distance — the frontend reuses P1-1's "activate layer if needed,
 * then select" flow for these results.
 */
export type GeoNearbyTerritoryResult = GeoTerritorySearchResult & { distanceMeters: number };

export type GeoLayerIntersectionMatch = {
  sourceCode: string;
  sourceName: string;
  targetCode: string;
  targetName: string;
  intersectionAreaHa: number;
};

/** Bounded, read-only PostGIS overlay between two authorized catalog layers. */
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
 * (spec §19). No viewport (map center/zoom) by design — restoring the
 * layer set already re-triggers MultiLayerMap's own auto-fit.
 */
export type GeoSavedViewLayerState = {
  code: string;
  color: string;
  opacity: number;
  filters: GeoFeatureQueryFilter[];
};

export type GeoSavedViewState = {
  activeLayers: GeoSavedViewLayerState[];
};

/** Owned by a real signed-in user — see GET/POST/DELETE /geo/saved-views. */
export type GeoSavedView = {
  id: Identifier;
  userId: Identifier;
  name: string;
  viewState: GeoSavedViewState;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * P1-5 — distribution of the current filtered result set for one field
 * (spec §12, "Mapa + BI", GET /geo/layers/:code/stats). Never the current
 * table page — always the whole filtered set.
 */
export type GeoLayerFieldStatsGroup = { value: string; count: number };

export type GeoLayerFieldStats =
  | { field: string; kind: 'grouped'; groups: GeoLayerFieldStatsGroup[]; truncated: boolean }
  | { field: string; kind: 'numeric'; count: number; min: number | null; max: number | null; avg: number | null }
  | { field: string; kind: 'date'; count: number; min: string | null; max: string | null };

export type GeoBiLayer = {
  id: Identifier;
  code: string;
  name: string;
  layerType: string;
  visibility: string;
  status: string;
  featureCount: number;
  totalAreaHa: number;
  lastUpdatedAt?: Timestamp | null;
};

export type GeoBiDatasetCatalogItem = {
  sourceId: Identifier;
  sourceCode?: string | null;
  sourceName: string;
  sourceType: string;
  institutionName: string;
  status: string;
  datasetCount: number;
  lastIngestedAt?: Timestamp | null;
};

export type GeoBiCoverageLevel = {
  level: string;
  territoryCount: number;
  featureCount: number;
  projectCount: number;
  totalAreaHa: number;
};

export type GeoBiKpi = {
  label: string;
  value: string;
  hint: string;
};

export type GeoBiBreakdownItem = {
  label: string;
  value: number;
};

export type GeoBiEcosystemNode = {
  id: string;
  name: string;
  status: 'Operativo' | 'Atencion' | 'Programado';
  metric: string;
  description: string;
};

export type GeoBiModule = {
  summary: {
    layers: number;
    datasets: number;
    sources: number;
    territories: number;
    features: number;
    visibleProjects: number;
    totalAreaHa: number;
    qualityScore: number;
    publications: number;
    reports: number;
    alerts: number;
  };
  layers: GeoBiLayer[];
  datasetCatalog: GeoBiDatasetCatalogItem[];
  coverage: {
    levels: GeoBiCoverageLevel[];
    visibleProjects: number;
    coveredTerritories: number;
    totalAreaHa: number;
  };
  dashboards: {
    kpis: GeoBiKpi[];
    themes: GeoBiBreakdownItem[];
    institutions: GeoBiBreakdownItem[];
  };
  quality: {
    score: number;
    passed: number;
    warning: number;
    failed: number;
    activeRules: number;
  };
  alerts: {
    open: number;
    investigating: number;
    resolved: number;
    recent: Incident[];
  };
  publications: {
    published: number;
    queued: number;
    failed: number;
    outputs: Publication[];
  };
  reports: {
    active: number;
    latest: ReportTemplate[];
  };
  audit: {
    events: number;
    recent: AuditEvent[];
  };
  linkedData: {
    sources: number;
    datasets: number;
    datasetVersions: number;
    validations: number;
    exports: number;
  };
  ecosystem: GeoBiEcosystemNode[];
};

export type ValidationRule = {
  id: Identifier;
  code: string;
  name: string;
  severity: 'info' | 'warning' | 'error';
  appliesToSchema: string;
};

export type ValidationResult = {
  id: Identifier;
  egiId?: Identifier | null;
  datasetVersionId: Identifier;
  ruleId?: Identifier;
  ruleCode?: string;
  status: 'passed' | 'warning' | 'failed';
  message: string;
  assignedToUserId?: Identifier | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type AuditEvent = {
  id: Identifier;
  egiId?: Identifier | null;
  actorUserId: Identifier | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId: Identifier | null;
  source: string;
  result: string;
  details?: Record<string, unknown>;
  createdAt: Timestamp;
};

export type Publication = {
  id: Identifier;
  egiId?: Identifier | null;
  datasetId: Identifier | null;
  target: 'public_portal' | 'geo_bi' | 'ferm' | 'api';
  status: 'draft' | 'queued' | 'published' | 'failed';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ReportTemplate = {
  id: Identifier;
  code: string;
  name: string;
  target: string;
  description?: string;
  status?: string;
  latestRun?: ReportRun | null;
};

export type ReportFrameworkCode =
  | 'NATIONAL_CHAPTER'
  | 'REGIONAL_RESTORATION'
  | 'BTR'
  | 'NDC'
  | 'GBF_TARGET_2'
  | 'LDN'
  | 'CUSTOM';

export type ReportWorkflowStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type ReportCoverageStatus =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'MISSING'
  | 'NOT_APPLICABLE'
  | 'PENDING_VALIDATION'
  | 'MANUAL_REQUIRED';

export type ReportFramework = {
  id: Identifier;
  code: ReportFrameworkCode;
  name: string;
  description: string;
  status: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ReportReferenceMilestone = {
  id: Identifier;
  code: string;
  dueYear: number;
  label: string;
  shortLabel: string;
  category: 'PREPARATION' | 'BIODIVERSITY' | 'CLIMATE' | 'LAND' | 'SUSTAINABLE_DEVELOPMENT' | 'REGIONAL';
  relatedFrameworkCode: ReportFrameworkCode | null;
  timingPrecision: 'YEAR' | 'QUARTER' | 'DATE';
  guidance: string;
  sourceNote: string;
  referenceUrl: string | null;
  status: 'reference' | 'confirmed' | 'superseded';
};

export type ReportCommitmentContribution = {
  id: Identifier;
  institutionId: Identifier;
  institutionName: string;
  responsibleUserId: Identifier | null;
  responsibleName: string | null;
  responsibleEmail: string | null;
  dueDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'VALIDATED' | 'CHANGES_REQUESTED' | 'NOT_APPLICABLE';
  notes: string | null;
  submission: Record<string, unknown>;
  submittedAt: Timestamp | null;
  reviewedAt: Timestamp | null;
  documents: Array<{ id: Identifier; name: string; validationStatus: string }>;
  datasets: Array<{ id: Identifier; title: string; status: string }>;
  indicators: Array<{ id: Identifier; code: string; name: string; unit: string; value: number | null }>;
};

export type ReportCommitment = {
  id: Identifier;
  egiId: Identifier;
  frameworkId: Identifier | null;
  frameworkCode: ReportFrameworkCode | null;
  frameworkName: string | null;
  referenceMilestoneId: Identifier | null;
  referenceLabel: string | null;
  coordinatingInstitutionId: Identifier | null;
  coordinatingInstitutionName: string | null;
  reportId: Identifier | null;
  title: string;
  countryCode: string | null;
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  dueDate: string;
  internalCutoffDate: string | null;
  instructions: string | null;
  status: 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'CLOSED' | 'CANCELLED';
  contributionCount: number;
  submittedCount: number;
  validatedCount: number;
  daysRemaining: number;
  urgency: 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'CLOSED';
  reminderRule: { enabled: boolean; daysBefore: number[]; overdueEveryDays: number };
  contributions: ReportCommitmentContribution[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ReportNotification = {
  id: Identifier;
  commitmentId: Identifier;
  contributionId: Identifier | null;
  kind: 'ASSIGNED' | 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE' | 'CHANGES_REQUESTED';
  title: string;
  message: string;
  status: 'UNREAD' | 'READ';
  createdAt: Timestamp;
  readAt: Timestamp | null;
};

export type ConfigurableReportTemplate = {
  id: Identifier;
  code: string;
  name: string;
  description: string;
  status: string;
  frameworkCode: ReportFrameworkCode;
  frameworkName: string;
  countryCode: string | null;
  languageCode: string;
  version: number;
  egiId: Identifier | null;
  institutionId: Identifier | null;
  sectionCount: number;
  updatedAt: Timestamp;
};

export type ReportCoverageItem = {
  requirementId: Identifier;
  sectionCode: string;
  variableCode: string;
  label: string;
  required: boolean;
  minimumValidation: string;
  eligibilityRule: string | null;
  transformationRule: string | null;
  status: ReportCoverageStatus;
  validationStatus: string | null;
  datasetId: Identifier | null;
  datasetName: string | null;
  sourceId: Identifier | null;
  sourceName: string | null;
  value: unknown;
  notes: string | null;
  evaluatedAt: Timestamp;
};

export type ReportCoverage = {
  summary: {
    score: number | null;
    total: number;
    quantifiable: number;
    available: number;
    partial: number;
    pending: number;
    missing: number;
    notApplicable: number;
  };
  items: ReportCoverageItem[];
};

export type ReportInstance = {
  id: Identifier;
  egiId: Identifier;
  institutionId: Identifier | null;
  institutionName: string | null;
  templateId: Identifier;
  templateName: string;
  frameworkCode: ReportFrameworkCode;
  frameworkName: string;
  name: string;
  countryCode: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  cutoffAt: Timestamp | null;
  languageCode: string;
  visibility: 'private' | 'institutional' | 'national' | 'public';
  status: ReportWorkflowStatus;
  scope: Record<string, unknown>;
  selection: Record<string, unknown>;
  quality: Record<string, unknown>;
  latestVersion: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type IntegrationConnector = {
  id: Identifier;
  institutionId: Identifier;
  connectorType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  displayName: string;
  status: 'active' | 'inactive';
  description?: string | null;
  endpointUrl?: string | null;
  userName?: string | null;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string | null;
  authScheme?: 'none' | 'basic' | 'bearer' | 'api_key' | string | null;
  resourcePath?: string | null;
  timeoutMs?: number | null;
  credentialsConfigured?: boolean;
  config?: Record<string, unknown>;
  lastSyncAt?: Timestamp | null;
};

export type SyncJob = {
  id: Identifier;
  institutionId: Identifier;
  connectorId: Identifier;
  status: string;
  mode: 'incremental' | 'full';
  createdAt: Timestamp;
};

export type Incident = {
  id: Identifier;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved';
  notes?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ReportRun = {
  id: Identifier;
  templateId?: Identifier;
  publicationId?: Identifier | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | string;
  outputUrl?: string | null;
  createdByUserId?: Identifier | null;
  startedAt?: Timestamp | null;
  finishedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
};

export type User = {
  id: Identifier;
  institutionId: Identifier | null;
  institutionName?: string | null;
  email: string;
  displayName: string;
  status: 'active' | 'inactive' | 'pending';
  roles?: string[];
  activeEgiId?: Identifier | null;
  hasPassword?: boolean;
};

export type Role = {
  id: Identifier;
  code: SigiRoleCode;
  name: string;
  permissions?: Permission[];
};

export type Permission = {
  id: Identifier;
  code: string;
  name: string;
};

export type DocumentFolder = {
  id: Identifier;
  egiId?: Identifier | null;
  parentId: Identifier | null;
  institutionId: Identifier | null;
  projectId: Identifier | null;
  name: string;
  path: string;
  description?: string | null;
  visibility: string;
  createdBy?: Identifier | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: Timestamp | null;
  childFolderCount?: number;
  fileCount?: number;
};

export type DocumentFileMetadata = {
  id?: Identifier;
  fileId?: Identifier;
  country?: string | null;
  department?: string | null;
  municipality?: string | null;
  thematicArea?: string | null;
  documentType?: string | null;
  dataOwner?: string | null;
  technicalCustodian?: string | null;
  license?: string | null;
  retentionPolicy?: string | null;
  spatialReference?: string | null;
  geometryType?: string | null;
  bbox?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type DocumentFileVersion = {
  id: Identifier;
  fileId: Identifier;
  versionNumber: number;
  storageKey: string;
  originalFilename: string;
  mimeType?: string | null;
  sizeBytes: number;
  checksumSha256?: string | null;
  changeNote?: string | null;
  uploadedBy?: Identifier | null;
  uploadedAt: Timestamp;
};

export type DocumentEntityLink = {
  id: Identifier;
  fileId: Identifier;
  entityType: string;
  entityId: Identifier;
  relationType: string;
  createdAt: Timestamp;
};

export type DocumentAuditEvent = {
  id: Identifier;
  fileId?: Identifier | null;
  folderId?: Identifier | null;
  eventType: string;
  userId?: Identifier | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Timestamp;
};

export type DocumentFile = {
  id: Identifier;
  egiId?: Identifier | null;
  folderId: Identifier | null;
  institutionId: Identifier | null;
  projectId: Identifier | null;
  currentVersionId?: Identifier | null;
  name: string;
  title?: string | null;
  description?: string | null;
  fileType?: string | null;
  mimeType?: string | null;
  extension?: string | null;
  sizeBytes: number;
  checksumSha256?: string | null;
  confidentialityLevel: string;
  validationStatus: string;
  sourceType: string;
  isGeospatial: boolean;
  isPublic: boolean;
  createdBy?: Identifier | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: Timestamp | null;
  folderPath?: string | null;
  institutionName?: string | null;
  projectTitle?: string | null;
  currentVersion?: DocumentFileVersion | null;
  metadata?: DocumentFileMetadata | null;
  versions?: DocumentFileVersion[];
  links?: DocumentEntityLink[];
};
