import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditEvent, DataSource, ReportCommitment, ReportNotification } from '@sigi/domain';
import { Badge, KPI, LoadingState, PageHeader } from '@sigi/ui';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';
import { DetailList, MessageBlock, Panel, PanelGrid, StatPill } from '../components/section-kit';

type EgiSummary = Awaited<ReturnType<typeof workspaceApi.getEgiSummary>>['data'];
type ReportsDashboard = Awaited<ReturnType<typeof workspaceApi.getReportsDashboard>>['data'];
type Incident = Awaited<ReturnType<typeof workspaceApi.getIncidents>>['data']['incidents'][number];
type WidgetKey = 'reports' | 'notifications' | 'commitments' | 'sources' | 'incidents' | 'audit';
type WidgetStatus = 'ready' | 'forbidden' | 'error' | 'loading';
type WidgetState = Record<WidgetKey, WidgetStatus>;

const INITIAL_WIDGET_STATE: WidgetState = {
  reports: 'loading', notifications: 'loading', commitments: 'loading',
  sources: 'loading', incidents: 'loading', audit: 'loading',
};

function isStaleSource(source: DataSource) {
  if (source.status !== 'active') return false;
  if (!source.lastIngestedAt) return true;
  const lastIngestedAt = Date.parse(source.lastIngestedAt);
  return Number.isNaN(lastIngestedAt) || Date.now() - lastIngestedAt > 30 * 24 * 60 * 60 * 1000;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function sourceStateLabel(state: WidgetState[WidgetKey]) {
  if (state === 'ready') return 'Disponible';
  if (state === 'error') return 'Parcial';
  if (state === 'loading') return 'Cargando';
  return 'Sin permiso';
}

export function AdminHomePage() {
  const { activeEgiId, activeEgi, currentUser, requiresCreation } = useEgi();
  const [summary, setSummary] = useState<EgiSummary | null>(null);
  const [reports, setReports] = useState<ReportsDashboard | null>(null);
  const [notifications, setNotifications] = useState<ReportNotification[]>([]);
  const [commitments, setCommitments] = useState<ReportCommitment[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [widgetState, setWidgetState] = useState<WidgetState>(INITIAL_WIDGET_STATE);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canReadReports = hasPermission(currentUser, 'reports.read');
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canReadIncidents = hasPermission(currentUser, 'incidents.read');
  const canReadAudit = hasPermission(currentUser, 'audit.read');
  const canReadValidations = hasPermission(currentUser, 'validations.read');
  const canReadProjects = hasPermission(currentUser, 'projects.read');
  const canReadFiles = hasPermission(currentUser, 'files.read');

  useEffect(() => {
    let cancelled = false;
    if (!activeEgiId) {
      setSummary(null);
      setIsLoading(false);
      return;
    }

    async function loadHome() {
      setIsLoading(true);
      setError(null);
      setReports(null);
      setNotifications([]);
      setCommitments([]);
      setSources([]);
      setIncidents([]);
      setAudit([]);
      const permittedState: WidgetState = {
        reports: canReadReports ? 'loading' : 'forbidden',
        notifications: canReadReports ? 'loading' : 'forbidden',
        commitments: canReadReports ? 'loading' : 'forbidden',
        sources: canReadSources ? 'loading' : 'forbidden',
        incidents: canReadIncidents ? 'loading' : 'forbidden',
        audit: canReadAudit ? 'loading' : 'forbidden',
      };
      setWidgetState(permittedState);

      try {
        const summaryResponse = await workspaceApi.getEgiSummary(activeEgiId!);
        if (cancelled) return;
        setSummary(summaryResponse.data);

        const requests: Array<{ key: WidgetKey; run: () => Promise<unknown> }> = [];
        if (canReadReports) {
          requests.push(
            { key: 'reports', run: () => workspaceApi.getReportsDashboard() },
            { key: 'notifications', run: () => workspaceApi.getReportNotifications() },
            { key: 'commitments', run: () => workspaceApi.getReportCommitments() },
          );
        }
        if (canReadSources) requests.push({ key: 'sources', run: () => workspaceApi.getSources() });
        if (canReadIncidents) requests.push({ key: 'incidents', run: () => workspaceApi.getIncidents() });
        if (canReadAudit) requests.push({ key: 'audit', run: () => workspaceApi.getAudit() });

        const results = await Promise.allSettled(requests.map((request) => request.run()));
        if (cancelled) return;
        const nextState = { ...permittedState };
        results.forEach((result, index) => {
          const key = requests[index].key;
          nextState[key] = result.status === 'fulfilled' ? 'ready' : 'error';
          if (result.status !== 'fulfilled') return;
          const response = result.value as { data: Record<string, unknown> };
          if (key === 'reports') setReports(response.data as ReportsDashboard);
          if (key === 'notifications') setNotifications(response.data.notifications as ReportNotification[]);
          if (key === 'commitments') setCommitments(response.data.commitments as ReportCommitment[]);
          if (key === 'sources') setSources(response.data.sources as DataSource[]);
          if (key === 'incidents') setIncidents(response.data.incidents as Incident[]);
          if (key === 'audit') setAudit(response.data.audit as AuditEvent[]);
        });
        setWidgetState(nextState);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadHome();
    return () => { cancelled = true; };
  }, [activeEgiId, canReadAudit, canReadIncidents, canReadReports, canReadSources]);

  const staleSources = useMemo(() => sources.filter(isStaleSource), [sources]);
  const openIncidents = useMemo(() => incidents.filter((item) => item.status !== 'resolved'), [incidents]);
  const unreadNotifications = useMemo(() => notifications.filter((item) => item.status === 'UNREAD'), [notifications]);
  const upcomingCommitments = useMemo(() => commitments
    .filter((item) => ['OVERDUE', 'DUE_SOON'].includes(item.urgency) && !['CLOSED', 'CANCELLED'].includes(item.status))
    .sort((left, right) => left.daysRemaining - right.daysRemaining), [commitments]);
  const recentActivity = audit.slice(0, 6);
  const attentionCount = (canReadValidations ? summary?.summary.validationsPending ?? 0 : 0)
    + openIncidents.length + staleSources.length + unreadNotifications.length + upcomingCommitments.length;

  return (
    <section className="ux-dashboard">
      <PageHeader
        eyebrow="Inicio 360"
        title={activeEgi ? `Hola · ${activeEgi.name}` : 'Resumen operativo'}
        description="Pendientes, actividad y estado del EGI activo."
        actions={activeEgi ? <Badge tone="success">{activeEgi.code}</Badge> : <Badge tone="warning">Sin EGI activo</Badge>}
      />

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {!activeEgiId ? (
        <MessageBlock tone="danger">
          {requiresCreation
            ? 'Todavía no existe un EGI. Crea el primero para habilitar la operación principal del SIGI.'
            : 'Selecciona un EGI activo para cargar, validar, visualizar y administrar información operativa.'}
        </MessageBlock>
      ) : null}
      {isLoading && !summary ? <LoadingState message="Construyendo tu situación operativa con fuentes reales…" /> : null}

      {summary ? (
        <>
          <section className={`ux-dashboard__attention${attentionCount === 0 ? ' ux-dashboard__attention--clear' : ''}`} aria-labelledby="dashboard-attention-title">
            <div>
              <span className="ux-dashboard__kicker">Atención requerida</span>
              <h2 id="dashboard-attention-title">{attentionCount > 0 ? `${attentionCount} señal(es) visibles para revisar` : 'Sin asuntos visibles que requieran atención'}</h2>
              <p>Asuntos visibles según tus permisos.</p>
            </div>
            <div className="ux-dashboard__attention-actions">
              {canReadValidations ? <Link to="/admin/validations?view=cases&status=pending">Validaciones</Link> : null}
              {canReadReports ? <Link to={`/admin/reports/commitments?commitmentUrgency=due&year=${new Date().getFullYear()}`}>Compromisos</Link> : null}
            </div>
          </section>

          <div className="ux-dashboard__kpis" aria-label="Indicadores navegables del EGI activo">
            {canReadProjects ? <Link className="ux-dashboard__kpi-link" to="/projects"><KPI label="Proyectos" value={summary.summary.projects} context="Fuente: resumen EGI." tone="success" /></Link> : null}
            {canReadSources ? <Link className="ux-dashboard__kpi-link" to="/admin/sources?view=sources"><KPI label="Fuentes" value={summary.summary.sources} context="Fuente: resumen EGI." tone="info" /></Link> : null}
            {canReadFiles ? <Link className="ux-dashboard__kpi-link" to="/admin/files"><KPI label="Documentos" value={summary.summary.documents} context="Fuente: resumen EGI." /></Link> : null}
            {canReadReports ? <Link className="ux-dashboard__kpi-link" to="/admin/reports/history?status=DRAFT"><KPI label="Informes en preparación" value={reports?.summary.drafts ?? '—'} context="Fuente: dashboard de informes." tone="info" /></Link> : null}
          </div>

          <PanelGrid>
            <Panel title="Mi trabajo" subtitle="Asignaciones y señales que requieren atención." icon="flow" action={<StatPill tone={attentionCount ? 'warn' : 'good'}>{attentionCount} visibles</StatPill>}>
              <div className="ux-dashboard__work-list">
                {canReadReports ? <HomeWorkItem label="Notificaciones de informes" value={unreadNotifications.length} detail={unreadNotifications[0]?.message ?? 'No tienes notificaciones de informes sin leer.'} to="/admin/reports" state={widgetState.notifications} /> : null}
                {canReadValidations ? <HomeWorkItem label="Validaciones del EGI" value={summary.summary.validationsPending} detail="Resultados no aprobados visibles en el espacio activo." to="/admin/validations?view=cases&status=pending" state="ready" /> : null}
                {canReadIncidents ? <HomeWorkItem label="Alertas abiertas" value={openIncidents.length} detail={openIncidents[0]?.title ?? 'No hay incidentes abiertos visibles.'} to="/admin/validations?view=alerts" state={widgetState.incidents} /> : null}
                {canReadSources ? <HomeWorkItem label="Fuentes desactualizadas" value={staleSources.length} detail={staleSources[0]?.name ?? 'Todas las fuentes activas tienen ingestión reciente.'} to="/admin/sources?view=sources&freshness=stale" state={widgetState.sources} /> : null}
                {canReadReports ? <HomeWorkItem label="Compromisos próximos o vencidos" value={upcomingCommitments.length} detail={upcomingCommitments[0] ? `${upcomingCommitments[0].title} · ${formatDate(upcomingCommitments[0].dueDate)}` : 'No hay compromisos próximos o vencidos.'} to={`/admin/reports/commitments?commitmentUrgency=due&year=${new Date().getFullYear()}`} state={widgetState.commitments} /> : null}
                {attentionCount === 0 ? <MessageBlock>No hay trabajo pendiente visible para tus permisos actuales.</MessageBlock> : null}
              </div>
            </Panel>

            <Panel title="Actividad reciente" subtitle="Últimos cambios visibles para tu perfil." icon="audit" action={<SourcePill state={widgetState.audit} />}>
              <div className="ux-dashboard__activity-list">
                {recentActivity.map((item) => (
                  <article key={item.id}>
                    <strong>{item.action}</strong>
                    <span>{item.entityType} · {item.actorEmail ?? 'sistema'}</span>
                    <small>{new Date(item.createdAt).toLocaleString('es-CR')}</small>
                  </article>
                ))}
                {widgetState.audit === 'forbidden' ? <MessageBlock>Tu perfil no tiene acceso a la bitácora.</MessageBlock> : null}
                {widgetState.audit === 'error' ? <MessageBlock tone="danger">La bitácora no respondió; los demás widgets permanecen disponibles.</MessageBlock> : null}
                {widgetState.audit === 'ready' && recentActivity.length === 0 ? <MessageBlock>Sin actividad reciente registrada.</MessageBlock> : null}
              </div>
            </Panel>

            <Panel title="Situación del EGI" subtitle="Estado operativo del espacio activo." icon="metrics" action={<StatPill tone="good">{summary.egi.code}</StatPill>}>
              <DetailList items={[
                { label: 'Proyectos', value: String(summary.summary.projects) },
                { label: 'Importaciones', value: String(summary.summary.imports) },
                { label: 'Publicaciones', value: String(summary.summary.publications) },
                { label: 'Usuarios con acceso', value: String(summary.summary.users) },
                { label: 'Eventos de auditoría · 7 días', value: String(summary.summary.recentAudit) },
              ]} />
            </Panel>

            <Panel title="Disponibilidad de datos" subtitle="Estado de la información utilizada en esta página." icon="database">
              <div className="ux-dashboard__source-list">
                <SourceRow label="Resumen EGI" state="ready" />
                <SourceRow label="Informes" state={widgetState.reports} />
                <SourceRow label="Fuentes" state={widgetState.sources} />
                <SourceRow label="Incidentes" state={widgetState.incidents} />
                <SourceRow label="Actividad" state={widgetState.audit} />
              </div>
            </Panel>
          </PanelGrid>
        </>
      ) : null}
    </section>
  );
}

function HomeWorkItem(props: { label: string; value: number; detail: string; to: string; state: WidgetState[WidgetKey] }) {
  return (
    <Link className="ux-dashboard__work-item" to={props.to}>
      <span className="ux-dashboard__work-count">{props.state === 'ready' ? props.value : '—'}</span>
      <span><strong>{props.label}</strong><small>{props.detail}</small></span>
      <SourcePill state={props.state} />
    </Link>
  );
}

function SourcePill({ state }: { state: WidgetState[WidgetKey] }) {
  return <span className={`ux-dashboard__source-state ux-dashboard__source-state--${state}`}>{sourceStateLabel(state)}</span>;
}

function SourceRow(props: { label: string; state: WidgetState[WidgetKey] }) {
  return <div><span><strong>{props.label}</strong></span><SourcePill state={props.state} /></div>;
}
