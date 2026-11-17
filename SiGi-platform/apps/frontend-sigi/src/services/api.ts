import type {
  ApiEnvelope,
  AskSigiResponse,
  AdminAuditResponse,
  AdminConnectorsResponse,
  AdminEgiSummaryResponse,
  AdminEgiWorkspaceResponse,
  AdminFileAuditResponse,
  AdminFileLinkResponse,
  AdminFileMetadataResponse,
  AdminFileResponse,
  AdminFilesSearchResponse,
  AdminFilesTreeResponse,
  AdminFileVersionsResponse,
  AdminFolderItemsResponse,
  AdminFolderResponse,
  AdminIncidentsResponse,
  AdminInstitutionsResponse,
  AdminPermissionsResponse,
  AdminPublicationsResponse,
  AdminRoleDeleteResponse,
  AdminRoleResponse,
  AdminRolesResponse,
  AuthMeResponse,
  AuthSessionResponse,
  AdminUserDeleteResponse,
  AdminUserResponse,
  AdminSourcesResponse,
  AdminUsersResponse,
  AdminValidationsResponse,
  AdminReportsResponse,
  AdminReportResponse,
  ReportFrameworksResponse,
  ReportReferenceCalendarResponse,
  ReportCommitmentsResponse,
  ReportCommitmentResponse,
  ReportContributionEvidenceResponse,
  ReportContributionParticipantsResponse,
  ReportNotificationsResponse,
  ReportTemplatesResponse,
  ReportCoverageResponse,
  ReportsDashboardResponse,
  ExportTargetResponse,
  ExportTargetsResponse,
  GeoBiModuleResponse,
  GeoFeatureQueryResponse,
  GeoLayerProfileResponse,
  GeoLayerResponse,
  GeoLayerSchemaResponse,
  GeoLayersListResponse,
  GeoLayerStatsResponse,
  GeoNearbyResponse,
  GeoLayerIntersectionResponse,
  GlobalSearchResponse,
  GeoSavedViewDeleteResponse,
  GeoSavedViewResponse,
  GeoSavedViewsListResponse,
  GeoSearchResponse,
  ProjectDetailResponse,
  ProjectPortfolioSummaryResponse,
  ProjectsListResponse,
  PublicDocumentsResponse,
  TerritoryFeaturesResponse,
  IndicatorsListResponse,
  AdminIndicatorsResponse,
  AdminIndicatorDetailResponse,
} from '@sigi/contracts';
import type { GeoFeatureQueryFilter, GeoSavedViewState, ProjectDetail } from '@sigi/domain';
import { normalizeApiText } from '@sigi/shared';

const API_BASE_URL =
  import.meta.env.VITE_SIGI_API_URL ?? 'http://localhost:3000/api';
const GEOSERVER_WMS_URL = import.meta.env.VITE_GEOSERVER_WMS_URL ?? '';
const GEOSERVER_ENABLED = String(import.meta.env.VITE_GEOSERVER_ENABLED ?? 'false') === 'true';
const GEOSERVER_TERRITORIES_LAYER =
  import.meta.env.VITE_GEOSERVER_TERRITORIES_LAYER ?? 'sigi:public_territories';
const GEOSERVER_PROJECT_LAYER =
  import.meta.env.VITE_GEOSERVER_PROJECT_LAYER ?? 'sigi:public_project_polygons';
const ADMIN_SESSION_STORAGE_KEY = 'sigi.admin.token';
const ADMIN_AUTH_INVALID_EVENT = 'sigi-admin-auth-invalid';
type StoredAdminSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
  user: import('@sigi/domain').User | null;
};

let adminSession: StoredAdminSession | null = null;
let activeEgiId: string | null = null;
let refreshInFlight: Promise<string> | null = null;
type AdminScope = 'active' | 'global';

async function requireAdminToken() {
  const token = await resolveAdminAccessToken();
  if (!token) {
    throw new Error('Admin session token required');
  }
  return token;
}

export function getAdminSessionToken() {
  return adminSession?.accessToken ?? null;
}

export function getAdminSessionUser() {
  return adminSession?.user ?? null;
}

export function setAdminSessionToken(session: {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  user: import('@sigi/domain').User;
}) {
  const accessToken = session.accessToken.trim();
  const refreshToken = session.refreshToken.trim();
  if (!accessToken || !refreshToken) {
    clearAdminSessionToken();
    return;
  }

  adminSession = {
    accessToken,
    refreshToken,
    expiresAt: new Date(session.expiresAt).getTime(),
    refreshExpiresAt: new Date(session.refreshExpiresAt).getTime(),
    user: session.user,
  };

  if (typeof window !== 'undefined') {
    persistAdminSession();
  }
}

export function hydrateAdminSessionToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  const storedToken = window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  if (!storedToken) {
    clearAdminSessionToken();
    return null;
  }

  try {
    const parsed = JSON.parse(storedToken) as Partial<StoredAdminSession>;
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      typeof parsed.refreshExpiresAt !== 'number'
    ) {
      clearAdminSessionToken();
      return null;
    }

    adminSession = {
      accessToken: parsed.accessToken.trim(),
      refreshToken: parsed.refreshToken.trim(),
      expiresAt: parsed.expiresAt,
      refreshExpiresAt: parsed.refreshExpiresAt,
      user: parsed.user ?? null,
    };
  } catch {
    clearAdminSessionToken();
    return null;
  }

  if (isSessionExpired()) {
    clearAdminSessionToken();
    return null;
  }

  persistAdminSession();
  return adminSession?.accessToken ?? null;
}

export function clearAdminSessionToken() {
  adminSession = null;
  refreshInFlight = null;
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  }
}

export function isAdminSessionActive() {
  return getAdminSessionToken() !== null;
}

export function getAdminAuthInvalidEventName() {
  return ADMIN_AUTH_INVALID_EVENT;
}

export function getActiveAdminEgiId() {
  return activeEgiId;
}

export function setActiveAdminEgiId(nextEgiId: string | null) {
  activeEgiId = nextEgiId?.trim() ? nextEgiId.trim() : null;
}

function isSessionExpired() {
  return adminSession !== null && adminSession.refreshExpiresAt <= Date.now();
}

function isAccessTokenExpired() {
  return adminSession !== null && adminSession.expiresAt <= Date.now();
}

function shouldRefreshAccessToken() {
  return adminSession !== null && adminSession.expiresAt - Date.now() <= 60_000;
}

function persistAdminSession() {
  if (!adminSession || typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(adminSession));
}

async function resolveAdminAccessToken() {
  if (!adminSession) {
    return null;
  }
  if (isSessionExpired()) {
    clearAdminSessionToken();
    return null;
  }
  if (isAccessTokenExpired() || shouldRefreshAccessToken()) {
    return requestSessionRefresh();
  }
  return adminSession.accessToken;
}

async function requestSessionRefresh() {
  if (!adminSession) {
    throw new Error('Admin session expired');
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: adminSession?.refreshToken,
        }),
      });
      if (!response.ok) {
        throw await buildRequestError(response);
      }

      const payload = normalizeApiText((await response.json()) as AuthSessionResponse);
      setAdminSessionToken(payload.data);
      return payload.data.accessToken;
    } catch (error) {
      clearAdminSessionToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ADMIN_AUTH_INVALID_EVENT));
      }
      throw buildTransportError(error);
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function buildRequestError(response: Response) {
  const fallbackMessage = `Request failed: ${response.status}`;
  const responseRequestId = response.headers.get('x-request-id');
  if (response.status === 401) {
    clearAdminSessionToken();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ADMIN_AUTH_INVALID_EVENT));
    }
  }
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
      code?: string;
      requestId?: string;
    };
    const requestId = payload.requestId ?? responseRequestId;
    const code =
      typeof payload.code === 'string' && payload.code.trim().length > 0
        ? payload.code.trim()
        : null;
    const appendDiagnostics = (message: string) => {
      const parts = [message.trim()];
      if (code) {
        parts.push(`Código: ${code}`);
      }
      if (requestId) {
        parts.push(`Ref: ${requestId}`);
      }
      return parts.join(' · ');
    };
    if (Array.isArray(payload.message)) {
      return new Error(appendDiagnostics(payload.message.join(', ')));
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return new Error(appendDiagnostics(payload.message));
    }
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return new Error(appendDiagnostics(payload.error));
    }
  } catch {
    const suffix = responseRequestId ? ` · Ref: ${responseRequestId}` : '';
    return new Error(`${fallbackMessage}${suffix}`);
  }
  const suffix = responseRequestId ? ` · Ref: ${responseRequestId}` : '';
  return new Error(`${fallbackMessage}${suffix}`);
}

function buildTransportError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim().toLowerCase();
    if (message === 'failed to fetch' || message.includes('networkerror')) {
      return new Error(
        'No se pudo conectar con la API del SIGI. Verifica que el backend esté activo y vuelve a intentar.',
      );
    }
    return error;
  }

  return new Error('No se pudo completar la solicitud hacia la API del SIGI.');
}

