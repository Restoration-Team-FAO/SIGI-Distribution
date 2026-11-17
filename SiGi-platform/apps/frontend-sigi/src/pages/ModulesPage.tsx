import { useEffect, useState } from 'react';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';
import {
  MessageBlock,
  MetricCard,
  MetricGrid,
  PageLead,
  Panel,
  PanelGrid,
  StatPill,
} from '../components/section-kit';

type ModuleCard = {
  id: string;
  name: string;
  purpose: string;
  owner: string;
  status: 'Operativo' | 'Atencion' | 'Programado';
  metric: string;
  hint: string;
};

export function ModulesPage() {
  const { currentUser, globalViewScope } = useEgi();
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canReadConnectors = hasPermission(currentUser, 'connectors.read');
  const canReadValidations = hasPermission(currentUser, 'validations.read');
  const canReadPublications = hasPermission(currentUser, 'publications.read');
  const canReadIncidents = hasPermission(currentUser, 'incidents.read');
  const canReadAudit = hasPermission(currentUser, 'audit.read');
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      !canReadSources &&
      !canReadConnectors &&
      !canReadValidations &&
      !canReadPublications &&
      !canReadIncidents &&
      !canReadAudit
    ) {
      setModules([]);
      return;
    }

    Promise.all([
      canReadSources ? workspaceApi.getSources(globalViewScope) : Promise.resolve({ data: { sources: [] } }),
      canReadConnectors ? workspaceApi.getConnectors() : Promise.resolve({ data: { connectors: [] } }),
      canReadValidations ? workspaceApi.getValidations(globalViewScope) : Promise.resolve({ data: { validations: [] } }),
      canReadPublications ? workspaceApi.getPublications(globalViewScope) : Promise.resolve({ data: { publications: [] } }),
      canReadIncidents ? workspaceApi.getIncidents(globalViewScope) : Promise.resolve({ data: { incidents: [] } }),
      canReadAudit ? workspaceApi.getExportTargets(globalViewScope) : Promise.resolve({ data: { targets: [] } }),
      canReadConnectors ? workspaceApi.getGeospatialCatalog() : Promise.resolve({ data: { summary: { catalogEntries: 0, managedLayers: 0, derivedLayers: 0, publicLayers: 0, publishedInGeoServer: 0 } } }),
    ])
      .then(
        ([
          sourcesResponse,
          connectorsResponse,
          validationsResponse,
          publicationsResponse,
          incidentsResponse,
          exportTargetsResponse,
          geospatialCatalogResponse,
        ]) => {
          const sources = sourcesResponse.data.sources;
          const connectors = connectorsResponse.data.connectors;
          const validations = validationsResponse.data.validations;
          const publications = publicationsResponse.data.publications;
          const incidents = incidentsResponse.data.incidents;
          const exportTargets = exportTargetsResponse.data.targets;
          const bridgeTargets = exportTargets.filter(
            (target) => target.target !== 'public_portal',
          );
          const bridgeIsOperational =
            bridgeTargets.length > 0 &&
            bridgeTargets.some((target) => target.latestRun !== null);
          const bridgeStatusLabel =
            bridgeTargets.length > 0
              ? `${bridgeTargets.length} destinos`
              : 'sin destinos';
          const geospatialSummary = geospatialCatalogResponse.data.summary;

          setModules([
            {
              id: 'extractor',
              name: 'SIGI Extractor',
              purpose: 'Conectores y sincronizaciones tecnicas',
              owner: 'Coordinacion de Integracion',
              status: connectors.length > 0 ? 'Operativo' : 'Atencion',
              metric: `${connectors.length} conectores`,
              hint: 'Responsable de las extracciones desde sistemas fuente.',
            },
            {
              id: 'loader',
              name: 'SIGI Cargador de archivos',
              purpose: 'Ingreso y registro de fuentes estructuradas',
              owner: 'Unidad de Carga Institucional',
              status: sources.length > 0 ? 'Operativo' : 'Programado',
              metric: `${sources.length} fuentes`,
              hint: 'Entrada controlada para cargas manuales e institucionales.',
            },
            {
              id: 'datastore',
              name: 'SIGI Almacen de datos',
              purpose: 'Persistencia operativa y publicable',
              owner: 'Administracion de Datos SIGI',
              status: publications.length > 0 ? 'Operativo' : 'Programado',
              metric: `${publications.length} salidas`,
              hint: 'Sostiene versiones y material publicable.',
            },
            {
              id: 'core',
              name: 'SIGI Nucleo',
              purpose: 'Modelo canonico y reglas activas',
              owner: 'Gobierno de Datos Nacional',
              status: validations.length > 0 ? 'Operativo' : 'Atencion',
              metric: `${validations.length} validaciones`,
              hint: 'Consolida catalogo, reglas y gobierno.',
            },
            {
              id: 'quality',
              name: 'Calidad y trazabilidad',
              purpose: 'Seguimiento de casos y consistencia',
              owner: 'Comite Tecnico de Calidad',
              status: incidents.some((incident) => incident.status !== 'resolved')
                ? 'Atencion'
                : 'Operativo',
              metric: `${incidents.length} incidentes`,
              hint: 'Controla observaciones y rastro de cambios.',
            },
            {
              id: 'apiops',
              name: 'OpenAPI / APIs',
              purpose: 'Exposicion y consumo de servicios',
              owner: 'Interoperabilidad SIGI',
              status: sources.length + connectors.length > 0 ? 'Operativo' : 'Programado',
              metric: `${sources.length + connectors.length} activos`,
              hint: 'Superficie interoperable del entorno.',
            },
            {
              id: 'bridge',
              name: 'SIGI Puente',
              purpose: 'Autoreportes y paquetes de salida',
              owner: 'Interoperabilidad Internacional',
              status: bridgeIsOperational ? 'Operativo' : 'Programado',
              metric: bridgeStatusLabel,
              hint: 'Transforma salidas para marcos externos.',
            },
            {
              id: 'geobi',
              name: 'Mapa',
              purpose: 'Visor, catálogo y análisis territorial',
              owner: 'Unidad Geo/BI',
              status: publications.length > 0 ? 'Operativo' : 'Programado',
              metric: `${publications.length} publicaciones`,
              hint: 'Entrega vistas y salidas geoespaciales consumibles.',
            },
            {
              id: 'geospatial-catalog',
              name: 'Catálogo Geoespacial',
              purpose: 'Gobierno de capas, vistas y publicaciones OGC',
              owner: 'Gobierno Geoespacial SIGI',
              status:
                geospatialSummary.catalogEntries > 0
                  ? geospatialSummary.publishedInGeoServer > 0
                    ? 'Operativo'
                    : 'Atencion'
                  : 'Programado',
              metric: `${geospatialSummary.catalogEntries} entradas`,
              hint: 'Centraliza inventario geoespacial, trazabilidad y publicación hacia GeoServer.',
            },
            {
              id: 'bi-visualizer',
              name: 'BI Visualizer',
              purpose: 'Combinación analítica de proyectos, Geo/BI, conectores y publicaciones',
              owner: 'Analítica SIGI',
              status:
                sources.length > 0 || connectors.length > 0 || publications.length > 0
                  ? 'Operativo'
                  : 'Programado',
              metric: `${sources.length + connectors.length + publications.length} señales`,
              hint: 'Vista tipo Power BI para combinar indicadores, filtros y lectura transversal del sistema.',
            },
          ]);
        },
      )
      .catch((reason: Error) => setError(reason.message));
  }, [canReadAudit, canReadConnectors, canReadIncidents, canReadPublications, canReadSources, canReadValidations, globalViewScope]);

  const activeModules = modules.filter((item) => item.status === 'Operativo').length;
  const attentionModules = modules.filter((item) => item.status === 'Atencion').length;

  return (
    <section>
      <PageLead
        eyebrow="Modulos"
        title="Modulos SIGI"
        description="Cada módulo se presenta con propósito, responsable y una señal rápida de salud construida desde datos reales del backend actual, sin depender de tarjetas simuladas."
      />

      {!canReadSources &&
      !canReadConnectors &&
      !canReadValidations &&
      !canReadPublications &&
      !canReadIncidents &&
      !canReadAudit ? (
        <MessageBlock tone="danger" icon="alert">
          Tu perfil no tiene permisos para consultar el resumen modular del EGI activo.
        </MessageBlock>
      ) : null}
      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}

      {modules.length > 0 ? (
        <>
          <MetricGrid>
            <MetricCard
              label="Modulos activos"
              value={String(activeModules)}
              hint="Con senal operativa positiva."
            />
            <MetricCard
              label="Modulos con atencion"
              value={String(attentionModules)}
              hint="Requieren seguimiento o todavia estan incompletos."
            />
            <MetricCard
              label="Superficie total"
              value={String(modules.length)}
              hint="Capacidades visibles del ecosistema SIGI."
            />
          </MetricGrid>

          <PanelGrid>
            {modules.map((item) => (
              <Panel
                key={item.id}
                title={item.name}
                subtitle={item.purpose}
                action={
                  <StatPill
                    tone={
                      item.status === 'Operativo'
                        ? 'good'
                        : item.status === 'Atencion'
                          ? 'warn'
                          : 'neutral'
                    }
                  >
                    {item.status}
                  </StatPill>
                }
              >
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ color: '#10233f', fontWeight: 700 }}>{item.metric}</div>
                  <div style={{ color: '#5f6b7a', fontSize: 14 }}>{item.hint}</div>
                  <div style={{ color: '#5f6b7a', fontSize: 13 }}>
                    Responsable sugerido: {item.owner}
                  </div>
                </div>
              </Panel>
            ))}
          </PanelGrid>
        </>
      ) : null}
    </section>
  );
}
