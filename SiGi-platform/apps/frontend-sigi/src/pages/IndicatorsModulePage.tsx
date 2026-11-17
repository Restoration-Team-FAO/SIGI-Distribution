import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { IndicatorWorkspaceDetail, IndicatorWorkspaceItem } from '@sigi/domain';
import { ModuleWorkspaceHeader } from '../components/ModuleWorkspaceHeader';
import { ActivityList, CompactList, DataTable, StatusBadge } from '../components/data-display';
import { DetailList, MessageBlock, MetricCard, MetricGrid, Panel, StatPill } from '../components/section-kit';
import { useEgi } from '../contexts/EgiContext';
import { workspaceApi } from '../services/api';
import { canUseGlobalView } from '../utils/global-view';

type IndicatorView = 'catalog' | 'detail' | 'targets' | 'results' | 'territory' | 'activity';

export function IndicatorsModulePage() {
  const [params] = useSearchParams();
  const { activeEgi, currentUser, globalViewScope, setGlobalViewScope } = useEgi();
  const allowGlobalView = canUseGlobalView(currentUser);
  const view = normalizeView(params.get('view'));
  const requestedCode = params.get('indicator');
  const [items, setItems] = useState<IndicatorWorkspaceItem[]>([]);
  const [detail, setDetail] = useState<IndicatorWorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    workspaceApi.getIndicators(globalViewScope)
      .then((response) => setItems(response.data.indicators))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [globalViewScope]);

  const selectedCode = requestedCode ?? items[0]?.code ?? null;
  useEffect(() => {
    if (!selectedCode || view === 'catalog') {
      setDetail(null);
      return;
    }
    setLoading(true);
    workspaceApi.getIndicatorDetail(selectedCode, globalViewScope)
      .then((response) => setDetail(response.data))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [globalViewScope, selectedCode, view]);

  const totals = useMemo(() => ({
    withData: items.filter((item) => item.latestValue !== null).length,
    withTarget: items.filter((item) => item.targetValue !== null).length,
    attention: items.filter((item) => item.status === 'attention').length,
    projects: new Set(detail?.observations.map((item) => item.projectId) ?? []).size,
  }), [detail, items]);
  const path = (nextView: IndicatorView, code = selectedCode) =>
    `/admin/indicators?view=${nextView}${code ? `&indicator=${encodeURIComponent(code)}` : ''}`;
  const tabs = [
    { label: 'Catálogo', to: path('catalog') }, { label: 'Ficha', to: path('detail') },
    { label: 'Metas', to: path('targets') }, { label: 'Resultados', to: path('results') },
    { label: 'Mapa', to: path('territory') }, { label: 'Actividad', to: path('activity') },
  ];

  return <section>
    <ModuleWorkspaceHeader eyebrow="Operación · Monitoreo" title="Indicadores"
      description={`${items.length} indicadores registrados`}
      configurationPath="/admin/monitoring/config"
      configurationPermissions={['monitoring.configure', 'validations.assign']}
      tabs={tabs} />

    {allowGlobalView ? <div className="sigi-scope-switcher sigi-scope-switcher--tabs">
      <button type="button" className={globalViewScope === 'active' ? 'is-active' : ''} onClick={() => setGlobalViewScope('active')}>EGI activo</button>
      <button type="button" className={globalViewScope === 'global' ? 'is-active' : ''} onClick={() => setGlobalViewScope('global')}>Vista global</button>
      <span>{globalViewScope === 'active' ? `Datos de ${activeEgi?.name ?? 'EGI activo'}` : 'Consolidado global autorizado'}</span>
    </div> : null}

    {error ? <MessageBlock>{error}</MessageBlock> : null}
    {loading ? <MessageBlock>Cargando indicadores y trazabilidad…</MessageBlock> : null}

    <MetricGrid>
      <MetricCard label="Indicadores" value={String(items.length)} hint="Definiciones visibles" icon="metrics" />
      <MetricCard label="Con resultados" value={String(totals.withData)} hint="Valor disponible" icon="activity" tone="good" />
      <MetricCard label="Con meta" value={String(totals.withTarget)} hint="Seguimiento cuantificable" icon="status" />
      <MetricCard label="Requieren atención" value={String(totals.attention)} hint="Avance menor al 75 %" icon="alert" tone={totals.attention ? 'warn' : 'good'} />
    </MetricGrid>

    {view === 'catalog' ? <Panel title="Catálogo de indicadores" subtitle={`${items.length} indicadores en el alcance actual`} icon="metrics">
      <DataTable rows={items} rowKey={(item) => item.code} empty={loading ? 'Cargando indicadores…' : 'No hay definiciones ni resultados de indicadores en este alcance.'} columns={[
        { id: 'indicator', header: 'Indicador', cell: (item) => <div className="sigi-table-primary"><strong>{item.name}</strong><span>{item.code} · {item.category}</span></div>, sortValue: (item) => item.name },
        { id: 'value', header: 'Último valor', cell: (item) => <strong>{formatValue(item.latestValue, item.unit)}</strong>, sortValue: (item) => item.latestValue },
        { id: 'projects', header: 'Proyectos', cell: (item) => item.projectCount, sortValue: (item) => item.projectCount },
        { id: 'results', header: 'Resultados', cell: (item) => item.observationCount, sortValue: (item) => item.observationCount },
        { id: 'status', header: 'Estado', cell: (item) => <StatusBadge status={item.status} label={statusLabel(item.status)} /> },
        { id: 'action', header: 'Acción', cell: (item) => <Link to={path('detail', item.code)}>Abrir ficha</Link> },
      ]} />
    </Panel> : null}

    {view !== 'catalog' && !detail && !loading ? <MessageBlock>Seleccione un indicador desde el catálogo.</MessageBlock> : null}
    {detail && view === 'detail' ? <Panel title={detail.indicator.name} subtitle={`${detail.indicator.code} · ${detail.indicator.category}`} icon="overview"
      action={<StatPill tone={tone(detail.indicator.status)}>{statusLabel(detail.indicator.status)}</StatPill>}>
      <DetailList items={[
        { label: 'Unidad', value: detail.indicator.unit },
        { label: 'Último valor', value: formatValue(detail.indicator.latestValue, detail.indicator.unit) },
        { label: 'Última observación', value: detail.indicator.latestObservedAt ?? 'Sin fecha' },
        { label: 'Proyectos vinculados', value: String(detail.indicator.projectCount) },
      ]} />
    </Panel> : null}

    {detail && view === 'targets' ? <Panel title="Metas y línea base" subtitle="Metas declaradas en los indicadores de proyecto; no se infieren valores ausentes." icon="status">
      <DataTable rows={detail.observations} rowKey={(item) => item.id} empty="No hay metas asociadas en este EGI." columns={[
        { id: 'project', header: 'Proyecto', cell: (item) => <div className="sigi-table-primary"><strong>{item.projectTitle}</strong><span>{item.projectCode ?? 'Sin código'}</span></div>, sortValue: (item) => item.projectTitle },
        { id: 'baseline', header: 'Línea base', cell: (item) => formatValue(item.baselineValue, item.unit), sortValue: (item) => item.baselineValue },
        { id: 'target', header: 'Meta', cell: (item) => formatValue(item.targetValue, item.unit), sortValue: (item) => item.targetValue },
        { id: 'progress', header: 'Avance', cell: (item) => item.progressPct === null ? 'No calculable' : `${item.progressPct}%`, sortValue: (item) => item.progressPct },
        { id: 'action', header: 'Acción', cell: (item) => <Link to={`/projects/${encodeURIComponent(item.projectId)}/indicators`}>Abrir proyecto</Link> },
      ]} />
    </Panel> : null}

    {detail && view === 'results' ? <Panel title="Resultados y validación" subtitle="Observaciones registradas y evidencia de datasets vinculada a sus proyectos." icon="validation">
      <DataTable rows={detail.observations} rowKey={(item) => item.id} empty="No hay resultados registrados." columns={[
        { id: 'project', header: 'Proyecto', cell: (item) => <strong>{item.projectTitle}</strong>, sortValue: (item) => item.projectTitle },
        { id: 'result', header: 'Resultado', cell: (item) => formatValue(item.valueNumeric, item.unit, item.valueText), sortValue: (item) => item.valueNumeric ?? item.valueText },
        { id: 'date', header: 'Observado', cell: (item) => item.observedAt ?? 'Sin fecha', sortValue: (item) => item.observedAt },
        { id: 'action', header: 'Acción', cell: (item) => <Link to={`/projects/${encodeURIComponent(item.projectId)}/indicators`}>Ver proyecto</Link> },
      ]} />
      <h3 className="sigi-subsection-title">Evidencia y calidad</h3>
      <CompactList empty="No existe evidencia de datasets vinculada a los proyectos de este indicador." items={detail.evidence.map((item) => ({ id: `${item.projectId}-${item.datasetId}`, title: item.datasetTitle ?? item.datasetId, meta: item.projectTitle, detail: item.evidenceNote, status: <StatusBadge status={item.validationStatus ?? 'pending'} label={item.validationStatus ?? 'Sin validación'} /> }))} />
    </Panel> : null}

    {detail && view === 'territory' ? <Panel title="Cobertura en mapa" subtitle="Lugares asociados a los proyectos que reportan el indicador." icon="map">
      <CompactList empty="No hay cobertura territorial asociada." items={detail.territories.map((item) => ({ id: `${item.projectId}-${item.territoryCode}`, title: item.territoryName ?? item.territoryCode, meta: item.projectTitle, detail: `${item.country} · ${item.areaHa.toLocaleString('es-CR')} ha`, actions: <Link to={`/admin/geobi?view=viewer&projectId=${encodeURIComponent(item.projectId)}`}>Ver en mapa</Link> }))} />
    </Panel> : null}

    {detail && view === 'activity' ? <Panel title="Trazabilidad" subtitle="Eventos auditados del indicador o de sus proyectos dentro del alcance autorizado." icon="audit">
      <ActivityList empty="No hay eventos auditados para este indicador en el alcance actual." items={detail.audit.map((event) => ({ id: event.id, event: event.action, actor: event.actorEmail ?? 'Sistema', timestamp: event.createdAt, status: event.result, entity: event.entityType, metadata: event.details }))} />
    </Panel> : null}
  </section>;
}

function normalizeView(value: string | null): IndicatorView {
  return value && ['catalog', 'detail', 'targets', 'results', 'territory', 'activity'].includes(value)
    ? value as IndicatorView : 'catalog';
}
function formatValue(value?: number | null, unit = '', fallback?: string | null) {
  return value === null || value === undefined ? (fallback ?? 'Sin dato') : `${value.toLocaleString('es-CR')} ${unit}`.trim();
}
function statusLabel(status: IndicatorWorkspaceItem['status']) {
  return ({ on_track: 'En ruta', attention: 'Atención', without_target: 'Sin meta', without_data: 'Sin dato' })[status];
}
function tone(status: IndicatorWorkspaceItem['status']): 'good' | 'warn' | 'neutral' {
  return status === 'on_track' ? 'good' : status === 'attention' ? 'warn' : 'neutral';
}