async function getJson<T>(path: string): Promise<T> {
  try {
    const token = await requireAdminToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(activeEgiId ? { 'X-SIGI-EGI-ID': activeEgiId } : {}),
      },
    });
    if (!response.ok) {
      throw await buildRequestError(response);
    }

    return normalizeApiText((await response.json()) as T);
  } catch (error) {
    throw buildTransportError(error);
  }
}

async function postForm<T>(path: string, body: FormData): Promise<T> {
  try {
    const token = await requireAdminToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(activeEgiId ? { 'X-SIGI-EGI-ID': activeEgiId } : {}),
      },
      body,
    });
    if (!response.ok) {
      throw await buildRequestError(response);
    }

    return normalizeApiText((await response.json()) as T);
  } catch (error) {
    throw buildTransportError(error);
  }
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  try {
    const token = await requireAdminToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(activeEgiId ? { 'X-SIGI-EGI-ID': activeEgiId } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await buildRequestError(response);
    }

    return normalizeApiText((await response.json()) as T);
  } catch (error) {
    throw buildTransportError(error);
  }
}

async function patchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  try {
    const token = await requireAdminToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(activeEgiId ? { 'X-SIGI-EGI-ID': activeEgiId } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await buildRequestError(response);
    }

    return normalizeApiText((await response.json()) as T);
  } catch (error) {
    throw buildTransportError(error);
  }
}

async function deleteJson<T>(path: string): Promise<T> {
  try {
    const token = await requireAdminToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(activeEgiId ? { 'X-SIGI-EGI-ID': activeEgiId } : {}),
      },
    });
    if (!response.ok) {
      throw await buildRequestError(response);
    }

    return normalizeApiText((await response.json()) as T);
  } catch (error) {
    throw buildTransportError(error);
  }
}

async function downloadJsonFile(path: string) {
  try {
    const token = await requireAdminToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(activeEgiId ? { 'X-SIGI-EGI-ID': activeEgiId } : {}),
      },
    });
    if (!response.ok) {
      throw await buildRequestError(response);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return {
      blob,
      fileName: match?.[1] ? decodeURIComponent(match[1]) : 'download',
    };
  } catch (error) {
    throw buildTransportError(error);
  }
}

/**
 * P0-8 — dedicated from downloadJsonFile (used elsewhere for admin file
 * downloads) because export responses carry extra bookkeeping headers
 * (X-SIGI-Export-*) callers need to show a truncation notice — never let a
 * capped export look like a complete one. Same admin bearer-token/EGI-scope
 * headers as every other authenticated call.
 */
async function downloadGeoExport(path: string) {
  try {
    const token = await requireAdminToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(activeEgiId ? { 'X-SIGI-EGI-ID': activeEgiId } : {}),
      },
    });
    if (!response.ok) {
      throw await buildRequestError(response);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return {
      blob,
      fileName: match?.[1] ? decodeURIComponent(match[1]) : 'export',
      totalFeatures: Number(response.headers.get('x-sigi-export-total') ?? '0'),
      exportedCount: Number(response.headers.get('x-sigi-export-exported') ?? '0'),
      truncated: response.headers.get('x-sigi-export-truncated') === 'true',
    };
  } catch (error) {
    throw buildTransportError(error);
  }
}

