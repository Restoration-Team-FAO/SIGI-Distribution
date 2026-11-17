import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  ConfigurableReportTemplate,
  DataSource,
  Dataset,
  Indicator,
  Institution,
  Project,
  ReportCoverage,
  ReportCommitment,
  ReportInstance,
  ReportNotification,
} from '@sigi/domain';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';
import { MessageBlock, MetricCard, MetricGrid, Panel, PanelGrid, StatPill } from '../components/section-kit';
import { ReportsWorkspaceHeader } from '../components/ReportsWorkspaceHeader';
import { ActivityList } from '../components/data-display';

type Dashboard = Awaited<ReturnType<typeof workspaceApi.getReportsDashboard>>['data'];
type ReferenceCalendar = Awaited<ReturnType<typeof workspaceApi.getReportReferenceCalendar>>['data'];
type ContributionEvidence = Awaited<ReturnType<typeof workspaceApi.getReportContributionEvidence>>['data'];
type ContributionParticipants = Awaited<ReturnType<typeof workspaceApi.getReportContributionParticipants>>['data']['institutions'];
type ReportDetailInstance = ReportInstance & {
  coverage?: ReportCoverage;
  versions?: Array<{
    id: string;
    label: string;
    status: string;
    changeSummary: string | null;
    createdBy: string | null;
    createdAt: string;
  }>;
};

const labels: Record<string, string> = {
  NATIONAL_CHAPTER: 'Acápite Nacional', REGIONAL_RESTORATION: 'Informe Regional',
  BTR: 'BTR', NDC: 'NDC', GBF_TARGET_2: 'Meta 2', LDN: 'LDN', CUSTOM: 'Personalizado',
};
const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador', IN_PROGRESS: 'En preparación', READY_FOR_REVIEW: 'Listo para revisión',
  UNDER_REVIEW: 'En revisión', CHANGES_REQUESTED: 'Cambios solicitados', APPROVED: 'Aprobado',
  PUBLISHED: 'Publicado', ARCHIVED: 'Archivado', AVAILABLE: 'Disponible', PARTIAL: 'Parcial',
  MISSING: 'Sin datos', NOT_APPLICABLE: 'No aplica', PENDING_VALIDATION: 'Validación pendiente',
  MANUAL_REQUIRED: 'Carga manual requerida',
};

const reportTemplateRoutes: Record<string, { frameworkCode?: string; title: string; description: string }> = {
  '/admin/reports/new': { title: 'Generar informe', description: 'Seleccione una plantilla y complete el asistente de generación.' },
  '/admin/reports/templates': { title: 'Plantillas de informes', description: 'Consulte las estructuras versionadas disponibles en el EGI activo.' },
  '/admin/reports/national': { frameworkCode: 'NATIONAL_CHAPTER', title: 'Acápite Nacional', description: 'Plantilla nacional configurable y sus informes generados.' },
  '/admin/reports/regional': { frameworkCode: 'REGIONAL_RESTORATION', title: 'Informe Regional', description: 'Plantilla para consolidación regional de restauración.' },
  '/admin/reports/btr': { frameworkCode: 'BTR', title: 'BTR', description: 'Informe Bienal de Transparencia y sus versiones nacionales.' },
  '/admin/reports/ndc': { frameworkCode: 'NDC', title: 'NDC', description: 'Seguimiento de las contribuciones determinadas a nivel nacional.' },
  '/admin/reports/gbf-target-2': { frameworkCode: 'GBF_TARGET_2', title: 'Meta 2', description: 'Reporte del Marco Mundial de Biodiversidad.' },
  '/admin/reports/ldn': { frameworkCode: 'LDN', title: 'LDN', description: 'Reporte de neutralidad de la degradación de las tierras.' },
  '/admin/reports/custom': { frameworkCode: 'CUSTOM', title: 'Informes personalizados', description: 'Plantillas institucionales configurables.' },
  '/admin/reports/schedules': { title: 'Programaciones', description: 'Administre el calendario, los compromisos del país y los aportes institucionales.' },
  '/admin/reports/commitments': { title: 'Compromisos', description: 'Calendario operativo, aportes institucionales y consolidación de informes.' },
  '/admin/reports/history': { title: 'Historial y versiones', description: 'Consulte instancias, estados y versiones reproducibles del EGI activo.' },
  '/admin/reports/detail': { title: 'Detalle de informe', description: 'Cobertura, fuentes, versiones y acciones autorizadas del informe.' },
  '/admin/reports/config': { title: 'Configuración de informes', description: 'Revise las correspondencias metodológicas entre indicadores y marcos de reporte.' },
};

