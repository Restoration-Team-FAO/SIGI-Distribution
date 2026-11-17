import type {
  AuditEvent,
  DataSource,
  DocumentAuditEvent,
  DocumentEntityLink,
  DocumentFile,
  DocumentFileMetadata,
  DocumentFileVersion,
  DocumentFolder,
  Dataset,
  EgiSpace,
  EgiSummary,
  Indicator,
  Incident,
  Institution,
  IntegrationConnector,
  Project,
  ProjectActor,
  ProjectDatasetLink,
  ProjectDeliverable,
  ProjectDetail,
  ProjectDocument,
  ProjectIndicator,
  IndicatorWorkspaceDetail,
  IndicatorWorkspaceItem,
  ProjectMilestone,
  ProjectPortfolio,
  ProjectTerritory,
  Publication,
  Permission,
  GeoFeatureCollection,
  GeoFeatureQuery,
  GeoFeatureQueryResult,
  GeoBiModule,
  GeoLayer,
  GeoLayerMetadata,
  GeoLayerSchema,
  GeoDatasetProfile,
  GeoLayerFieldStats,
  GeoNearbyTerritoryResult,
  GeoLayerIntersectionResult,
  GeoSavedView,
  GeoTerritorySearchResult,
  GlobalSearchItem,
  GlobalSearchResultType,
  AskSigiAnswer,
  ReportTemplate,
  ReportFramework,
  ReportReferenceMilestone,
  ReportCommitment,
  ReportNotification,
  ConfigurableReportTemplate,
  ReportCoverage,
  ReportInstance,
  Role,
  Territory,
  User,
  ValidationResult,
} from '@sigi/domain';
import type { SyncJobStatus } from '@sigi/shared';

export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type HealthResponse = {
  status: 'ok';
  component: string;
};

export type ReadyResponse = {
  status: 'ready' | 'not_ready';
  dependencies: Record<string, 'ok' | 'error'>;
  timestamp: string;
};

export type CatalogListResponse = ApiEnvelope<{
  catalogs: Array<{ code: string; name: string; version: string }>;
}>;

export type SchemaListResponse = ApiEnvelope<{
  schemas: Array<{ code: string; title: string; version: string }>;
}>;

export type DatasetSubmissionRequest = {
  institutionId: string;
  sourceId: string;
  schemaCode: string;
  payload: Record<string, unknown>;
};

export type DatasetResponse = ApiEnvelope<{ dataset: Dataset }>;
export type DatasetValidationResponse = ApiEnvelope<{
  datasetId: string;
  status: 'pending' | 'passed' | 'warning' | 'failed';
  results: Array<{ ruleCode: string; status: string; message: string }>;
}>;

export type AuditListResponse = ApiEnvelope<{ audit: AuditEvent[] }>;
export type ProjectsListResponse = ApiEnvelope<{ projects: Project[] }>;
export type GlobalSearchResponse = ApiEnvelope<{
  query: string;
  scope: 'active' | 'global';
  items: GlobalSearchItem[];
  groups: Array<{ type: GlobalSearchResultType; label: string; count: number }>;
  omittedTypes: GlobalSearchResultType[];
}>;
export type AskSigiResponse = ApiEnvelope<AskSigiAnswer>;
export type ProjectResponse = ApiEnvelope<{ project: Project }>;
export type ProjectDetailResponse = ApiEnvelope<ProjectDetail>;
export type ProjectPortfolioSummaryResponse = ApiEnvelope<{
  portfolios: ProjectPortfolio[];
  summary: {
    totalProjects: number;
    activeProjects: number;
    publishedProjects: number;
    totalAreaHa: number;
    featuredProjects: number;
  };
}>;
export type ProjectActorsResponse = ApiEnvelope<{ actors: ProjectActor[] }>;
export type ProjectMilestonesResponse = ApiEnvelope<{ milestones: ProjectMilestone[] }>;
export type ProjectIndicatorsResponse = ApiEnvelope<{ indicators: ProjectIndicator[] }>;
export type ProjectTerritoriesResponse = ApiEnvelope<{ territories: ProjectTerritory[] }>;
export type ProjectDeliverablesResponse = ApiEnvelope<{ deliverables: ProjectDeliverable[] }>;
export type ProjectDocumentsResponse = ApiEnvelope<{ documents: ProjectDocument[] }>;
export type ProjectDatasetsResponse = ApiEnvelope<{ datasets: ProjectDatasetLink[] }>;
export type ProjectIncidentsResponse = ApiEnvelope<{ incidents: Incident[] }>;
export type ProjectAuditResponse = ApiEnvelope<{ audit: AuditEvent[] }>;
export type IndicatorsListResponse = ApiEnvelope<{ indicators: Indicator[] }>;
export type AdminIndicatorsResponse = ApiEnvelope<{ indicators: IndicatorWorkspaceItem[] }>;
export type AdminIndicatorDetailResponse = ApiEnvelope<IndicatorWorkspaceDetail>;
export type TerritoriesListResponse = ApiEnvelope<{ territories: Territory[] }>;
export type TerritoryFeaturesResponse = ApiEnvelope<GeoFeatureCollection>;
export type GeoBiModuleResponse = ApiEnvelope<{ module: GeoBiModule }>;

