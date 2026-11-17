import { useEffect, useMemo, useState } from 'react';
import {
  workspaceApi,
  type KoboConnectionTestResult,
  type KoboSource,
  type KoboSourcePreviewResult,
  type SyncJobResponse,
} from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';
import {
  DetailList,
  MessageBlock,
  MetricCard,
  MetricGrid,
  PageLead,
  Panel,
  PanelGrid,
  StatPill,
} from '../components/section-kit';

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'Sin registro';
  }
  try {
    return new Intl.DateTimeFormat('es-CR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function resultTone(ok?: boolean) {
  if (ok === true) {
    return 'good' as const;
  }
  if (ok === false) {
    return 'danger' as const;
  }
  return 'neutral' as const;
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

export function KoboConnectorPage() {
  const { activeEgi, activeEgiId, currentUser, globalViewScope } = useEgi();
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canRunConnectors = hasPermission(currentUser, 'connectors.run');
  const [sources, setSources] = useState<KoboSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedSource, setSelectedSource] = useState<KoboSource | null>(null);
  const [lastJob, setLastJob] = useState<SyncJobResponse | null>(null);
  const [connectionResult, setConnectionResult] = useState<KoboConnectionTestResult | null>(null);
  const [preview, setPreview] = useState<KoboSourcePreviewResult | null>(null);
  const [syncJob, setSyncJob] = useState<SyncJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [promotedLayer, setPromotedLayer] = useState<{
    code: string;
    title: string;
    promotedFeatures: number;
    extractedRecords: number;
    discardedRecords: number;
    message: string;
  } | null>(null);

  async function loadSources(preferredSourceId?: string) {
    if (!canReadSources) {
      setSources([]);
      setSelectedSourceId('');
      setSelectedSource(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await workspaceApi.getKoboSources();
      const nextSources = response.data.sources;
      setSources(nextSources);
      const nextSelectedId = preferredSourceId || selectedSourceId || nextSources[0]?.sourceId || '';
      setSelectedSourceId(nextSelectedId);
      setSelectedSource(
        nextSources.find((item) => item.sourceId === nextSelectedId) ?? nextSources[0] ?? null,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las fuentes Kobo.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadLastJob(sourceId: string) {
    try {
      const response = await workspaceApi.getKoboSourceLastJob(sourceId);
      setLastJob(response.data.job);
    } catch {
      setLastJob(null);
    }
  }

  useEffect(() => {
    void loadSources();
  }, [canReadSources]);

  useEffect(() => {
    const nextSelectedSource = sources.find((item) => item.sourceId === selectedSourceId) ?? null;
    setSelectedSource(nextSelectedSource);
    setConnectionResult(null);
    setPreview(null);
    setSyncJob(null);
    setPromotedLayer(null);
    setInfo(null);
    if (nextSelectedSource) {
      void loadLastJob(nextSelectedSource.sourceId);
    } else {
      setLastJob(null);
    }
  }, [selectedSourceId, sources]);

  const activeSources = useMemo(
    () => sources.filter((item) => item.status === 'active').length,
    [sources],
  );
  const egiScopeLabel = describeEgiScope(activeEgi?.name ?? null, activeEgi?.code ?? null, globalViewScope);

  async function handleTestConnection() {
    if (!selectedSource) {
      return;
    }
    setIsTesting(true);
    setError(null);
    try {
      const response = await workspaceApi.testKoboConnectionById(selectedSource.sourceId);
      setConnectionResult(response.data.result);
      setInfo(`${response.data.result.message} · contexto ${egiScopeLabel}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo probar la conexion Kobo.');
    } finally {
      setIsTesting(false);
    }
  }

  async function handlePreview() {
    if (!selectedSource) {
      return;
    }
    setIsPreviewing(true);
    setError(null);
    try {
      const response = await workspaceApi.previewKoboSource(selectedSource.sourceId);
      setPreview(response.data.preview);
      setInfo(`${response.data.preview.message} · lectura aplicada sobre ${egiScopeLabel}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo generar la previsualizacion Kobo.');
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleRunSync() {
    if (!selectedSource) {
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const response = await workspaceApi.runKoboSourceSync(selectedSource.sourceId);
      let latestJob = await workspaceApi.getSyncJob(response.data.jobId);
      setSyncJob(latestJob);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (['completed', 'partial_failed', 'failed'].includes(latestJob.status)) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        latestJob = await workspaceApi.getSyncJob(response.data.jobId);
        setSyncJob(latestJob);
      }
      await Promise.all([loadSources(selectedSource.sourceId), loadLastJob(selectedSource.sourceId)]);
      setInfo(`Sync Kobo lanzado para ${egiScopeLabel}. Trabajo ${response.data.jobId.slice(0, 8)}...`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo ejecutar el sync Kobo.');
    } finally {
      setIsRunning(false);
    }
  }

  async function handlePromoteLayer() {
    if (!selectedSource) {
      return;
    }
    setIsPromoting(true);
    setError(null);
    try {
      const response = await workspaceApi.promoteKoboGeospatialLayer({
        sourceId: selectedSource.sourceId,
        code: `kobo_${selectedSource.sourceCode}_points`,
        name: `Kobo ${selectedSource.sourceName} Points`,
        visibility: 'public',
        status: 'published',
      });
      const entry = response.data.entry;
      setPromotedLayer({
        code: entry?.code ?? `kobo_${selectedSource.sourceCode}_points`,
        title: entry?.title ?? `Kobo ${selectedSource.sourceName} Points`,
        promotedFeatures: response.data.promotedFeatures,
        extractedRecords: response.data.extractedRecords,
        discardedRecords:
          response.data.discardedRecords ??
          Math.max(response.data.extractedRecords - response.data.promotedFeatures, 0),
        message: response.data.message,
      });
      setInfo(
        `${response.data.message} · ${response.data.promotedFeatures}/${response.data.extractedRecords} registros quedaron promovidos sobre ${egiScopeLabel}.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo crear la capa SIGI desde Kobo.',
      );
    } finally {
      setIsPromoting(false);
    }
  }

  return (
    <section>
      <PageLead
        eyebrow="Conector Kobo"
        title="SIGI ↔ KoboToolbox"
        description="Modulo operativo para revisar fuentes Kobo, validar conectividad, previsualizar submissions y ejecutar sincronizacion desde SIGI-platform."
      />

      <Panel
        title="Contexto EGI"
        subtitle="Este conector opera dentro del espacio activo para no mezclar formularios, sincronizaciones ni capas entre distintos EGI."
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
            { label: 'Alcance', value: globalViewScope === 'global' ? 'Consolidado global' : 'Operación del EGI activo' },
          ]}
        />
      </Panel>

      {!canReadSources ? (
        <MessageBlock tone="danger" icon="alert">
          Tu perfil no tiene permiso para consultar fuentes Kobo.
        </MessageBlock>
      ) : null}
      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {info ? <MessageBlock>{info}</MessageBlock> : null}
      {syncJob ? (
        <MessageBlock tone={syncJob.status === 'failed' ? 'danger' : 'neutral'}>
          Trabajo de sincronizacion {syncJob.jobId.slice(0, 8)}... · estado {syncJob.status}
          {syncJob.finishedAt ? ` · finalizado ${formatTimestamp(syncJob.finishedAt)}` : ''}
        </MessageBlock>
      ) : null}

      <MetricGrid>
        <MetricCard label="Fuentes Kobo" value={String(sources.length)} hint="Fuentes Kobo registradas en SIGI." />
        <MetricCard label="Activas" value={String(activeSources)} hint="Fuentes listas para sincronizacion." />
        <MetricCard
          label="Con credenciales"
          value={String(sources.filter((item) => item.credentialsConfigured).length)}
          hint="Fuentes con token disponible en el conector."
        />
        <MetricCard
          label="Ultimo sync"
          value={lastJob?.status ?? 'Sin registro'}
          hint="Estado mas reciente para la fuente seleccionada."
        />
      </MetricGrid>

      <PanelGrid>
        <Panel
          title="Fuente Kobo seleccionada"
          subtitle="Selecciona una fuente existente del catalogo general para operarla desde este modulo."
          action={<StatPill tone="neutral">{isLoading ? 'Cargando...' : `${sources.length} disponibles`}</StatPill>}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#5f6b7a' }}>Fuente Kobo</span>
              <select
                value={selectedSourceId}
                onChange={(event) => setSelectedSourceId(event.target.value)}
                disabled={isLoading || sources.length === 0}
              >
                {sources.length === 0 ? <option value="">No hay fuentes Kobo registradas</option> : null}
                {sources.map((source) => (
                  <option key={source.sourceId} value={source.sourceId}>
                    {source.sourceName} ({source.sourceCode})
                  </option>
                ))}
              </select>
            </label>

            {selectedSource ? (
              <DetailList
                items={[
                  { label: 'Institucion', value: selectedSource.institutionName },
                  { label: 'Fuente', value: selectedSource.sourceName },
                  { label: 'Codigo', value: selectedSource.sourceCode },
                  { label: 'Asset UID', value: selectedSource.assetUid || 'No configurado' },
                  { label: 'Base URL', value: selectedSource.baseUrl || 'No configurada' },
                  { label: 'Canal tecnico', value: selectedSource.connectorDisplayName ?? 'Sin conector' },
                  { label: 'Ultima ingesta', value: formatTimestamp(selectedSource.sourceLastIngestedAt) },
                  { label: 'Ultimo sync del conector', value: formatTimestamp(selectedSource.connectorLastSyncAt) },
                ]}
              />
            ) : (
              <MessageBlock>
                Registra una fuente tipo Kobo y asociale un conector Kobo desde la vista general de fuentes para operarla aqui.
              </MessageBlock>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!canRunConnectors || !selectedSource || isTesting}
              >
                {isTesting ? 'Probando...' : 'Probar conexion'}
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={!canRunConnectors || !selectedSource || isPreviewing}
              >
                {isPreviewing ? 'Previsualizando...' : 'Previsualizar'}
              </button>
              <button
                type="button"
                onClick={handleRunSync}
                disabled={!canRunConnectors || !selectedSource || isRunning}
              >
                {isRunning ? 'Ejecutando...' : 'Ejecutar sync'}
              </button>
              <button
                type="button"
                onClick={handlePromoteLayer}
                disabled={!canRunConnectors || !selectedSource || isPromoting}
              >
                {isPromoting ? 'Creando capa...' : 'Crear capa SIGI'}
              </button>
              <a href="/admin/sources">Administrar catalogo</a>
            </div>
            {!canRunConnectors ? (
              <MessageBlock tone="danger" icon="alert">
                Tu perfil puede consultar la fuente, pero no ejecutar pruebas ni sincronizaciones.
              </MessageBlock>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Validacion y muestra"
          subtitle="Respuesta operativa del conector Kobo para la fuente seleccionada."
          action={
            <StatPill tone={resultTone(connectionResult?.ok)}>
              {connectionResult ? (connectionResult.ok ? 'Conectado' : 'Con observaciones') : 'Pendiente'}
            </StatPill>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {connectionResult ? (
              <DetailList
                items={[
                  { label: 'Mensaje', value: connectionResult.message },
                  { label: 'Esquema auth', value: connectionResult.authScheme ?? 'Sin dato' },
                  { label: 'Registros primera pagina', value: String(connectionResult.recordsOnFirstPage ?? 0) },
                  { label: 'Mas paginas', value: connectionResult.hasMore ? 'Si' : 'No' },
                ]}
              />
            ) : (
              <MessageBlock>Usa "Probar conexion" para validar token, endpoint y acceso al asset.</MessageBlock>
            )}

            {preview ? (
              <>
                <DetailList
                  items={[
                    { label: 'Mensaje', value: preview.message },
                    { label: 'Registros primera pagina', value: String(preview.recordsOnFirstPage ?? 0) },
                    { label: 'Ultima submission', value: preview.lastSubmissionTime ?? 'Sin dato' },
                    { label: 'Ultimo ID', value: preview.lastSubmissionId ? String(preview.lastSubmissionId) : 'Sin dato' },
                  ]}
                />
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong style={{ color: '#10233f' }}>Muestra de submissions</strong>
                  <pre
                    style={{
                      margin: 0,
                      padding: 12,
                      borderRadius: 8,
                      background: '#0f172a',
                      color: '#e2e8f0',
                      overflowX: 'auto',
                      fontSize: 12,
                    }}
                  >
                    {JSON.stringify(preview.previewRows, null, 2)}
                  </pre>
                </div>
              </>
            ) : null}

            {promotedLayer ? (
              <>
                <DetailList
                  items={[
                    { label: 'Capa creada', value: promotedLayer.title },
                    { label: 'Codigo de capa', value: promotedLayer.code },
                    { label: 'Registros extraidos', value: String(promotedLayer.extractedRecords) },
                    { label: 'Features promovidos', value: String(promotedLayer.promotedFeatures) },
                    { label: 'Descartados', value: String(promotedLayer.discardedRecords) },
                    { label: 'Resultado', value: promotedLayer.message },
                  ]}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <a href="/admin/geospatial-catalog">Abrir Catalogo geografico</a>
                  <a href="/admin/geobi?view=viewer">Abrir Mapa</a>
                </div>
              </>
            ) : null}
          </div>
        </Panel>
      </PanelGrid>
    </section>
  );
}
