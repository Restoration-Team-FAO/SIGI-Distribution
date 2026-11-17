import { useEffect, useState } from 'react';
import type { ExportTargetsResponse } from '@sigi/contracts';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission, hasRole } from '../utils/permissions';
import { AdministrationWorkspaceHeader } from '../components/AdministrationWorkspaceHeader';
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

const RESET_CONFIRMATION_TEXT = 'RESET SIGI DATABASE';

type ApiOpsModel = {
  targets: ExportTargetsResponse['data']['targets'];
  connectorCount: number;
  sourceCount: number;
  publicationCount: number;
};

type EndpointCatalogItem = {
  method: 'GET' | 'POST';
  path: string;
  module: string;
  description: string;
};

const endpointCatalog: EndpointCatalogItem[] = [
  {
    method: 'GET',
    path: '/api/exports',
    module: 'SIGI Puente',
    description: 'Inventario de objetivos de exportacion con estado vigente.',
  },
  {
    method: 'GET',
    path: '/api/exports/{target}',
    module: 'SIGI Puente',
    description: 'Detalle operativo del ultimo corte por destino.',
  },
  {
    method: 'POST',
    path: '/api/exports/{target}/run',
    module: 'SIGI Puente',
    description: 'Encola una salida para interoperabilidad externa.',
  },
  {
    method: 'GET',
    path: '/api/admin/connectors',
    module: 'SIGI Extractor',
    description: 'Listado de conectores institucionales registrados.',
  },
  {
    method: 'GET',
    path: '/api/admin/sources',
    module: 'SIGI Cargador de archivos',
    description: 'Fuentes de datos listas para ingestion y validacion.',
  },
  {
    method: 'POST',
    path: '/api/admin/system/reset-database',
    module: 'Operaciones SIGI',
    description: 'Reinicio total de base para mantenimiento controlado (solo superadmin).',
  },
];

function getToneByStatus(status: string): 'neutral' | 'good' | 'warn' | 'danger' {
  if (status === 'completed' || status === 'published' || status === 'active') {
    return 'good';
  }

  if (status === 'queued' || status === 'running') {
    return 'warn';
  }

  if (status === 'failed') {
    return 'danger';
  }

  return 'neutral';
}

