import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Checkbox, Drawer, InputField, SelectField, TextareaField } from '@sigi/ui';
import type {
  DocumentAuditEvent,
  DocumentFile,
  GeoFeatureCollection,
  Institution,
  Project,
  ProjectDetail,
  ProjectPortfolio,
  ReportInstance,
} from '@sigi/domain';
import { workspaceApi, adminGeoServerConfig, type ProjectPolygon } from '../services/api';
import { OperationalLayerMap } from '../components/OperationalLayerMap';
import { ProjectCoverageMap } from '../components/ProjectCoverageMap';
import { useEgi } from '../contexts/EgiContext';
import { canUseGlobalView } from '../utils/global-view';
import { hasPermission } from '../utils/permissions';
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
import { ProjectHeader } from '../components/ProjectHeader';
import { ProjectPlanningWorkspace } from '../components/ProjectPlanningWorkspace';
import { FinancialSettingsPanel, ProjectHealthPanel, ProjectLifecycleWorkspace } from '../components/ProjectLifecycleWorkspace';
import { ActivityList, CompactList, DataTable, RowActions, StatusBadge } from '../components/data-display';
import {
  parseProjectWorkspaceView,
  projectWorkspacePath,
  reportIncludesProject,
  type ProjectWorkspaceView,
} from '../features/projects/project-workspace';

type ProjectFormState = {
  code: string;
  title: string;
  objective: string;
  summary: string;
  description: string;
  theme: string;
  priority: string;
  visibility: string;
  status: string;
  institutionId: string;
  portfolioId: string;
  startDate: string;
  endDate: string;
  progressPct: string;
  areaHa: string;
  featured: boolean;
};

type MilestoneFormState = {
  activityCode: string;
  title: string;
  description: string;
  dueDate: string;
  completedAt: string;
  status: string;
  progressPct: string;
};

type DeliverableFormState = {
  code: string;
  title: string;
  deliverableType: string;
  description: string;
  status: string;
  dueDate: string;
  publishedAt: string;
  outputUrl: string;
};

type ActorFormState = {
  actorType: string;
  institutionId: string;
  displayName: string;
  roleLabel: string;
  status: string;
};

const initialFormState: ProjectFormState = {
  code: '',
  title: '',
  objective: '',
  summary: '',
  description: '',
  theme: '',
  priority: 'medium',
  // V2-02: fail-closed; publicar un proyecto (y su polígono) exige elegir Pública explícitamente.
  visibility: 'internal',
  status: 'draft',
  institutionId: '',
  portfolioId: '',
  startDate: '',
  endDate: '',
  progressPct: '0',
  areaHa: '',
  featured: false,
};

const initialMilestoneFormState: MilestoneFormState = {
  activityCode: '',
  title: '',
  description: '',
  dueDate: '',
  completedAt: '',
  status: 'planned',
  progressPct: '0',
};

const initialDeliverableFormState: DeliverableFormState = {
  code: '',
  title: '',
  deliverableType: 'report',
  description: '',
  status: 'planned',
  dueDate: '',
  publishedAt: '',
  outputUrl: '',
};

const initialActorFormState: ActorFormState = {
  actorType: 'partner',
  institutionId: '',
  displayName: '',
  roleLabel: '',
  status: 'active',
};