function withAdminScope(path: string, scope?: AdminScope) {
  if (!scope || scope === 'active') {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}scope=${scope}`;
}

export async function loginAdminSession(email: string, password: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    });
    if (!response.ok) {
      throw await buildRequestError(response);
    }

    const payload = normalizeApiText((await response.json()) as AuthSessionResponse);
    setAdminSessionToken(payload.data);
    return payload.data;
  } catch (error) {
    throw buildTransportError(error);
  }
}

export async function logoutAdminSession() {
  try {
    const token = await resolveAdminAccessToken();
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch {
    // Best effort logout.
  } finally {
    clearAdminSessionToken();
  }
}

export async function refreshAdminSessionUser() {
  const payload = await getJson<AuthMeResponse>('/auth/me');
  if (adminSession) {
    adminSession = {
      ...adminSession,
      user: payload.data.user,
    };
    persistAdminSession();
  }
  return payload.data.user;
}

export const workspaceApi = {
  askSigi: (question: string, scope: AdminScope = 'active') =>
    postJson<AskSigiResponse>('/admin/assistant/ask', { question, scope }),
  globalSearch: (query: string, scope: AdminScope = 'active', limit = 5) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (scope === 'global') params.set('scope', scope);
    return getJson<GlobalSearchResponse>(`/admin/search?${params.toString()}`);
  },
  getIndicators: (scope?: AdminScope) =>
    getJson<AdminIndicatorsResponse>(withAdminScope('/admin/indicators', scope)),
  getIndicatorDetail: (code: string, scope?: AdminScope) =>
    getJson<AdminIndicatorDetailResponse>(withAdminScope(`/admin/indicators/${encodeURIComponent(code)}`, scope)),
  getReportsDashboard: () => getJson<ReportsDashboardResponse>('/admin/reports/dashboard'),
  getReportFrameworks: () => getJson<ReportFrameworksResponse>('/admin/reports/frameworks'),
  getReportReferenceCalendar: () => getJson<ReportReferenceCalendarResponse>('/admin/reports/calendar'),
  getReportCommitments: () => getJson<ReportCommitmentsResponse>('/admin/reports/commitments'),
  getReportContributionEvidence: () => getJson<ReportContributionEvidenceResponse>('/admin/reports/commitments/evidence'),
  getReportContributionParticipants: () => getJson<ReportContributionParticipantsResponse>('/admin/reports/commitments/participants'),
  updateReportContributionAssignments: (id: string, assignments: Array<{ institutionId: string; responsibleUserId?: string | null }>) =>
    patchJson<ReportCommitmentResponse>(`/admin/reports/commitments/${id}/assignments`, { assignments }),
  updateReportReminderRule: (id: string, input: { enabled: boolean; daysBefore: number[]; overdueEveryDays: number }) =>
    patchJson<ApiEnvelope<{ reminderRule: Record<string, unknown> }>>(`/admin/reports/commitments/${id}/reminders`, input),
  processReportReminders: () => postJson<ApiEnvelope<{ created: number; processedAt: string }>>('/admin/reports/commitments/reminders/process', {}),
  getReportNotifications: () => getJson<ReportNotificationsResponse>('/admin/reports/notifications'),
  refreshReportNotifications: () => postJson<ApiEnvelope<{ created: number; processedAt: string }>>('/admin/reports/notifications/refresh', {}),
  markReportNotificationRead: (id: string) => patchJson<ApiEnvelope<{ notification: { id: string; status: string } }>>(`/admin/reports/notifications/${id}/read`, {}),
  exportReportCommitments: (format: 'xlsx'|'ics', filters?: { year?: number; status?: string; institutionId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.year) params.set('year', String(filters.year));
    if (filters?.status) params.set('status', filters.status);
    if (filters?.institutionId) params.set('institutionId', filters.institutionId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return downloadJsonFile(`/admin/reports/commitments/export/${format}${suffix}`);
  },
  createReportCommitment: (input: {
    title: string; frameworkCode?: string | null; referenceMilestoneId?: string | null;
    coordinatingInstitutionId: string; countryCode?: string | null;
    reportingPeriodStart?: string | null; reportingPeriodEnd?: string | null;
    dueDate: string; internalCutoffDate?: string | null; instructions?: string | null;
    status?: string; institutionIds: string[];
  }) => postJson<ReportCommitmentResponse>('/admin/reports/commitments', input),
  updateReportCommitment: (id: string, input: { title?: string; dueDate?: string; internalCutoffDate?: string | null; instructions?: string | null; status?: string }) =>
    patchJson<ReportCommitmentResponse>(`/admin/reports/commitments/${id}`, input),
  submitReportContribution: (id: string, input: { notes?: string; submission?: Record<string, unknown> }) =>
    postJson<ApiEnvelope<{ contributionId: string; commitment: import('@sigi/domain').ReportCommitment }>>(`/admin/reports/commitments/${id}/contributions/submit`, input),
  reviewReportContribution: (id: string, contributionId: string, input: { status: 'VALIDATED' | 'CHANGES_REQUESTED'; notes?: string }) =>
    postJson<ReportCommitmentResponse>(`/admin/reports/commitments/${id}/contributions/${contributionId}/review`, input),
  consolidateReportCommitment: (id: string, name?: string) =>
    postJson<ApiEnvelope<{ commitment: import('@sigi/domain').ReportCommitment; report: import('@sigi/domain').ReportInstance }>>(`/admin/reports/commitments/${id}/consolidate`, { name: name ?? '' }),
  getReportTemplates: () => getJson<ReportTemplatesResponse>('/admin/reports/templates'),
  getReportMappings: () => getJson<ApiEnvelope<{ mappings: Array<{
    id: string; indicatorCode: string; indicatorName: string; frameworkCode: string;
    frameworkName: string; reportVariableCode: string; mappingType: string;
    eligibilityRule: string | null; transformationRule: string | null; status: string; version: number;
  }> }>>('/admin/reports/mappings'),
  getReportIndicators: () => getJson<IndicatorsListResponse>('/indicators'),
  getReportDatasets: () => getJson<ApiEnvelope<{ datasets: import('@sigi/domain').Dataset[] }>>('/datasets'),
  getReports: () => getJson<AdminReportsResponse>('/admin/reports'),
  getReport: (id: string) => getJson<AdminReportResponse>(`/admin/reports/${id}`),
  getReportCoverage: (id: string) => getJson<ReportCoverageResponse>(`/admin/reports/${id}/coverage`),
  createReport: (input: {
    templateId: string;
    name: string;
    countryCode?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    cutoffAt?: string | null;
    languageCode?: string;
    visibility?: string;
    scope?: Record<string, unknown>;
    selection?: Record<string, unknown>;
    quality?: Record<string, unknown>;
  }) => postJson<AdminReportResponse>('/admin/reports', input),
  updateReport: (id: string, input: {
    name?: string;
    countryCode?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    cutoffAt?: string | null;
    languageCode?: string;
    visibility?: string;
    scope?: Record<string, unknown>;
    selection?: Record<string, unknown>;
    quality?: Record<string, unknown>;
  }) => patchJson<AdminReportResponse>(`/admin/reports/${id}`, input),
  generateReport: (id: string) => postJson<ApiEnvelope<{ version: Record<string, unknown> }>>(`/admin/reports/${id}/generate`, {}),
  validateReport: (id: string) => postJson<ApiEnvelope<{ valid: boolean; findings: Array<{ severity: string; code: string; message: string }> }>>(`/admin/reports/${id}/validate`, {}),
  submitReportReview: (id: string, comment?: string) => postJson<AdminReportResponse>(`/admin/reports/${id}/submit-review`, { comment: comment ?? '' }),
  startReportReview: (id: string, comment?: string) => postJson<AdminReportResponse>(`/admin/reports/${id}/review`, { comment: comment ?? '' }),
  requestReportChanges: (id: string, comment?: string) => postJson<AdminReportResponse>(`/admin/reports/${id}/request-changes`, { comment: comment ?? '' }),
  approveReport: (id: string, comment?: string) => postJson<AdminReportResponse>(`/admin/reports/${id}/approve`, { comment: comment ?? '' }),
  publishReport: (id: string, comment?: string) => postJson<AdminReportResponse>(`/admin/reports/${id}/publish`, { comment: comment ?? '' }),
  exportReportJson: (id: string) => downloadJsonFile(`/admin/reports/${id}/export/json`),
  getEgiWorkspace: () => getJson<AdminEgiWorkspaceResponse>('/admin/egi'),
  getEgiSummary: (egiId: string) => getJson<AdminEgiSummaryResponse>(`/admin/egi/${egiId}/summary`),
  createEgi: (input: {
    institutionId?: string | null;
    code: string;
    name: string;
    description?: string | null;
    responsible?: string | null;
    territorialScope?: string | null;
    thematicScope?: string | null;
    visibility?: 'public' | 'institutional' | 'internal';
    status?: 'draft' | 'active' | 'inactive';
  }) => postJson<ApiEnvelope<{ egi: import('@sigi/domain').EgiSpace }>>('/admin/egi', input),
  updateEgi: (
    id: string,
    input: {
      institutionId?: string | null;
      code?: string;
      name?: string;
      description?: string | null;
      responsible?: string | null;
      territorialScope?: string | null;
      thematicScope?: string | null;
      visibility?: 'public' | 'institutional' | 'internal';
      status?: 'draft' | 'active' | 'inactive';
    },
  ) => patchJson<ApiEnvelope<{ egi: import('@sigi/domain').EgiSpace }>>(`/admin/egi/${id}`, input),
  selectActiveEgi: (egiId: string) =>
    postJson<ApiEnvelope<{ activeEgiId: string; activeEgi: import('@sigi/domain').EgiSpace | null }>>('/admin/egi/active', { egiId }),
  getInstitutions: () => getJson<AdminInstitutionsResponse>('/admin/institutions'),
  createInstitution: (input: {
    code: string;
    name: string;
    status?: 'active' | 'inactive';
  }) =>
    postJson<ApiEnvelope<{ institution: { id: string; code: string; name: string; status: string } }>>(
      '/admin/institutions',
      input,
    ),
  updateInstitution: (
    id: string,
    input: {
      code?: string;
      name?: string;
      status?: 'active' | 'inactive';
    },
  ) =>
    patchJson<ApiEnvelope<{ institution: { id: string; code: string; name: string; status: string } }>>(
      `/admin/institutions/${id}`,
      input,
    ),
  deleteInstitution: (id: string) =>
    deleteJson<ApiEnvelope<{ id: string; deleted: boolean }>>(`/admin/institutions/${id}`),
  getSources: (scope?: AdminScope) => getJson<AdminSourcesResponse>(withAdminScope('/admin/sources', scope)),
  createSource: (input: {
    institutionId: string;
    connectorId?: string;
    code: string;
    name: string;
    sourceType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
    assetUid?: string;
    description?: string;
    userName?: string;
    country?: string | null;
    allowedCountries?: string[] | null;
    territorialScope?: string | null;
    status?: 'active' | 'inactive';
  }) =>
    postJson<
      ApiEnvelope<{
        source: {
          id: string;
          institutionId: string;
          connectorId?: string | null;
          code: string;
          name: string;
          sourceType: string;
          status: string;
          assetUid?: string | null;
          country?: string | null;
          allowedCountries?: string[];
          territorialScope?: string | null;
        };
      }>
    >('/admin/sources', input),
  updateSource: (
    id: string,
    input: {
      institutionId?: string;
      connectorId?: string | null;
      code?: string;
      name?: string;
      sourceType?: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
      assetUid?: string | null;
      description?: string | null;
      userName?: string | null;
      country?: string | null;
      allowedCountries?: string[] | null;
      territorialScope?: string | null;
      status?: 'active' | 'inactive';
    },
  ) =>
    patchJson<
      ApiEnvelope<{
        source: {
          id: string;
          institutionId: string;
          connectorId?: string | null;
          code: string;
          name: string;
          sourceType: string;
          status: string;
          assetUid?: string | null;
          description?: string | null;
          userName?: string | null;
          country?: string | null;
          allowedCountries?: string[];
          territorialScope?: string | null;
        };
      }>
    >(`/admin/sources/${id}`, input),
  deleteSource: (id: string) =>
    deleteJson<ApiEnvelope<{ id: string; deleted: boolean }>>(`/admin/sources/${id}`),
  getProjects: (filters?: {
    status?: string;
    institutionId?: string;
    portfolioId?: string;
    featured?: boolean;
    visibility?: string;
    scope?: AdminScope;
  }) => {
    const query = new URLSearchParams();
    if (filters?.status) {
      query.set('status', filters.status);
    }
    if (filters?.institutionId) {
      query.set('institutionId', filters.institutionId);
    }
    if (filters?.portfolioId) {
      query.set('portfolioId', filters.portfolioId);
    }
    if (typeof filters?.featured === 'boolean') {
      query.set('featured', String(filters.featured));
    }
    if (filters?.visibility) {
      query.set('visibility', filters.visibility);
    }
    if (filters?.scope && filters.scope !== 'active') {
      query.set('scope', filters.scope);
    }
    const suffix = query.toString().length > 0 ? `?${query.toString()}` : '';
    return getJson<ProjectsListResponse>(`/admin/projects${suffix}`);
  },
  getProjectPortfolioSummary: (scope?: AdminScope) =>
    getJson<ProjectPortfolioSummaryResponse>(withAdminScope('/admin/projects/portfolio/summary', scope)),
  getProjectDetail: (id: string, scope?: AdminScope) =>
    getJson<ProjectDetailResponse>(withAdminScope(`/admin/projects/${id}`, scope)),
  getProjectPolygon: (id: string, scope?: AdminScope) =>
    getJson<ApiEnvelope<{ polygon: ProjectPolygon | null }>>(withAdminScope(`/admin/projects/${id}/polygon`, scope)),
  getGeoBiModule: () => getJson<GeoBiModuleResponse>('/admin/geo-bi'),
  // P0-3 /geo/* API for catalog/ficha/filters/table (P0-4..P0-7; see
  // docs/geo/MAPA_SIGI_DIAGNOSTICO.md). Authenticated
  // like every other admin call — getJson always attaches the admin token,
  // so these resolve with includeInternal=true for any role holding
  // connectors.read, same as the rest of the admin console.
  getGeoLayers: () => getJson<GeoLayersListResponse>('/geo/layers'),
  getGeoLayerFeatures: (
    code: string,
    params: {
      zoom?: number;
      page?: number;
      pageSize?: number;
      filters?: GeoFeatureQueryFilter[];
      sort?: string;
      order?: 'asc' | 'desc';
    } = {},
  ) => getJson<GeoFeatureQueryResponse>(`/geo/layers/${encodeURIComponent(code)}/features${buildGeoFeaturesQuery(params)}`),
  getGeoLayerMetadata: (code: string) =>
    getJson<GeoLayerResponse>(`/geo/layers/${encodeURIComponent(code)}/metadata`),
  getGeoLayerSchema: (code: string) =>
    getJson<GeoLayerSchemaResponse>(`/geo/layers/${encodeURIComponent(code)}/schema`),
  // P1-2 — cached per-layer profile (spec §11: "estadísticas dinámicas").
  getGeoLayerProfile: (code: string) =>
    getJson<GeoLayerProfileResponse>(`/geo/layers/${encodeURIComponent(code)}/profile`),
  // P1-5 — distribution of the whole filtered result set for one field
  // (spec §12: "Mapa + BI").
  getGeoLayerStats: (code: string, field: string, filters?: GeoFeatureQueryFilter[]) => {
    const search = new URLSearchParams({ field });
    if (filters && filters.length > 0) {
      search.set('filters', JSON.stringify(filters));
    }
    return getJson<GeoLayerStatsResponse>(`/geo/layers/${encodeURIComponent(code)}/stats?${search.toString()}`);
  },
  // P1-6 — proximity search (spec §10: "consultas espaciales").
  findNearbyTerritories: (code: string, geometry: Record<string, unknown>, radiusMeters: number) =>
    postJson<GeoNearbyResponse>(`/geo/layers/${encodeURIComponent(code)}/nearby`, { geometry, radiusMeters }),
  intersectGeoLayers: (sourceLayerCode: string, targetLayerCode: string) =>
    postJson<GeoLayerIntersectionResponse>('/geo/analysis/intersection', {
      sourceLayerCode,
      targetLayerCode,
    }),
  // P0-8 — export the current filtered/sorted result set (spec §17). Same
  // visibility/filter/sort semantics as
  // getGeoLayerFeatures; unpaginated (server-capped), always full-precision.
  exportGeoLayerFeatures: (
    code: string,
    params: {
      format: 'csv' | 'xlsx' | 'geojson';
      filters?: GeoFeatureQueryFilter[];
      sort?: string;
      order?: 'asc' | 'desc';
    },
  ) => downloadGeoExport(`/geo/layers/${encodeURIComponent(code)}/export${buildGeoFeaturesQuery(params)}`),
  // P1-1 — cross-layer territorial search (spec §18). Authenticated like
  // every other workspace call.
  searchGeoTerritories: (term: string) =>
    getJson<GeoSearchResponse>(`/geo/search?q=${encodeURIComponent(term)}`),
  // P1-4 — saved views (spec §19). Requires a real session; see
  // docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.14.
  getGeoSavedViews: () => getJson<GeoSavedViewsListResponse>('/geo/saved-views'),
  createGeoSavedView: (input: { name: string; viewState: GeoSavedViewState }) =>
    postJson<GeoSavedViewResponse>('/geo/saved-views', input),
  deleteGeoSavedView: (id: string) =>
    deleteJson<GeoSavedViewDeleteResponse>(`/geo/saved-views/${encodeURIComponent(id)}`),
  getGeospatialCatalog: () =>
    getJson<
      ApiEnvelope<{
        summary: {
          catalogEntries: number;
          managedLayers: number;
          derivedLayers: number;
          publicLayers: number;
          publishedInGeoServer: number;
        };
        geoserver: {
          workspace: string | null;
          wmsUrl: string;
          wfsUrl: string;
          capabilitiesUrl: string;
          publishedLayers: GeoServerPublishedLayer[];
        };
        workbench: {
          connectors: {
            postgis: {
              host: string;
              port: string;
              database: string;
              schema: string;
              user: string;
              connectionName: string;
              qgisUriSample: string;
              sampleLayers: string[];
            };
            geoserver: {
              workspace: string | null;
              datastore: string;
              wmsUrl: string;
              wfsUrl: string;
              capabilitiesUrl: string;
            };
          };
          imports: {
            supportedFormats: string[];
            geometrySupport: string;
            notes: string;
          };
          exports: {
            supportedFormats: string[];
            notes: string;
          };
          projectPublications: GeospatialProjectPublication[];
        };
        entries: GeospatialCatalogEntry[];
      }>
    >('/admin/geospatial-catalog'),
  publishGeospatialLayer: (code: string) =>
    postJson<
      ApiEnvelope<{
        entry: GeospatialCatalogEntry;
        geoserver: {
          workspace: string | null;
          wmsUrl: string;
          wfsUrl: string;
          capabilitiesUrl: string;
          publishedLayers: GeoServerPublishedLayer[];
        };
        action: 'publish' | 'republish';
        message: string;
      }>
    >('/admin/geospatial-catalog/publish', { code }),
  publishGeospatialProject: (projectId: string) =>
    postJson<
      ApiEnvelope<{
        project: GeospatialProjectPublication;
        geoserver: {
          workspace: string | null;
          wmsUrl: string;
          wfsUrl: string;
          capabilitiesUrl: string;
          publishedLayers: GeoServerPublishedLayer[];
        };
        action: 'publish' | 'republish';
        message: string;
      }>
    >('/admin/geospatial-catalog/projects/publish', { projectId }),
  exportGeospatialLayer: (code: string) =>
    getJson<
      ApiEnvelope<{
        code: string;
        fileName: string;
        featureCount: number;
        format: 'geojson';
        featureCollection: Record<string, unknown>;
      }>
    >(`/admin/geospatial-catalog/export/${code}`),
  importGeospatialLayer: (input: {
    file: File;
    code: string;
    name: string;
    layerType?: string;
    visibility?: LayerVisibility;
    status?: 'draft' | 'active' | 'published';
    territoryLevel?: string;
    country?: string;
  }) => {
    const form = new FormData();
    form.append('file', input.file);
    form.append('code', input.code);
    form.append('name', input.name);
    if (input.layerType?.trim()) {
      form.append('layerType', input.layerType.trim());
    }
    if (input.visibility) {
      form.append('visibility', input.visibility);
    }
    if (input.status) {
      form.append('status', input.status);
    }
    if (input.territoryLevel?.trim()) {
      form.append('territoryLevel', input.territoryLevel.trim());
    }
    if (input.country?.trim()) {
      form.append('country', input.country.trim());
    }
    return postForm<
      ApiEnvelope<{
        entry: GeospatialCatalogEntry | null;
        importedFeatures: number;
        message: string;
      }>
    >('/admin/geospatial-catalog/import', form);
  },
  previewGeospatialShapefile: (input: {
    file: File;
    mappingJson?: string;
    country?: string;
    importMode?: 'project-linked' | 'reference-layer';
  }) => {
    const form = new FormData();
    form.append('file', input.file);
    if (input.mappingJson?.trim()) {
      form.append('mappingJson', input.mappingJson.trim());
    }
    if (input.country?.trim()) {
      form.append('country', input.country.trim());
    }
    if (input.importMode) {
      form.append('importMode', input.importMode);
    }
    return postForm<ApiEnvelope<ShapefilePreview>>(
      '/admin/geospatial-catalog/shapefile/preview',
      form,
    );
  },
  importGeospatialShapefile: (input: {
    file: File;
    code: string;
    name: string;
    layerType?: string;
    visibility?: LayerVisibility;
    status?: 'draft' | 'active' | 'published';
    mappingJson?: string;
    country?: string;
    importMode?: 'project-linked' | 'reference-layer';
  }) => {
    const form = new FormData();
    form.append('file', input.file);
    form.append('code', input.code);
    form.append('name', input.name);
    if (input.layerType?.trim()) {
      form.append('layerType', input.layerType.trim());
    }
    if (input.visibility) {
      form.append('visibility', input.visibility);
    }
    if (input.status) {
      form.append('status', input.status);
    }
    if (input.mappingJson?.trim()) {
      form.append('mappingJson', input.mappingJson.trim());
    }
    if (input.country?.trim()) {
      form.append('country', input.country.trim());
    }
    if (input.importMode) {
      form.append('importMode', input.importMode);
    }
    return postForm<
      ApiEnvelope<{
        entry: GeospatialCatalogEntry | null;
        importedFeatures: number;
        preview: {
          geometryType: string;
          crs: string;
          validationSummary: Record<string, unknown> | null;
        };
        message: string;
      }>
    >('/admin/geospatial-catalog/shapefile/import', form);
  },
  promoteKoboGeospatialLayer: (input: {
    sourceId: string;
    code?: string;
    name?: string;
    visibility?: LayerVisibility;
    status?: 'draft' | 'active' | 'published';
  }) =>
    postJson<
      ApiEnvelope<{
        entry: GeospatialCatalogEntry | null;
        source: {
          id: string;
          code: string;
          name: string;
        };
        syncJobId: string;
        assetUid: string | null;
        rawPages: number;
        extractedRecords: number;
        promotedFeatures: number;
        discardedRecords?: number;
        message: string;
      }>
    >('/admin/geospatial-catalog/kobo/promote', input),
  deleteGeospatialLayer: (code: string) =>
    deleteJson<
      ApiEnvelope<{
        code: string;
        deleted: boolean;
        deletedFeatures: number;
        message: string;
      }>
    >(`/admin/geospatial-catalog/${code}`),
  getGeoServerCapabilities: () =>
    getJson<ApiEnvelope<{ ok: boolean; workspace: string | null; serviceUrl: string; wfsServiceUrl: string; capabilitiesUrl: string; publishedLayers: GeoServerPublishedLayer[] }>>(
      '/admin/geo-bi/capabilities',
    ),
  getTerritoryFeatures: (level?: string, layer?: string) =>
    getJson<TerritoryFeaturesResponse>(
      `/territories/features${buildTerritoryFeaturesQuery(level, layer)}`,
    ),
  createProject: (input: Record<string, unknown>) =>
    postJson<ProjectDetailResponse>('/admin/projects', input),
  updateProject: (id: string, input: Record<string, unknown>) =>
    patchJson<ProjectDetailResponse>(`/admin/projects/${id}`, input),
  createProjectActor: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ actor: ProjectDetail['actors'][number] }>>(
      `/admin/projects/${projectId}/actors`,
      input,
    ),
  updateProjectActor: (
    projectId: string,
    actorId: string,
    input: Record<string, unknown>,
  ) =>
    patchJson<ApiEnvelope<{ actor: ProjectDetail['actors'][number] }>>(
      `/admin/projects/${projectId}/actors/${actorId}`,
      input,
    ),
  deleteProjectActor: (projectId: string, actorId: string) =>
    deleteJson<ApiEnvelope<{ deleted: boolean; id: string }>>(
      `/admin/projects/${projectId}/actors/${actorId}`,
    ),
  createProjectMilestone: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ milestone: ProjectDetail['milestones'][number] }>>(
      `/admin/projects/${projectId}/milestones`,
      input,
    ),
  updateProjectMilestone: (
    projectId: string,
    milestoneId: string,
    input: Record<string, unknown>,
  ) =>
    patchJson<ApiEnvelope<{ milestone: ProjectDetail['milestones'][number] }>>(
      `/admin/projects/${projectId}/milestones/${milestoneId}`,
      input,
    ),
  deleteProjectMilestone: (projectId: string, milestoneId: string) =>
    deleteJson<ApiEnvelope<{ deleted: boolean; id: string }>>(
      `/admin/projects/${projectId}/milestones/${milestoneId}`,
    ),
  createProjectTask: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ task: ProjectDetail['tasks'][number] }>>(`/admin/projects/${projectId}/tasks`, input),
  updateProjectTask: (projectId: string, taskId: string, input: Record<string, unknown>) =>
    patchJson<ApiEnvelope<{ task: ProjectDetail['tasks'][number] }>>(`/admin/projects/${projectId}/tasks/${taskId}`, input),
  deleteProjectTask: (projectId: string, taskId: string) =>
    deleteJson<ApiEnvelope<{ deleted: boolean; id: string }>>(`/admin/projects/${projectId}/tasks/${taskId}`),
  createProjectBudgetItem: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ budgetItem: ProjectDetail['budgetItems'][number] }>>(`/admin/projects/${projectId}/budget-items`, input),
  updateProjectBudgetItem: (projectId: string, itemId: string, input: Record<string, unknown>) =>
    patchJson<ApiEnvelope<{ budgetItem: ProjectDetail['budgetItems'][number] }>>(`/admin/projects/${projectId}/budget-items/${itemId}`, input),
  deleteProjectBudgetItem: (projectId: string, itemId: string) =>
    deleteJson<ApiEnvelope<{ deleted: boolean; id: string }>>(`/admin/projects/${projectId}/budget-items/${itemId}`),
  createProjectRisk: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ risk: ProjectDetail['risks'][number] }>>(`/admin/projects/${projectId}/risks`, input),
  updateProjectRisk: (projectId: string, riskId: string, input: Record<string, unknown>) =>
    patchJson<ApiEnvelope<{ risk: ProjectDetail['risks'][number] }>>(`/admin/projects/${projectId}/risks/${riskId}`, input),
  deleteProjectRisk: (projectId: string, riskId: string) =>
    deleteJson<ApiEnvelope<{ deleted: boolean; id: string }>>(`/admin/projects/${projectId}/risks/${riskId}`),
  updateProjectFinancialSettings: (projectId: string, input: Record<string, unknown>) =>
    patchJson<ApiEnvelope<{ financialSettings: ProjectDetail['financialSettings'] }>>(`/admin/projects/${projectId}/financial-settings`, input),
  createProjectFundingSource: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ fundingSource: ProjectDetail['fundingSources'][number] }>>(`/admin/projects/${projectId}/funding-sources`, input),
  createProjectBudgetVersion: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ budgetVersion: ProjectDetail['budgetVersions'][number] }>>(`/admin/projects/${projectId}/budget-versions`, input),
  approveProjectBudgetVersion: (projectId: string, versionId: string) =>
    postJson<ApiEnvelope<{ budgetVersion: ProjectDetail['budgetVersions'][number] }>>(`/admin/projects/${projectId}/budget-versions/${versionId}/approve`, {}),
  createProjectFinancialMovement: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ financialMovement: ProjectDetail['financialMovements'][number] }>>(`/admin/projects/${projectId}/financial-movements`, input),
  createProjectManagementRecord: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ managementRecord: ProjectDetail['managementRecords'][number] }>>(`/admin/projects/${projectId}/management-records`, input),
  createProjectStatusUpdate: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ statusUpdate: ProjectDetail['statusUpdates'][number] }>>(`/admin/projects/${projectId}/status-updates`, input),
  closeProject: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ project: ProjectDetail; checklist: Record<string, number>; closedWithPending: boolean }>>(`/admin/projects/${projectId}/close`, input),
  createProjectDeliverable: (projectId: string, input: Record<string, unknown>) =>
    postJson<ApiEnvelope<{ deliverable: ProjectDetail['deliverables'][number] }>>(
      `/admin/projects/${projectId}/deliverables`,
      input,
    ),
  updateProjectDeliverable: (
    projectId: string,
    deliverableId: string,
    input: Record<string, unknown>,
  ) =>
    patchJson<ApiEnvelope<{ deliverable: ProjectDetail['deliverables'][number] }>>(
      `/admin/projects/${projectId}/deliverables/${deliverableId}`,
      input,
    ),
  deleteProjectDeliverable: (projectId: string, deliverableId: string) =>
    deleteJson<ApiEnvelope<{ deleted: boolean; id: string }>>(
      `/admin/projects/${projectId}/deliverables/${deliverableId}`,
    ),
  updateProjectPolygon: (
    id: string,
    input: {
      territoryName?: string;
      country?: string;
      geojson: Record<string, unknown>;
    },
  ) =>
    patchJson<ApiEnvelope<{ polygon: ProjectPolygon | null }>>(
      `/admin/projects/${id}/polygon`,
      input,
    ),
  getConnectors: () => getJson<AdminConnectorsResponse>('/admin/connectors'),
  createConnector: (input: {
    institutionId: string;
    connectorType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
    displayName: string;
    description?: string;
    endpointUrl?: string;
    userName?: string;
    credentialSecret?: string;
    status?: 'active' | 'inactive';
  }) =>
    postJson<
      ApiEnvelope<{
        connector: {
          id: string;
          institutionId: string;
          connectorType: string;
          displayName: string;
          status: string;
          description?: string | null;
          endpointUrl?: string | null;
          userName?: string | null;
          credentialsConfigured?: boolean;
        };
      }>
    >('/admin/connectors', input),
  updateConnector: (
    id: string,
    input: {
      institutionId?: string;
      connectorType?: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
      displayName?: string;
      description?: string | null;
      endpointUrl?: string | null;
      userName?: string | null;
      credentialSecret?: string | null;
      status?: 'active' | 'inactive';
    },
  ) =>
    patchJson<
      ApiEnvelope<{
        connector: {
          id: string;
          institutionId: string;
          connectorType: string;
          displayName: string;
          status: string;
          description?: string | null;
          endpointUrl?: string | null;
          userName?: string | null;
          credentialsConfigured?: boolean;
        };
      }>
    >(`/admin/connectors/${id}`, input),
  deleteConnector: (id: string) =>
    deleteJson<ApiEnvelope<{ id: string; deleted: boolean }>>(`/admin/connectors/${id}`),
  getValidations: (scope?: AdminScope) =>
    getJson<AdminValidationsResponse>(withAdminScope('/admin/validations', scope)),
  getPublications: (scope?: AdminScope) =>
    getJson<AdminPublicationsResponse>(withAdminScope('/admin/publications', scope)),
  getIncidents: (scope?: AdminScope) =>
    getJson<AdminIncidentsResponse>(withAdminScope('/admin/incidents', scope)),
  getExportTargets: (scope?: AdminScope) =>
    getJson<ExportTargetsResponse>(withAdminScope('/exports', scope)),
  getExportTarget: (target: string, scope?: AdminScope) =>
    getJson<ExportTargetResponse>(withAdminScope(`/exports/${target}`, scope)),
  runExportTarget: (target: string, scope?: AdminScope) =>
    postJson<ApiEnvelope<{ target: string; status: string; exportRunId: string }>>(
      withAdminScope(`/exports/${target}/run`, scope),
      {},
    ),
  downloadExportArtifact: (target: string, scope?: AdminScope) =>
    downloadJsonFile(withAdminScope(`/exports/${target}/artifact`, scope)),
  getFilesTree: () => getJson<AdminFilesTreeResponse>('/admin/files/tree'),
  getRootFolderItems: () => getJson<AdminFolderItemsResponse>('/admin/files/root/items'),
  getFolderItems: (id: string) =>
    getJson<AdminFolderItemsResponse>(`/admin/files/folders/${id}/items`),
  createFolder: (input: {
    parentId?: string | null;
    institutionId?: string | null;
    projectId?: string | null;
    name: string;
    description?: string | null;
    visibility?: string;
  }) => postJson<AdminFolderResponse>('/admin/files/folders', input),
  updateFolder: (
    id: string,
    input: {
      parentId?: string | null;
      name?: string;
      description?: string | null;
      visibility?: string;
    },
  ) => patchJson<AdminFolderResponse>(`/admin/files/folders/${id}`, input),
  deleteFolder: (id: string) =>
    deleteJson<ApiEnvelope<{ id: string; deleted: boolean }>>(`/admin/files/folders/${id}`),
  uploadFile: (input: {
    file: File;
    folderId?: string | null;
    institutionId?: string | null;
    projectId?: string | null;
    title?: string | null;
    description?: string | null;
    confidentialityLevel?: string;
    validationStatus?: string;
    sourceType?: string;
    isGeospatial?: boolean;
    isPublic?: boolean;
    changeNote?: string | null;
  }) => {
    const form = new FormData();
    form.append('file', input.file);
    if (input.folderId) form.append('folderId', input.folderId);
    if (input.institutionId) form.append('institutionId', input.institutionId);
    if (input.projectId) form.append('projectId', input.projectId);
    if (input.title) form.append('title', input.title);
    if (input.description) form.append('description', input.description);
    if (input.confidentialityLevel) form.append('confidentialityLevel', input.confidentialityLevel);
    if (input.validationStatus) form.append('validationStatus', input.validationStatus);
    if (input.sourceType) form.append('sourceType', input.sourceType);
    if (typeof input.isGeospatial === 'boolean') form.append('isGeospatial', String(input.isGeospatial));
    if (typeof input.isPublic === 'boolean') form.append('isPublic', String(input.isPublic));
    if (input.changeNote) form.append('changeNote', input.changeNote);
    return postForm<AdminFileResponse>('/admin/files/upload', form);
  },
  getFileDetail: (id: string) => getJson<AdminFileResponse>(`/admin/files/${id}`),
  downloadFile: (id: string) => downloadJsonFile(`/admin/files/${id}/download`),
  updateFileMetadata: (id: string, input: Record<string, unknown>) =>
    patchJson<AdminFileMetadataResponse & ApiEnvelope<{ file: unknown }>>(
      `/admin/files/${id}/metadata`,
      input,
    ),
  createFileVersion: (
    id: string,
    input: {
      file: File;
      changeNote?: string | null;
    },
  ) => {
    const form = new FormData();
    form.append('file', input.file);
    if (input.changeNote) form.append('changeNote', input.changeNote);
    return postForm<AdminFileVersionsResponse & ApiEnvelope<{ file: unknown }>>(
      `/admin/files/${id}/version`,
      form,
    );
  },
  getFileVersions: (id: string) =>
    getJson<AdminFileVersionsResponse>(`/admin/files/${id}/versions`),
  linkFile: (
    id: string,
    input: { entityType: string; entityId: string; relationType?: string },
  ) => postJson<AdminFileLinkResponse>(`/admin/files/${id}/link`, input),
  unlinkFile: (id: string, linkId: string) =>
    deleteJson<AdminFileLinkResponse>(`/admin/files/${id}/link/${linkId}`),
  searchFiles: (query?: Record<string, string | boolean | undefined | null>) => {
    const params = new URLSearchParams();
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim().length > 0) {
        params.set(key, String(value));
      }
    });
    const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';
    return getJson<AdminFilesSearchResponse>(`/admin/files/search${suffix}`);
  },
  getFileAudit: (id: string) =>
    getJson<AdminFileAuditResponse>(`/admin/files/${id}/audit`),
  deleteFile: (id: string) =>
    deleteJson<ApiEnvelope<{ id: string; deleted: boolean }>>(`/admin/files/${id}`),
  getUsers: () => getJson<AdminUsersResponse>('/admin/users'),
  createUser: (input: {
    institutionId?: string | null;
    email: string;
    displayName: string;
    password?: string;
    status?: 'active' | 'inactive' | 'pending';
    roles?: string[];
  }) => postJson<AdminUserResponse>('/admin/users', input),
  updateUser: (
    id: string,
    input: {
      institutionId?: string | null;
      email?: string;
      displayName?: string;
      password?: string;
      status?: 'active' | 'inactive' | 'pending';
      roles?: string[];
    },
  ) => patchJson<AdminUserResponse>(`/admin/users/${id}`, input),
  deleteUser: (id: string) => deleteJson<AdminUserDeleteResponse>(`/admin/users/${id}`),
  getRoles: () => getJson<AdminRolesResponse>('/admin/roles'),
  getPermissions: () => getJson<AdminPermissionsResponse>('/admin/permissions'),
  createRole: (input: { code: string; name: string; permissions?: string[] }) =>
    postJson<AdminRoleResponse>('/admin/roles', input),
  updateRole: (id: string, input: { code?: string; name?: string; permissions?: string[] }) =>
    patchJson<AdminRoleResponse>(`/admin/roles/${id}`, input),
  deleteRole: (id: string) => deleteJson<AdminRoleDeleteResponse>(`/admin/roles/${id}`),
  getAudit: () => getJson<AdminAuditResponse>('/admin/audit'),
  getImportBatches: (scope?: AdminScope) =>
    getJson<ApiEnvelope<{ batches: ImportBatch[] }>>(withAdminScope('/admin/imports/batches', scope)),
  getImportBatch: (id: string, scope?: AdminScope) =>
    getJson<ApiEnvelope<{ batch: ImportBatch }>>(withAdminScope(`/admin/imports/batches/${id}`, scope)),
  getImportBatchErrors: (id: string, scope?: AdminScope) =>
    getJson<ApiEnvelope<{ errors: ImportBatchError[] }>>(
      withAdminScope(`/admin/imports/batches/${id}/errors`, scope),
    ),
  getImportBatchRules: (id: string, scope?: AdminScope) =>
    getJson<ApiEnvelope<{ rules: ImportBatchRule[] }>>(
      withAdminScope(`/admin/imports/batches/${id}/rules`, scope),
    ),
  getImportMappingProfiles: (query?: {
    sourceId?: string;
    entityType?: ImportBatch['entityType'];
    scope?: AdminScope;
  }) => {
    const search = new URLSearchParams();
    if (query?.sourceId) {
      search.set('sourceId', query.sourceId);
    }
    if (query?.entityType) {
      search.set('entityType', query.entityType);
    }
    if (query?.scope) {
      search.set('scope', query.scope);
    }
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return getJson<ApiEnvelope<{ mappingProfiles: SourceMappingProfile[] }>>(
      `/admin/imports/mapping-profiles${suffix}`,
    );
  },
  createImportMappingProfile: (input: {
    sourceId: string;
    entityType: ImportBatch['entityType'];
    profileName: string;
    mappingJson: Record<string, string>;
    isDefault?: boolean;
  }) =>
    postJson<ApiEnvelope<{ mappingProfile: SourceMappingProfile }>>(
      '/admin/imports/mapping-profiles',
      input,
    ),
  updateImportMappingProfile: (
    id: string,
    input: {
      profileName?: string;
      mappingJson?: Record<string, string>;
      isDefault?: boolean;
      status?: 'active' | 'inactive';
    },
  ) =>
    patchJson<ApiEnvelope<{ mappingProfile: SourceMappingProfile }>>(
      `/admin/imports/mapping-profiles/${id}`,
      input,
    ),
  uploadImportBatch: (input: {
    file: File;
    entityType: ImportBatch['entityType'];
    sheetName?: string;
    sourceId?: string;
    mappingProfileId?: string;
    columnMapping?: Record<string, string>;
  }) => {
    const form = new FormData();
    form.append('file', input.file);
    form.append('entityType', input.entityType);
    if (input.sheetName?.trim()) {
      form.append('sheetName', input.sheetName.trim());
    }
    if (input.sourceId?.trim()) {
      form.append('sourceId', input.sourceId.trim());
    }
    if (input.mappingProfileId?.trim()) {
      form.append('mappingProfileId', input.mappingProfileId.trim());
    }
    if (input.columnMapping && Object.keys(input.columnMapping).length > 0) {
      form.append('columnMapping', JSON.stringify(input.columnMapping));
    }
    return postForm<ApiEnvelope<{ batch: ImportBatch; errors: number }>>(
      '/admin/imports/upload',
      form,
    );
  },
  runConnector: (connectorId: string) =>
    postJson<ApiEnvelope<{ connectorId: string; jobId: string; status: string }>>(
      `/admin/connectors/${connectorId}/run`,
      {},
    ),
  getSyncJob: (jobId: string) => getJson<SyncJobResponse>(`/sync-jobs/${jobId}`),
  getKoboSources: () =>
    getJson<ApiEnvelope<{ sources: KoboSource[] }>>('/admin/kobo-sources'),
  testKoboConnection: (input: {
    sourceId?: string;
    baseUrl?: string;
    token?: string;
    assetUid?: string;
  }) =>
    postJson<ApiEnvelope<{ result: KoboConnectionTestResult }>>(
      '/admin/kobo-sources/test-connection',
      input,
    ),
  testKoboConnectionById: (id: string) =>
    postJson<ApiEnvelope<{ result: KoboConnectionTestResult }>>(
      `/admin/kobo-sources/${id}/test-connection`,
      {},
    ),
  previewKoboSource: (id: string) =>
    postJson<ApiEnvelope<{ preview: KoboSourcePreviewResult }>>(
      `/admin/kobo-sources/${id}/preview`,
      {},
    ),
  runKoboSourceSync: (id: string) =>
    postJson<ApiEnvelope<{ connectorId: string; jobId: string; status: string }>>(
      `/admin/kobo-sources/${id}/run`,
      {},
    ),
  getKoboSourceLastJob: (id: string) =>
    getJson<ApiEnvelope<{ job: SyncJobResponse | null }>>(
      `/admin/kobo-sources/${id}/last-job`,
    ),
  getOdooSources: () =>
    getJson<ApiEnvelope<{ sources: OdooSource[] }>>('/admin/odoo-sources'),
  getOdooSource: (id: string) =>
    getJson<ApiEnvelope<{ source: OdooSource }>>(`/admin/odoo-sources/${id}`),
  createOdooSource: (input: {
    sourceName: string;
    sourceCode?: string;
    institutionId: string;
    baseUrl: string;
    databaseName: string;
    username: string;
    password: string;
    mappingProfileId?: string | null;
    isActive?: boolean;
  }) =>
    postJson<ApiEnvelope<{ source: OdooSource }>>('/admin/odoo-sources', input),
  updateOdooSource: (
    id: string,
    input: {
      sourceName?: string;
      sourceCode?: string;
      institutionId?: string;
      baseUrl?: string;
      databaseName?: string;
      username?: string;
      password?: string;
      mappingProfileId?: string | null;
      isActive?: boolean;
      status?: string;
    },
  ) =>
    patchJson<ApiEnvelope<{ source: OdooSource }>>(
      `/admin/odoo-sources/${id}`,
      input,
    ),
  testOdooConnection: (input: {
    sourceId?: string;
    baseUrl?: string;
    databaseName?: string;
    username?: string;
    password?: string;
  }) =>
    postJson<ApiEnvelope<{ result: OdooConnectionTestResult }>>(
      '/admin/odoo-sources/test-connection',
      input,
    ),
  testOdooConnectionById: (id: string) =>
    postJson<ApiEnvelope<{ result: OdooConnectionTestResult }>>(
      `/admin/odoo-sources/${id}/test-connection`,
      {},
    ),
  runOdooSourceSync: (id: string) =>
    postJson<ApiEnvelope<{ connectorId: string; jobId: string; status: string }>>(
      `/admin/odoo-sources/${id}/run`,
      {},
    ),
  runOdooSourceSyncWithOptions: (
    id: string,
    input: {
      institutionLimit?: number;
      institutionCodes?: string[];
    },
  ) =>
    postJson<ApiEnvelope<{ connectorId: string; jobId: string; status: string }>>(
      `/admin/odoo-sources/${id}/run`,
      input,
    ),
  previewOdooSource: (
    id: string,
    input: {
      institutionLimit?: number;
      institutionCodes?: string[];
    },
  ) =>
    postJson<ApiEnvelope<{ preview: OdooSourcePreviewResult }>>(
      `/admin/odoo-sources/${id}/preview`,
      input,
    ),
  previewOdooShapefile: (
    id: string,
    input: {
      file: File;
      mappingJson?: Record<string, string>;
      country?: string;
    },
  ) => {
    const form = new FormData();
    form.append('file', input.file);
    if (input.mappingJson && Object.keys(input.mappingJson).length > 0) {
      form.append('mappingJson', JSON.stringify(input.mappingJson));
    }
    if (input.country?.trim()) {
      form.append('country', input.country.trim());
    }
    return postForm<ApiEnvelope<{ preview: OdooShapefilePreview }>>(
      `/admin/odoo-sources/${id}/shapefile/preview`,
      form,
    );
  },
  importOdooShapefile: (
    id: string,
    input: {
      file: File;
      mappingJson?: Record<string, string>;
      country?: string;
      createMissingProjects?: boolean;
    },
  ) => {
    const form = new FormData();
    form.append('file', input.file);
    if (input.mappingJson && Object.keys(input.mappingJson).length > 0) {
      form.append('mappingJson', JSON.stringify(input.mappingJson));
    }
    if (input.country?.trim()) {
      form.append('country', input.country.trim());
    }
    if (typeof input.createMissingProjects === 'boolean') {
      form.append('createMissingProjects', input.createMissingProjects ? 'true' : 'false');
    }
    return postForm<ApiEnvelope<OdooShapefileImportResult>>(
      `/admin/odoo-sources/${id}/shapefile/import`,
      form,
    );
  },
  getOdooSourceLastJob: (id: string) =>
    getJson<ApiEnvelope<{ job: SyncJobResponse | null }>>(
      `/admin/odoo-sources/${id}/last-job`,
    ),
  getOdooSourceBatches: (id: string) =>
    getJson<ApiEnvelope<{ batches: ImportBatch[] }>>(`/admin/odoo-sources/${id}/batches`),
  getOdooSourceErrors: (id: string) =>
    getJson<ApiEnvelope<{ errors: OdooSourceBatchError[] }>>(
      `/admin/odoo-sources/${id}/errors`,
    ),
  getOdooMappingProfiles: (query?: { sourceId?: string; institutionId?: string }) => {
    const search = new URLSearchParams();
    if (query?.sourceId) {
      search.set('sourceId', query.sourceId);
    }
    if (query?.institutionId) {
      search.set('institutionId', query.institutionId);
    }
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return getJson<ApiEnvelope<{ mappingProfiles: OdooMappingProfile[] }>>(
      `/admin/odoo-sources/mapping-profiles${suffix}`,
    );
  },
  resetDatabase: (input: { confirmationText: string; passphrase: string }) =>
    postJson<
      ApiEnvelope<{
        resetExecuted: boolean;
        truncatedTables: number;
        schemas: Record<string, number>;
        resetAt: string;
      }>
    >('/admin/system/reset-database', input),
};

export const adminGeoServerConfig =
  GEOSERVER_ENABLED && GEOSERVER_WMS_URL.trim().length > 0
    ? {
        wmsUrl: GEOSERVER_WMS_URL,
        territoriesLayerName: GEOSERVER_TERRITORIES_LAYER,
        projectLayerName: GEOSERVER_PROJECT_LAYER,
      }
    : null;

// Dominio de gis.geo_layers.visibility (ver apps/sigi-api/src/common/geo/geo-visibility.ts).
export type LayerVisibility = 'public' | 'institutional' | 'internal' | 'restricted' | 'private';

export type ImportBatch = {
  id: string;
  entityType: 'institutions' | 'projects' | 'project_indicators' | 'project_territories';
  sourceFormat: 'csv' | 'xlsx';
  fileName: string;
  sheetName: string | null;
  status: 'received' | 'running' | 'completed' | 'completed_with_errors' | 'failed';
  sourceId?: string | null;
  mappingProfileId?: string | null;
  datasetId?: string | null;
  initiatedByUserId: string | null;
  totalRows: number;
  stagedRows: number;
  validRows: number;
  invalidRows: number;
  promotedRows: number;
  qualityScore?: number | null;
  qualityGrade?: string;
  quality?: Record<string, unknown>;
  details: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPolygon = {
  projectTerritoryId: string;
  territoryId: string;
  territoryCode: string;
  territoryName: string | null;
  country: string;
  areaHa: number;
  geojson: Record<string, unknown>;
};

export type GeoServerPublishedLayer = {
  name: string;
  title: string;
  workspace: string;
};

export type GeospatialCatalogEntry = {
  id: string;
  code: string;
  name: string;
  title: string;
  layerType: string;
  sourceMode: 'managed' | 'derived';
  visibility: string;
  status: string;
  featureCount: number;
  totalAreaHa: number;
  lastUpdatedAt: string | null;
  publishedInGeoServer: boolean;
  geoserverLayerName: string | null;
  geoserverWorkspace: string | null;
  nativeViewName: string | null;
  notes: string;
  publicationEligible: boolean;
  publicationEligibilityReason: string | null;
};

export type GeospatialProjectPublication = {
  id: string;
  code: string;
  title: string;
  visibility: string;
  status: string;
  hasPolygon: boolean;
  publicationEligible: boolean;
  publicationEligibilityReason: string | null;
  geoserverLayerName: string;
  nativeViewName: string;
  publishedInGeoServer: boolean;
};

export type ShapefilePreview = {
  ok: boolean;
  fileName: string;
  importMode?: 'project-linked' | 'reference-layer' | string;
  recordCount: number;
  featureCount: number;
  geometryType: string;
  crs: string;
  detectedColumns: string[];
  requiredFields: string[];
  mappingSuggested: Record<string, string>;
  mappingApplied: Record<string, string>;
  bbox?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  } | null;
  countries?: string[];
  territoryLevels?: string[];
  geographicSummary?: {
    insideNationalBoundsRows: number;
    outsideNationalBoundsRows: number;
    configuredNationalBBox: {
      minLon: number;
      minLat: number;
      maxLon: number;
      maxLat: number;
    } | null;
  } | null;
  validationSummary: {
    validRows: number;
    invalidRows: number;
    warningRows: number;
    errorCount: number;
    warningCount: number;
  };
  validationIssues: Array<{
    rowNumber: number;
    code: string;
    message: string;
    severity: string;
  }>;
  previewRows: Array<Record<string, unknown>>;
};

export type ImportBatchError = {
  id: string;
  batchId: string;
  entityType: string;
  rowNumber: number;
  errorCode: string;
  errorMessage: string;
  rawPayload: Record<string, unknown>;
  createdAt: string;
};

export type ImportBatchRule = {
  id: string;
  batchId: string;
  entityType: string;
  ruleCode: string;
  severity: string;
  status: string;
  affectedRows: number;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type SyncJobResponse = {
  jobId: string;
  institutionId: string;
  connectorId: string;
  integrationJobId: string | null;
  status: 'queued' | 'dispatching' | 'running' | 'completed' | 'partial_failed' | 'failed';
  triggeredBy: 'user' | 'scheduler';
  mode: 'incremental' | 'full';
  startedAt: string | null;
  finishedAt: string | null;
  summary: Record<string, unknown>;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type OdooShapefileValidationIssue = {
  rowNumber: number;
  code: string;
  message: string;
  severity: 'error' | 'warning' | string;
};

export type OdooShapefileValidationSummary = {
  validRows: number;
  invalidRows: number;
  warningRows: number;
  errorCount: number;
  warningCount: number;
};

export type OdooShapefileCanonicalRow = {
  rowNumber: number;
  project_code: string;
  territory_code: string;
  territory_name: string;
  territory_level: string;
  country: string;
  area_ha: number;
  geometry_wkt: string;
  source_crs: string;
  raw_properties: Record<string, unknown>;
};

export type OdooShapefilePreview = {
  ok: boolean;
  fileName: string;
  recordCount: number;
  featureCount: number;
  geometryType: string;
  crs: string;
  detectedColumns: string[];
  requiredFields: string[];
  mappingSuggested: Record<string, string>;
  mappingApplied: Record<string, string>;
  bbox?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  } | null;
  countries?: string[];
  territoryLevels?: string[];
  geographicSummary?: {
    insideNationalBoundsRows: number;
    outsideNationalBoundsRows: number;
    configuredNationalBBox: {
      minLon: number;
      minLat: number;
      maxLon: number;
      maxLat: number;
    } | null;
  } | null;
  validationSummary: OdooShapefileValidationSummary;
  validationIssues: OdooShapefileValidationIssue[];
  previewRows: Array<Record<string, unknown>>;
  rows?: OdooShapefileCanonicalRow[];
};

export type OdooShapefileImportResult = {
  preview: {
    featureCount: number;
    geometryType: string;
    crs: string;
    validationSummary: OdooShapefileValidationSummary;
  };
  batch: ImportBatch;
  errors: number;
  missingProjectsDetected?: number;
  odooProjectUpsert?: {
    ok: boolean;
    mode: 'live' | 'mock';
    sourceId: string;
    model: string;
    totals: {
      received: number;
      created: number;
      existing: number;
      failed: number;
    };
    createdProjectCodes: string[];
    existingProjectCodes: string[];
    failedRows: Array<{ projectCode: string | null; error: string }>;
    message?: string;
  } | null;
  projectBootstrapBatchId?: string | null;
  geoFeaturesPersisted: number;
  geoFeaturesSkipped: number;
  layerCode: string;
};

export type OdooSource = {
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  sourceStatus: string;
  sourceType: string;
  institutionId: string;
  institutionName: string;
  connectorId: string;
  connectorStatus: string;
  connectorDisplayName: string;
  baseUrl: string;
  databaseName: string;
  username: string;
  credentialsConfigured: boolean;
  mappingProfileId: string | null;
  mappingProfileName: string | null;
  configId: string | null;
  isActive: boolean;
  status: string;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  lastSyncJobId: string | null;
  lastSyncAt: string | null;
  sourceLastIngestedAt: string | null;
  connectorLastSyncAt: string | null;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
  configCreatedAt: string | null;
  configUpdatedAt: string | null;
};

export type OdooConnectionTestResult = {
  ok: boolean;
  mode: 'live' | 'mock';
  message: string;
  latencyMs?: number;
  sourceId?: string | null;
};

export type OdooMappingProfile = {
  id: string;
  sourceId: string;
  sourceName: string;
  entityType: string;
  profileName: string;
  version: number;
  mappingJson: Record<string, unknown>;
  keyResolutionJson: Record<string, unknown>;
  isDefault: boolean;
  status: string;
  updatedAt: string;
};

export type SourceMappingProfile = {
  id: string;
  sourceId: string;
  sourceName: string;
  entityType: string;
  profileName: string;
  version: number;
  mappingJson: Record<string, unknown>;
  keyResolutionJson: Record<string, unknown>;
  isDefault: boolean;
  status: string;
  updatedAt: string;
};

export type OdooSourceBatchError = {
  id: string;
  batchId: string;
  batchFileName: string;
  batchStatus: string;
  entityType: string;
  rowNumber: number;
  errorCode: string;
  errorMessage: string;
  rawPayload: Record<string, unknown>;
  createdAt: string;
};

export type OdooSourcePreviewResult = {
  ok: boolean;
  mode: 'live' | 'mock';
  sourceId: string | null;
  institutionsFound: number;
  institutionsSelected: number;
  institutionCodesSelected: string[];
  projectsEstimated: number;
  selectionApplied: boolean;
  message: string;
};

export type KoboSource = {
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  sourceStatus: string;
  sourceType: string;
  institutionId: string;
  institutionName: string;
  connectorId: string | null;
  connectorDisplayName: string | null;
  connectorStatus: string | null;
  baseUrl: string;
  assetUid: string;
  credentialsConfigured: boolean;
  status: string;
  sourceLastIngestedAt: string | null;
  connectorLastSyncAt: string | null;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
};

export type KoboConnectionTestResult = {
  ok: boolean;
  mode: 'live' | 'mock';
  message: string;
  sourceId?: string | null;
  assetUid?: string | null;
  baseUrl?: string | null;
  authScheme?: string | null;
  recordsOnFirstPage?: number;
  hasMore?: boolean;
};

export type KoboSourcePreviewResult = KoboConnectionTestResult & {
  previewRows: Array<Record<string, unknown>>;
  geojsonPreview: Record<string, unknown> | null;
  lastSubmissionTime?: string | null;
  lastSubmissionId?: number | null;
};

function buildTerritoryFeaturesQuery(level?: string, layer?: string) {
  const params = new URLSearchParams();
  if (level) {
    params.set('level', level);
  }
  if (layer) {
    params.set('layer', layer);
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}

function buildGeoFeaturesQuery(params: {
  zoom?: number;
  page?: number;
  pageSize?: number;
  filters?: GeoFeatureQueryFilter[];
  sort?: string;
  order?: 'asc' | 'desc';
  /** P0-8 — export only. */
  format?: 'csv' | 'xlsx' | 'geojson';
}) {
  const search = new URLSearchParams();
  if (params.zoom !== undefined) {
    search.set('zoom', String(params.zoom));
  }
  if (params.page !== undefined) {
    search.set('page', String(params.page));
  }
  if (params.pageSize !== undefined) {
    search.set('pageSize', String(params.pageSize));
  }
  if (params.filters && params.filters.length > 0) {
    search.set('filters', JSON.stringify(params.filters));
  }
  if (params.format) {
    search.set('format', params.format);
  }
  if (params.sort) {
    search.set('sort', params.sort);
    search.set('order', params.order ?? 'asc');
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : '';
}