/**
 * Response shapes for the /geo/* API planned in P0-3. Not wired to any
 * controller in P0-2 — published now so the endpoint work implements
 * against a reviewed contract instead of improvising one per handler.
 */
export type GeoLayersListResponse = ApiEnvelope<{ layers: GeoLayer[] }>;
export type GeoLayerResponse = ApiEnvelope<{ layer: GeoLayer; metadata: GeoLayerMetadata | null }>;
export type GeoLayerSchemaResponse = ApiEnvelope<GeoLayerSchema>;
/** P1-2 — GET /geo/layers/:code/profile. `profile: null` when never profiled (docs/geo/postgis.md §2). */
export type GeoLayerProfileResponse = ApiEnvelope<{ profile: GeoDatasetProfile | null }>;
export type GeoFeatureQueryRequest = GeoFeatureQuery;
export type GeoFeatureQueryResponse = ApiEnvelope<GeoFeatureQueryResult>;
/** P1-1 — GET /geo/search. */
export type GeoSearchResponse = ApiEnvelope<{ results: GeoTerritorySearchResult[] }>;
/** P1-4 — GET/POST/DELETE /geo/saved-views. */
export type GeoSavedViewsListResponse = ApiEnvelope<{ views: GeoSavedView[] }>;
export type GeoSavedViewResponse = ApiEnvelope<{ view: GeoSavedView }>;
export type GeoSavedViewDeleteResponse = ApiEnvelope<{ id: string; deleted: boolean }>;
/** P1-5 — GET /geo/layers/:code/stats. */
export type GeoLayerStatsResponse = ApiEnvelope<{ stats: GeoLayerFieldStats }>;
/** P1-6 — POST /geo/layers/:code/nearby. */
export type GeoNearbyResponse = ApiEnvelope<{ results: GeoNearbyTerritoryResult[] }>;
/** POST /geo/analysis/intersection. */
export type GeoLayerIntersectionResponse = ApiEnvelope<{ result: GeoLayerIntersectionResult }>;

export type AdminSourcesResponse = ApiEnvelope<{ sources: DataSource[] }>;
export type AdminEgiWorkspaceResponse = ApiEnvelope<{
  spaces: EgiSpace[];
  activeEgiId: string | null;
  activeEgi: EgiSpace | null;
  requiresCreation: boolean;
  currentUser: {
    email: string | null;
    roles: string[];
    permissions: string[];
    canUseGlobalView: boolean;
  };
}>;
export type AdminEgiSummaryResponse = ApiEnvelope<EgiSummary>;
export type AdminInstitutionsResponse = ApiEnvelope<{ institutions: Institution[] }>;
export type AdminConnectorsResponse = ApiEnvelope<{
  connectors: IntegrationConnector[];
}>;
export type AdminConnectorRunResponse = ApiEnvelope<{
  connectorId: string;
  jobId: string;
  status: SyncJobStatus;
}>;
export type AdminValidationsResponse = ApiEnvelope<{
  validations: ValidationResult[];
}>;
export type AdminPublicationsResponse = ApiEnvelope<{
  publications: Publication[];
}>;
export type AdminIncidentsResponse = ApiEnvelope<{
  incidents: Array<{ id: string; title: string; severity: string; status: string }>;
}>;
export type AdminUsersResponse = ApiEnvelope<{ users: User[] }>;
export type AdminUserResponse = ApiEnvelope<{ user: User }>;
export type AdminUserDeleteResponse = ApiEnvelope<{ id: string; deleted: boolean }>;
export type AdminRolesResponse = ApiEnvelope<{ roles: Role[] }>;
export type AdminRoleResponse = ApiEnvelope<{ role: Role }>;
export type AdminRoleDeleteResponse = ApiEnvelope<{ id: string; deleted: boolean }>;
export type AdminPermissionsResponse = ApiEnvelope<{ permissions: Permission[] }>;
export type AdminAuditResponse = AuditListResponse;
export type AuthSessionResponse = ApiEnvelope<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  user: User;
}>;
export type AuthMeResponse = ApiEnvelope<{ user: User }>;
export type AdminFilesTreeResponse = ApiEnvelope<{
  folders: DocumentFolder[];
  rootFolders: DocumentFolder[];
}>;
export type AdminFolderItemsResponse = ApiEnvelope<{
  folder: DocumentFolder | null;
  folders: DocumentFolder[];
  files: DocumentFile[];
  breadcrumb: DocumentFolder[];
}>;
export type AdminFolderResponse = ApiEnvelope<{ folder: DocumentFolder }>;
export type AdminFileResponse = ApiEnvelope<{ file: DocumentFile }>;
export type AdminFileVersionsResponse = ApiEnvelope<{ versions: DocumentFileVersion[] }>;
export type AdminFileAuditResponse = ApiEnvelope<{ audit: DocumentAuditEvent[] }>;
export type AdminFilesSearchResponse = ApiEnvelope<{ files: DocumentFile[] }>;
export type AdminFileDownloadResponse = {
  blob: Blob;
  fileName: string;
};
export type AdminFileMetadataResponse = ApiEnvelope<{ metadata: DocumentFileMetadata }>;
export type AdminFileLinkResponse = ApiEnvelope<{ link: DocumentEntityLink }>;