export function ProjectsModulePage() {
  // P0-5 parity: "Ver proyecto" from the admin Mapa SIGI identification
  // ficha links here as /admin/projects?projectId=<id> — a real deep link.
  // Absent/unknown values fall back to the pre-existing selection logic.
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeParams = useParams<{ projectId?: string; '*': string }>();
  const routeProjectId = routeParams.projectId ? decodeURIComponent(routeParams.projectId) : null;
  const requestedProjectId = routeProjectId ?? searchParams.get('projectId');
  const workspaceView: ProjectWorkspaceView = requestedProjectId
    ? parseProjectWorkspaceView(routeProjectId ? (routeParams['*'] || 'summary') : searchParams.get('view'))
    : 'portfolio';
  const { activeEgi, activeEgiId, currentUser, globalViewScope, setGlobalViewScope } = useEgi();
  const allowGlobalView = canUseGlobalView(currentUser);
  const canReadProjects = hasPermission(currentUser, 'projects.read');
  const canCreateProjects = hasPermission(currentUser, 'projects.create');
  const canUpdateProjects = hasPermission(currentUser, 'projects.update');
  const canManageProjectPlanning = hasPermission(currentUser, 'projects.planning.manage') || canUpdateProjects;
  const canManageProjectBudget = hasPermission(currentUser, 'projects.budget.manage');
  const canManageProjectFinance = hasPermission(currentUser, 'projects.finance.manage');
  const canManageProjectRisks = hasPermission(currentUser, 'projects.risks.manage') || canUpdateProjects;
  const canCloseProjects = hasPermission(currentUser, 'projects.close');
  const canUpdateProjectPolygon = hasPermission(currentUser, 'projects.polygon.update');
  const canReadInstitutions = hasPermission(currentUser, 'institutions.read');
  const canCreateFiles = hasPermission(currentUser, 'files.create');
  const canShareFiles = hasPermission(currentUser, 'files.share');
  const canUpdateFiles = hasPermission(currentUser, 'files.update');
  const canDownloadFiles = hasPermission(currentUser, 'files.download');
  const canReadReports = hasPermission(currentUser, 'reports.read');
  const [projects, setProjects] = useState<Project[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [portfolios, setPortfolios] = useState<ProjectPortfolio[]>([]);
  const [reports, setReports] = useState<ReportInstance[]>([]);
  const [reportLoadFailed, setReportLoadFailed] = useState(false);
  const [featureCollection, setFeatureCollection] = useState<GeoFeatureCollection | null>(null);
  const [operationalFeatureCollection, setOperationalFeatureCollection] = useState<GeoFeatureCollection | null>(null);
  const [summary, setSummary] = useState<{
    totalProjects: number;
    activeProjects: number;
    publishedProjects: number;
    totalAreaHa: number;
    featuredProjects: number;
  } | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [polygon, setPolygon] = useState<ProjectPolygon | null>(null);
  const [polygonText, setPolygonText] = useState<string>('');
  const [polygonTerritoryName, setPolygonTerritoryName] = useState<string>('');
  const [polygonCountry, setPolygonCountry] = useState<string>('Costa Rica');
  const [form, setForm] = useState<ProjectFormState>(initialFormState);
  const [actorForm, setActorForm] = useState<ActorFormState>(initialActorFormState);
  const [editingActorId, setEditingActorId] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState<MilestoneFormState>(initialMilestoneFormState);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [deliverableForm, setDeliverableForm] = useState<DeliverableFormState>(initialDeliverableFormState);
  const [editingDeliverableId, setEditingDeliverableId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<DocumentFile[]>([]);
  const [projectFileUpload, setProjectFileUpload] = useState<File | null>(null);
  const [existingFileSearch, setExistingFileSearch] = useState<string>('');
  const [existingFileRelationType, setExistingFileRelationType] = useState<string>('evidence');
  const [existingProjectFiles, setExistingProjectFiles] = useState<DocumentFile[]>([]);
  const [selectedProjectFileId, setSelectedProjectFileId] = useState<string | null>(null);
  const [selectedProjectFileDetail, setSelectedProjectFileDetail] = useState<DocumentFile | null>(null);
  const [selectedProjectFileAudit, setSelectedProjectFileAudit] = useState<DocumentAuditEvent[]>([]);
  const [selectedProjectFilePreviewUrl, setSelectedProjectFilePreviewUrl] = useState<string | null>(null);
  const [projectFileVersionUpload, setProjectFileVersionUpload] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingActor, setIsSavingActor] = useState(false);
  const [isSavingMilestone, setIsSavingMilestone] = useState(false);
  const [isSavingDeliverable, setIsSavingDeliverable] = useState(false);
  const [isUploadingProjectFile, setIsUploadingProjectFile] = useState(false);
  const [isSearchingExistingFiles, setIsSearchingExistingFiles] = useState(false);
  const [isLinkingProjectFile, setIsLinkingProjectFile] = useState(false);
  const [isLoadingProjectFileContext, setIsLoadingProjectFileContext] = useState(false);
  const [isCreatingProjectFileVersion, setIsCreatingProjectFileVersion] = useState(false);
  const [isSavingPolygon, setIsSavingPolygon] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('public');
  const [mapView, setMapView] = useState<'executive' | 'operational'>('executive');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [actorFormOpen, setActorFormOpen] = useState(false);
  const [milestoneFormOpen, setMilestoneFormOpen] = useState(false);
  const [deliverableFormOpen, setDeliverableFormOpen] = useState(false);
  const [documentFormOpen, setDocumentFormOpen] = useState(false);
  const [polygonFormOpen, setPolygonFormOpen] = useState(false);

  async function loadModuleData() {
    setError(null);
    const [
      projectsResponse,
      institutionsResponse,
      portfolioResponse,
      featuresResponse,
      projectPolygonFeaturesResponse,
      operationalFeaturesResponse,
    ] = await Promise.all([
      canReadProjects
        ? workspaceApi.getProjects({
        status: statusFilter === 'all' ? undefined : statusFilter,
        institutionId: institutionFilter === 'all' ? undefined : institutionFilter,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
        scope: globalViewScope,
      })
        : Promise.resolve(null),
      canReadInstitutions ? workspaceApi.getInstitutions() : Promise.resolve(null),
      canReadProjects ? workspaceApi.getProjectPortfolioSummary(globalViewScope) : Promise.resolve(null),
      canReadProjects ? workspaceApi.getTerritoryFeatures('region') : Promise.resolve(null),
      canReadProjects ? workspaceApi.getTerritoryFeatures(undefined, 'project_polygons') : Promise.resolve(null),
      canReadProjects ? workspaceApi.getTerritoryFeatures(undefined, 'odoo_project_territories') : Promise.resolve(null),
    ]);

    setProjects(projectsResponse?.data.projects ?? []);
    setInstitutions(institutionsResponse?.data.institutions ?? []);
    setPortfolios(portfolioResponse?.data.portfolios ?? []);
    setSummary(portfolioResponse?.data.summary ?? null);
    setFeatureCollection(
      featuresResponse && projectPolygonFeaturesResponse
        ? mergeFeatureCollections(featuresResponse.data, projectPolygonFeaturesResponse.data)
        : null,
    );
    setOperationalFeatureCollection(operationalFeaturesResponse?.data ?? null);

    const projectList = projectsResponse?.data.projects ?? [];
    const requestedValid = requestedProjectId && projectList.some((project) => project.id === requestedProjectId);
    const nextSelectedId = requestedProjectId ? (
      selectedProjectId && projectList.some((project) => project.id === selectedProjectId)
        ? selectedProjectId
        : requestedValid
          ? requestedProjectId
          : null
    ) : null;
    setSelectedProjectId(nextSelectedId);
  }

  async function loadProjectDetail(projectId: string) {
    const [detailResponse, polygonResponse] = await Promise.all([
      workspaceApi.getProjectDetail(projectId, globalViewScope),
      workspaceApi.getProjectPolygon(projectId, globalViewScope),
    ]);
    setDetail(detailResponse.data);
    const nextPolygon = polygonResponse.data.polygon;
    setPolygon(nextPolygon);
    setPolygonText(
      nextPolygon?.geojson
        ? JSON.stringify(nextPolygon.geojson, null, 2)
        : JSON.stringify(defaultProjectPolygonTemplate(), null, 2),
    );
    setPolygonTerritoryName(
      nextPolygon?.territoryName ?? detailResponse.data.project.title,
    );
    setPolygonCountry(nextPolygon?.country ?? 'Costa Rica');
    const filesResponse = await workspaceApi.searchFiles({ projectId });
    setProjectFiles(filesResponse.data.files);
    if (filesResponse.data.files.length > 0) {
      const nextSelectedFileId =
        selectedProjectFileId && filesResponse.data.files.some((file) => file.id === selectedProjectFileId)
          ? selectedProjectFileId
          : filesResponse.data.files[0]?.id ?? null;
      setSelectedProjectFileId(nextSelectedFileId);
    } else {
      setSelectedProjectFileId(null);
      setSelectedProjectFileDetail(null);
      setSelectedProjectFileAudit([]);
    }
  }

  async function loadSelectedProjectFileContext(fileId: string) {
    setIsLoadingProjectFileContext(true);
    try {
      const [detailResponse, auditResponse] = await Promise.all([
        workspaceApi.getFileDetail(fileId),
        workspaceApi.getFileAudit(fileId),
      ]);
      setSelectedProjectFileDetail(detailResponse.data.file);
      setSelectedProjectFileAudit(auditResponse.data.audit);

      if (selectedProjectFilePreviewUrl) {
        URL.revokeObjectURL(selectedProjectFilePreviewUrl);
        setSelectedProjectFilePreviewUrl(null);
      }

      const mimeType = detailResponse.data.file.mimeType ?? '';
      if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
        const result = await workspaceApi.downloadFile(fileId);
        setSelectedProjectFilePreviewUrl(URL.createObjectURL(result.blob));
      }
    } finally {
      setIsLoadingProjectFileContext(false);
    }
  }

  useEffect(() => {
    loadModuleData().catch((reason: Error) => setError(reason.message));
  }, [allowGlobalView, canReadInstitutions, canReadProjects, globalViewScope, statusFilter, institutionFilter, visibilityFilter]);

  useEffect(() => {
    if (!canReadReports || !activeEgiId) {
      setReports([]);
      setReportLoadFailed(false);
      return;
    }
    setReportLoadFailed(false);
    workspaceApi.getReports()
      .then((response) => setReports(response.data.reports))
      .catch(() => {
        setReports([]);
        setReportLoadFailed(true);
      });
  }, [activeEgiId, canReadReports, globalViewScope]);

  useEffect(() => {
    if (requestedProjectId && requestedProjectId !== selectedProjectId && projects.some((project) => project.id === requestedProjectId)) {
      setSelectedProjectId(requestedProjectId);
    }
  }, [projects, requestedProjectId, selectedProjectId]);

  useEffect(() => {
    const legacyProjectId = searchParams.get('projectId');
    if (!routeProjectId && ['/admin/projects', '/projects'].includes(location.pathname) && legacyProjectId) {
      navigate(projectWorkspacePath(parseProjectWorkspaceView(searchParams.get('view')), legacyProjectId), { replace: true });
    }
  }, [location.pathname, navigate, routeProjectId, searchParams]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDetail(null);
      setExistingFileSearch('');
      setExistingFileRelationType('evidence');
      setExistingProjectFiles([]);
      setProjectFiles([]);
      setPolygon(null);
      setPolygonText('');
      setSelectedProjectFileId(null);
      setSelectedProjectFileDetail(null);
      setSelectedProjectFileAudit([]);
      return;
    }

    loadProjectDetail(selectedProjectId).catch((reason: Error) => setError(reason.message));
  }, [globalViewScope, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectFileId) {
      if (selectedProjectFilePreviewUrl) {
        URL.revokeObjectURL(selectedProjectFilePreviewUrl);
        setSelectedProjectFilePreviewUrl(null);
      }
      setSelectedProjectFileDetail(null);
      setSelectedProjectFileAudit([]);
      return;
    }

    loadSelectedProjectFileContext(selectedProjectFileId).catch((reason: Error) => setError(reason.message));
  }, [selectedProjectFileId]);

  useEffect(() => () => {
    if (selectedProjectFilePreviewUrl) {
      URL.revokeObjectURL(selectedProjectFilePreviewUrl);
    }
  }, [selectedProjectFilePreviewUrl]);

  function selectProject(projectId: string, view?: ProjectWorkspaceView) {
    setSelectedProjectId(projectId);
    navigate(projectWorkspacePath(view && view !== 'portfolio' ? view : 'summary', projectId));
  }

  function startCreateMode() {
    setIsEditing(false);
    setForm(initialFormState);
    setNotice(null);
    setError(null);
  }

  function startCreateFromHeader() {
    startCreateMode();
    setProjectFormOpen(true);
  }

  function startEditMode() {
    if (!detail) {
      return;
    }

    setIsEditing(true);
    setForm({
      code: detail.project.code ?? '',
      title: detail.project.title,
      objective: detail.project.objective ?? '',
      summary: detail.project.summary ?? '',
      description: detail.project.description ?? '',
      theme: detail.project.theme ?? '',
      priority: detail.project.priority ?? 'medium',
      visibility: detail.project.visibility ?? 'internal',
      status: detail.project.status,
      institutionId: detail.project.institutionId,
      portfolioId: detail.project.portfolioId ?? '',
      startDate: detail.project.startDate ?? '',
      endDate: detail.project.endDate ?? '',
      progressPct: String(detail.project.progressPct ?? 0),
      areaHa:
        typeof detail.project.areaHa === 'number' ? String(detail.project.areaHa) : '',
      featured: Boolean(detail.project.featured),
    });
    setNotice(null);
    setError(null);
    setProjectFormOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const payload = {
        code: form.code.trim() || undefined,
        title: form.title.trim(),
        objective: form.objective.trim() || undefined,
        summary: form.summary.trim() || undefined,
        description: form.description.trim() || undefined,
        theme: form.theme.trim() || undefined,
        priority: form.priority,
        visibility: form.visibility,
        status: form.status,
        institutionId: form.institutionId,
        portfolioId: form.portfolioId || null,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        progressPct: Number(form.progressPct),
        areaHa: form.areaHa.trim().length > 0 ? Number(form.areaHa) : undefined,
        featured: form.featured,
      };

      const response = isEditing && detail
        ? await workspaceApi.updateProject(detail.project.id, payload)
        : await workspaceApi.createProject(payload);

      const nextId = response.data.project.id;
      setNotice(
        isEditing
          ? `Proyecto ${response.data.project.title} actualizado correctamente.`
          : `Proyecto ${response.data.project.title} creado correctamente.`,
      );
      setIsEditing(false);
      setSelectedProjectId(nextId);
      await loadModuleData();
      await loadProjectDetail(nextId);
      setProjectFormOpen(false);
      navigate(projectWorkspacePath('summary', nextId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSaving(false);
    }
  }

  function startActorCreateMode() {
    setEditingActorId(null);
    setActorForm(initialActorFormState);
    setNotice(null);
    setError(null);
    setActorFormOpen(true);
  }

  function startActorEditMode(actor: ProjectDetail['actors'][number]) {
    setEditingActorId(actor.id);
    setActorForm({
      actorType: actor.actorType,
      institutionId: actor.institutionId ?? '',
      displayName: actor.displayName,
      roleLabel: actor.roleLabel ?? '',
      status: actor.status,
    });
    setNotice(null);
    setError(null);
    setActorFormOpen(true);
  }

  async function handleActorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) {
      return;
    }

    setIsSavingActor(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        actorType: actorForm.actorType,
        institutionId: actorForm.institutionId || null,
        displayName: actorForm.displayName.trim(),
        roleLabel: actorForm.roleLabel.trim() || null,
        status: actorForm.status,
      };

      if (editingActorId) {
        await workspaceApi.updateProjectActor(detail.project.id, editingActorId, payload);
        setNotice(`Actor "${payload.displayName}" actualizado correctamente.`);
      } else {
        await workspaceApi.createProjectActor(detail.project.id, payload);
        setNotice(`Actor "${payload.displayName}" creado correctamente.`);
      }

      startActorCreateMode();
      setActorFormOpen(false);
      await loadProjectDetail(detail.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSavingActor(false);
    }
  }

  async function handleDeleteActor(actorId: string) {
    if (!detail) {
      return;
    }
    const actor = detail.actors.find((item) => item.id === actorId);
    if (!actor) {
      return;
    }
    const shouldDelete = window.confirm(`Se eliminará el actor "${actor.displayName}". ¿Deseas continuar?`);
    if (!shouldDelete) {
      return;
    }

    setIsSavingActor(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.deleteProjectActor(detail.project.id, actorId);
      if (editingActorId === actorId) {
        startActorCreateMode();
      }
      setNotice(`Actor "${actor.displayName}" eliminado correctamente.`);
      await loadProjectDetail(detail.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSavingActor(false);
    }
  }

  function startMilestoneCreateMode() {
    setEditingMilestoneId(null);
    setMilestoneForm(initialMilestoneFormState);
    setNotice(null);
    setError(null);
    setMilestoneFormOpen(true);
  }

  function startMilestoneEditMode(milestone: ProjectDetail['milestones'][number]) {
    setEditingMilestoneId(milestone.id);
    setMilestoneForm({
      activityCode: milestone.activityCode ?? '',
      title: milestone.title,
      description: milestone.description ?? '',
      dueDate: milestone.dueDate ?? '',
      completedAt: milestone.completedAt ?? '',
      status: milestone.status,
      progressPct: String(milestone.progressPct ?? 0),
    });
    setNotice(null);
    setError(null);
    setMilestoneFormOpen(true);
  }

  async function handleMilestoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) {
      return;
    }

    setIsSavingMilestone(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        activityCode: milestoneForm.activityCode.trim() || undefined,
        title: milestoneForm.title.trim(),
        description: milestoneForm.description.trim() || undefined,
        dueDate: milestoneForm.dueDate || undefined,
        completedAt: milestoneForm.completedAt || undefined,
        status: milestoneForm.status,
        progressPct: Number(milestoneForm.progressPct),
      };

      if (editingMilestoneId) {
        await workspaceApi.updateProjectMilestone(detail.project.id, editingMilestoneId, payload);
        setNotice(`Hito "${payload.title}" actualizado correctamente.`);
      } else {
        await workspaceApi.createProjectMilestone(detail.project.id, payload);
        setNotice(`Hito "${payload.title}" creado correctamente.`);
      }

      startMilestoneCreateMode();
      setMilestoneFormOpen(false);
      await loadProjectDetail(detail.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSavingMilestone(false);
    }
  }

  async function handleDeleteMilestone(milestoneId: string) {
    if (!detail) {
      return;
    }
    const milestone = detail.milestones.find((item) => item.id === milestoneId);
    if (!milestone) {
      return;
    }
    const shouldDelete = window.confirm(`Se eliminará el hito "${milestone.title}". ¿Deseas continuar?`);
    if (!shouldDelete) {
      return;
    }

    setIsSavingMilestone(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.deleteProjectMilestone(detail.project.id, milestoneId);
      if (editingMilestoneId === milestoneId) {
        startMilestoneCreateMode();
      }
      setNotice(`Hito "${milestone.title}" eliminado correctamente.`);
      await loadProjectDetail(detail.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSavingMilestone(false);
    }
  }

  function startDeliverableCreateMode() {
    setEditingDeliverableId(null);
    setDeliverableForm(initialDeliverableFormState);
    setNotice(null);
    setError(null);
    setDeliverableFormOpen(true);
  }

  function startDeliverableEditMode(deliverable: ProjectDetail['deliverables'][number]) {
    setEditingDeliverableId(deliverable.id);
    setDeliverableForm({
      code: deliverable.code ?? '',
      title: deliverable.title,
      deliverableType: deliverable.deliverableType,
      description: deliverable.description ?? '',
      status: deliverable.status,
      dueDate: deliverable.dueDate ?? '',
      publishedAt: deliverable.publishedAt ?? '',
      outputUrl: deliverable.outputUrl ?? '',
    });
    setNotice(null);
    setError(null);
    setDeliverableFormOpen(true);
  }

  async function handleDeliverableSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) {
      return;
    }

    setIsSavingDeliverable(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        code: deliverableForm.code.trim() || undefined,
        title: deliverableForm.title.trim(),
        deliverableType: deliverableForm.deliverableType.trim() || undefined,
        description: deliverableForm.description.trim() || undefined,
        status: deliverableForm.status,
        dueDate: deliverableForm.dueDate || undefined,
        publishedAt: deliverableForm.publishedAt || undefined,
        outputUrl: deliverableForm.outputUrl.trim() || undefined,
      };

      if (editingDeliverableId) {
        await workspaceApi.updateProjectDeliverable(detail.project.id, editingDeliverableId, payload);
        setNotice(`Entregable "${payload.title}" actualizado correctamente.`);
      } else {
        await workspaceApi.createProjectDeliverable(detail.project.id, payload);
        setNotice(`Entregable "${payload.title}" creado correctamente.`);
      }

      startDeliverableCreateMode();
      setDeliverableFormOpen(false);
      await loadProjectDetail(detail.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSavingDeliverable(false);
    }
  }

  async function handleDeleteDeliverable(deliverableId: string) {
    if (!detail) {
      return;
    }
    const deliverable = detail.deliverables.find((item) => item.id === deliverableId);
    if (!deliverable) {
      return;
    }
    const shouldDelete = window.confirm(`Se eliminará el entregable "${deliverable.title}". ¿Deseas continuar?`);
    if (!shouldDelete) {
      return;
    }

    setIsSavingDeliverable(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.deleteProjectDeliverable(detail.project.id, deliverableId);
      if (editingDeliverableId === deliverableId) {
        startDeliverableCreateMode();
      }
      setNotice(`Entregable "${deliverable.title}" eliminado correctamente.`);
      await loadProjectDetail(detail.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSavingDeliverable(false);
    }
  }

  function handleProjectFileSelection(event: ChangeEvent<HTMLInputElement>) {
    setProjectFileUpload(event.target.files?.[0] ?? null);
  }

  async function handleSearchExistingProjectFiles() {
    if (!detail) {
      return;
    }

    setIsSearchingExistingFiles(true);
    setError(null);
    try {
      const response = await workspaceApi.searchFiles({
        q: existingFileSearch,
      });
      setExistingProjectFiles(
        response.data.files.filter((file) => file.projectId !== detail.project.id),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSearchingExistingFiles(false);
    }
  }

  async function handleLinkExistingFile(fileId: string) {
    if (!detail) {
      return;
    }

    setIsLinkingProjectFile(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.linkFile(fileId, {
        entityType: 'project',
        entityId: detail.project.id,
        relationType: existingFileRelationType,
      });
      setNotice('Archivo existente vinculado al proyecto.');
      await loadProjectDetail(detail.project.id);
      setSelectedProjectFileId(fileId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsLinkingProjectFile(false);
    }
  }

  async function handleUnlinkProjectFile(linkId: string) {
    if (!selectedProjectFileDetail || !detail) {
      return;
    }

    const confirmed = window.confirm('Se quitará esta asociación del archivo con el proyecto activo. ¿Deseas continuar?');
    if (!confirmed) {
      return;
    }

    setIsLinkingProjectFile(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.unlinkFile(selectedProjectFileDetail.id, linkId);
      setNotice('Asociación eliminada correctamente.');
      await loadSelectedProjectFileContext(selectedProjectFileDetail.id);
      await loadProjectDetail(detail.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsLinkingProjectFile(false);
    }
  }

  async function handleUploadProjectFile() {
    if (!detail || !projectFileUpload) {
      return;
    }

    setIsUploadingProjectFile(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.uploadFile({
        file: projectFileUpload,
        projectId: detail.project.id,
        institutionId: detail.project.institutionId,
        title: projectFileUpload.name,
      });
      setProjectFileUpload(null);
      setDocumentFormOpen(false);
      setNotice(`Documento ${projectFileUpload.name} vinculado correctamente al proyecto.`);
      await loadProjectDetail(detail.project.id);
      await handleSearchExistingProjectFiles();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsUploadingProjectFile(false);
    }
  }

  async function handleDownloadProjectFile(file: DocumentFile) {
    setError(null);
    try {
      const result = await workspaceApi.downloadFile(file.id);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function handleProjectFileVersionSelection(event: ChangeEvent<HTMLInputElement>) {
    setProjectFileVersionUpload(event.target.files?.[0] ?? null);
  }

  async function handleCreateProjectFileVersion() {
    if (!selectedProjectFileDetail || !projectFileVersionUpload) {
      return;
    }

    setIsCreatingProjectFileVersion(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.createFileVersion(selectedProjectFileDetail.id, {
        file: projectFileVersionUpload,
        changeNote: `Nueva versión cargada desde la ficha del proyecto ${detail?.project.code ?? ''}`.trim(),
      });
      setProjectFileVersionUpload(null);
      setNotice('Nueva versión del archivo registrada correctamente.');
      await loadSelectedProjectFileContext(selectedProjectFileDetail.id);
      if (detail) {
        await loadProjectDetail(detail.project.id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsCreatingProjectFileVersion(false);
    }
  }

  async function handleSavePolygon() {
    if (!detail) {
      return;
    }

    setIsSavingPolygon(true);
    setError(null);
    setNotice(null);

    try {
      const parsed = JSON.parse(polygonText) as Record<string, unknown>;
      const response = await workspaceApi.updateProjectPolygon(detail.project.id, {
        territoryName: polygonTerritoryName.trim() || detail.project.title,
        country: polygonCountry.trim() || 'Costa Rica',
        geojson: parsed,
      });
      setPolygon(response.data.polygon);
      setPolygonFormOpen(false);
      setNotice('Polígono del proyecto actualizado correctamente.');
      await loadProjectDetail(detail.project.id);
      await loadModuleData();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo guardar el polígono del proyecto.',
      );
    } finally {
      setIsSavingPolygon(false);
    }
  }

  const activeProjects = projects.filter((project) => project.status === 'active').length;
  const publishedProjects = projects.filter((project) => project.status === 'published').length;
  const selectedInstitutionName = detail?.project.institutionName ?? 'No visible';
  const selectedPortfolioName = detail?.portfolio?.name ?? detail?.project.portfolioName ?? 'Sin portafolio';
  const executiveGeoServerOverlay = adminGeoServerConfig
    ? {
        label: 'GeoServer WMS',
        wmsUrl: adminGeoServerConfig.wmsUrl,
        layerName: `${adminGeoServerConfig.territoriesLayerName},${adminGeoServerConfig.projectLayerName}`,
        enabled: true,
        opacity: 0.72,
      }
    : null;
  const visiblePortfolios = visibilityFilter === 'internal'
    ? portfolios.filter((portfolio) => portfolio.visibility === 'internal')
    : visibilityFilter === 'public'
      ? portfolios.filter((portfolio) => portfolio.visibility === 'public')
      : portfolios;
  const projectReports = detail
    ? reports.filter((report) => reportIncludesProject(report, detail.project.id))
    : [];
  const projectEvidence = projectFiles.filter((file) =>
    (file.links ?? []).some((link) =>
      link.entityType === 'project'
      && link.entityId === selectedProjectId
      && link.relationType === 'evidence',
    ),
  );
  const normalizedProjectSearch = projectSearch.trim().toLocaleLowerCase('es');
  const visibleProjects = normalizedProjectSearch
    ? projects.filter((project) => `${project.title} ${project.code ?? ''} ${project.institutionName ?? ''} ${project.theme ?? ''}`.toLocaleLowerCase('es').includes(normalizedProjectSearch))
    : projects;
  const workspaceProjectId = selectedProjectId ?? requestedProjectId;
  const workspaceTabs = [
    { label: 'Resumen', to: projectWorkspacePath('summary', workspaceProjectId) },
    { label: 'Cartera', to: projectWorkspacePath('portfolio', workspaceProjectId) },
    { label: 'Planificación', to: projectWorkspacePath('planning', workspaceProjectId) },
    { label: 'Cronograma', to: projectWorkspacePath('schedule', workspaceProjectId) },
    ...(detail && detail.financialSettings.mode !== 'none' ? [{ label: detail.financialSettings.mode === 'execution' ? 'Finanzas' : detail.financialSettings.mode === 'external' ? 'Finanzas externas' : 'Presupuesto', to: projectWorkspacePath('budget', workspaceProjectId) }] : []),
    { label: 'Seguimiento', to: projectWorkspacePath('monitoring', workspaceProjectId) },
    { label: 'Riesgos y cambios', to: projectWorkspacePath('governance', workspaceProjectId) },
    { label: 'Indicadores', to: projectWorkspacePath('indicators', workspaceProjectId) },
    { label: 'Mapa', to: projectWorkspacePath('territory', workspaceProjectId) },
    { label: 'Entregables', to: projectWorkspacePath('deliverables', workspaceProjectId) },
    { label: 'Documentos', to: projectWorkspacePath('documents', workspaceProjectId) },
    ...(canReadReports ? [{ label: 'Informes', to: projectWorkspacePath('reports', workspaceProjectId) }] : []),
    { label: 'Actividad', to: projectWorkspacePath('activity', workspaceProjectId) },
  ];

  return (
    <section>
      {workspaceView === 'portfolio' ? <ModuleWorkspaceHeader
        eyebrow="Operación · Proyectos"
        title="Proyectos"
        description="Consulta y selecciona un proyecto para abrir su espacio de trabajo."
        primaryAction={canCreateProjects ? <button type="button" className="reports-button reports-button--primary" onClick={startCreateFromHeader}>Nuevo proyecto</button> : undefined}
        configurationPath="/projects/config"
        configurationPermissions={['projects.configure']}
      /> : detail ? <>
        <ProjectHeader project={detail.project} portfolio={detail.portfolio} alertCount={detail.incidents.filter((incident) => incident.status !== 'resolved').length} canEdit={canUpdateProjects} onEdit={startEditMode} />
        <nav aria-label="Secciones del proyecto" className="sigi-module-tabs">
          {workspaceTabs.filter((tab) => tab.label !== 'Cartera').map((tab) => <Link key={tab.to} to={tab.to} role="tab" aria-selected={tab.to === projectWorkspacePath(workspaceView, detail.project.id)} className={`sigi-module-tab${tab.to === projectWorkspacePath(workspaceView, detail.project.id) ? ' sigi-module-tab--active' : ''}`}>{tab.label}</Link>)}
        </nav>
      </> : null}

      {allowGlobalView && workspaceView === 'portfolio' ? (
        <div className="sigi-scope-switcher">
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
              ? 'La cartera se limita al Espacio de Gestión seleccionado.'
              : 'La cartera se consolida entre EGI solo cuando el backend autoriza el modo global.'}
          </span>
        </div>
      ) : null}

      {false ? <Panel
        title="Alcance"
        subtitle="Espacio de gestión utilizado en esta consulta."
        action={
          <StatPill tone={activeEgiId ? 'good' : 'warn'}>
            {globalViewScope === 'global' ? 'Vista global' : 'EGI activo'}
          </StatPill>
        }
        icon="overview"
        tone="neutral"
      >
        <DetailList
          items={[
            { label: 'EGI activo', value: activeEgi?.name ?? 'Sin EGI seleccionado' },
            { label: 'Código', value: activeEgi?.code ?? 'n/d' },
            {
              label: 'Alcance',
              value:
                globalViewScope === 'global'
                  ? 'Consolidado global autorizado'
                  : 'Operación del EGI activo',
            },
          ]}
        />
      </Panel> : null}

      {error ? <MessageBlock tone="danger" icon="alert">{error}</MessageBlock> : null}
      {notice ? <MessageBlock icon="status">{notice}</MessageBlock> : null}
      {false ? (
        <MessageBlock icon="overview">
          {globalViewScope === 'global'
            ? 'Vista consolidada habilitada. Los listados y fichas se están consultando en modo global explícito, sin mezclar el comportamiento normal del EGI activo.'
            : visibilityFilter === 'public'
            ? `Mostrando la cartera pública visible. SIGI registra ${summary?.totalProjects ?? projects.length} proyectos en total; el resto permanece en gestión interna u operativa fuera del recorrido institucional.`
            : visibilityFilter === 'internal'
              ? `Mostrando cartera interna de trabajo. Estos proyectos no forman parte de la vista país ni del recorrido ejecutivo.`
              : `Mostrando la cartera completa del SIGI: combina proyectos públicos de presentación y proyectos internos de gestión.`}
        </MessageBlock>
      ) : null}

      {false ? <div
        style={{
          display: 'grid',
          gap: 18,
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(280px, 0.85fr)',
          marginBottom: 18,
        }}
      >
        <section style={heroPanelStyle}>
          <div style={{ display: 'grid', gap: 14 }}>
            <StatPill tone="good">Control institucional</StatPill>
            <h3 style={{ margin: 0, fontSize: 30, lineHeight: 1.08, color: '#f8fbff' }}>
              El módulo ya integra lectura ejecutiva, gestión operativa y trazabilidad del portafolio en una misma experiencia.
            </h3>
            <p style={{ margin: 0, color: 'rgba(248, 251, 255, 0.82)', maxWidth: 760 }}>
              Desde esta vista se puede priorizar la cartera, revisar cobertura territorial, validar responsables,
              seguir entregables y sostener una conversación ejecutiva alineada con la vista país.
            </p>
          </div>
        </section>

        <Panel
          title="Resumen de cartera"
          subtitle="Estado actual de los proyectos visibles."
          action={<StatPill tone={visibilityFilter === 'public' ? 'good' : 'neutral'}>{visibilityFilter === 'public' ? 'Vista pública' : 'Vista operativa'}</StatPill>}
          icon="status"
          tone={visibilityFilter === 'public' ? 'good' : 'neutral'}
        >
          <DetailList
            items={[
              { label: 'Vista actual', value: visibilityFilter === 'public' ? 'Cartera pública visible' : visibilityFilter === 'internal' ? 'Cartera interna' : 'Cartera completa' },
              { label: 'Instituciones visibles', value: String(new Set(projects.map((project) => project.institutionId)).size) },
              { label: 'Portafolios visibles', value: String(visiblePortfolios.length) },
              { label: 'Proyecto enfocado', value: detail?.project.title ?? 'Selecciona un proyecto' },
            ]}
          />
        </Panel>
      </div> : null}

      {workspaceView === 'summary' && detail ? <MetricGrid>
        <MetricCard
          label="Avance general"
          value={`${detail.project.progressPct ?? 0}%`}
          hint="Progreso reportado del proyecto."
          icon="overview"
          tone="neutral"
        />
        <MetricCard
          label="Área reportada"
          value={typeof detail.project.areaHa === 'number' ? `${detail.project.areaHa.toLocaleString('es-CR')} ha` : 'Sin dato'}
          hint="Cobertura declarada."
          icon="flow"
          tone="good"
        />
        <MetricCard
          label="Hitos pendientes"
          value={String(detail.milestones.filter((item) => item.status !== 'done').length)}
          hint="Hitos aún no completados."
          icon="publication"
          tone="good"
        />
        <MetricCard
          label="Documentos"
          value={String(detail.documents.length + projectFiles.length)}
          hint={`${detail.incidents.filter((item) => item.status !== 'resolved').length} incidencias abiertas.`}
          icon="map"
          tone="warn"
        />
      </MetricGrid> : null}

      {workspaceView === 'summary' && detail ? (
        <div className="project-summary-layout">
          <Panel title="Resumen" subtitle="Situación actual del proyecto." icon="overview" tone="good">
            <dl className="project-summary-facts">
              {[
                ['Estado', projectStatusLabel(detail.project.status)],
                ['Institución líder', selectedInstitutionName],
                ['Portafolio', selectedPortfolioName],
                ['Temática', detail.project.theme ?? 'Sin temática'],
                ['Inicio', detail.project.startDate ?? 'Sin fecha'],
                ['Fin', detail.project.endDate ?? 'Sin fecha'],
                ['Indicadores', String(detail.indicators.length)],
                ['Actores', String(detail.actors.length)],
              ].map(([label, value]) => (
                <div key={label} className="project-summary-fact">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <section className="project-summary-objective" aria-labelledby="project-objective-title">
              <span className="project-summary-objective__marker" aria-hidden="true" />
              <div>
                <h4 id="project-objective-title">Objetivo</h4>
                <p>{detail.project.objective ?? detail.project.summary ?? 'Sin objetivo registrado.'}</p>
              </div>
            </section>
          </Panel>

          <Panel
            title="Secciones del proyecto"
            subtitle="Accede a cada área de trabajo y su información vinculada."
            icon="flow"
            tone="neutral"
          >
            <nav className="project-section-grid" aria-label="Accesos del proyecto">
              {[
                ['Planificación', detail.tasks.length, 'planning' as const],
                ['Presupuesto', detail.budgetItems.length, 'budget' as const],
                ['Riesgos', detail.risks.filter((item) => !['closed', 'mitigated'].includes(item.status)).length, 'risks' as const],
                ['Actores', detail.actors.length, 'actors' as const],
                ['Hitos', detail.milestones.length, 'milestones' as const],
                ['Indicadores', detail.indicators.length, 'indicators' as const],
                ['Territorios', detail.territories.length, 'territory' as const],
                ['Entregables', detail.deliverables.length, 'deliverables' as const],
                ['Documentos', detail.documents.length + projectFiles.length, 'documents' as const],
                ...(canReadReports ? [['Informes', reportLoadFailed ? 'Parcial' : projectReports.length, 'reports' as const] as const] : []),
                ['Eventos', detail.audit.length, 'activity' as const],
              ].map(([label, count, view]) => (
                <Link key={String(view)} to={projectWorkspacePath(view as ProjectWorkspaceView, detail.project.id)} className="project-section-card">
                  <span className="project-section-card__label">{label}</span>
                  <strong className="project-section-card__count">{count}</strong>
                  <span className="project-section-card__action">Abrir sección <span aria-hidden="true">→</span></span>
                </Link>
              ))}
            </nav>
          </Panel>
        </div>
      ) : null}

      {workspaceView === 'summary' && detail ? <>
        <div style={{ height: 16 }} />
        <ProjectHealthPanel detail={detail} />
        <div style={{ height: 16 }} />
        <FinancialSettingsPanel detail={detail} canManage={canManageProjectBudget} onChanged={() => loadProjectDetail(detail.project.id)} />
      </> : null}

      {detail && (workspaceView === 'planning' || workspaceView === 'schedule' || workspaceView === 'budget' || workspaceView === 'risks') ? (
        <ProjectPlanningWorkspace
          detail={detail}
          view={workspaceView}
          canUpdate={workspaceView === 'budget' ? canManageProjectBudget : workspaceView === 'risks' ? canManageProjectRisks : canManageProjectPlanning}
          canManageBudget={canManageProjectBudget}
          canManageFinance={canManageProjectFinance}
          onChanged={() => loadProjectDetail(detail.project.id)}
        />
      ) : null}

      {detail && workspaceView === 'governance' ? <>
        <ProjectPlanningWorkspace detail={detail} view="risks" canUpdate={canManageProjectRisks} onChanged={() => loadProjectDetail(detail.project.id)} />
        <div style={{ height: 16 }} />
        <ProjectLifecycleWorkspace detail={detail} view="governance" canUpdate={canUpdateProjects} canManageRisks={canManageProjectRisks} onChanged={() => loadProjectDetail(detail.project.id)} />
      </> : null}

      {detail && workspaceView === 'monitoring' ? <ProjectLifecycleWorkspace detail={detail} view="monitoring" canUpdate={canUpdateProjects} canManageRisks={canManageProjectRisks} canClose={canCloseProjects} onChanged={() => loadProjectDetail(detail.project.id)} /> : null}

      {workspaceView === 'territory' ? <section className="sigi-map-page" aria-label="Mapa del proyecto">
        <div className="sigi-map-page__title">
          <div><span>Proyecto · Mapa</span><h2>Mapa</h2><p>Explora la cobertura del portafolio y la capa operativa disponible.</p></div>
          <div className="sigi-map-page__actions">
            {detail ? (
              <Link style={secondaryLinkStyle} to={`/admin/geobi?view=viewer&projectId=${encodeURIComponent(detail.project.id)}`}>
                Abrir en Mapa
              </Link>
            ) : null}
            {detail && canUpdateProjectPolygon ? <button type="button" onClick={() => setPolygonFormOpen(true)} style={secondaryButtonStyle}>Editar geometría</button> : null}
            <button
              type="button"
              onClick={() => setMapView('executive')}
              style={mapTabButtonStyle(mapView === 'executive')}
            >
              Mapa ejecutivo
            </button>
            <button
              type="button"
              onClick={() => setMapView('operational')}
              style={mapTabButtonStyle(mapView === 'operational')}
            >
              Capa SSP
            </button>
          </div>
        </div>
        <div className="sigi-project-map-canvas">

          {mapView === 'executive' ? (
            <ProjectCoverageMap
              featureCollection={featureCollection}
              projects={projects}
              detail={detail}
              selectedProjectId={selectedProjectId}
              onSelectProject={(projectId) => selectProject(projectId, 'territory')}
              title="Mapa de proyectos"
              subtitle="Cobertura por proyecto y portafolio."
              emptyMessage="No hay capas disponibles para construir el mapa del módulo."
              geoserverOverlay={executiveGeoServerOverlay}
            />
          ) : (
            <OperationalLayerMap
              featureCollection={operationalFeatureCollection}
              title="Capa operativa SSP importada"
              subtitle="Vista analítica de la capa geoespacial cargada por shapefile. Se mantiene separada de la cartera pública del país para no mezclar narrativa institucional con operación territorial detallada."
              emptyMessage="No hay geometrías operativas importadas en la capa SSP."
            />
          )}
        </div>
      </section> : null}

      {workspaceView === 'portfolio' ? <div
        style={{
          display: 'grid',
          gap: 18,
          gridTemplateColumns: 'minmax(0, 1fr)',
          alignItems: 'start',
        }}
      >
        <Panel
          title="Cartera de proyectos"
          subtitle="Busca, filtra y abre el proyecto que necesitas consultar."
          action={<StatPill tone="good">{projects.length} proyectos</StatPill>}
          icon="overview"
          tone="good"
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="sigi-filter-bar">
            <label className="sigi-filter-bar__search">
              <span style={labelStyle}>Buscar proyecto</span>
              <input type="search" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Nombre, código, institución o temática" style={inputStyle} />
            </label>
              <label>
                <span style={labelStyle}>Vista</span>
                <select
                  value={visibilityFilter}
                  onChange={(event) => setVisibilityFilter(event.target.value)}
                  style={inputStyle}
                >
                  <option value="public">Pública</option>
                  <option value="internal">Interna</option>
                  <option value="all">Completa</option>
                </select>
              </label>
              <label>
                <span style={labelStyle}>Estado</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  style={inputStyle}
                >
                  <option value="all">Todos</option>
                  <option value="draft">Borrador</option>
                  <option value="active">Activo</option>
                  <option value="completed">Completado</option>
                  <option value="published">Publicado</option>
                </select>
              </label>
              <label>
                <span style={labelStyle}>Institución</span>
                <select
                  value={institutionFilter}
                  onChange={(event) => setInstitutionFilter(event.target.value)}
                  style={inputStyle}
                >
                  <option value="all">Todas</option>
                  {institutions.map((institution) => (
                    <option key={institution.id} value={institution.id}>
                      {institution.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <DataTable rows={visibleProjects} rowKey={(project) => project.id} empty="No hay proyectos para los filtros seleccionados." columns={[
              { id: 'project', header: 'Proyecto', cell: (project) => <div className="sigi-table-primary"><strong>{project.title}</strong><span>{project.code ?? 'Sin código'} · {project.theme ?? 'Sin temática'}</span></div>, sortValue: (project) => project.title },
              { id: 'institution', header: 'Institución', cell: (project) => project.institutionName ?? 'Sin institución', sortValue: (project) => project.institutionName },
              { id: 'status', header: 'Estado', cell: (project) => <StatusBadge status={project.status} label={projectStatusLabel(project.status)} /> },
              { id: 'progress', header: 'Avance', cell: (project) => <div className="sigi-table-progress"><span>{project.progressPct ?? 0}%</span><div className="project-progress" aria-label={`Avance ${project.progressPct ?? 0}%`}><span style={{ width: `${Math.min(100, Math.max(0, project.progressPct ?? 0))}%` }} /></div></div>, sortValue: (project) => project.progressPct },
              { id: 'action', header: 'Acción', cell: (project) => <Link to={projectWorkspacePath('summary', project.id)}>Ver proyecto →</Link> },
            ]} />
          </div>
        </Panel>

        {shouldRenderLegacyWorkspace() && detail ? <div>
          <Panel
            title={isEditing ? 'Edición de ficha maestra' : 'Ficha maestra del proyecto'}
            subtitle="Núcleo administrativo del módulo transversal de proyectos."
            action={<StatPill tone={isEditing ? 'warn' : 'good'}>{isEditing ? 'Edición' : 'Vista activa'}</StatPill>}
          >
            <form onSubmit={(event) => void handleSubmit(event)} style={{ display: 'grid', gap: 14 }}>
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                }}
              >
                <div style={summaryTileStyle}>
                  <span style={summaryTileLabelStyle}>Institución líder</span>
                  <strong style={summaryTileValueStyle}>{selectedInstitutionName}</strong>
                </div>
                <div style={summaryTileStyle}>
                  <span style={summaryTileLabelStyle}>Portafolio</span>
                  <strong style={summaryTileValueStyle}>{selectedPortfolioName}</strong>
                </div>
                <div style={summaryTileStyle}>
                  <span style={summaryTileLabelStyle}>Estado</span>
                  <strong style={summaryTileValueStyle}>{detail ? projectStatusLabel(detail.project.status) : 'Nuevo proyecto'}</strong>
                </div>
                <div style={summaryTileStyle}>
                  <span style={summaryTileLabelStyle}>Avance</span>
                  <strong style={summaryTileValueStyle}>{detail ? `${detail.project.progressPct ?? 0}%` : '0%'}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Código</span>
                  <input disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Nombre</span>
                  <input disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Institución líder</span>
                  <select disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.institutionId} onChange={(event) => setForm((current) => ({ ...current, institutionId: event.target.value }))} style={inputStyle}>
                    <option value="">Selecciona</option>
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>{institution.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Portafolio</span>
                  <select disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.portfolioId} onChange={(event) => setForm((current) => ({ ...current, portfolioId: event.target.value }))} style={inputStyle}>
                    <option value="">Sin portafolio</option>
                    {portfolios.map((portfolio) => (
                      <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Temática</span>
                  <input disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.theme} onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Estado</span>
                  <select disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} style={inputStyle}>
                    <option value="draft">Borrador</option>
                    <option value="active">Activo</option>
                    <option value="completed">Completado</option>
                    <option value="published">Publicado</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Prioridad</span>
                  <select disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} style={inputStyle}>
                    <option value="critical">Crítica</option>
                    <option value="high">Alta</option>
                    <option value="medium">Media</option>
                    <option value="low">Baja</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Visibilidad</span>
                  <select disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))} style={inputStyle}>
                    <option value="public">Pública</option>
                    <option value="internal">Interna</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Inicio</span>
                  <input disabled={isEditing ? !canUpdateProjects : !canCreateProjects} type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Fin</span>
                  <input disabled={isEditing ? !canUpdateProjects : !canCreateProjects} type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Avance %</span>
                  <input disabled={isEditing ? !canUpdateProjects : !canCreateProjects} type="number" min="0" max="100" value={form.progressPct} onChange={(event) => setForm((current) => ({ ...current, progressPct: event.target.value }))} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Área ha</span>
                  <input disabled={isEditing ? !canUpdateProjects : !canCreateProjects} type="number" min="0" step="0.01" value={form.areaHa} onChange={(event) => setForm((current) => ({ ...current, areaHa: event.target.value }))} style={inputStyle} />
                </label>
              </div>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={labelStyle}>Objetivo</span>
                <textarea disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.objective} onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))} style={textareaStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={labelStyle}>Resumen</span>
                <textarea disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} style={textareaStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={labelStyle}>Descripción</span>
                <textarea disabled={isEditing ? !canUpdateProjects : !canCreateProjects} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} style={textareaStyle} />
              </label>

              <div style={executiveNoteStyle}>
                {detail?.project.summary ??
                  'Usa esta ficha maestra para consolidar la narrativa institucional del proyecto antes de presentarlo en la vista país y en el mapa.'}
              </div>

              <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#10233f', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(event) => setForm((current) => ({ ...current, featured: event.target.checked }))}
                />
                Proyecto destacado en vistas país
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <DetailList
                  items={[
                    { label: 'Institución líder', value: selectedInstitutionName },
                    { label: 'Portafolio', value: selectedPortfolioName },
                    { label: 'Incidencias', value: String(detail?.incidents.length ?? 0) },
                    { label: 'Entregables', value: String(detail?.deliverables.length ?? 0) },
                  ]}
                />
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <button type="button" onClick={startCreateMode} style={secondaryButtonStyle}>
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || (isEditing ? !canUpdateProjects : !canCreateProjects) || form.title.trim().length === 0 || form.institutionId.length === 0}
                    style={{
                      ...primaryButtonStyle,
                      opacity: isSaving || form.title.trim().length === 0 || form.institutionId.length === 0 ? 0.6 : 1,
                      cursor: isSaving || form.title.trim().length === 0 || form.institutionId.length === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isSaving ? 'Guardando...' : isEditing ? 'Actualizar proyecto' : 'Crear proyecto'}
                  </button>
                </div>
              </div>
            </form>
          </Panel>

          {detail ? (
            <PanelGrid>
              <Panel title="Actores y gobernanza" subtitle="Liderazgo, socios y responsables del proyecto.">
                <div style={{ display: 'grid', gap: 10 }}>
                  <form onSubmit={handleActorSubmit} style={{ ...tileStyle, gap: 10 }}>
                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      }}
                    >
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Tipo de actor</span>
                        <select
                          value={actorForm.actorType}
                          onChange={(event) => setActorForm((current) => ({ ...current, actorType: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingActor}
                          style={inputStyle}
                        >
                          <option value="leader">Liderazgo</option>
                          <option value="responsible">Responsable</option>
                          <option value="partner">Socio</option>
                          <option value="approver">Aprobador</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Institución</span>
                        <select
                          value={actorForm.institutionId}
                          onChange={(event) => setActorForm((current) => ({ ...current, institutionId: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingActor}
                          style={inputStyle}
                        >
                          <option value="">Sin institución enlazada</option>
                          {institutions.map((institution) => (
                            <option key={institution.id} value={institution.id}>
                              {institution.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Nombre visible</span>
                        <input
                          value={actorForm.displayName}
                          onChange={(event) => setActorForm((current) => ({ ...current, displayName: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingActor}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Rol</span>
                        <input
                          value={actorForm.roleLabel}
                          onChange={(event) => setActorForm((current) => ({ ...current, roleLabel: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingActor}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Estado</span>
                        <select
                          value={actorForm.status}
                          onChange={(event) => setActorForm((current) => ({ ...current, status: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingActor}
                          style={inputStyle}
                        >
                          <option value="active">Activo</option>
                          <option value="inactive">Inactivo</option>
                        </select>
                      </label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button type="button" onClick={startActorCreateMode} style={secondaryButtonStyle}>
                        Limpiar
                      </button>
                      <button
                        type="submit"
                        disabled={!canUpdateProjects || isSavingActor || actorForm.displayName.trim().length === 0}
                        style={{
                          ...primaryButtonStyle,
                          opacity: !canUpdateProjects || isSavingActor || actorForm.displayName.trim().length === 0 ? 0.6 : 1,
                          cursor: !canUpdateProjects || isSavingActor || actorForm.displayName.trim().length === 0 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSavingActor
                          ? 'Guardando...'
                          : editingActorId
                            ? 'Actualizar actor'
                            : 'Crear actor'}
                      </button>
                    </div>
                  </form>
                  {detail.actors.map((actor) => (
                    <article key={actor.id} style={tileStyle}>
                      <strong>{actor.displayName}</strong>
                      <span style={metaStyle}>{projectActorLabel(actor.actorType)} · {actor.roleLabel ?? 'Sin rol adicional'}</span>
                      <span style={metaStyle}>{actor.institutionName ?? 'Sin institución enlazada'}</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" onClick={() => startActorEditMode(actor)} style={secondaryButtonStyle}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteActor(actor.id)}
                          style={{ ...secondaryButtonStyle, borderColor: '#f3d6d4', color: '#b42318' }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))}
                  {detail.actors.length === 0 ? (
                    <MessageBlock>Este proyecto aún no tiene actores o socios registrados.</MessageBlock>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Plan de trabajo e hitos" subtitle="Cronograma operativo y avance.">
                <div style={{ display: 'grid', gap: 10 }}>
                  <form onSubmit={handleMilestoneSubmit} style={{ ...tileStyle, gap: 10 }}>
                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      }}
                    >
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Código actividad</span>
                        <input
                          value={milestoneForm.activityCode}
                          onChange={(event) => setMilestoneForm((current) => ({ ...current, activityCode: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingMilestone}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Título</span>
                        <input
                          value={milestoneForm.title}
                          onChange={(event) => setMilestoneForm((current) => ({ ...current, title: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingMilestone}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Estado</span>
                        <select
                          value={milestoneForm.status}
                          onChange={(event) => setMilestoneForm((current) => ({ ...current, status: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingMilestone}
                          style={inputStyle}
                        >
                          <option value="planned">Planificado</option>
                          <option value="in_progress">En progreso</option>
                          <option value="done">Completado</option>
                          <option value="blocked">Bloqueado</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Fecha objetivo</span>
                        <input
                          type="date"
                          value={milestoneForm.dueDate}
                          onChange={(event) => setMilestoneForm((current) => ({ ...current, dueDate: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingMilestone}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Fecha completado</span>
                        <input
                          type="date"
                          value={milestoneForm.completedAt}
                          onChange={(event) => setMilestoneForm((current) => ({ ...current, completedAt: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingMilestone}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Avance %</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={milestoneForm.progressPct}
                          onChange={(event) => setMilestoneForm((current) => ({ ...current, progressPct: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingMilestone}
                          style={inputStyle}
                        />
                      </label>
                    </div>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={labelStyle}>Descripción</span>
                      <textarea
                        value={milestoneForm.description}
                        onChange={(event) => setMilestoneForm((current) => ({ ...current, description: event.target.value }))}
                        disabled={!canUpdateProjects || isSavingMilestone}
                        style={textareaStyle}
                      />
                    </label>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button type="button" onClick={startMilestoneCreateMode} style={secondaryButtonStyle}>
                        Limpiar
                      </button>
                      <button
                        type="submit"
                        disabled={!canUpdateProjects || isSavingMilestone || milestoneForm.title.trim().length === 0}
                        style={{
                          ...primaryButtonStyle,
                          opacity: !canUpdateProjects || isSavingMilestone || milestoneForm.title.trim().length === 0 ? 0.6 : 1,
                          cursor: !canUpdateProjects || isSavingMilestone || milestoneForm.title.trim().length === 0 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSavingMilestone
                          ? 'Guardando...'
                          : editingMilestoneId
                            ? 'Actualizar hito'
                            : 'Crear hito'}
                      </button>
                    </div>
                  </form>
                  {detail.milestones.map((milestone) => (
                    <article key={milestone.id} style={tileStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <strong>{milestone.title}</strong>
                        <StatPill tone={milestone.status === 'done' ? 'good' : milestone.status === 'blocked' ? 'danger' : 'neutral'}>
                          {projectMilestoneStatusLabel(milestone.status)}
                        </StatPill>
                      </div>
                      <span style={metaStyle}>{milestone.description ?? 'Sin descripción adicional'}</span>
                      <span style={metaStyle}>Vence: {milestone.dueDate ?? 'sin fecha'} · Avance {milestone.progressPct ?? 0}%</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" onClick={() => startMilestoneEditMode(milestone)} style={secondaryButtonStyle}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMilestone(milestone.id)}
                          style={{ ...secondaryButtonStyle, borderColor: '#f3d6d4', color: '#b42318' }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))}
                  {detail.milestones.length === 0 ? (
                    <MessageBlock>Este proyecto aún no tiene hitos cargados.</MessageBlock>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Indicadores y metas" subtitle="KPIs, línea base y progreso observado.">
                <div style={{ display: 'grid', gap: 10 }}>
                  {detail.indicators.map((indicator) => (
                    <article key={indicator.id} style={tileStyle}>
                      <strong>{indicator.indicatorName ?? indicator.indicatorCode}</strong>
                      <span style={metaStyle}>
                        Valor actual: {indicator.valueNumeric ?? indicator.valueText ?? 'n/d'} {indicator.unit}
                      </span>
                      <span style={metaStyle}>
                        Línea base: {indicator.baselineValue ?? 'n/d'} · Meta: {indicator.targetValue ?? 'n/d'} · Avance {indicator.progressPct ?? 0}%
                      </span>
                    </article>
                  ))}
                  {detail.indicators.length === 0 ? (
                    <MessageBlock>Este proyecto aún no tiene KPIs asociados.</MessageBlock>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Territorio y cobertura" subtitle="Alcance territorial con lectura de áreas.">
                <div style={{ display: 'grid', gap: 14 }}>
                  {detail.territories.map((territory) => (
                    <article key={territory.id} style={tileStyle}>
                      <strong>{territory.territoryName ?? territory.territoryCode}</strong>
                      <span style={metaStyle}>{territory.level ?? 'custom'} · {territory.country}</span>
                      <span style={metaStyle}>{territory.areaHa.toLocaleString('es-CR')} ha</span>
                    </article>
                  ))}
                  {detail.territories.length === 0 ? (
                    <MessageBlock>Este proyecto aún no tiene cobertura territorial registrada.</MessageBlock>
                  ) : null}

                  <div
                    style={{
                      border: '1px solid #d7dde5',
                      borderRadius: 16,
                      padding: 16,
                      display: 'grid',
                      gap: 12,
                      background: '#f8fbff',
                    }}
                  >
                    <strong style={{ color: '#10233f' }}>Polígono editable del proyecto</strong>
                    <span style={metaStyle}>
                      Pega o ajusta un GeoJSON tipo <code>Polygon</code> o <code>MultiPolygon</code>.
                      Se guardará como geometría propia del proyecto dentro del módulo.
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gap: 12,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      }}
                    >
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Nombre del polígono</span>
                        <input
                          disabled={!canUpdateProjectPolygon}
                          value={polygonTerritoryName}
                          onChange={(event) => setPolygonTerritoryName(event.target.value)}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>País</span>
                        <input
                          disabled={!canUpdateProjectPolygon}
                          value={polygonCountry}
                          onChange={(event) => setPolygonCountry(event.target.value)}
                          style={inputStyle}
                        />
                      </label>
                    </div>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={labelStyle}>GeoJSON del polígono</span>
                      <textarea
                        disabled={!canUpdateProjectPolygon}
                        value={polygonText}
                        onChange={(event) => setPolygonText(event.target.value)}
                        style={{ ...textareaStyle, minHeight: 220 }}
                      />
                    </label>
                    <DetailList
                      items={[
                        {
                          label: 'Código',
                          value: polygon?.territoryCode ?? 'Se generará al guardar',
                        },
                        {
                          label: 'Área calculada',
                          value:
                            polygon && typeof polygon.areaHa === 'number'
                              ? `${polygon.areaHa.toLocaleString('es-CR')} ha`
                              : 'Se calculará al guardar',
                        },
                      ]}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button
                        type="button"
                        onClick={handleSavePolygon}
                        disabled={isSavingPolygon || !canUpdateProjectPolygon || polygonText.trim().length === 0}
                        style={{
                          ...primaryButtonStyle,
                          opacity: isSavingPolygon || polygonText.trim().length === 0 ? 0.6 : 1,
                          cursor:
                            isSavingPolygon || polygonText.trim().length === 0
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        {isSavingPolygon ? 'Guardando polígono...' : 'Guardar polígono'}
                      </button>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Resultados y entregables" subtitle="Productos, reportes y salidas publicables." icon="publication" tone="good">
                <div style={{ display: 'grid', gap: 10 }}>
                  <form onSubmit={handleDeliverableSubmit} style={{ ...tileStyle, gap: 10 }}>
                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      }}
                    >
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Código</span>
                        <input
                          value={deliverableForm.code}
                          onChange={(event) => setDeliverableForm((current) => ({ ...current, code: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingDeliverable}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Título</span>
                        <input
                          value={deliverableForm.title}
                          onChange={(event) => setDeliverableForm((current) => ({ ...current, title: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingDeliverable}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Tipo</span>
                        <input
                          value={deliverableForm.deliverableType}
                          onChange={(event) => setDeliverableForm((current) => ({ ...current, deliverableType: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingDeliverable}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Estado</span>
                        <select
                          value={deliverableForm.status}
                          onChange={(event) => setDeliverableForm((current) => ({ ...current, status: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingDeliverable}
                          style={inputStyle}
                        >
                          <option value="planned">Planificado</option>
                          <option value="in_progress">En progreso</option>
                          <option value="completed">Completado</option>
                          <option value="published">Publicado</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Fecha objetivo</span>
                        <input
                          type="date"
                          value={deliverableForm.dueDate}
                          onChange={(event) => setDeliverableForm((current) => ({ ...current, dueDate: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingDeliverable}
                          style={inputStyle}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={labelStyle}>Fecha publicado</span>
                        <input
                          type="date"
                          value={deliverableForm.publishedAt}
                          onChange={(event) => setDeliverableForm((current) => ({ ...current, publishedAt: event.target.value }))}
                          disabled={!canUpdateProjects || isSavingDeliverable}
                          style={inputStyle}
                        />
                      </label>
                    </div>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={labelStyle}>URL / salida</span>
                      <input
                        value={deliverableForm.outputUrl}
                        onChange={(event) => setDeliverableForm((current) => ({ ...current, outputUrl: event.target.value }))}
                        disabled={!canUpdateProjects || isSavingDeliverable}
                        style={inputStyle}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={labelStyle}>Descripción</span>
                      <textarea
                        value={deliverableForm.description}
                        onChange={(event) => setDeliverableForm((current) => ({ ...current, description: event.target.value }))}
                        disabled={!canUpdateProjects || isSavingDeliverable}
                        style={textareaStyle}
                      />
                    </label>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button type="button" onClick={startDeliverableCreateMode} style={secondaryButtonStyle}>
                        Limpiar
                      </button>
                      <button
                        type="submit"
                        disabled={!canUpdateProjects || isSavingDeliverable || deliverableForm.title.trim().length === 0}
                        style={{
                          ...primaryButtonStyle,
                          opacity: !canUpdateProjects || isSavingDeliverable || deliverableForm.title.trim().length === 0 ? 0.6 : 1,
                          cursor: !canUpdateProjects || isSavingDeliverable || deliverableForm.title.trim().length === 0 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSavingDeliverable
                          ? 'Guardando...'
                          : editingDeliverableId
                            ? 'Actualizar entregable'
                            : 'Crear entregable'}
                      </button>
                    </div>
                  </form>
                  {detail.deliverables.map((deliverable) => (
                    <article key={deliverable.id} style={tileStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <strong>{deliverable.title}</strong>
                        <StatPill tone={deliverable.status === 'published' ? 'good' : 'neutral'}>
                          {projectDeliverableStatusLabel(deliverable.status)}
                        </StatPill>
                      </div>
                      <span style={metaStyle}>{deliverable.deliverableType} · vence {deliverable.dueDate ?? 'sin fecha'}</span>
                      <span style={metaStyle}>{deliverable.outputUrl ?? 'Sin URL publicada aún'}</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" onClick={() => startDeliverableEditMode(deliverable)} style={secondaryButtonStyle}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDeliverable(deliverable.id)}
                          style={{ ...secondaryButtonStyle, borderColor: '#f3d6d4', color: '#b42318' }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))}
                  {detail.deliverables.length === 0 ? (
                    <MessageBlock icon="publication">Este proyecto aún no tiene entregables vinculados.</MessageBlock>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Documentos y evidencia" subtitle="Archivos reales y documentos declarados dentro del contexto del proyecto." icon="publication" tone="neutral">
                <div style={{ display: 'grid', gap: 12 }}>
                  <div
                    style={{
                      ...tileStyle,
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <strong style={{ color: '#10233f' }}>Carga contextual al proyecto</strong>
                    <span style={metaStyle}>
                      Los archivos cargados aquí quedan asociados al `projectId` activo para exploración, auditoría y descarga.
                    </span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="file"
                        onChange={handleProjectFileSelection}
                        disabled={!canCreateFiles || isUploadingProjectFile}
                      />
                      <button
                        type="button"
                        onClick={() => void handleUploadProjectFile()}
                        disabled={!canCreateFiles || isUploadingProjectFile || !projectFileUpload}
                        style={{
                          ...primaryButtonStyle,
                          opacity: !canCreateFiles || isUploadingProjectFile || !projectFileUpload ? 0.6 : 1,
                          cursor: !canCreateFiles || isUploadingProjectFile || !projectFileUpload ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isUploadingProjectFile ? 'Subiendo...' : 'Subir documento'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    <strong style={{ color: '#10233f' }}>Vincular archivo existente</strong>
                    <div style={{ ...tileStyle, gap: 10 }}>
                      <span style={metaStyle}>
                        Busca evidencia ya cargada en SIGI y asóciala al proyecto activo sin duplicar documentos.
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}>
                        <input
                          value={existingFileSearch}
                          onChange={(event) => setExistingFileSearch(event.target.value)}
                          placeholder="Buscar por nombre, título o descripción"
                          style={inputStyle}
                        />
                        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(180px, 1fr) auto' }}>
                          <select
                            value={existingFileRelationType}
                            onChange={(event) => setExistingFileRelationType(event.target.value)}
                            style={inputStyle}
                          >
                            <option value="evidence">Evidencia</option>
                            <option value="deliverable">Entregable</option>
                            <option value="reference">Referencia</option>
                            <option value="support">Soporte</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => void handleSearchExistingProjectFiles()}
                            disabled={isSearchingExistingFiles}
                            style={{
                              ...secondaryButtonStyle,
                              opacity: isSearchingExistingFiles ? 0.6 : 1,
                              cursor: isSearchingExistingFiles ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSearchingExistingFiles ? 'Buscando...' : 'Buscar'}
                          </button>
                        </div>
                      </div>
                      {existingProjectFiles.length > 0 ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {existingProjectFiles.slice(0, 5).map((file) => (
                            <article key={file.id} style={tileStyle}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                <strong>{file.title ?? file.name}</strong>
                                <StatPill tone="neutral">{(file.extension ?? 'sin ext').toUpperCase()}</StatPill>
                              </div>
                              <span style={metaStyle}>
                                {file.projectTitle ?? 'Sin proyecto enlazado'} · {file.institutionName ?? 'Sin institución'}
                              </span>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => void handleLinkExistingFile(file.id)}
                                  disabled={!canShareFiles || isLinkingProjectFile}
                                  style={secondaryButtonStyle}
                                >
                                  Vincular al proyecto
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : existingFileSearch.trim().length > 0 && !isSearchingExistingFiles ? (
                        <MessageBlock>No se encontraron archivos externos listos para vincular con ese criterio.</MessageBlock>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    <strong style={{ color: '#10233f' }}>Archivos vinculados al proyecto ({projectFiles.length})</strong>
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)' }}>
                      <div style={{ display: 'grid', gap: 10 }}>
                        {projectFiles.map((file) => {
                          const isSelected = selectedProjectFileId === file.id;
                          return (
                            <article
                              key={file.id}
                              style={{
                                ...tileStyle,
                                borderColor: isSelected ? '#14532d' : '#d7dde5',
                                boxShadow: isSelected ? '0 0 0 1px rgba(20, 83, 45, 0.2)' : 'none',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                <strong>{file.title ?? file.name}</strong>
                                <StatPill tone={file.validationStatus === 'approved' ? 'good' : 'warn'}>
                                  {file.validationStatus}
                                </StatPill>
                              </div>
                              <span style={metaStyle}>
                                {(file.extension ?? 'sin ext').toUpperCase()} · {file.projectTitle ?? detail.project.title}
                              </span>
                              <span style={metaStyle}>
                                {file.description ?? 'Sin descripción adicional'} · {file.createdAt ? new Date(file.createdAt).toLocaleString('es-CR') : 'sin fecha'}
                              </span>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedProjectFileId(file.id)}
                                  style={secondaryButtonStyle}
                                >
                                  Ver detalle
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDownloadProjectFile(file)}
                                  disabled={!canDownloadFiles}
                                  style={secondaryButtonStyle}
                                >
                                  Descargar
                                </button>
                              </div>
                            </article>
                          );
                        })}
                        {projectFiles.length === 0 ? (
                          <MessageBlock>No hay archivos cargados aún para este proyecto en el explorador documental.</MessageBlock>
                        ) : null}
                      </div>

                      <div style={{ ...tileStyle, alignContent: 'start' }}>
                        <strong style={{ color: '#10233f' }}>Archivo enfocado</strong>
                        {isLoadingProjectFileContext ? <MessageBlock>Cargando detalle y auditoría del archivo...</MessageBlock> : null}
                        {!isLoadingProjectFileContext && !selectedProjectFileDetail ? (
                          <MessageBlock>Selecciona un archivo vinculado para revisar su contexto operativo y trazabilidad.</MessageBlock>
                        ) : null}
                        {selectedProjectFileDetail ? (
                          <div style={{ display: 'grid', gap: 12 }}>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <strong>{selectedProjectFileDetail.title ?? selectedProjectFileDetail.name}</strong>
                              <span style={metaStyle}>
                                {(selectedProjectFileDetail.extension ?? 'sin ext').toUpperCase()} · {selectedProjectFileDetail.mimeType ?? 'mime no definido'}
                              </span>
                              <span style={metaStyle}>{selectedProjectFileDetail.description ?? 'Sin descripción adicional'}</span>
                            </div>

                            {selectedProjectFilePreviewUrl && (selectedProjectFileDetail.mimeType ?? '').startsWith('image/') ? (
                              <img
                                src={selectedProjectFilePreviewUrl}
                                alt={selectedProjectFileDetail.title ?? selectedProjectFileDetail.name}
                                style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 14, border: '1px solid #d7dde5', background: '#ffffff' }}
                              />
                            ) : null}
                            {selectedProjectFilePreviewUrl && selectedProjectFileDetail.mimeType === 'application/pdf' ? (
                              <iframe
                                src={selectedProjectFilePreviewUrl}
                                title={selectedProjectFileDetail.title ?? selectedProjectFileDetail.name}
                                style={{ width: '100%', minHeight: 260, border: '1px solid #d7dde5', borderRadius: 14, background: '#ffffff' }}
                              />
                            ) : null}

                            <DetailList
                              items={[
                                { label: 'Institución', value: selectedProjectFileDetail.institutionName ?? 'Sin institución' },
                                { label: 'Proyecto', value: selectedProjectFileDetail.projectTitle ?? detail.project.title },
                                { label: 'Visibilidad', value: selectedProjectFileDetail.isPublic ? 'Público' : 'Restringido' },
                                { label: 'Geoespacial', value: selectedProjectFileDetail.isGeospatial ? 'Sí' : 'No' },
                                { label: 'Estado', value: selectedProjectFileDetail.validationStatus },
                              ]}
                            />

                            <div style={{ display: 'grid', gap: 8 }}>
                              <strong style={{ color: '#10233f' }}>Asociaciones registradas</strong>
                              {(selectedProjectFileDetail.links ?? []).length === 0 ? (
                                <MessageBlock>Este archivo todavía no tiene asociaciones visibles.</MessageBlock>
                              ) : (
                                (selectedProjectFileDetail.links ?? []).map((link) => (
                                  <article key={link.id} style={tileStyle}>
                                    <strong>{link.entityType}</strong>
                                    <span style={metaStyle}>{link.entityId}</span>
                                    <span style={metaStyle}>Relación: {link.relationType}</span>
                                    {link.entityType === 'project' && link.entityId === detail.project.id ? (
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                        <button
                                          type="button"
                                          onClick={() => void handleUnlinkProjectFile(link.id)}
                                          disabled={!canShareFiles || isLinkingProjectFile}
                                          style={{ ...secondaryButtonStyle, borderColor: '#f3d6d4', color: '#b42318' }}
                                        >
                                          Desvincular
                                        </button>
                                      </div>
                                    ) : null}
                                  </article>
                                ))
                              )}
                            </div>

                            <div style={{ display: 'grid', gap: 8 }}>
                              <strong style={{ color: '#10233f' }}>Versiones del archivo</strong>
                              <div style={{ ...tileStyle, gap: 10 }}>
                                <span style={metaStyle}>
                                  Gestiona nuevas versiones del mismo documento sin perder trazabilidad histórica.
                                </span>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <input
                                    type="file"
                                    onChange={handleProjectFileVersionSelection}
                                    disabled={!canUpdateFiles || isCreatingProjectFileVersion}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleCreateProjectFileVersion()}
                                    disabled={!canUpdateFiles || isCreatingProjectFileVersion || !projectFileVersionUpload}
                                    style={{
                                      ...secondaryButtonStyle,
                                      opacity: !canUpdateFiles || isCreatingProjectFileVersion || !projectFileVersionUpload ? 0.6 : 1,
                                      cursor: !canUpdateFiles || isCreatingProjectFileVersion || !projectFileVersionUpload ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    {isCreatingProjectFileVersion ? 'Guardando versión...' : 'Nueva versión'}
                                  </button>
                                </div>
                              </div>
                              {(selectedProjectFileDetail.versions ?? []).length === 0 ? (
                                <MessageBlock>Sin versiones registradas todavía.</MessageBlock>
                              ) : (
                                (selectedProjectFileDetail.versions ?? []).slice(0, 5).map((version) => (
                                  <article key={version.id} style={tileStyle}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                      <strong>v{version.versionNumber}</strong>
                                      <span style={metaStyle}>{formatFileSize(version.sizeBytes)}</span>
                                    </div>
                                    <span style={metaStyle}>{version.originalFilename}</span>
                                    <span style={metaStyle}>{new Date(version.uploadedAt).toLocaleString('es-CR')}</span>
                                  </article>
                                ))
                              )}
                            </div>

                            <div style={{ display: 'grid', gap: 8 }}>
                              <strong style={{ color: '#10233f' }}>Auditoría del archivo</strong>
                              {selectedProjectFileAudit.length === 0 ? (
                                <MessageBlock>Sin eventos de auditoría registrados todavía.</MessageBlock>
                              ) : (
                                selectedProjectFileAudit.slice(0, 6).map((entry) => (
                                  <article key={entry.id} style={tileStyle}>
                                    <strong>{entry.eventType}</strong>
                                    <span style={metaStyle}>{new Date(entry.createdAt).toLocaleString('es-CR')}</span>
                                  </article>
                                ))
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    <strong style={{ color: '#10233f' }}>Documentos declarados ({detail.documents.length})</strong>
                    {detail.documents.map((document) => (
                      <article key={document.id} style={tileStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <strong>{document.title}</strong>
                          <StatPill tone={document.status === 'published' ? 'good' : 'neutral'}>
                            {document.status}
                          </StatPill>
                        </div>
                        <span style={metaStyle}>{document.documentType} · {document.code}</span>
                        <span style={metaStyle}>{document.fileUrl ?? 'Sin URL externa registrada'}</span>
                      </article>
                    ))}
                    {detail.documents.length === 0 ? (
                      <MessageBlock>No hay documentos declarados todavía en la ficha del proyecto.</MessageBlock>
                    ) : null}
                  </div>
                </div>
              </Panel>

              <Panel title="Riesgos, incidencias y alertas" subtitle="Bloqueos y observaciones vinculadas al proyecto." icon="alert" tone="warn">
                <div style={{ display: 'grid', gap: 10 }}>
                  {detail.incidents.map((incident) => (
                    <article key={incident.id} style={tileStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <strong>{incident.title}</strong>
                        <StatPill tone={incident.status === 'resolved' ? 'good' : 'warn'}>
                          {projectIncidentStatusLabel(incident.status)}
                        </StatPill>
                      </div>
                      <span style={metaStyle}>{projectIncidentSeverityLabel(incident.severity)} · {incident.notes ?? 'Sin nota adicional'}</span>
                    </article>
                  ))}
                  {detail.incidents.length === 0 ? (
                    <MessageBlock icon="status">No hay incidencias registradas para este proyecto.</MessageBlock>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Datos y fuentes asociadas" subtitle="Datasets, validaciones y evidencia para trazabilidad." icon="database" tone="neutral">
                <div style={{ display: 'grid', gap: 10 }}>
                  {detail.datasets.map((dataset) => (
                    <article key={dataset.id} style={tileStyle}>
                      <strong>{dataset.datasetTitle ?? dataset.datasetId}</strong>
                      <span style={metaStyle}>{dataset.relationshipType} · {dataset.datasetStatus ?? 'sin estado'}</span>
                      <span style={metaStyle}>Validación: {dataset.validationStatus ?? 'n/d'} · {dataset.evidenceNote ?? 'Sin nota'}</span>
                    </article>
                  ))}
                  {detail.datasets.length === 0 ? (
                    <MessageBlock>No hay datasets asociados a este proyecto.</MessageBlock>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Bitácora y auditoría" subtitle="Rastro operativo del proyecto dentro del SIGI.">
                <div style={{ display: 'grid', gap: 10 }}>
                  {detail.audit.map((entry) => (
                    <article key={entry.id} style={tileStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <strong>{entry.action}</strong>
                        <StatPill tone={entry.result === 'success' ? 'good' : entry.result === 'warning' ? 'warn' : 'neutral'}>
                          {auditResultLabel(entry.result)}
                        </StatPill>
                      </div>
                      <span style={metaStyle}>
                        {entry.entityType === 'document'
                          ? `Documento · ${String(entry.details?.fileName ?? entry.details?.documentEvent ?? entry.entityId ?? 'sin referencia')}`
                          : `${entry.entityType} · ${entry.source}`}
                      </span>
                      <span style={metaStyle}>{entry.actorEmail ?? 'system'} · {new Date(entry.createdAt).toLocaleString('es-CR')}</span>
                    </article>
                  ))}
                  {detail.audit.length === 0 ? (
                    <MessageBlock>No hay eventos de auditoría registrados para este proyecto.</MessageBlock>
                  ) : null}
                </div>
              </Panel>
            </PanelGrid>
          ) : (
            <MessageBlock>Selecciona un proyecto del portafolio para ver su ficha maestra y submódulos.</MessageBlock>
          )}
        </div> : null}
      </div> : null}

      {workspaceView === 'actors' ? (
        <Panel title="Actores" subtitle="Liderazgo, responsables, socios y aprobadores vinculados al proyecto." action={canUpdateProjects ? <button type="button" style={primaryButtonStyle} onClick={startActorCreateMode}>Agregar actor</button> : undefined}>
          <CompactList ariaLabel="Actores del proyecto" empty="No hay actores asociados al proyecto seleccionado." items={detail?.actors.map((actor) => ({
            id: actor.id,
            title: actor.displayName,
            meta: `${projectActorLabel(actor.actorType)} · ${actor.roleLabel ?? 'Sin rol adicional'}`,
            detail: actor.institutionName ?? 'Sin institución enlazada',
            status: <StatusBadge status={actor.status} />,
            actions: canUpdateProjects ? <RowActions label={`Acciones de ${actor.displayName}`}><button type="button" onClick={() => startActorEditMode(actor)}>Editar</button><button type="button" className="is-danger" onClick={() => void handleDeleteActor(actor.id)}>Eliminar</button></RowActions> : undefined,
          })) ?? []} />
        </Panel>
      ) : null}

      {workspaceView === 'milestones' ? (
        <Panel title="Hitos" subtitle="Cronograma, estado y avance del proyecto." action={canUpdateProjects ? <button type="button" style={primaryButtonStyle} onClick={startMilestoneCreateMode}>Nuevo hito</button> : undefined}>
          <CompactList ariaLabel="Hitos del proyecto" empty="No hay hitos asociados al proyecto seleccionado." items={detail?.milestones.map((milestone) => ({
            id: milestone.id,
            title: milestone.title,
            meta: `${milestone.activityCode ?? 'Sin código'} · Fecha objetivo: ${milestone.dueDate ?? 'sin fecha'}`,
            detail: <div className="project-list-progress"><span>Avance {milestone.progressPct ?? 0}%</span><div className="project-progress"><span style={{ width: `${Math.min(100, Math.max(0, milestone.progressPct ?? 0))}%` }} /></div></div>,
            status: <StatusBadge status={milestone.status} label={projectMilestoneStatusLabel(milestone.status)} />,
            actions: canUpdateProjects ? <RowActions label={`Acciones de ${milestone.title}`}><button type="button" onClick={() => startMilestoneEditMode(milestone)}>Editar</button><button type="button" className="is-danger" onClick={() => void handleDeleteMilestone(milestone.id)}>Eliminar</button></RowActions> : undefined,
          })) ?? []} />
        </Panel>
      ) : null}

      {workspaceView === 'indicators' ? (
        <Panel title="Indicadores" subtitle="Resultados, metas y evolución del proyecto.">
          <DataTable rows={detail?.indicators ?? []} rowKey={(indicator) => indicator.id} empty="No hay indicadores asociados al proyecto seleccionado." columns={[
            { id: 'indicator', header: 'Indicador', cell: (indicator) => <div className="sigi-table-primary"><strong>{indicator.indicatorName ?? indicator.indicatorCode}</strong><span>{indicator.indicatorCode}</span></div>, sortValue: (indicator) => indicator.indicatorName ?? indicator.indicatorCode },
            { id: 'current', header: 'Valor actual', cell: (indicator) => `${indicator.valueNumeric ?? indicator.valueText ?? 'n/d'} ${indicator.unit}`.trim() },
            { id: 'baseline', header: 'Línea base', cell: (indicator) => indicator.baselineValue ?? 'n/d' },
            { id: 'target', header: 'Meta', cell: (indicator) => indicator.targetValue ?? 'n/d' },
            { id: 'progress', header: 'Avance', cell: (indicator) => `${indicator.progressPct ?? 0}%`, sortValue: (indicator) => indicator.progressPct },
            { id: 'action', header: 'Acción', cell: (indicator) => <Link to={`/admin/indicators?view=detail&indicator=${encodeURIComponent(indicator.indicatorCode)}`}>Abrir ficha</Link> },
          ]} />
        </Panel>
      ) : null}

      {workspaceView === 'deliverables' ? (
        <Panel title="Entregables" subtitle="Productos y resultados del proyecto." action={canUpdateProjects ? <button type="button" style={primaryButtonStyle} onClick={startDeliverableCreateMode}>Nuevo entregable</button> : undefined}>
          <CompactList ariaLabel="Entregables del proyecto" empty="No hay entregables asociados al proyecto seleccionado." items={detail?.deliverables.map((deliverable) => ({
            id: deliverable.id,
            title: deliverable.title,
            meta: `${deliverable.code} · ${deliverable.deliverableType}`,
            detail: <>Fecha objetivo: {deliverable.dueDate ?? 'sin fecha'}{deliverable.outputUrl ? <> · <a href={deliverable.outputUrl} target="_blank" rel="noreferrer">Abrir resultado</a></> : null}</>,
            status: <StatusBadge status={deliverable.status} label={projectDeliverableStatusLabel(deliverable.status)} />,
            actions: canUpdateProjects ? <RowActions label={`Acciones de ${deliverable.title}`}><button type="button" onClick={() => startDeliverableEditMode(deliverable)}>Editar</button><button type="button" className="is-danger" onClick={() => void handleDeleteDeliverable(deliverable.id)}>Eliminar</button></RowActions> : undefined,
          })) ?? []} />
        </Panel>
      ) : null}

      {workspaceView === 'documents' ? (
        <Panel title="Documentos" subtitle="Archivos y evidencia vinculados al proyecto." action={canCreateFiles ? <button type="button" style={primaryButtonStyle} onClick={() => setDocumentFormOpen(true)}>Subir documento</button> : undefined}>
          <h4 className="sigi-section-label">Archivos vinculados <span>{projectFiles.length}</span></h4>
          <DataTable rows={projectFiles} rowKey={(file) => file.id} empty="No hay archivos vinculados al proyecto." columns={[
            { id: 'name', header: 'Documento', cell: (file) => <div className="sigi-table-primary"><strong>{file.title ?? file.name}</strong><span>{file.name}</span></div>, sortValue: (file) => file.title ?? file.name },
            { id: 'type', header: 'Tipo', cell: (file) => (file.extension ?? 'sin ext').toUpperCase() },
            { id: 'validation', header: 'Validación', cell: (file) => <StatusBadge status={file.validationStatus} /> },
            { id: 'use', header: 'Uso', cell: (file) => <StatusBadge status={projectEvidence.some((evidence) => evidence.id === file.id) ? 'validated' : 'draft'} label={projectEvidence.some((evidence) => evidence.id === file.id) ? 'Evidencia' : 'Archivo'} /> },
            { id: 'actions', header: 'Acciones', cell: (file) => <button type="button" onClick={() => void handleDownloadProjectFile(file)} disabled={!canDownloadFiles} className="sigi-table-action">Descargar</button> },
          ]} />
          <h4 className="sigi-section-label">Documentos declarados <span>{detail?.documents.length ?? 0}</span></h4>
          <DataTable rows={detail?.documents ?? []} rowKey={(document) => document.id} empty="No hay documentos declarados para el proyecto seleccionado." columns={[
            { id: 'title', header: 'Documento', cell: (document) => <strong>{document.title}</strong>, sortValue: (document) => document.title },
            { id: 'type', header: 'Tipo', cell: (document) => document.documentType },
            { id: 'code', header: 'Código', cell: (document) => document.code },
            { id: 'url', header: 'Ubicación', cell: (document) => document.fileUrl ? <a href={document.fileUrl} target="_blank" rel="noreferrer">Abrir documento</a> : 'Sin URL externa' },
          ]} />
        </Panel>
      ) : null}

      {workspaceView === 'reports' && canReadReports ? (
        <Panel title="Informes relacionados" subtitle="Instancias reales cuya selección incluye el proyecto activo.">
          {reportLoadFailed ? <MessageBlock tone="danger">No se pudo consultar Informes. El resto del workspace continúa disponible.</MessageBlock> : null}
          <CompactList ariaLabel="Informes relacionados" empty={detail && !reportLoadFailed ? <>No hay informes asociados. <Link to={`/admin/reports/history?projectId=${encodeURIComponent(detail.project.id)}`}>Revisar historial filtrado</Link>.</> : 'Selecciona un proyecto para consultar sus informes.'} items={projectReports.map((report) => ({
            id: report.id,
            title: report.name,
            meta: `${report.frameworkName} · ${report.templateName}`,
            status: <StatusBadge status={report.status} />,
            actions: <Link to={`/admin/reports/detail?reportId=${encodeURIComponent(report.id)}`}>Abrir detalle</Link>,
          }))} />
        </Panel>
      ) : null}

      {workspaceView === 'activity' ? (
        <PanelGrid>
          <Panel title="Incidencias" subtitle="Asuntos que requieren seguimiento.">
            <CompactList empty="No hay incidencias registradas." items={detail?.incidents.map((incident) => ({ id: incident.id, title: incident.title, meta: projectIncidentSeverityLabel(incident.severity), status: <StatusBadge status={incident.status} label={projectIncidentStatusLabel(incident.status)} /> })) ?? []} />
          </Panel>
          <Panel title="Actividad" subtitle="Rastro operativo reciente del proyecto.">
            <ActivityList empty="No hay eventos de auditoría registrados." items={detail?.audit.map((entry) => ({ id: entry.id, event: entry.action, actor: entry.actorEmail ?? 'Sistema', timestamp: entry.createdAt, status: entry.result, entity: entry.entityType, metadata: entry.details })) ?? []} />
          </Panel>
        </PanelGrid>
      ) : null}

      <Drawer open={projectFormOpen} title={isEditing ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={() => setProjectFormOpen(false)}>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="project-form-grid">
            <InputField label="Código" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
            <InputField label="Nombre" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            <SelectField label="Institución líder" required value={form.institutionId} onChange={(event) => setForm((current) => ({ ...current, institutionId: event.target.value }))}><option value="">Selecciona</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</SelectField>
            <SelectField label="Portafolio" value={form.portfolioId} onChange={(event) => setForm((current) => ({ ...current, portfolioId: event.target.value }))}><option value="">Sin portafolio</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</SelectField>
            <InputField label="Temática" value={form.theme} onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))} />
            <SelectField label="Estado" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">Borrador</option><option value="active">Activo</option><option value="completed">Completado</option><option value="published">Publicado</option></SelectField>
            <InputField label="Inicio" type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
            <InputField label="Fin" type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
            <InputField label="Avance %" type="number" min="0" max="100" value={form.progressPct} onChange={(event) => setForm((current) => ({ ...current, progressPct: event.target.value }))} />
            <InputField label="Área (ha)" type="number" min="0" step="0.01" value={form.areaHa} onChange={(event) => setForm((current) => ({ ...current, areaHa: event.target.value }))} />
          </div>
          <TextareaField label="Objetivo" value={form.objective} onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))} />
          <TextareaField label="Resumen" value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} />
          <Checkbox label="Proyecto destacado" checked={form.featured} onChange={(event) => setForm((current) => ({ ...current, featured: event.target.checked }))} />
          <div className="project-form-actions"><Button type="button" variant="secondary" onClick={() => setProjectFormOpen(false)}>Cancelar</Button><Button type="submit" loading={isSaving} disabled={!form.title.trim() || !form.institutionId}>{isEditing ? 'Guardar cambios' : 'Crear proyecto'}</Button></div>
        </form>
      </Drawer>

      <Drawer open={actorFormOpen} title={editingActorId ? 'Editar actor' : 'Agregar actor'} onClose={() => setActorFormOpen(false)}>
        <form onSubmit={handleActorSubmit}>
          <div className="project-form-grid">
            <SelectField label="Tipo" value={actorForm.actorType} onChange={(event) => setActorForm((current) => ({ ...current, actorType: event.target.value }))}><option value="leader">Liderazgo</option><option value="responsible">Responsable</option><option value="partner">Socio</option><option value="approver">Aprobador</option></SelectField>
            <SelectField label="Institución" value={actorForm.institutionId} onChange={(event) => setActorForm((current) => ({ ...current, institutionId: event.target.value }))}><option value="">Sin institución</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</SelectField>
            <InputField label="Nombre visible" required value={actorForm.displayName} onChange={(event) => setActorForm((current) => ({ ...current, displayName: event.target.value }))} />
            <InputField label="Rol" value={actorForm.roleLabel} onChange={(event) => setActorForm((current) => ({ ...current, roleLabel: event.target.value }))} />
          </div>
          <div className="project-form-actions"><Button type="button" variant="secondary" onClick={() => setActorFormOpen(false)}>Cancelar</Button><Button type="submit" loading={isSavingActor} disabled={!actorForm.displayName.trim()}>{editingActorId ? 'Guardar cambios' : 'Agregar actor'}</Button></div>
        </form>
      </Drawer>

      <Drawer open={milestoneFormOpen} title={editingMilestoneId ? 'Editar hito' : 'Nuevo hito'} onClose={() => setMilestoneFormOpen(false)}>
        <form onSubmit={handleMilestoneSubmit}>
          <div className="project-form-grid">
            <InputField label="Código" value={milestoneForm.activityCode} onChange={(event) => setMilestoneForm((current) => ({ ...current, activityCode: event.target.value }))} />
            <InputField label="Título" required value={milestoneForm.title} onChange={(event) => setMilestoneForm((current) => ({ ...current, title: event.target.value }))} />
            <SelectField label="Estado" value={milestoneForm.status} onChange={(event) => setMilestoneForm((current) => ({ ...current, status: event.target.value }))}><option value="planned">Planificado</option><option value="in_progress">En progreso</option><option value="done">Completado</option><option value="blocked">Bloqueado</option></SelectField>
            <InputField label="Fecha objetivo" type="date" value={milestoneForm.dueDate} onChange={(event) => setMilestoneForm((current) => ({ ...current, dueDate: event.target.value }))} />
            <InputField label="Avance %" type="number" min="0" max="100" value={milestoneForm.progressPct} onChange={(event) => setMilestoneForm((current) => ({ ...current, progressPct: event.target.value }))} />
          </div>
          <TextareaField label="Descripción" value={milestoneForm.description} onChange={(event) => setMilestoneForm((current) => ({ ...current, description: event.target.value }))} />
          <div className="project-form-actions"><Button type="button" variant="secondary" onClick={() => setMilestoneFormOpen(false)}>Cancelar</Button><Button type="submit" loading={isSavingMilestone} disabled={!milestoneForm.title.trim()}>{editingMilestoneId ? 'Guardar cambios' : 'Crear hito'}</Button></div>
        </form>
      </Drawer>

      <Drawer open={deliverableFormOpen} title={editingDeliverableId ? 'Editar entregable' : 'Nuevo entregable'} onClose={() => setDeliverableFormOpen(false)}>
        <form onSubmit={handleDeliverableSubmit}>
          <div className="project-form-grid">
            <InputField label="Código" value={deliverableForm.code} onChange={(event) => setDeliverableForm((current) => ({ ...current, code: event.target.value }))} />
            <InputField label="Título" required value={deliverableForm.title} onChange={(event) => setDeliverableForm((current) => ({ ...current, title: event.target.value }))} />
            <InputField label="Tipo" value={deliverableForm.deliverableType} onChange={(event) => setDeliverableForm((current) => ({ ...current, deliverableType: event.target.value }))} />
            <SelectField label="Estado" value={deliverableForm.status} onChange={(event) => setDeliverableForm((current) => ({ ...current, status: event.target.value }))}><option value="planned">Planificado</option><option value="in_progress">En progreso</option><option value="completed">Completado</option><option value="published">Publicado</option></SelectField>
            <InputField label="Fecha objetivo" type="date" value={deliverableForm.dueDate} onChange={(event) => setDeliverableForm((current) => ({ ...current, dueDate: event.target.value }))} />
            <InputField label="URL de resultado" type="url" value={deliverableForm.outputUrl} onChange={(event) => setDeliverableForm((current) => ({ ...current, outputUrl: event.target.value }))} />
          </div>
          <TextareaField label="Descripción" value={deliverableForm.description} onChange={(event) => setDeliverableForm((current) => ({ ...current, description: event.target.value }))} />
          <div className="project-form-actions"><Button type="button" variant="secondary" onClick={() => setDeliverableFormOpen(false)}>Cancelar</Button><Button type="submit" loading={isSavingDeliverable} disabled={!deliverableForm.title.trim()}>{editingDeliverableId ? 'Guardar cambios' : 'Crear entregable'}</Button></div>
        </form>
      </Drawer>

      <Drawer open={documentFormOpen} title="Subir documento" onClose={() => setDocumentFormOpen(false)}>
        <div style={{ display: 'grid', gap: 16, marginTop: 18 }}><InputField label="Archivo" type="file" onChange={handleProjectFileSelection} /><p style={{ margin: 0, color: '#64748b' }}>El documento quedará asociado al proyecto activo y disponible en su trazabilidad.</p><div className="project-form-actions"><Button type="button" variant="secondary" onClick={() => setDocumentFormOpen(false)}>Cancelar</Button><Button type="button" loading={isUploadingProjectFile} disabled={!projectFileUpload} onClick={() => void handleUploadProjectFile()}>Subir documento</Button></div></div>
      </Drawer>

      <Drawer open={polygonFormOpen} title="Editar geometría" onClose={() => setPolygonFormOpen(false)}>
        <div className="map-edit-mode"><MessageBlock>Modo edición. El dibujo y la edición de vértices requieren un contrato cartográfico que el backend actual todavía no expone; se conserva la edición avanzada compatible.</MessageBlock><InputField label="Nombre de la cobertura" value={polygonTerritoryName} onChange={(event) => setPolygonTerritoryName(event.target.value)} /><InputField label="País" value={polygonCountry} onChange={(event) => setPolygonCountry(event.target.value)} /><details><summary>Más · Edición avanzada · Ver GeoJSON</summary><div style={{ marginTop: 12 }}><TextareaField label="GeoJSON" rows={14} value={polygonText} onChange={(event) => setPolygonText(event.target.value)} /></div></details><div className="project-form-actions"><Button type="button" variant="secondary" onClick={() => setPolygonFormOpen(false)}>Cancelar</Button><Button type="button" loading={isSavingPolygon} onClick={() => void handleSavePolygon()}>Guardar geometría</Button></div></div>
      </Drawer>
    </section>
  );
}

function projectStatusLabel(status: string) {
  return (
    {
      draft: 'Borrador',
      active: 'Activo',
      completed: 'Completado',
      published: 'Publicado',
    }[status] ?? status
  );
}

function projectActorLabel(actorType: string) {
  return (
    {
      leader: 'Liderazgo',
      responsible: 'Responsable',
      partner: 'Socio',
      approver: 'Aprobador',
    }[actorType] ?? actorType
  );
}

function projectMilestoneStatusLabel(status: string) {
  return (
    {
      planned: 'Planificado',
      in_progress: 'En curso',
      done: 'Cumplido',
      blocked: 'Bloqueado',
    }[status] ?? status
  );
}

function projectDeliverableStatusLabel(status: string) {
  return (
    {
      planned: 'Planificado',
      in_progress: 'En curso',
      published: 'Publicado',
      completed: 'Completado',
    }[status] ?? status
  );
}

function projectIncidentStatusLabel(status: string) {
  return (
    {
      investigating: 'En seguimiento',
      resolved: 'Resuelta',
      open: 'Abierta',
    }[status] ?? status
  );
}

function projectIncidentSeverityLabel(severity: string) {
  return (
    {
      critical: 'Crítica',
      high: 'Alta',
      medium: 'Media',
      low: 'Baja',
    }[severity] ?? severity
  );
}

function auditResultLabel(result: string) {
  return (
    {
      success: 'Exitoso',
      warning: 'Advertencia',
      failed: 'Fallido',
    }[result] ?? result
  );
}

const labelStyle = {
  color: '#10233f',
  fontSize: 13,
  fontWeight: 600,
};

const inputStyle = {
  width: '100%',
  borderRadius: 14,
  border: '1px solid #d7dde5',
  background: '#ffffff',
  color: '#10233f',
  padding: '12px 14px',
  fontSize: 14,
  boxSizing: 'border-box' as const,
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 84,
  resize: 'vertical' as const,
};

const primaryButtonStyle = {
  border: 'none',
  borderRadius: 999,
  padding: '10px 16px',
  background: '#14532d',
  color: '#f8fbff',
  fontWeight: 700,
};

const secondaryButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '10px 16px',
  background: '#ffffff',
  color: '#10233f',
  fontWeight: 700,
};

const secondaryLinkStyle = {
  ...secondaryButtonStyle,
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
};

const tileStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 16,
  padding: 14,
  display: 'grid',
  gap: 6,
  background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(245,247,251,1) 100%)',
};

const metaStyle = {
  color: '#5f6b7a',
  fontSize: 13,
};

const heroPanelStyle = {
  borderRadius: 28,
  padding: 24,
  border: '1px solid #d7dde5',
  background:
    'radial-gradient(circle at top left, rgba(20, 83, 45, 0.14), transparent 38%), linear-gradient(135deg, #10233f 0%, #17304b 55%, #14532d 100%)',
  color: '#f8fbff',
  boxShadow: '0 22px 48px rgba(16, 35, 63, 0.18)',
};

const summaryTileStyle = {
  borderRadius: 18,
  padding: 14,
  border: '1px solid #d7dde5',
  background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(245,247,251,1) 100%)',
  display: 'grid',
  gap: 4,
};

const relationCardStyle = {
  ...summaryTileStyle,
  textDecoration: 'none',
  minHeight: 104,
};

const summaryTileLabelStyle = {
  color: '#5f6b7a',
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.7,
};

const summaryTileValueStyle = {
  color: '#10233f',
  fontSize: 16,
  lineHeight: 1.35,
};

const executiveNoteStyle = {
  borderRadius: 18,
  padding: 16,
  background: '#f8fbff',
  border: '1px solid #d7dde5',
  color: '#475569',
  fontSize: 14,
  lineHeight: 1.65,
};

function mapTabButtonStyle(isActive: boolean) {
  return {
    border: isActive ? '1px solid #14532d' : '1px solid #d7dde5',
    borderRadius: 999,
    padding: '8px 14px',
    background: isActive ? '#e8f3ec' : '#ffffff',
    color: isActive ? '#14532d' : '#10233f',
    fontWeight: 700,
    cursor: 'pointer',
  };
}

function formatFileSize(sizeBytes: number | null | undefined) {
  const value = typeof sizeBytes === 'number' ? sizeBytes : 0;
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function defaultProjectPolygonTemplate() {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [-84.2, 9.95],
        [-84.19, 9.95],
        [-84.19, 9.96],
        [-84.2, 9.96],
        [-84.2, 9.95],
      ],
    ],
  };
}

function mergeFeatureCollections(
  left: GeoFeatureCollection | null,
  right: GeoFeatureCollection | null,
): GeoFeatureCollection | null {
  if (!left && !right) {
    return null;
  }
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return {
    type: 'FeatureCollection',
    features: [...left.features, ...right.features],
  };
}

function shouldRenderLegacyWorkspace(): boolean {
  return false;
}
