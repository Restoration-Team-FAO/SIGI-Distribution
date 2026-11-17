import { useEffect, useState } from 'react';
import { workspaceApi, getAdminSessionUser } from '../services/api';
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

type FlowStage = {
  id: string;
  title: string;
  subtitle: string;
  count: string;
  status: 'Operativo' | 'Atención' | 'Programado' | 'Solo exportación manual';
};

export function FlowPage() {
  const currentUser = getAdminSessionUser();
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canReadValidations = hasPermission(currentUser, 'validations.read');
  const canReadPublications = hasPermission(currentUser, 'publications.read');
  const canReadIncidents = hasPermission(currentUser, 'incidents.read');
  const canReadAudit = hasPermission(currentUser, 'audit.read');
  const { globalViewScope } = useEgi();
  const [stages, setStages] = useState<FlowStage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      !canReadSources &&
      !canReadValidations &&
      !canReadPublications &&
      !canReadIncidents &&
      !canReadAudit
    ) {
      setStages([]);
      return;
    }

    Promise.all([
      canReadSources ? workspaceApi.getSources(globalViewScope) : Promise.resolve({ data: { sources: [] } }),
      canReadValidations ? workspaceApi.getValidations(globalViewScope) : Promise.resolve({ data: { validations: [] } }),
      canReadPublications ? workspaceApi.getPublications(globalViewScope) : Promise.resolve({ data: { publications: [] } }),
      canReadIncidents ? workspaceApi.getIncidents(globalViewScope) : Promise.resolve({ data: { incidents: [] } }),
      canReadAudit ? workspaceApi.getExportTargets(globalViewScope) : Promise.resolve({ data: { targets: [] } }),
    ])
      .then(
        ([
          sourcesResponse,
          validationsResponse,
          publicationsResponse,
          incidentsResponse,
          exportTargetsResponse,
        ]) => {
          const sources = sourcesResponse.data.sources;
          const validations = validationsResponse.data.validations;
          const publications = publicationsResponse.data.publications;
          const incidents = incidentsResponse.data.incidents;
          const exportTargets = exportTargetsResponse.data.targets;
          const bridgeTargets = exportTargets.filter(
            (target) => target.target !== 'public_portal',
          );
          const bridgeOperational = bridgeTargets.some(
            (target) => target.latestRun !== null,
          );

          setStages([
            {
              id: 'sources',
              title: '1. Fuentes',
              subtitle: 'Inventario de entradas institucionales registradas.',
              count: `${sources.length} fuentes`,
              status: sources.length > 0 ? 'Operativo' : 'Programado',
            },
            {
              id: 'validation',
              title: '2. Validación',
              subtitle: 'Resultados visibles para control y seguimiento.',
              count: `${validations.length} resultados`,
              status: validations.length > 0 ? 'Operativo' : 'Atención',
            },
            {
              id: 'incidents',
              title: '3. Incidentes',
              subtitle: 'Casos que afectan consistencia o publicación.',
              count: `${incidents.length} incidentes`,
              status: incidents.some((incident) => incident.status !== 'resolved')
                ? 'Atención'
                : 'Operativo',
            },
            {
              id: 'publication',
              title: '4. Publicación',
              subtitle: 'Salidas visibles para portal y capas país.',
              count: `${publications.length} publicaciones`,
              status: publications.length > 0 ? 'Operativo' : 'Programado',
            },
            {
              id: 'bridge',
              title: '5. Puente',
              // El envío automático a FERM/MIDA no está implementado: solo hay paquetes descargables.
              subtitle: 'Paquetes exportables para carga manual; sin integración automática.',
              count:
                bridgeTargets.length > 0
                  ? `${bridgeTargets.length} destinos`
                  : 'sin destinos',
              status: bridgeOperational ? 'Solo exportación manual' : 'Programado',
            },
          ]);
        },
      )
      .catch((reason: Error) => setError(reason.message));
  }, [canReadAudit, canReadIncidents, canReadPublications, canReadSources, canReadValidations, globalViewScope]);

  return (
    <section>
      <PageLead
        eyebrow="Flujo"
        title="Flujo de integración"
        description="Esta ruta muestra el recorrido operativo desde fuentes y validación hasta publicación y puente, usando únicamente datos expuestos por el backend actual."
        icon="flow"
      />

      {!canReadSources &&
      !canReadValidations &&
      !canReadPublications &&
      !canReadIncidents &&
      !canReadAudit ? (
        <MessageBlock tone="danger" icon="alert">
          Tu perfil no tiene permisos para consultar el flujo operativo del EGI activo.
        </MessageBlock>
      ) : null}
      {error ? <MessageBlock tone="danger" icon="alert">{error}</MessageBlock> : null}

      {stages.length > 0 ? (
        <>
          <MetricGrid>
            <MetricCard
              label="Etapas visibles"
              value={String(stages.length)}
              hint="Lectura del flujo extremo a extremo."
              icon="flow"
              tone="neutral"
            />
            <MetricCard
              label="Etapas con atención"
              value={String(stages.filter((stage) => stage.status === 'Atención').length)}
              hint="Segmentos que hoy requieren seguimiento."
              icon="alert"
              tone={stages.some((stage) => stage.status === 'Atención') ? 'warn' : 'good'}
            />
          </MetricGrid>

          <PanelGrid>
            {stages.map((stage) => (
              <Panel
                key={stage.id}
                title={stage.title}
                subtitle={stage.subtitle}
                icon={
                  stage.id === 'sources'
                    ? 'database'
                    : stage.id === 'validation'
                      ? 'validation'
                      : stage.id === 'incidents'
                        ? 'alert'
                        : stage.id === 'publication'
                          ? 'publication'
                          : 'flow'
                }
                tone={
                  stage.status === 'Operativo'
                    ? 'good'
                    : stage.status === 'Atención'
                      ? 'warn'
                      : 'neutral'
                }
                action={
                  <StatPill
                    tone={
                      stage.status === 'Operativo'
                        ? 'good'
                        : stage.status === 'Atención'
                          ? 'warn'
                          : 'neutral'
                    }
                  >
                    {stage.status}
                  </StatPill>
                }
              >
                <DetailList
                  items={[
                    { label: 'Volumen visible', value: stage.count },
                    { label: 'Lectura actual', value: stage.status },
                  ]}
                />
              </Panel>
            ))}
          </PanelGrid>
        </>
      ) : null}
    </section>
  );
}