function formatTimestamp(timestamp?: string | null): string {
  if (!timestamp) {
    return 'Sin corrida visible';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString('es-CR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function buildExportSummaryLabel(details: Record<string, unknown>) {
  const summary =
    typeof details.summary === 'object' && details.summary !== null
      ? (details.summary as Record<string, unknown>)
      : null;
  if (!summary) {
    return 'Sin resumen estructurado';
  }

  const projects = typeof summary.projects === 'number' ? summary.projects : 0;
  const publications =
    typeof summary.publications === 'number' ? summary.publications : 0;
  const validations =
    typeof summary.validations === 'number' ? summary.validations : 0;

  return `${projects} proyecto(s) · ${publications} publicación(es) · ${validations} validación(es)`;
}

export function ApiOpsPage() {
  const { activeEgi, activeEgiId, currentUser, globalViewScope } = useEgi();
  const canReadAudit = hasPermission(currentUser, 'audit.read');
  const canReadConnectors = hasPermission(currentUser, 'connectors.read');
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canReadPublications = hasPermission(currentUser, 'publications.read');
  const canPublishOutputs = hasPermission(currentUser, 'publications.publish');
  const canResetDatabase = hasPermission(currentUser, 'system.reset_database') || hasRole(currentUser, 'superadmin');
  const [model, setModel] = useState<ApiOpsModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetPassphrase, setResetPassphrase] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetInfo, setResetInfo] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [runningTarget, setRunningTarget] = useState<string | null>(null);
  const [downloadingTarget, setDownloadingTarget] = useState<string | null>(null);

  async function loadApiOpsModel() {
    setError(null);
    try {
      const [
        targetsResponse,
        connectorsResponse,
        sourcesResponse,
        publicationsResponse,
      ] = await Promise.all([
        canReadAudit ? workspaceApi.getExportTargets(globalViewScope) : Promise.resolve(null),
        canReadConnectors ? workspaceApi.getConnectors() : Promise.resolve(null),
        canReadSources ? workspaceApi.getSources(globalViewScope) : Promise.resolve(null),
        canReadPublications ? workspaceApi.getPublications(globalViewScope) : Promise.resolve(null),
      ]);
      setModel({
        targets: targetsResponse?.data.targets ?? [],
        connectorCount: connectorsResponse?.data.connectors.length ?? 0,
        sourceCount: sourcesResponse?.data.sources.length ?? 0,
        publicationCount: publicationsResponse?.data.publications.length ?? 0,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar estado API.');
    }
  }

  useEffect(() => {
    loadApiOpsModel().catch((reason: Error) => setError(reason.message));
  }, [canReadAudit, canReadConnectors, canReadPublications, canReadSources, globalViewScope]);

  async function handleRunTarget(target: string) {
    setRunningTarget(target);
    setError(null);
    setNotice(null);
    try {
      const response = await workspaceApi.runExportTarget(target, globalViewScope);
      setNotice(`Salida ${response.data.target} ejecutada correctamente.`);
      await loadApiOpsModel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo ejecutar la exportación.');
    } finally {
      setRunningTarget(null);
    }
  }

  async function handleDownloadArtifact(target: string) {
    setDownloadingTarget(target);
    setError(null);
    setNotice(null);
    try {
      const result = await workspaceApi.downloadExportArtifact(target, globalViewScope);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`Artefacto ${result.fileName} descargado.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo descargar el artefacto.');
    } finally {
      setDownloadingTarget(null);
    }
  }

  async function handleResetDatabase() {
    setResetInfo(null);
    setError(null);
    setIsResetting(true);
    try {
      const response = await workspaceApi.resetDatabase({
        confirmationText: resetConfirmation,
        passphrase: resetPassphrase,
      });
      const result = response.data;
      setResetInfo(
        `Reset ejecutado. Tablas truncadas: ${result.truncatedTables}. Fecha: ${formatTimestamp(result.resetAt)}.`,
      );
      setResetConfirmation('');
      setResetPassphrase('');
      await loadApiOpsModel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo reiniciar la base SIGI.');
    } finally {
      setIsResetting(false);
    }
  }

  const targets = model?.targets ?? [];
  const activeTargets = targets.filter((target) => target.latestRun !== null);
  const queuedTargets = targets.filter((target) => target.status === 'queued').length;

  return (
    <section>
      <AdministrationWorkspaceHeader description="Servicios, exportaciones y mantenimiento." />
      <PageLead
        eyebrow="Interoperabilidad"
        title="OpenAPI y operaciones de servicio"
        description="Estado de servicios y destinos de exportación."
      />

      <Panel
        title="Contexto EGI"
        subtitle="Las exportaciones y artefactos se ejecutan sobre el espacio activo para evitar mezclas entre EGI, salvo cuando se entra explícitamente en vista global."
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
            {
              label: 'Alcance',
              value:
                globalViewScope === 'global'
                  ? 'Consolidado global'
                  : 'Operación del EGI activo',
            },
          ]}
        />
      </Panel>

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {notice ? <MessageBlock>{notice}</MessageBlock> : null}
      {!canReadAudit ? (
        <MessageBlock tone="danger">
          Tu sesión no tiene permisos suficientes para consultar operaciones API desde esta consola.
        </MessageBlock>
      ) : null}

      {!error && canReadAudit && !model ? (
        <MessageBlock>Cargando estado de contratos y salidas interoperables...</MessageBlock>
      ) : null}

      {canReadAudit && model ? (
        <>
          <MetricGrid>
            <MetricCard
              label="Contratos visibles"
              value={String(endpointCatalog.length)}
              hint="Superficie API prioritaria para operación institucional."
            />
            <MetricCard
              label="Objetivos de exportacion"
              value={String(targets.length)}
              hint="Destinos interoperables publicados en SIGI."
            />
            <MetricCard
              label="Destinos con corrida"
              value={String(activeTargets.length)}
              hint="Targets con rastro de ejecucion en el entorno."
            />
            <MetricCard
              label="Pendientes en cola"
              value={String(queuedTargets)}
              hint="Salidas que aun esperan procesamiento."
            />
          </MetricGrid>

          <PanelGrid>
            <Panel
              title="Objetivos de interoperabilidad"
              subtitle="Estado vigente por destino de salida."
              action={<StatPill tone="good">{targets.length} objetivos</StatPill>}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                {targets.map((target) => (
                  <article
                    key={target.target}
                    style={{
                      border: '1px solid #d7dde5',
                      borderRadius: 16,
                      padding: 14,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong>{target.target}</strong>
                      <StatPill tone={getToneByStatus(target.status)}>{target.status}</StatPill>
                    </div>
                    <span style={{ color: '#5f6b7a', fontSize: 14 }}>
                      Ultimo hito:{' '}
                      {formatTimestamp(
                        target.latestRun?.finishedAt ?? target.latestRun?.startedAt,
                      )}
                    </span>
                    {target.latestRun?.details ? (
                      <DetailList
                        items={[
                          {
                            label: 'Artefacto',
                            value: String(
                              (target.latestRun.details.artifact as { fileName?: string } | undefined)
                                ?.fileName ?? 'sin archivo',
                            ),
                          },
                          {
                            label: 'Resumen',
                            value: buildExportSummaryLabel(target.latestRun.details),
                          },
                        ]}
                      />
                    ) : null}
                    {Array.isArray(target.latestRun?.details?.notes) ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {(target.latestRun?.details?.notes as string[]).slice(0, 2).map((note) => (
                          <span key={note} style={{ color: '#5f6b7a', fontSize: 13 }}>
                            {note}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => void handleDownloadArtifact(target.target)}
                        disabled={!target.latestRun || downloadingTarget === target.target}
                        style={{
                          border: '1px solid #d7dde5',
                          borderRadius: 999,
                          padding: '10px 14px',
                          background: '#ffffff',
                          color: '#10233f',
                          fontWeight: 700,
                          cursor:
                            !target.latestRun || downloadingTarget === target.target
                              ? 'not-allowed'
                              : 'pointer',
                          opacity:
                            !target.latestRun || downloadingTarget === target.target ? 0.6 : 1,
                        }}
                      >
                        {downloadingTarget === target.target ? 'Descargando...' : 'Descargar artefacto'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRunTarget(target.target)}
                        disabled={!canPublishOutputs || runningTarget === target.target}
                        style={{
                          border: '1px solid #d7dde5',
                          borderRadius: 999,
                          padding: '10px 14px',
                          background: '#ffffff',
                          color: '#10233f',
                          fontWeight: 700,
                          cursor:
                            !canPublishOutputs || runningTarget === target.target
                              ? 'not-allowed'
                              : 'pointer',
                          opacity:
                            !canPublishOutputs || runningTarget === target.target ? 0.6 : 1,
                        }}
                      >
                        {runningTarget === target.target ? 'Ejecutando...' : 'Ejecutar salida'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel
              title="Contrato API priorizado"
              subtitle="Rutas clave para soporte institucional, operación y trazabilidad."
              action={<StatPill tone="neutral">API-first</StatPill>}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                {endpointCatalog.map((endpoint) => (
                  <article
                    key={`${endpoint.method}-${endpoint.path}`}
                    style={{
                      borderRadius: 14,
                      padding: 12,
                      background: '#f5f7fb',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong>
                        {endpoint.method} {endpoint.path}
                      </strong>
                      <StatPill tone="neutral">{endpoint.module}</StatPill>
                    </div>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>
                      {endpoint.description}
                    </span>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel
              title="Capacidad operativa"
              subtitle="Resumen ejecutivo de la superficie interoperable."
              action={<StatPill tone="good">SIGI en linea</StatPill>}
            >
              <DetailList
                items={[
                  { label: 'Conectores registrados', value: String(model.connectorCount) },
                  { label: 'Fuentes visibles', value: String(model.sourceCount) },
                  { label: 'Publicaciones vigentes', value: String(model.publicationCount) },
                  { label: 'Targets activos', value: String(activeTargets.length) },
                ]}
              />
            </Panel>

            <Panel
              title="Reinicio total de base SIGI"
              subtitle="Operación destructiva para mantenimiento mayor y reinicialización controlada."
              action={<StatPill tone="danger">Solo superadmin</StatPill>}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                <MessageBlock tone="danger">
                  Esta acción borra todos los datos en esquemas `core`, `integration` y `gis`.
                </MessageBlock>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#5f6b7a' }}>
                    Escribe la frase exacta de confirmación
                  </span>
                  <input
                    disabled={!canResetDatabase}
                    value={resetConfirmation}
                    onChange={(event) => setResetConfirmation(event.target.value)}
                    placeholder={RESET_CONFIRMATION_TEXT}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#5f6b7a' }}>
                    Passphrase de seguridad (SIGI_DB_RESET_PASSPHRASE)
                  </span>
                  <input
                    disabled={!canResetDatabase}
                    type="password"
                    value={resetPassphrase}
                    onChange={(event) => setResetPassphrase(event.target.value)}
                    placeholder="Passphrase de reset"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleResetDatabase}
                  disabled={
                    isResetting ||
                    !canResetDatabase ||
                    resetConfirmation.trim().toUpperCase() !== RESET_CONFIRMATION_TEXT ||
                    resetPassphrase.trim().length === 0
                  }
                  style={{
                    border: 'none',
                    borderRadius: 12,
                    padding: '10px 14px',
                    background:
                      isResetting ||
                      resetConfirmation.trim().toUpperCase() !== RESET_CONFIRMATION_TEXT ||
                      resetPassphrase.trim().length === 0
                        ? '#94a3b8'
                        : '#b42318',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor:
                      isResetting ||
                      resetConfirmation.trim().toUpperCase() !== RESET_CONFIRMATION_TEXT ||
                      resetPassphrase.trim().length === 0
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {isResetting ? 'Reiniciando base...' : 'Resetear base de datos SIGI'}
                </button>
                {resetInfo ? <MessageBlock>{resetInfo}</MessageBlock> : null}
              </div>
            </Panel>
          </PanelGrid>
        </>
      ) : null}
    </section>
  );
}