export type PublicDashboardSummaryResponse = ApiEnvelope<{
  institutions: number;
  projectCount: number;
  sourceCount: number;
  qualityScore: number;
}>;
export type PublicDocumentsResponse = ApiEnvelope<{ files: DocumentFile[] }>;

export type ReportsListResponse = ApiEnvelope<{
  reports: ReportTemplate[];
}>;

export type ReportResponse = ApiEnvelope<{
  report: ReportTemplate;
}>;

export type AdminReportsResponse = ApiEnvelope<{ reports: ReportInstance[] }>;
export type AdminReportResponse = ApiEnvelope<{ report: ReportInstance & { coverage?: ReportCoverage } }>;
export type ReportFrameworksResponse = ApiEnvelope<{ frameworks: ReportFramework[] }>;
export type ReportReferenceCalendarResponse = ApiEnvelope<{
  startYear: number;
  endYear: number;
  disclaimer: string;
  milestones: ReportReferenceMilestone[];
}>;
export type ReportCommitmentsResponse = ApiEnvelope<{ commitments: ReportCommitment[] }>;
export type ReportCommitmentResponse = ApiEnvelope<{ commitment: ReportCommitment }>;
export type ReportContributionEvidenceResponse = ApiEnvelope<{
  documents: Array<{ id: string; name: string; validationStatus: string }>;
  datasets: Array<{ id: string; title: string; schemaCode: string; status: string }>;
  indicators: Array<{ id: string; code: string; name: string; unit: string; currentValue: number | null }>;
}>;
export type ReportContributionParticipantsResponse = ApiEnvelope<{ institutions: Array<{
  id: string; code: string; name: string;
  users: Array<{ id: string; displayName: string; email: string }>;
}> }>;
export type ReportNotificationsResponse = ApiEnvelope<{ notifications: ReportNotification[] }>;
export type ReportTemplatesResponse = ApiEnvelope<{ templates: ConfigurableReportTemplate[] }>;
export type ReportCoverageResponse = ApiEnvelope<ReportCoverage>;
export type ReportsDashboardResponse = ApiEnvelope<{
  summary: {
    total: number; drafts: number; inReview: number; approved: number;
    published: number; activeTemplates: number; currentPeriod: number;
    dataPending: number; validationPending: number;
  };
  byFramework: Array<{ code: string; count: number }>;
  recentActivity: Array<{
    id: string; reportId: string; reportName: string; version: string | null;
    user: string | null; action: string; status: string; date: string;
  }>;
}>;

export type IncidentsListResponse = ApiEnvelope<{
  incidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
}>;

export type ExportTargetResponse = ApiEnvelope<{
  target: string;
  status: string;
  latestRun: {
    id: string;
    datasetId: string | null;
    reportRunId: string | null;
    requestedByUserId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    details: Record<string, unknown>;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
}>;

export type ExportTargetsResponse = ApiEnvelope<{
  targets: Array<{
    target: string;
    status: string;
    latestRun: {
      id: string;
      datasetId: string | null;
      reportRunId: string | null;
      requestedByUserId: string | null;
      startedAt: string | null;
      finishedAt: string | null;
      details: Record<string, unknown>;
      createdAt: string | null;
      updatedAt: string | null;
    } | null;
  }>;
}>;