export function ReportsModulePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeEgiId, currentUser } = useEgi();
  const canCreate = hasPermission(currentUser, 'reports.create');
  const canManageCommitments = hasPermission(currentUser, 'reports.commitments.manage');
  const canSubmitContributions = hasPermission(currentUser, 'reports.contributions.submit');
  const canReviewContributions = hasPermission(currentUser, 'reports.contributions.review');
  const canExportCommitments = hasPermission(currentUser, 'reports.export');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [referenceCalendar, setReferenceCalendar] = useState<ReferenceCalendar | null>(null);
  const [commitments, setCommitments] = useState<ReportCommitment[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [contributionEvidence, setContributionEvidence] = useState<ContributionEvidence>({ documents: [], datasets: [], indicators: [] });
  const [participants, setParticipants] = useState<ContributionParticipants>([]);
  const [notifications, setNotifications] = useState<ReportNotification[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ConfigurableReportTemplate[]>([]);
  const [reports, setReports] = useState<ReportInstance[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mappings, setMappings] = useState<Awaited<ReturnType<typeof workspaceApi.getReportMappings>>['data']['mappings']>([]);
  const [selected, setSelected] = useState<ReportDetailInstance | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTemplateId, setWizardTemplateId] = useState<string | null>(null);
  const [commitmentFormOpen, setCommitmentFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitmentView, setCommitmentView] = useState<'cards'|'year'|'month'>('cards');
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth());
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('');
  const [filterInstitution, setFilterInstitution] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyFramework, setHistoryFramework] = useState('');

  function updateFilter(key: string, value: string | number) {
    const next = new URLSearchParams(searchParams);
    const normalized = String(value);
    if (!normalized) next.delete(key);
    else next.set(key, normalized);
    setSearchParams(next, { replace: true });
  }

  async function load() {
    if (!activeEgiId) return;
    setError(null);
    try {
      const path = location.pathname;
      const needsDashboard = path === '/admin/reports' || path === '/admin/reports/history';
      const needsTemplates = path === '/admin/reports' || path === '/admin/reports/new'
        || path === '/admin/reports/templates' || path === '/admin/reports/schedules'
        || Boolean(reportTemplateRoutes[path]?.frameworkCode);
      const needsReports = path === '/admin/reports/history' || Boolean(reportTemplateRoutes[path]?.frameworkCode);
      const needsCommitments = path === '/admin/reports/commitments' || path === '/admin/reports/schedules';
      if (needsCommitments) await workspaceApi.refreshReportNotifications();
      const [dashboardResponse, templateResponse, reportResponse, calendarResponse, commitmentResponse, notificationResponse] = await Promise.all([
        needsDashboard ? workspaceApi.getReportsDashboard() : Promise.resolve(null),
        needsTemplates ? workspaceApi.getReportTemplates() : Promise.resolve(null),
        needsReports ? workspaceApi.getReports() : Promise.resolve(null),
        needsCommitments ? workspaceApi.getReportReferenceCalendar() : Promise.resolve(null),
        needsCommitments ? workspaceApi.getReportCommitments() : Promise.resolve(null),
        needsCommitments ? workspaceApi.getReportNotifications() : Promise.resolve(null),
      ]);
      if (dashboardResponse) setDashboard(dashboardResponse.data);
      if (templateResponse) setTemplates(templateResponse.data.templates);
      if (reportResponse) setReports(reportResponse.data.reports);
      if (calendarResponse) setReferenceCalendar(calendarResponse.data);
      if (commitmentResponse) setCommitments(commitmentResponse.data.commitments);
      if (notificationResponse) setNotifications(notificationResponse.data.notifications);
      if (needsCommitments && canManageCommitments) {
        const response = await workspaceApi.getInstitutions();
        setInstitutions(response.data.institutions.filter((item) => item.status === 'active'));
        setParticipants((await workspaceApi.getReportContributionParticipants()).data.institutions);
      }
      if (needsCommitments && canSubmitContributions) {
        const evidenceResponse = await workspaceApi.getReportContributionEvidence();
        setContributionEvidence(evidenceResponse.data);
      }
      if (canCreate && (path === '/admin/reports/new' || path === '/admin/reports/detail')) {
        const catalogs = await Promise.allSettled([
          workspaceApi.getSources(), workspaceApi.getReportDatasets(),
          workspaceApi.getReportIndicators(), workspaceApi.getProjects(),
        ]);
        if (catalogs[0].status === 'fulfilled') setSources(catalogs[0].value.data.sources);
        if (catalogs[1].status === 'fulfilled') setDatasets(catalogs[1].value.data.datasets);
        if (catalogs[2].status === 'fulfilled') setIndicators(catalogs[2].value.data.indicators);
        if (catalogs[3].status === 'fulfilled') setProjects(catalogs[3].value.data.projects);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  useEffect(() => { void load(); }, [activeEgiId, canCreate, canManageCommitments, canSubmitContributions, location.pathname]);

  useEffect(() => {
    if (activeEgiId && location.pathname === '/admin/reports/config' && hasPermission(currentUser, 'reports.mappings.read')) {
      workspaceApi.getReportMappings().then((response) => setMappings(response.data.mappings)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    }
  }, [activeEgiId, location.pathname, currentUser]);

  useEffect(() => {
    setWizardOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const requestedStatus = searchParams.get('status');
    setHistoryStatus(requestedStatus ?? '');
    setHistorySearch(searchParams.get('q') ?? '');
    setHistoryFramework(searchParams.get('framework') ?? '');
    setFilterUrgency(searchParams.get('commitmentUrgency') ?? '');
    setFilterStatus(searchParams.get('commitmentStatus') ?? '');
    setFilterInstitution(searchParams.get('institutionId') ?? '');
    const requestedView = searchParams.get('calendarView');
    if (requestedView && ['cards', 'year', 'month'].includes(requestedView)) {
      setCommitmentView(requestedView as 'cards' | 'year' | 'month');
    }
    const requestedMonth = Number(searchParams.get('month'));
    if (Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12) {
      setFilterMonth(requestedMonth - 1);
    }
    const requestedYear = Number(searchParams.get('year'));
    if (Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= 2200) {
      setFilterYear(requestedYear);
    }
  }, [searchParams]);

  useEffect(() => {
    if (location.pathname === '/admin/reports/new' && canCreate && templates.length > 0) {
      const requestedTemplateId = searchParams.get('templateId');
      setWizardTemplateId(templates.some((item) => item.id === requestedTemplateId) ? requestedTemplateId : null);
      setWizardOpen(true);
    }
  }, [location.pathname, canCreate, searchParams, templates]);

  async function loadReport(id: string) {
    setBusy(true); setError(null);
    try { setSelected((await workspaceApi.getReport(id)).data.report as ReportDetailInstance); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function openReport(id: string) {
    navigate(`/admin/reports/detail?reportId=${encodeURIComponent(id)}`);
  }

  useEffect(() => {
    const reportId = searchParams.get('reportId');
    if (location.pathname === '/admin/reports/detail' && reportId) void loadReport(reportId);
    else setSelected(null);
  }, [location.pathname, searchParams]);

  async function action(run: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await run(); if (selected) await loadReport(selected.id); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function processReminders() {
    setBusy(true); setError(null); setNotice(null);
    try { const response = await workspaceApi.processReportReminders(); setNotice(`${response.data.created} recordatorio(s) nuevo(s) generado(s).`); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function exportCommitments(format: 'xlsx'|'ics') {
    setBusy(true); setError(null);
    try {
      const file = await workspaceApi.exportReportCommitments(format, { year: filterYear, status: filterStatus || undefined, institutionId: filterInstitution || undefined });
      const url = URL.createObjectURL(file.blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.fileName; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  if (!activeEgiId) return <MessageBlock>Seleccione un Espacio de Gestión de Información para consultar informes.</MessageBlock>;

  const summary = dashboard?.summary;
  const routeProfile = reportTemplateRoutes[location.pathname];
  const isHistoryWorkspace = location.pathname === '/admin/reports/history';
  const isCommitmentsWorkspace = location.pathname === '/admin/reports/commitments';
  const isDetailWorkspace = location.pathname === '/admin/reports/detail';
  const isGenerationWorkspace = location.pathname === '/admin/reports/new';
  const isScheduleWorkspace = location.pathname === '/admin/reports/schedules';
  const isConfigWorkspace = location.pathname === '/admin/reports/config';
  const isTemplateAdminWorkspace = location.pathname === '/admin/reports/templates';
  const isConfigurationWorkspace = isConfigWorkspace || isScheduleWorkspace || isTemplateAdminWorkspace;
  const isHomeWorkspace = location.pathname === '/admin/reports' || location.pathname === '/admin/reports/';
  const isFrameworkWorkspace = Boolean(routeProfile?.frameworkCode);
  const focusedTemplate = routeProfile?.frameworkCode
    ? templates.find((item) => item.frameworkCode === routeProfile.frameworkCode)
    : undefined;
  const visibleTemplates = routeProfile?.frameworkCode
    ? templates.filter((item) => item.frameworkCode === routeProfile.frameworkCode)
    : templates;
  const visibleReports = routeProfile?.frameworkCode
    ? reports.filter((item) => item.frameworkCode === routeProfile.frameworkCode)
    : reports;
  const historyProjectId = searchParams.get('projectId');
  const historyDocumentId = searchParams.get('documentId');
  const historyReports = visibleReports.filter((item) =>
    (!historySearch || `${item.name} ${item.frameworkName} ${item.latestVersion ?? ''}`.toLocaleLowerCase('es').includes(historySearch.toLocaleLowerCase('es'))) &&
    (!historyStatus || item.status === historyStatus) &&
    (!historyFramework || item.frameworkCode === historyFramework) &&
    (!historyProjectId || selectionIds(item.selection?.projects).includes(historyProjectId)) &&
    (!historyDocumentId || selectionIds(item.selection?.documents).includes(historyDocumentId)));
  const reportFrameworks = Array.from(new Map(reports.map((item) => [item.frameworkCode, item.frameworkName] as const)).entries());
  const filteredCommitments = commitments.filter((item) => Number(item.dueDate.slice(0,4)) === filterYear
    && (!filterStatus || item.status === filterStatus)
    && (!filterUrgency || (filterUrgency === 'due' ? ['OVERDUE', 'DUE_SOON'].includes(item.urgency) : item.urgency === filterUrgency))
    && (!filterInstitution || item.contributions.some((contribution) => contribution.institutionId === filterInstitution))
    && (commitmentView !== 'month' || Number(item.dueDate.slice(5,7)) - 1 === filterMonth));
  const commitmentInstitutions = Array.from(new Map(commitments.flatMap((item) => item.contributions.map((contribution) => [contribution.institutionId, contribution.institutionName] as const))).entries());
  return (
    <section style={{ display: 'grid', gap: 22 }}>
      <ReportsWorkspaceHeader
        configuration={isConfigurationWorkspace}
        title={routeProfile?.title ?? 'Informes'}
        description={routeProfile?.description ?? `${reports.length} informes registrados`}
        primaryAction={<>
          {canCreate && !isGenerationWorkspace && !isConfigurationWorkspace ? <Link className="reports-button reports-button--primary" to={focusedTemplate ? `/admin/reports/new?templateId=${encodeURIComponent(focusedTemplate.id)}` : '/admin/reports/new'}>Generar informe</Link> : null}
        </>}
      />

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {notice ? <MessageBlock>{notice}</MessageBlock> : null}

      {isHomeWorkspace ? <MetricGrid>
        <MetricCard label="Informes" value={String(summary?.total ?? 0)} hint="Instancias del EGI activo." icon="overview" />
        <MetricCard label="Borradores" value={String(summary?.drafts ?? 0)} hint="No son documentos oficiales." icon="flow" />
        <MetricCard label="En revisión" value={String(summary?.inReview ?? 0)} hint="Pendientes de revisión técnica." icon="validation" tone="warn" />
        <MetricCard label="Aprobados" value={String(summary?.approved ?? 0)} hint="Versiones aprobadas reproducibles." icon="status" tone="good" />
        <MetricCard label="Publicados" value={String(summary?.published ?? 0)} hint="Publicación expresamente autorizada." icon="publication" tone="good" />
        <MetricCard label="Plantillas activas" value={String(summary?.activeTemplates ?? templates.length)} hint="Configuración almacenada en base de datos." icon="database" />
        <MetricCard label="Datos pendientes" value={String(summary?.dataPending ?? 0)} hint="Informes con faltantes identificados." icon="alert" tone={(summary?.dataPending ?? 0) > 0 ? 'warn' : 'neutral'} />
        <MetricCard label="Validación pendiente" value={String(summary?.validationPending ?? 0)} hint="Fuentes seleccionadas aún no aprobadas." icon="validation" tone={(summary?.validationPending ?? 0) > 0 ? 'warn' : 'neutral'} />
      </MetricGrid> : null}

      {(isCommitmentsWorkspace || isScheduleWorkspace) ? <>
      {referenceCalendar ? <ReferenceTimeline calendar={referenceCalendar} /> : null}

      <NotificationsPanel notifications={notifications} canProcess={isScheduleWorkspace && canManageCommitments} busy={busy}
        onProcess={processReminders} onRead={(id) => action(() => workspaceApi.markReportNotificationRead(id))} />

      <Panel title="Compromisos del país" subtitle="Fechas oficiales del EGI y aportes institucionales para consolidar cada informe." icon="activity">
        <div className="reports-commitment-toolbar">
          <p>{commitments.length ? `${filteredCommitments.length} de ${commitments.length} compromiso(s) visibles.` : 'Todavía no hay compromisos configurados para este EGI.'}</p>
          {isScheduleWorkspace && canManageCommitments ? <button className="reports-button reports-button--primary" onClick={() => setCommitmentFormOpen(true)}>Agregar compromiso</button> : null}
        </div>
        <div className="reports-calendar-filters">
          <label>Vista<select value={commitmentView} onChange={(event) => { const value = event.target.value as 'cards'|'year'|'month'; setCommitmentView(value); updateFilter('calendarView', value); }}><option value="cards">Agenda</option><option value="year">Anual</option><option value="month">Mensual</option></select></label>
          <label>Año<input type="number" min="2020" max="2200" value={filterYear} onChange={(event) => { const value = Number(event.target.value); setFilterYear(value); updateFilter('year', value); }} /></label>
          {commitmentView === 'month' ? <label>Mes<select value={filterMonth} onChange={(event) => { const value = Number(event.target.value); setFilterMonth(value); updateFilter('month', value + 1); }}>{monthNames.map((name,index) => <option key={name} value={index}>{name}</option>)}</select></label> : null}
          <label>Estado<select value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); updateFilter('commitmentStatus', event.target.value); }}><option value="">Todos</option>{['DRAFT','OPEN','IN_REVIEW','CLOSED','CANCELLED'].map((status) => <option key={status} value={status}>{commitmentLabel(status)}</option>)}</select></label>
          <label>Urgencia<select value={filterUrgency} onChange={(event) => { setFilterUrgency(event.target.value); updateFilter('commitmentUrgency', event.target.value); }}><option value="">Todas</option><option value="due">Próximos o vencidos</option><option value="OVERDUE">Vencidos</option><option value="DUE_SOON">Próximos</option><option value="ON_TRACK">En plazo</option></select></label>
          <label>Institución<select value={filterInstitution} onChange={(event) => { setFilterInstitution(event.target.value); updateFilter('institutionId', event.target.value); }}><option value="">Todas</option>{commitmentInstitutions.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {canExportCommitments ? <div className="reports-export-actions"><button className="reports-button" disabled={busy} onClick={() => void exportCommitments('xlsx')}>Excel</button><button className="reports-button" disabled={busy} onClick={() => void exportCommitments('ics')}>iCalendar</button></div> : null}
        </div>
        {commitmentView === 'year' ? <YearCommitmentCalendar year={filterYear} commitments={filteredCommitments} /> : null}
        {commitmentView === 'month' ? <MonthCommitmentCalendar year={filterYear} month={filterMonth} commitments={filteredCommitments} /> : null}
        {commitmentView === 'cards' ? <div className="reports-commitments">
          {filteredCommitments.map((commitment) => <CommitmentCard key={commitment.id} commitment={commitment}
            canManage={isScheduleWorkspace && canManageCommitments} canSubmit={canSubmitContributions} canReview={canReviewContributions}
            evidence={contributionEvidence} participants={participants} busy={busy} onRun={action} onOpenReport={openReport} />)}
          {filteredCommitments.length === 0 && commitments.length > 0 ? <MessageBlock>No hay compromisos que coincidan con los filtros.</MessageBlock> : null}
        </div> : null}
      </Panel>
      </> : null}

      {(isHomeWorkspace || isFrameworkWorkspace || isTemplateAdminWorkspace) ? <Panel title={isTemplateAdminWorkspace ? 'Plantillas configuradas' : 'Catálogo de informes'} subtitle="Plantillas e informes disponibles." icon="database">
        <div className="reports-template-grid">
          {visibleTemplates.map((template) => (
            <article className="reports-template-card" key={template.id}>
              <div><span>{labels[template.frameworkCode] ?? template.frameworkName}</span><StatPill tone="good">Activa</StatPill></div>
              <p>{template.description}</p>
              <small>v{template.version} · {template.sectionCount} secciones · {template.countryCode ?? 'alcance configurable'}</small>
              {!isTemplateAdminWorkspace ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {frameworkPath(template.frameworkCode) ? <Link className="reports-button" to={frameworkPath(template.frameworkCode)!}>Ver categoría</Link> : null}
                {canCreate ? <Link className="reports-button reports-button--primary" to={`/admin/reports/new?templateId=${encodeURIComponent(template.id)}`}>Generar</Link> : null}
              </div> : <StatPill tone="neutral">Configuración versionada</StatPill>}
            </article>
          ))}
          {visibleTemplates.length === 0 ? <MessageBlock>No existe una plantilla activa para esta categoría en el EGI.</MessageBlock> : null}
        </div>
      </Panel> : null}

      {(isFrameworkWorkspace || isHistoryWorkspace) ? <PanelGrid>
        <Panel title="Historial e instancias" subtitle="Seleccione un informe para revisar cobertura, versiones y acciones." icon="activity">
          {historyProjectId ? <MessageBlock>Contexto aplicado: informes vinculados al proyecto seleccionado.</MessageBlock> : null}
          {historyDocumentId ? <MessageBlock>Contexto aplicado: informes vinculados al documento seleccionado.</MessageBlock> : null}
          {isHistoryWorkspace ? <div className="reports-calendar-filters"><label>Buscar<input value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); updateFilter('q', event.target.value); }} placeholder="Nombre, marco o versión" /></label><label>Estado<select value={historyStatus} onChange={(event) => { setHistoryStatus(event.target.value); updateFilter('status', event.target.value); }}><option value="">Todos</option>{['DRAFT','IN_PROGRESS','READY_FOR_REVIEW','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED','ARCHIVED'].map((status) => <option key={status} value={status}>{statusLabels[status] ?? status}</option>)}</select></label><label>Marco<select value={historyFramework} onChange={(event) => { setHistoryFramework(event.target.value); updateFilter('framework', event.target.value); }}><option value="">Todos</option>{reportFrameworks.map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></label><span className="reports-filter-count">{historyReports.length} resultado(s)</span></div> : null}
          <div className="reports-list">
            {historyReports.length === 0 ? <MessageBlock>No hay informes que coincidan con esta vista.</MessageBlock> : historyReports.map((report) => (
              <Link key={report.id} className="reports-list-item" to={`/admin/reports/detail?reportId=${encodeURIComponent(report.id)}`}>
                <span><strong>{report.name}</strong><small>{report.frameworkName} · {formatPeriod(report)}</small></span>
                <span><StatPill tone={statusTone(report.status)}>{statusLabels[report.status] ?? report.status}</StatPill><small>{report.latestVersion ?? 'sin versión'}</small></span>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Actividad reciente" subtitle="Eventos registrados por la auditoría central de SIGI." icon="audit">
          <ActivityList empty="Sin actividad registrada." items={(dashboard?.recentActivity ?? []).map((item) => ({ id: item.id, event: item.action, actor: item.user ?? 'Sistema', timestamp: item.date, status: 'success', entity: item.reportName, metadata: item.version ? { versión: item.version } : undefined }))} />
        </Panel>
      </PanelGrid> : null}

      {isConfigWorkspace ? <Panel title="Correspondencias metodológicas" subtitle="Mapeos explícitos de indicadores SIGI hacia variables de los marcos de reporte." icon="database">
        {mappings.length === 0 ? <MessageBlock>No hay correspondencias configuradas en este EGI.</MessageBlock> : <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Indicador</th><th>Marco</th><th>Variable</th><th>Tipo</th><th>Regla</th><th>Estado</th></tr></thead><tbody>{mappings.map((mapping) => <tr key={mapping.id}><td><strong>{mapping.indicatorCode}</strong><small>{mapping.indicatorName}</small></td><td>{mapping.frameworkName}</td><td>{mapping.reportVariableCode}</td><td>{mapping.mappingType}</td><td>{mapping.transformationRule ?? mapping.eligibilityRule ?? '—'}</td><td><StatPill tone={mapping.status === 'active' ? 'good' : 'neutral'}>{mapping.status}</StatPill></td></tr>)}</tbody></table></div>}
      </Panel> : null}

      {isGenerationWorkspace && wizardOpen ? <ReportWizard key={wizardTemplateId ?? 'default'} initialTemplateId={wizardTemplateId} templates={templates} sources={sources} datasets={datasets} indicators={indicators} projects={projects} onClose={() => navigate('/admin/reports')} onCreated={async (report) => { setWizardOpen(false); await load(); await openReport(report.id); }} /> : null}
      {commitmentFormOpen && referenceCalendar ? <CommitmentForm templates={templates} calendar={referenceCalendar} institutions={institutions} onClose={() => setCommitmentFormOpen(false)} onCreated={async () => { setCommitmentFormOpen(false); await load(); }} /> : null}
      {isDetailWorkspace && !selected && busy ? <MessageBlock>Cargando detalle del informe…</MessageBlock> : null}
      {isDetailWorkspace && !selected && !busy && !error ? <MessageBlock>Seleccione un informe desde Historial.</MessageBlock> : null}
      {isDetailWorkspace && selected ? <ReportDetail inline report={selected} busy={busy} currentUser={currentUser} sources={sources} datasets={datasets} indicators={indicators} projects={projects} onClose={() => navigate('/admin/reports/history')} onRefresh={async () => { await loadReport(selected.id); await load(); }} onAction={action} /> : null}
    </section>
  );
}

function ReferenceTimeline({ calendar }: { calendar: ReferenceCalendar }) {
  const years = Array.from({ length: calendar.endYear - calendar.startYear + 1 }, (_, index) => calendar.startYear + index);
  return <Panel title="Calendario de referencia 2025–2033" subtitle="Guía visual de los ciclos compartidos; no sustituye la fecha oficial registrada por el país." icon="overview">
    <div className="reports-reference-scroll"><div className="reports-reference-line">
      {years.map((year) => <section className="reports-reference-year" key={year}>
        <strong>{year}</strong>
        <div>{calendar.milestones.filter((item) => item.dueYear === year).map((item) =>
          <article className={`reports-milestone reports-milestone--${item.category.toLowerCase()}`} key={item.id} title={item.guidance}>
            <b>{item.shortLabel}</b><span>{item.label}</span>
          </article>)}</div>
      </section>)}
    </div></div>
    <p className="reports-reference-note">{calendar.disclaimer}</p>
  </Panel>;
}

const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function CalendarCommitmentChip({ item }: { item: ReportCommitment }) {
  return <article className={`reports-calendar-chip reports-calendar-chip--${item.urgency.toLowerCase()}`}><strong>{item.title}</strong><small>{item.dueDate.slice(8,10)} · {item.validatedCount}/{item.contributionCount} validadas</small></article>;
}

function YearCommitmentCalendar({ year, commitments }: { year: number; commitments: ReportCommitment[] }) {
  return <div className="reports-year-calendar">{monthNames.map((name,index) => { const items = commitments.filter((item) => Number(item.dueDate.slice(5,7)) - 1 === index); return <section key={name}><header><strong>{name}</strong><span>{items.length}</span></header><div>{items.length ? items.map((item) => <CalendarCommitmentChip key={item.id} item={item} />) : <small>Sin compromisos</small>}</div></section>; })}<span className="reports-calendar-caption">Cronograma anual {year}</span></div>;
}

function MonthCommitmentCalendar({ year, month, commitments }: { year: number; month: number; commitments: ReportCommitment[] }) {
  const totalDays = new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const leading = (new Date(Date.UTC(year,month,1)).getUTCDay()+6)%7;
  const cells = [...Array.from({ length: leading }, () => null), ...Array.from({ length: totalDays }, (_,index) => index+1)];
  return <div className="reports-month-wrap"><h4 className="reports-month-heading">{monthNames[month]} {year}</h4><div className="reports-month-weekdays">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((day) => <span key={day}>{day}</span>)}</div><div className="reports-month-calendar">{cells.map((day,index) => <section className={!day ? 'is-empty' : ''} key={`${day ?? 'empty'}-${index}`}>{day ? <><b>{day}</b>{commitments.filter((item) => Number(item.dueDate.slice(8,10)) === day).map((item) => <CalendarCommitmentChip key={item.id} item={item} />)}</> : null}</section>)}</div></div>;
}

function NotificationsPanel(props: { notifications: ReportNotification[]; canProcess: boolean; busy: boolean; onProcess: () => Promise<void>; onRead: (id: string) => Promise<void> }) {
  const unread = props.notifications.filter((item) => item.status === 'UNREAD');
  return <Panel title={`Recordatorios y avisos${unread.length ? ` · ${unread.length} nuevos` : ''}`} subtitle="Avisos internos dirigidos al responsable asignado en cada institución." icon="alert">
    <div className="reports-notification-toolbar"><span>{props.notifications.length ? 'Últimos avisos del EGI activo.' : 'No tiene avisos de informes pendientes.'}</span>{props.canProcess ? <button className="reports-button" disabled={props.busy} onClick={() => void props.onProcess()}>Procesar recordatorios</button> : null}</div>
    {props.notifications.length ? <div className="reports-notifications">{props.notifications.slice(0, 8).map((item) => <article key={item.id} className={item.status === 'UNREAD' ? 'is-unread' : ''}><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString('es')}</small></div>{item.status === 'UNREAD' ? <button disabled={props.busy} onClick={() => void props.onRead(item.id)}>Marcar leído</button> : <small>Leído</small>}</article>)}</div> : null}
  </Panel>;
}

function CommitmentCard(props: { commitment: ReportCommitment; canManage: boolean; canSubmit: boolean; canReview: boolean; evidence: ContributionEvidence; participants: ContributionParticipants; busy: boolean; onRun: (run: () => Promise<unknown>) => Promise<void>; onOpenReport: (id: string) => Promise<void> }) {
  const item = props.commitment;
  const [contributionOpen, setContributionOpen] = useState(false);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const progress = item.contributionCount ? Math.round((item.validatedCount / item.contributionCount) * 100) : 0;
  return <article className="reports-commitment-card">
    <header><div><span className="reports-eyebrow">{item.frameworkName ?? 'Informe nacional'} · {item.countryCode ?? 'país por definir'}</span><h4>{item.title}</h4></div><div className="reports-status-stack"><StatPill tone={commitmentTone(item.status)}>{commitmentLabel(item.status)}</StatPill><StatPill tone={urgencyTone(item.urgency)}>{urgencyLabel(item)}</StatPill></div></header>
    <div className="reports-commitment-dates"><span><small>Corte institucional</small><b>{formatDate(item.internalCutoffDate ?? item.dueDate)}</b></span><span><small>Compromiso país</small><b>{formatDate(item.dueDate)}</b></span><span><small>Coordinación</small><b>{item.coordinatingInstitutionName ?? 'Pendiente'}</b></span></div>
    {item.instructions ? <p>{item.instructions}</p> : null}
    <div className="reports-progress"><span style={{ width: `${progress}%` }} /></div>
    <small>{item.validatedCount} de {item.contributionCount} instituciones validadas · {item.submittedCount} enviadas pendientes de revisión</small>
    <div className="reports-contributions">
      {item.contributions.map((contribution) => <div className="reports-contribution-row" key={contribution.id}><span><strong>{contribution.institutionName}</strong><small>Responsable: {contribution.responsibleName ?? 'sin asignar'}{contribution.responsibleEmail ? ` · ${contribution.responsibleEmail}` : ''}</small><small>vence {formatDate(contribution.dueDate)}</small>{contribution.notes ? <small>{contribution.notes}</small> : null}<EvidenceSummary contribution={contribution} /></span><span><StatPill tone={statusTone(contribution.status)}>{contributionLabel(contribution.status)}</StatPill>
        {props.canReview && contribution.status === 'SUBMITTED' ? <><button disabled={props.busy} onClick={() => props.onRun(() => workspaceApi.reviewReportContribution(item.id, contribution.id, { status: 'VALIDATED' }))}>Validar</button><button disabled={props.busy} onClick={() => props.onRun(() => workspaceApi.reviewReportContribution(item.id, contribution.id, { status: 'CHANGES_REQUESTED', notes: 'Requiere ajustes' }))}>Pedir cambios</button></> : null}
      </span></div>)}
    </div>
    <footer>
      {props.canSubmit && ['OPEN','IN_REVIEW'].includes(item.status) ? <button className="reports-button" disabled={props.busy} onClick={() => setContributionOpen(true)}>Preparar aporte institucional</button> : null}
      {props.canManage && item.status === 'DRAFT' ? <button className="reports-button reports-button--primary" disabled={props.busy} onClick={() => props.onRun(() => workspaceApi.updateReportCommitment(item.id, { status: 'OPEN' }))}>Abrir convocatoria</button> : null}
      {props.canManage && item.status === 'OPEN' ? <button className="reports-button" disabled={props.busy} onClick={() => props.onRun(() => workspaceApi.updateReportCommitment(item.id, { status: 'IN_REVIEW' }))}>Cerrar recepción</button> : null}
      {props.canManage && ['DRAFT','OPEN'].includes(item.status) ? <button className="reports-button" disabled={props.busy} onClick={() => setAssignmentsOpen(true)}>Instituciones y recordatorios</button> : null}
      {props.canManage && !item.reportId && item.validatedCount > 0 ? <button className="reports-button reports-button--primary" disabled={props.busy} onClick={() => props.onRun(async () => { const response = await workspaceApi.consolidateReportCommitment(item.id); await props.onOpenReport(response.data.report.id); })}>Crear informe consolidado</button> : null}
      {item.reportId ? <button className="reports-button" disabled={props.busy} onClick={() => props.onOpenReport(item.reportId!)}>Abrir informe vinculado</button> : null}
    </footer>
    {contributionOpen ? <ContributionForm commitment={item} evidence={props.evidence} onClose={() => setContributionOpen(false)} onSubmit={async (input) => { await props.onRun(() => workspaceApi.submitReportContribution(item.id, input)); setContributionOpen(false); }} /> : null}
    {assignmentsOpen ? <AssignmentsForm commitment={item} participants={props.participants} onClose={() => setAssignmentsOpen(false)} onSave={async (assignments, rule) => { await workspaceApi.updateReportContributionAssignments(item.id, assignments); await workspaceApi.updateReportReminderRule(item.id, rule); setAssignmentsOpen(false); await props.onRun(async () => undefined); }} /> : null}
  </article>;
}

function AssignmentsForm(props: { commitment: ReportCommitment; participants: ContributionParticipants; onClose: () => void; onSave: (assignments: Array<{ institutionId: string; responsibleUserId: string | null }>, rule: { enabled: boolean; daysBefore: number[]; overdueEveryDays: number }) => Promise<void> }) {
  const initial = new Map(props.commitment.contributions.map((item) => [item.institutionId, item.responsibleUserId]));
  const [assignments, setAssignments] = useState<Map<string,string|null>>(initial);
  const [search, setSearch] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(props.commitment.reminderRule.enabled);
  const [daysBefore, setDaysBefore] = useState(props.commitment.reminderRule.daysBefore.join(', '));
  const [overdueEveryDays, setOverdueEveryDays] = useState(String(props.commitment.reminderRule.overdueEveryDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = props.participants.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  function toggleInstitution(id: string) { const next = new Map(assignments); if (next.has(id)) next.delete(id); else next.set(id, null); setAssignments(next); }
  function assignUser(institutionId: string, userId: string) { const next = new Map(assignments); next.set(institutionId, userId || null); setAssignments(next); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const days = daysBefore.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item));
    try { await props.onSave(Array.from(assignments, ([institutionId,responsibleUserId]) => ({ institutionId,responsibleUserId })), { enabled: remindersEnabled, daysBefore: days, overdueEveryDays: Number(overdueEveryDays) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  }
  return <div className="reports-overlay" role="dialog" aria-modal="true"><form className="reports-dialog reports-dialog--wide" onSubmit={submit}>
    <header><div><span className="reports-eyebrow">Coordinación interinstitucional</span><h3>Instituciones y responsables</h3><p>{props.commitment.title}</p></div><button type="button" className="reports-icon-button" onClick={props.onClose}>×</button></header>
    <div className="reports-form-body">{error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      <label>Buscar institución<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre de la institución" /></label>
      <div className="reports-assignment-list">{visible.map((institution) => <div key={institution.id}><label className="reports-check"><input type="checkbox" checked={assignments.has(institution.id)} onChange={() => toggleInstitution(institution.id)} /><strong>{institution.name}</strong></label><select disabled={!assignments.has(institution.id)} value={assignments.get(institution.id) ?? ''} onChange={(event) => assignUser(institution.id, event.target.value)}><option value="">Responsable sin asignar</option>{institution.users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}</select></div>)}</div>
      <fieldset><legend>Recordatorios internos</legend><label className="reports-check"><input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} />Activar recordatorios</label><div className="reports-fields"><label>Días antes<input value={daysBefore} onChange={(event) => setDaysBefore(event.target.value)} placeholder="30, 15, 7, 1, 0" /></label><label>Repetir vencidos cada N días<input type="number" min="1" max="90" value={overdueEveryDays} onChange={(event) => setOverdueEveryDays(event.target.value)} /></label></div><small>La generación es idempotente: un usuario no recibe dos veces el mismo aviso diario.</small></fieldset>
    </div><footer><button type="button" className="reports-button" onClick={props.onClose}>Cancelar</button><button className="reports-button reports-button--primary" disabled={busy || assignments.size === 0}>{busy ? 'Guardando…' : 'Guardar coordinación'}</button></footer>
  </form></div>;
}

function EvidenceSummary({ contribution }: { contribution: ReportCommitment['contributions'][number] }) {
  const parts = [
    contribution.documents.length ? `${contribution.documents.length} documento(s)` : '',
    contribution.datasets.length ? `${contribution.datasets.length} dataset(s)` : '',
    contribution.indicators.length ? `${contribution.indicators.length} indicador(es)` : '',
  ].filter(Boolean);
  return parts.length ? <details className="reports-evidence-summary"><summary>Evidencia: {parts.join(' · ')}</summary><ul>
    {contribution.documents.map((item) => <li key={`document-${item.id}`}>Documento: {item.name} · {item.validationStatus}</li>)}
    {contribution.datasets.map((item) => <li key={`dataset-${item.id}`}>Dataset: {item.title} · {item.status}</li>)}
    {contribution.indicators.map((item) => <li key={`indicator-${item.id}`}>Indicador: {item.name} · {item.value ?? 'sin valor'} {item.unit}</li>)}
  </ul></details> : null;
}

function ContributionForm(props: { commitment: ReportCommitment; evidence: ContributionEvidence; onClose: () => void; onSubmit: (input: { notes?: string; submission: Record<string, unknown> }) => Promise<void> }) {
  const [notes, setNotes] = useState('');
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [indicatorIds, setIndicatorIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await props.onSubmit({ notes, submission: { documentIds, datasetIds, indicatorIds } }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  }
  const hasContent = Boolean(notes.trim() || documentIds.length || datasetIds.length || indicatorIds.length);
  return <div className="reports-overlay" role="dialog" aria-modal="true"><form className="reports-dialog reports-dialog--wide" onSubmit={submit}>
    <header><div><span className="reports-eyebrow">Aporte institucional</span><h3>{props.commitment.title}</h3><p>Seleccione únicamente información respaldada por su institución.</p></div><button type="button" className="reports-icon-button" onClick={props.onClose}>×</button></header>
    <div className="reports-form-body">{error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      <label>Observaciones o síntesis del aporte<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Explique qué información se entrega y cualquier limitación metodológica." /></label>
      <div className="reports-data-groups">
        <ChoiceGroup title="Documentos" empty="No hay documentos institucionales disponibles en este EGI." items={props.evidence.documents.map((item) => ({ id: item.id, label: `${item.name} · ${item.validationStatus}` }))} values={documentIds} onChange={setDocumentIds} />
        <ChoiceGroup title="Datasets" empty="No hay datasets institucionales disponibles." items={props.evidence.datasets.map((item) => ({ id: item.id, label: `${item.title} · ${item.status}` }))} values={datasetIds} onChange={setDatasetIds} />
        <ChoiceGroup title="Indicadores" empty="No hay indicadores configurados." items={props.evidence.indicators.map((item) => ({ id: item.id, label: `${item.name} (${item.unit})${item.currentValue === null ? ' · sin valor' : ` · ${item.currentValue}`}` }))} values={indicatorIds} onChange={setIndicatorIds} />
      </div><MessageBlock>El envío quedará bloqueado para edición hasta que el validador lo apruebe o solicite cambios.</MessageBlock>
    </div><footer><button type="button" className="reports-button" onClick={props.onClose}>Cancelar</button><button className="reports-button reports-button--primary" disabled={busy || !hasContent}>{busy ? 'Enviando…' : 'Enviar aporte'}</button></footer>
  </form></div>;
}

function CommitmentForm(props: { templates: ConfigurableReportTemplate[]; calendar: ReferenceCalendar; institutions: Institution[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [frameworkCode, setFrameworkCode] = useState<string>(props.templates[0]?.frameworkCode ?? 'CUSTOM');
  const [referenceMilestoneId, setReferenceMilestoneId] = useState('');
  const [coordinator, setCoordinator] = useState(props.institutions[0]?.id ?? '');
  const [institutionIds, setInstitutionIds] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameworks = [...new Map(props.templates.map((item) => [item.frameworkCode, item.frameworkName])).entries()];
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await workspaceApi.createReportCommitment({ title, frameworkCode, referenceMilestoneId: referenceMilestoneId || null,
        coordinatingInstitutionId: coordinator, countryCode: countryCode || null, dueDate,
        internalCutoffDate: cutoff || null, instructions: instructions || null, status: 'DRAFT', institutionIds });
      await props.onCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <div className="reports-overlay" role="dialog" aria-modal="true"><form className="reports-dialog" onSubmit={submit}>
    <header><div><span className="reports-eyebrow">Calendario administrable</span><h3>Nuevo compromiso del país</h3><p>Defina la entrega y las instituciones que deben aportar a la consolidación.</p></div><button type="button" className="reports-icon-button" onClick={props.onClose}>×</button></header>
    <div className="reports-form-body">
      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      <div className="reports-fields"><label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label>Marco<select value={frameworkCode} onChange={(event) => setFrameworkCode(event.target.value)}>{frameworks.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <label>Hito de referencia<select value={referenceMilestoneId} onChange={(event) => setReferenceMilestoneId(event.target.value)}><option value="">Sin asociación</option>{props.calendar.milestones.map((item) => <option key={item.id} value={item.id}>{item.dueYear} · {item.shortLabel}</option>)}</select></label>
        <label>País / ISO<input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} /></label><label>Compromiso país<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><label>Corte interno<input type="date" value={cutoff} max={dueDate || undefined} onChange={(event) => setCutoff(event.target.value)} /></label>
        <label>Institución coordinadora<select value={coordinator} onChange={(event) => setCoordinator(event.target.value)} required><option value="">Seleccione</option>{props.institutions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <label>Instrucciones<textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
      <fieldset><legend>Instituciones que deben reportar</legend>{props.institutions.map((item) => <label className="reports-check" key={item.id}><input type="checkbox" checked={institutionIds.includes(item.id)} onChange={() => setInstitutionIds(toggle(institutionIds, item.id))} />{item.name}</label>)}</fieldset>
    </div><footer><button type="button" className="reports-button" onClick={props.onClose}>Cancelar</button><button className="reports-button reports-button--primary" disabled={busy || !institutionIds.length || !coordinator}>{busy ? 'Guardando…' : 'Guardar compromiso'}</button></footer>
  </form></div>;
}

function ReportWizard(props: { initialTemplateId: string | null; templates: ConfigurableReportTemplate[]; sources: DataSource[]; datasets: Dataset[]; indicators: Indicator[]; projects: Project[]; onClose: () => void; onCreated: (report: ReportInstance) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState(props.initialTemplateId ?? props.templates[0]?.id ?? '');
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [cutoffAt, setCutoffAt] = useState('');
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [indicatorIds, setIndicatorIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedTemplate = props.templates.find((item) => item.id === templateId);
  const steps = ['Tipo', 'Alcance', 'Datos', 'Calidad', 'Contenido', 'Vista previa', 'Validación', 'Generar'];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 8) { setStep(step + 1); return; }
    setBusy(true); setError(null);
    try {
      const response = await workspaceApi.createReport({
        templateId, name: name || `${selectedTemplate?.name ?? 'Informe'} ${periodEnd.slice(0, 4)}`,
        countryCode: countryCode || null, periodStart: periodStart || null,
        periodEnd: periodEnd || null, cutoffAt: cutoffAt ? new Date(`${cutoffAt}T23:59:59`).toISOString() : null,
        scope: { countries: countryCode ? [countryCode] : [] },
        selection: { sources: sourceIds, datasets: datasetIds, indicators: indicatorIds, projects: projectIds },
        quality: { minimumValidation: 'approved', allowInReview: false },
      });
      await props.onCreated(response.data.report);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <div className="reports-overlay" role="dialog" aria-modal="true">
    <form className="reports-dialog" onSubmit={submit}>
      <header><div><span className="reports-eyebrow">Generar informe · paso {step} de 8</span><h3>{steps[step - 1]}</h3></div><button type="button" className="reports-icon-button" onClick={props.onClose}>×</button></header>
      <div className="reports-stepper">{steps.map((label, index) => <span key={label} className={index + 1 <= step ? 'is-active' : ''}>{index + 1}<small>{label}</small></span>)}</div>
      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      <div className="reports-form-body">
        {step === 1 ? <label>Plantilla<select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>{props.templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : null}
        {step === 2 ? <div className="reports-fields"><label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label>País / código ISO<input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} placeholder="Configurable; no se preselecciona" /></label><label>Inicio<input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required /></label><label>Fin<input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required /></label></div> : null}
        {step === 3 ? <div className="reports-data-groups">
          <ChoiceGroup title="Fuentes del EGI" empty="Sin fuentes configuradas." items={props.sources.map((item) => ({ id: item.id, label: item.name }))} values={sourceIds} onChange={setSourceIds} />
          <ChoiceGroup title="Datasets" empty="Sin datasets en este EGI." items={props.datasets.map((item) => ({ id: item.id, label: `${item.schemaCode} · ${item.status}` }))} values={datasetIds} onChange={setDatasetIds} />
          <ChoiceGroup title="Indicadores SIGI" empty="Sin indicadores configurados." items={props.indicators.map((item) => ({ id: item.id, label: `${item.name} (${item.unit})` }))} values={indicatorIds} onChange={setIndicatorIds} />
          <ChoiceGroup title="Proyectos" empty="Sin proyectos visibles." items={props.projects.map((item) => ({ id: item.id, label: item.title }))} values={projectIds} onChange={setProjectIds} />
        </div> : null}
        {step === 4 ? <><label>Fecha de corte<input type="date" value={cutoffAt} onChange={(e) => setCutoffAt(e.target.value)} /></label><MessageBlock>Por defecto solo se admite información aprobada. Una selección pendiente aparecerá como “Validación pendiente”.</MessageBlock></> : null}
        {step === 5 ? <MessageBlock>{selectedTemplate?.sectionCount ?? 0} secciones configuradas en la versión {selectedTemplate?.version ?? 1}. Las opcionales se conservan editables en la plantilla.</MessageBlock> : null}
        {step === 6 ? <Preview template={selectedTemplate} name={name} periodStart={periodStart} periodEnd={periodEnd} sourceCount={sourceIds.length} /> : null}
        {step === 7 ? <MessageBlock>{periodStart && periodEnd ? 'Período disponible.' : 'Período pendiente.'} {sourceIds.length ? `${sourceIds.length} fuente(s) seleccionada(s), sujetas a validación.` : 'Sin fuentes: la matriz registrará faltantes, sin inventar valores.'}</MessageBlock> : null}
        {step === 8 ? <MessageBlock>Se creará una instancia DRAFT. No tendrá carácter oficial hasta completar revisión, aprobación y publicación.</MessageBlock> : null}
      </div>
      <footer><button type="button" className="reports-button" disabled={step === 1 || busy} onClick={() => setStep(step - 1)}>Anterior</button><button className="reports-button reports-button--primary" disabled={busy || !templateId}>{step === 8 ? (busy ? 'Creando…' : 'Crear borrador') : 'Continuar'}</button></footer>
    </form>
  </div>;
}

function ReportDetail(props: { report: ReportDetailInstance; inline?: boolean; busy: boolean; currentUser: { permissions: string[] } | null; sources: DataSource[]; datasets: Dataset[]; indicators: Indicator[]; projects: Project[]; onClose: () => void; onRefresh: () => Promise<void>; onAction: (action: () => Promise<unknown>) => Promise<void> }) {
  const report = props.report;
  const coverage = report.coverage;
  const [editing, setEditing] = useState(false);
  async function download() {
    const file = await workspaceApi.exportReportJson(report.id);
    const url = URL.createObjectURL(file.blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = file.fileName; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className={props.inline ? 'reports-detail-page' : 'reports-overlay'} role={props.inline ? undefined : 'dialog'} aria-modal={props.inline ? undefined : true}><div className="reports-dialog reports-dialog--wide">
    <header><div><span className="reports-eyebrow">{report.frameworkName} · {report.latestVersion ?? 'sin versión'}</span><h3>{report.name}</h3><p>{report.countryCode ?? 'Sin país fijado'} · {formatPeriod(report)}</p></div><button className={props.inline ? 'reports-button' : 'reports-icon-button'} onClick={props.onClose}>{props.inline ? 'Volver al historial' : '×'}</button></header>
    <div className="reports-actions">
      {hasPermission(props.currentUser, 'reports.edit') && ['DRAFT','IN_PROGRESS','CHANGES_REQUESTED'].includes(report.status) ? <button className="reports-button reports-button--primary" disabled={props.busy} onClick={() => setEditing(true)}>Editar informe</button> : null}
      {hasPermission(props.currentUser, 'reports.generate') ? <button className="reports-button" disabled={props.busy} onClick={() => props.onAction(() => workspaceApi.generateReport(report.id))}>Generar versión</button> : null}
      {hasPermission(props.currentUser, 'reports.edit') && ['DRAFT','IN_PROGRESS','CHANGES_REQUESTED'].includes(report.status) ? <button className="reports-button" disabled={props.busy} onClick={() => props.onAction(() => workspaceApi.submitReportReview(report.id))}>Enviar a revisión</button> : null}
      {hasPermission(props.currentUser, 'reports.review') && report.status === 'READY_FOR_REVIEW' ? <button className="reports-button" disabled={props.busy} onClick={() => props.onAction(() => workspaceApi.startReportReview(report.id))}>Iniciar revisión</button> : null}
      {hasPermission(props.currentUser, 'reports.review') && ['READY_FOR_REVIEW','UNDER_REVIEW'].includes(report.status) ? <button className="reports-button" disabled={props.busy} onClick={() => props.onAction(() => workspaceApi.requestReportChanges(report.id, 'Requiere ajustes técnicos'))}>Solicitar cambios</button> : null}
      {hasPermission(props.currentUser, 'reports.approve') && ['READY_FOR_REVIEW','UNDER_REVIEW'].includes(report.status) ? <button className="reports-button reports-button--primary" disabled={props.busy} onClick={() => props.onAction(() => workspaceApi.approveReport(report.id))}>Aprobar</button> : null}
      {hasPermission(props.currentUser, 'reports.publish') && report.status === 'APPROVED' ? <button className="reports-button reports-button--primary" disabled={props.busy} onClick={() => props.onAction(() => workspaceApi.publishReport(report.id))}>Publicar</button> : null}
      {hasPermission(props.currentUser, 'reports.export') ? <button className="reports-button" disabled={props.busy} onClick={() => props.onAction(download)}>Exportar JSON</button> : null}
    </div>
    <div className="reports-detail-meta"><StatPill tone={statusTone(report.status)}>{statusLabels[report.status] ?? report.status}</StatPill><span>Fecha de corte: {report.cutoffAt ? new Date(report.cutoffAt).toLocaleDateString('es') : 'pendiente'}</span><span>Visibilidad: {report.visibility}</span></div>
    <section><h4>Matriz de cobertura {coverage?.summary.score === null ? '' : `· ${coverage?.summary.score ?? 0}%`}</h4>
      {!coverage || coverage.items.length === 0 ? <MessageBlock>La plantilla no contiene requerimientos cuantificables.</MessageBlock> : <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Variable</th><th>SIGI</th><th>Estado</th><th>Fuente</th><th>Validación</th><th>Acción</th></tr></thead><tbody>{coverage.items.map((item) => <tr key={item.requirementId}><td><strong>{item.label}</strong><small>{item.sectionCode}</small></td><td>{item.status === 'MISSING' || item.status === 'MANUAL_REQUIRED' ? 'No' : 'Sí'}</td><td><StatPill tone={coverageTone(item.status)}>{statusLabels[item.status]}</StatPill></td><td>{item.sourceName ?? item.datasetName ?? '—'}</td><td>{item.validationStatus ?? '—'}</td><td>{hasPermission(props.currentUser, 'reports.edit') && ['DRAFT','IN_PROGRESS','CHANGES_REQUESTED'].includes(report.status) ? <button type="button" className="reports-link-button" onClick={() => setEditing(true)}>{item.status === 'MISSING' || item.status === 'MANUAL_REQUIRED' ? 'Configurar' : 'Editar selección'}</button> : 'Ver trazabilidad'}</td></tr>)}</tbody></table></div>}
    </section>
    <section><h4>Versiones reproducibles</h4>
      <ActivityList empty="Este informe todavía no tiene versiones generadas." items={(report.versions ?? []).map((version) => ({ id: version.id, event: version.label, actor: version.createdBy ?? 'Sistema', timestamp: version.createdAt, status: version.status, metadata: version.changeSummary ? { cambio: version.changeSummary } : undefined }))} />
    </section>
    {editing ? <ReportEditor report={report} sources={props.sources} datasets={props.datasets} indicators={props.indicators} projects={props.projects} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await props.onRefresh(); }} /> : null}
  </div></div>;
}

function ReportEditor(props: { report: ReportInstance; sources: DataSource[]; datasets: Dataset[]; indicators: Indicator[]; projects: Project[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const selection = props.report.selection ?? {};
  const [name, setName] = useState(props.report.name);
  const [countryCode, setCountryCode] = useState(props.report.countryCode ?? '');
  const [periodStart, setPeriodStart] = useState(props.report.periodStart?.slice(0,10) ?? '');
  const [periodEnd, setPeriodEnd] = useState(props.report.periodEnd?.slice(0,10) ?? '');
  const [cutoffAt, setCutoffAt] = useState(props.report.cutoffAt?.slice(0,10) ?? '');
  const [visibility, setVisibility] = useState(props.report.visibility);
  const [sourceIds, setSourceIds] = useState(selectionIds(selection.sources));
  const [datasetIds, setDatasetIds] = useState(selectionIds(selection.datasets));
  const [indicatorIds, setIndicatorIds] = useState(selectionIds(selection.indicators));
  const [projectIds, setProjectIds] = useState(selectionIds(selection.projects));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      await workspaceApi.updateReport(props.report.id, {
        name: name.trim(), countryCode: countryCode.trim().toUpperCase() || null,
        periodStart: periodStart || null, periodEnd: periodEnd || null,
        cutoffAt: cutoffAt ? new Date(`${cutoffAt}T23:59:59`).toISOString() : null,
        visibility, scope: { ...props.report.scope, countries: countryCode.trim() ? [countryCode.trim().toUpperCase()] : [] },
        selection: { ...selection, sources: sourceIds, datasets: datasetIds, indicators: indicatorIds, projects: projectIds },
      });
      await props.onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <div className="reports-overlay reports-overlay--nested" role="dialog" aria-modal="true"><form className="reports-dialog reports-dialog--wide" onSubmit={submit}>
    <header><div><span className="reports-eyebrow">Edición de borrador</span><h3>Editar informe</h3><p>{props.report.templateName} · los cambios recalculan la matriz de cobertura.</p></div><button type="button" className="reports-icon-button" onClick={props.onClose}>×</button></header>
    <div className="reports-form-body">
      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      <div className="reports-fields"><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label><label>País / código ISO<input value={countryCode} maxLength={3} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} /></label><label>Inicio<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label>Fin<input type="date" min={periodStart || undefined} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label><label>Fecha de corte<input type="date" value={cutoffAt} onChange={(event) => setCutoffAt(event.target.value)} /></label><label>Visibilidad<select value={visibility} onChange={(event) => setVisibility(event.target.value as ReportInstance['visibility'])}><option value="private">Privado</option><option value="institutional">Institucional</option><option value="national">Nacional</option><option value="public">Público</option></select></label></div>
      <div className="reports-data-groups"><ChoiceGroup title="Fuentes del EGI" empty="Sin fuentes configuradas." items={props.sources.map((item) => ({ id: item.id, label: item.name }))} values={sourceIds} onChange={setSourceIds} /><ChoiceGroup title="Datasets" empty="Sin datasets en este EGI." items={props.datasets.map((item) => ({ id: item.id, label: `${item.schemaCode} · ${item.status}` }))} values={datasetIds} onChange={setDatasetIds} /><ChoiceGroup title="Indicadores SIGI" empty="Sin indicadores configurados." items={props.indicators.map((item) => ({ id: item.id, label: `${item.name} (${item.unit})` }))} values={indicatorIds} onChange={setIndicatorIds} /><ChoiceGroup title="Proyectos" empty="Sin proyectos visibles." items={props.projects.map((item) => ({ id: item.id, label: item.title }))} values={projectIds} onChange={setProjectIds} /></div>
    </div><footer><button type="button" className="reports-button" onClick={props.onClose}>Cancelar</button><button className="reports-button reports-button--primary" disabled={busy || !name.trim()}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></footer>
  </form></div>;
}

function Preview(props: { template?: ConfigurableReportTemplate; name: string; periodStart: string; periodEnd: string; sourceCount: number }) { return <div className="reports-preview"><strong>{props.name || props.template?.name}</strong><span>{props.periodStart || 'sin inicio'} — {props.periodEnd || 'sin fin'}</span><span>{props.sourceCount} fuente(s) seleccionada(s)</span><small>Las cifras, mapas y gráficos aparecerán solo cuando existan datos validados y reglas compatibles.</small></div>; }
function ChoiceGroup(props: { title: string; empty: string; items: Array<{ id: string; label: string }>; values: string[]; onChange: (values: string[]) => void }) { return <fieldset><legend>{props.title}</legend>{props.items.length === 0 ? <small>{props.empty}</small> : props.items.map((item) => <label className="reports-check" key={item.id}><input type="checkbox" checked={props.values.includes(item.id)} onChange={() => props.onChange(toggle(props.values, item.id))} />{item.label}</label>)}</fieldset>; }
function toggle(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function selectionIds(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function frameworkPath(code: string) { return ({ NATIONAL_CHAPTER: '/admin/reports/national', REGIONAL_RESTORATION: '/admin/reports/regional', BTR: '/admin/reports/btr', NDC: '/admin/reports/ndc', GBF_TARGET_2: '/admin/reports/gbf-target-2', LDN: '/admin/reports/ldn', CUSTOM: '/admin/reports/custom' } as Record<string,string>)[code] ?? null; }
function formatPeriod(report: Pick<ReportInstance, 'periodStart'|'periodEnd'>) { return report.periodStart || report.periodEnd ? `${report.periodStart ?? '…'} — ${report.periodEnd ?? '…'}` : 'período pendiente'; }
function statusTone(status: string): 'neutral'|'good'|'warn'|'danger' { if (['APPROVED','PUBLISHED','AVAILABLE'].includes(status)) return 'good'; if (['READY_FOR_REVIEW','UNDER_REVIEW','PENDING_VALIDATION','PARTIAL'].includes(status)) return 'warn'; if (['MISSING','CHANGES_REQUESTED'].includes(status)) return 'danger'; return 'neutral'; }
function coverageTone(status: string) { return statusTone(status); }
function formatDate(value: string | null) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pendiente'; }
function commitmentLabel(status: string) { return ({ DRAFT: 'Borrador', OPEN: 'Recepción abierta', IN_REVIEW: 'Consolidación', CLOSED: 'Cerrado', CANCELLED: 'Cancelado' } as Record<string,string>)[status] ?? status; }
function contributionLabel(status: string) { return ({ PENDING: 'Pendiente', IN_PROGRESS: 'En preparación', SUBMITTED: 'Enviado', VALIDATED: 'Validado', CHANGES_REQUESTED: 'Requiere cambios', NOT_APPLICABLE: 'No aplica' } as Record<string,string>)[status] ?? status; }
function commitmentTone(status: string): 'neutral'|'good'|'warn'|'danger' { if (status === 'CLOSED') return 'good'; if (['OPEN','IN_REVIEW'].includes(status)) return 'warn'; if (status === 'CANCELLED') return 'danger'; return 'neutral'; }
function urgencyTone(status: string): 'neutral'|'good'|'warn'|'danger' { if (status === 'OVERDUE') return 'danger'; if (status === 'DUE_SOON') return 'warn'; if (status === 'ON_TRACK') return 'good'; return 'neutral'; }
function urgencyLabel(item: ReportCommitment) { if (item.urgency === 'CLOSED') return 'Sin alerta'; if (item.urgency === 'OVERDUE') return `${Math.abs(item.daysRemaining)} día(s) vencido`; if (item.daysRemaining === 0) return 'Vence hoy'; return `${item.daysRemaining} día(s)`; }
