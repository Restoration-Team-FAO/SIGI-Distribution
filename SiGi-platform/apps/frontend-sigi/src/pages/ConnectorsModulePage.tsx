import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { DataSource, IntegrationConnector, ValidationResult } from '@sigi/domain';
import {
  workspaceApi,
  type ImportBatch,
  type OdooSource,
} from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';
import { AdministrationWorkspaceHeader } from '../components/AdministrationWorkspaceHeader';
import { ActivityList, CompactList, DataTable, StatusBadge } from '../components/data-display';
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
import { SourcesPage } from './SourcesPage';

type ConnectorWorkspace =
  | 'overview'
  | 'catalog'
  | 'orchestrator'
  | 'manual-import'
  | 'odoo-erp'
  | 'monitoring';

type SourceFormState = {
  id?: string | null;
  institutionId: string;
  connectorId: string;
  code: string;
  name: string;
  sourceType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  assetUid: string;
  description: string;
  userName: string;
  country: string;
  allowedCountriesText: string;
  territorialScope: string;
  status: 'active' | 'inactive';
};

type ConnectorFormState = {
  id?: string | null;
  institutionId: string;
  connectorType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  displayName: string;
  description: string;
  endpointUrl: string;
  userName: string;
  credentialSecret: string;
  status: 'active' | 'inactive';
};

type SourceViewModel = DataSource & {
  institutionName: string;
  connectorName: string | null;
};

const workspaceCards: Array<{
  id: ConnectorWorkspace;
  short: string;
  title: string;
  subtitle: string;
}> = [
  { id: 'overview', short: 'A-I', title: 'Resumen del módulo', subtitle: 'Lectura transversal del ecosistema de conectores.' },
  { id: 'catalog', short: 'A', title: 'Catálogo y fuentes', subtitle: 'Fuentes, conectores, tipos y metadatos.' },
  { id: 'orchestrator', short: 'B-C', title: 'Orquestador y mapeo', subtitle: 'Jobs, ejecución, transformación y cobertura técnica.' },
  { id: 'manual-import', short: 'D-E', title: 'Carga manual y batches', subtitle: 'Validación previa, staging, promoción y re-proceso.' },
  { id: 'odoo-erp', short: 'ERP', title: 'Odoo / ERP', subtitle: 'Credenciales, sync, preview y shapefiles.' },
  { id: 'monitoring', short: 'F-H', title: 'Monitoreo y auditoría', subtitle: 'Alertas, bitácora, trazabilidad y estado.' },
] as const;

function workspaceButtonStyle(isActive: boolean) {
  return {
    textAlign: 'left' as const,
    border: isActive ? '1px solid #14532d' : '1px solid #d7dde5',
    borderRadius: 16,
    padding: 14,
    background: isActive ? '#e8f3ec' : '#ffffff',
    display: 'grid',
    gap: 6,
    cursor: 'pointer',
  };
}

function connectorTypeLabel(value: string) {
  return (
    {
      kobo: 'KoboToolbox',
      excel: 'Excel / CSV',
      odoo: 'Odoo / ERP',
      postgis: 'SQL / PostGIS',
      api: 'Web Service / API',
    }[value] ?? value
  );
}

function connectorEndpointLabel(connectorType: ConnectorFormState['connectorType']) {
  if (connectorType === 'postgis') {
    return 'Host / URL / cadena de conexión SQL';
  }
  if (connectorType === 'api') {
    return 'Endpoint / URL base del Web Service';
  }
  return 'Endpoint / URL base';
}

function connectorUserLabel(connectorType: ConnectorFormState['connectorType']) {
  if (connectorType === 'postgis') {
    return 'Usuario SQL';
  }
  if (connectorType === 'api') {
    return 'Usuario técnico / client id';
  }
  return 'Usuario técnico';
}

function connectorSecretLabel(connectorType: ConnectorFormState['connectorType']) {
  if (connectorType === 'postgis') {
    return 'Password SQL';
  }
  if (connectorType === 'api') {
    return 'Token / API key / secreto';
  }
  return 'Token / secreto técnico';
}

function sourceStatusTone(status: string): 'good' | 'warn' | 'neutral' {
  if (status === 'active') {
    return 'good';
  }
  if (status === 'inactive') {
    return 'warn';
  }
  return 'neutral';
}

function statusLabel(status: string): string {
  return (
    {
      active: 'Activo',
      inactive: 'Inactivo',
    }[status] ?? status
  );
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'sin registro';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
}

function buildDefaultSourceForm(institutionId = ''): SourceFormState {
  return {
    id: null,
    institutionId,
    connectorId: '',
    code: '',
    name: '',
    sourceType: 'excel',
    assetUid: '',
    description: '',
    userName: '',
    country: '',
    allowedCountriesText: '',
    territorialScope: '',
    status: 'active',
  };
}

function buildSourceFormFromSource(source: SourceViewModel): SourceFormState {
  return {
    id: source.id,
    institutionId: source.institutionId,
    connectorId: source.connectorId ?? '',
    code: source.code ?? '',
    name: source.name,
    sourceType: source.sourceType,
    assetUid:
      source.assetUid ??
      (typeof source.config?.assetUid === 'string' ? source.config.assetUid : '') ??
      '',
    description: source.description ?? '',
    userName: source.userName ?? '',
    country: source.country ?? '',
    allowedCountriesText: (source.allowedCountries ?? []).join(', '),
    territorialScope: source.territorialScope ?? '',
    status: source.status,
  };
}

function parseAllowedCountriesText(input: string) {
  const unique = new Map<string, string>();
  for (const chunk of input.split(/[,\n;|]/)) {
    const value = chunk.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, value);
    }
  }
  return Array.from(unique.values());
}

function buildDefaultConnectorForm(institutionId = ''): ConnectorFormState {
  return {
    id: null,
    institutionId,
    connectorType: 'excel',
    displayName: '',
    description: '',
    endpointUrl: '',
    userName: '',
    credentialSecret: '',
    status: 'active',
  };
}

function buildConnectorFormFromConnector(connector: IntegrationConnector): ConnectorFormState {
  return {
    id: connector.id,
    institutionId: connector.institutionId,
    connectorType: connector.connectorType,
    displayName: connector.displayName,
    description: connector.description ?? '',
    endpointUrl: connector.endpointUrl ?? '',
    userName: connector.userName ?? '',
    credentialSecret: '',
    status: connector.status,
  };
}

export function ConnectorsModulePage() {
  const { currentUser, globalViewScope } = useEgi();
  const canReadConnectors = hasPermission(currentUser, 'connectors.read');
  const canCreateConnectors = hasPermission(currentUser, 'connectors.create');
  const canUpdateConnectors = hasPermission(currentUser, 'connectors.update');
  const canDeleteConnectors = hasPermission(currentUser, 'connectors.delete');
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canCreateSources = hasPermission(currentUser, 'sources.create');
  const canUpdateSources = hasPermission(currentUser, 'sources.update');
  const canDeleteSources = hasPermission(currentUser, 'sources.delete');
  const canReadInstitutions = hasPermission(currentUser, 'institutions.read');
  const canReadImports = hasPermission(currentUser, 'imports.read');
  const canReadValidations = hasPermission(currentUser, 'validations.read');
  const canReadIncidents = hasPermission(currentUser, 'incidents.read');
  const canReadAudit = hasPermission(currentUser, 'audit.read');
  const [workspace, setWorkspace] = useState<ConnectorWorkspace>('overview');
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([]);
  const [sources, setSources] = useState<SourceViewModel[]>([]);
  const [connectors, setConnectors] = useState<IntegrationConnector[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [validations, setValidations] = useState<ValidationResult[]>([]);
  const [incidents, setIncidents] = useState<Array<{ id: string; title: string; severity: string; status: string }>>([]);
  const [audit, setAudit] = useState<
    Array<{ id: string; action: string; entityType: string; result: string; createdAt: string; actorEmail?: string | null }>
  >([]);
  const [odooSources, setOdooSources] = useState<OdooSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceForm, setSourceForm] = useState<SourceFormState>(buildDefaultSourceForm());
  const [sourceFormError, setSourceFormError] = useState<string | null>(null);
  const [sourceFormInfo, setSourceFormInfo] = useState<string | null>(null);
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [connectorForm, setConnectorForm] = useState<ConnectorFormState>(buildDefaultConnectorForm());
  const [connectorFormError, setConnectorFormError] = useState<string | null>(null);
  const [connectorFormInfo, setConnectorFormInfo] = useState<string | null>(null);
  const [isSavingConnector, setIsSavingConnector] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);

  async function loadModuleData() {
    const [
      sourcesResponse,
      connectorsResponse,
      institutionsResponse,
      batchesResponse,
      validationsResponse,
      incidentsResponse,
      auditResponse,
      odooSourcesResponse,
    ] = await Promise.all([
      canReadSources ? workspaceApi.getSources(globalViewScope) : Promise.resolve(null),
      canReadConnectors ? workspaceApi.getConnectors() : Promise.resolve(null),
      canReadInstitutions ? workspaceApi.getInstitutions() : Promise.resolve(null),
      canReadImports ? workspaceApi.getImportBatches(globalViewScope) : Promise.resolve(null),
      canReadValidations ? workspaceApi.getValidations(globalViewScope) : Promise.resolve(null),
      canReadIncidents ? workspaceApi.getIncidents(globalViewScope) : Promise.resolve(null),
      canReadAudit ? workspaceApi.getAudit() : Promise.resolve(null),
      canReadSources ? workspaceApi.getOdooSources() : Promise.resolve(null),
    ]);

    const connectorsData = connectorsResponse?.data.connectors ?? [];
    const institutionsData = institutionsResponse?.data.institutions ?? [];

    setInstitutions(institutionsData);
    setConnectors(connectorsData);
    const mappedSources = (sourcesResponse?.data.sources ?? []).map((source) => {
      const institution =
        institutionsData.find((item) => item.id === source.institutionId) ?? null;
      const connector =
        connectorsData.find((item) => item.id === source.connectorId) ?? null;
      return {
        ...source,
        institutionName: institution?.name ?? 'Institución no visible',
        connectorName: connector?.displayName ?? null,
      };
    });

    setSources(mappedSources);
    setBatches(batchesResponse?.data.batches ?? []);
    setValidations(validationsResponse?.data.validations ?? []);
    setIncidents(incidentsResponse?.data.incidents ?? []);
    setAudit(
      (auditResponse?.data.audit ?? []).map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        result: item.result,
        createdAt: item.createdAt,
        actorEmail: item.actorEmail ?? null,
      })),
    );
    setOdooSources(odooSourcesResponse?.data.sources ?? []);
    setSourceForm((current) =>
      current.institutionId ? current : buildDefaultSourceForm(institutionsData[0]?.id ?? ''),
    );
    setConnectorForm((current) =>
      current.institutionId ? current : buildDefaultConnectorForm(institutionsData[0]?.id ?? ''),
    );
    setSelectedSourceId((current) => current ?? sourcesResponse?.data.sources[0]?.id ?? null);
    setSelectedConnectorId((current) => current ?? connectorsData[0]?.id ?? null);

    return {
      sources: mappedSources,
      connectors: connectorsData,
      institutions: institutionsData,
    };
  }

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    loadModuleData()
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setIsLoading(false));
  }, [canReadAudit, canReadConnectors, canReadImports, canReadIncidents, canReadInstitutions, canReadSources, canReadValidations, globalViewScope]);

  const activeSources = sources.filter((item) => item.status === 'active');
  const activeConnectors = connectors.filter((item) => item.status === 'active');
  const connectorFamilies = new Set(connectors.map((item) => item.connectorType));
  const completedBatches = batches.filter(
    (item) => item.status === 'completed' || item.status === 'completed_with_errors',
  );
  const openIncidents = incidents.filter((item) => item.status !== 'resolved');
  const latestSource = sources[0] ?? null;
  const latestOdooSource = odooSources[0] ?? null;
  const latestBatch = batches[0] ?? null;
  const selectedSource =
    sources.find((item) => item.id === selectedSourceId) ?? null;
  const selectedConnector =
    connectors.find((item) => item.id === selectedConnectorId) ?? null;
  const sourceConnectorOptions = connectors.filter(
    (item) => item.institutionId === sourceForm.institutionId,
  );

  const validationSummary = useMemo(() => {
    const passed = validations.filter((item) => item.status === 'passed').length;
    const warning = validations.filter((item) => item.status === 'warning').length;
    const failed = validations.filter((item) => item.status === 'failed').length;
    return { passed, warning, failed };
  }, [validations]);

  const sourceTypeCoverage = useMemo(
    () =>
      ['odoo', 'excel', 'api', 'kobo', 'postgis'].map((sourceType) => ({
        sourceType,
        total: sources.filter((item) => item.sourceType === sourceType).length,
      })),
    [sources],
  );

  async function handleCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSourceFormError(null);
    setSourceFormInfo(null);

    if (!sourceForm.institutionId || !sourceForm.code.trim() || !sourceForm.name.trim()) {
      setSourceFormError('Completa institución, código y nombre para registrar la fuente.');
      return;
    }
    if (sourceForm.sourceType === 'kobo' && !sourceForm.assetUid.trim()) {
      setSourceFormError('Las fuentes Kobo requieren el Asset UID del formulario o proyecto.');
      return;
    }

    setIsCreatingSource(true);
    try {
      if (sourceForm.id) {
        await workspaceApi.updateSource(sourceForm.id, {
          institutionId: sourceForm.institutionId,
          connectorId: sourceForm.connectorId || null,
          code: sourceForm.code.trim(),
          name: sourceForm.name.trim(),
          sourceType: sourceForm.sourceType,
          assetUid: sourceForm.assetUid.trim() || null,
          description: sourceForm.description.trim() || null,
          userName: sourceForm.userName.trim() || null,
          country: sourceForm.country.trim() || null,
          allowedCountries: parseAllowedCountriesText(sourceForm.allowedCountriesText),
          territorialScope: sourceForm.territorialScope.trim() || null,
          status: sourceForm.status,
        });
        setSourceFormInfo('Fuente actualizada correctamente.');
      } else {
        await workspaceApi.createSource({
          institutionId: sourceForm.institutionId,
          connectorId: sourceForm.connectorId || undefined,
          code: sourceForm.code.trim(),
          name: sourceForm.name.trim(),
          sourceType: sourceForm.sourceType,
          assetUid: sourceForm.assetUid.trim() || undefined,
          description: sourceForm.description.trim() || undefined,
          userName: sourceForm.userName.trim() || undefined,
          country: sourceForm.country.trim() || undefined,
          allowedCountries: parseAllowedCountriesText(sourceForm.allowedCountriesText),
          territorialScope: sourceForm.territorialScope.trim() || undefined,
          status: sourceForm.status,
        });
        setSourceFormInfo('Fuente registrada correctamente en el catálogo SIGI.');
      }

      const refreshedData = await loadModuleData();
      const nextSelectedId = sourceForm.id ?? null;
      if (nextSelectedId) {
        const refreshedSource =
          refreshedData.sources.find((item) => item.id === nextSelectedId) ?? null;
        setSourceForm(
          refreshedSource
            ? buildSourceFormFromSource(refreshedSource)
            : buildDefaultSourceForm(sourceForm.institutionId),
        );
        setSelectedSourceId(refreshedSource?.id ?? null);
      } else {
        const createdSource = refreshedData.sources.find(
          (item) =>
            item.code === sourceForm.code.trim() &&
            item.institutionId === sourceForm.institutionId,
        );
        setSelectedSourceId(createdSource?.id ?? null);
        setSourceForm(
          createdSource
            ? buildSourceFormFromSource(createdSource)
            : buildDefaultSourceForm(sourceForm.institutionId),
        );
      }
    } catch (reason) {
      setSourceFormError(reason instanceof Error ? reason.message : 'No se pudo registrar la fuente.');
    } finally {
      setIsCreatingSource(false);
    }
  }

  async function handleDeleteSource() {
    if (!selectedSource) {
      return;
    }

    const confirmed = window.confirm(
      `¿Eliminar la fuente "${selectedSource.name}"? Esta acción solo se permitirá si no tiene datasets ni batches asociados.`,
    );
    if (!confirmed) {
      return;
    }

    setSourceFormError(null);
    setSourceFormInfo(null);
    setIsCreatingSource(true);
    try {
      await workspaceApi.deleteSource(selectedSource.id);
      setSourceFormInfo('Fuente eliminada correctamente.');
      const nextInstitutionId = institutions[0]?.id ?? '';
      setSelectedSourceId(null);
      setSourceForm(buildDefaultSourceForm(nextInstitutionId));
      await loadModuleData();
    } catch (reason) {
      setSourceFormError(reason instanceof Error ? reason.message : 'No se pudo eliminar la fuente.');
    } finally {
      setIsCreatingSource(false);
    }
  }

  async function handleSaveConnector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnectorFormError(null);
    setConnectorFormInfo(null);

    if (!connectorForm.institutionId || !connectorForm.displayName.trim()) {
      setConnectorFormError('Completa institución y nombre visible para registrar el conector.');
      return;
    }

    setIsSavingConnector(true);
    try {
      if (connectorForm.id) {
        await workspaceApi.updateConnector(connectorForm.id, {
          institutionId: connectorForm.institutionId,
          connectorType: connectorForm.connectorType,
          displayName: connectorForm.displayName.trim(),
          description: connectorForm.description.trim() || null,
          endpointUrl: connectorForm.endpointUrl.trim() || null,
          userName: connectorForm.userName.trim() || null,
          // Vacío = conservar la credencial actual (la API nunca la devuelve; null la borraría).
          credentialSecret: connectorForm.credentialSecret.trim() || undefined,
          status: connectorForm.status,
        });
        setConnectorFormInfo('Conector actualizado correctamente.');
      } else {
        await workspaceApi.createConnector({
          institutionId: connectorForm.institutionId,
          connectorType: connectorForm.connectorType,
          displayName: connectorForm.displayName.trim(),
          description: connectorForm.description.trim() || undefined,
          endpointUrl: connectorForm.endpointUrl.trim() || undefined,
          userName: connectorForm.userName.trim() || undefined,
          credentialSecret: connectorForm.credentialSecret.trim() || undefined,
          status: connectorForm.status,
        });
        setConnectorFormInfo('Conector registrado correctamente en el catálogo técnico.');
      }

      const refreshedData = await loadModuleData();
      const nextSelectedId = connectorForm.id ?? null;
      if (nextSelectedId) {
        const refreshedConnector =
          refreshedData.connectors.find((item) => item.id === nextSelectedId) ?? null;
        setConnectorForm(
          refreshedConnector
            ? buildConnectorFormFromConnector(refreshedConnector)
            : buildDefaultConnectorForm(connectorForm.institutionId),
        );
        setSelectedConnectorId(refreshedConnector?.id ?? null);
      } else {
        const createdConnector = refreshedData.connectors.find(
          (item) =>
            item.displayName === connectorForm.displayName.trim() &&
            item.institutionId === connectorForm.institutionId,
        );
        setSelectedConnectorId(createdConnector?.id ?? null);
        setConnectorForm(
          createdConnector
            ? buildConnectorFormFromConnector(createdConnector)
            : buildDefaultConnectorForm(connectorForm.institutionId),
        );
      }
    } catch (reason) {
      setConnectorFormError(reason instanceof Error ? reason.message : 'No se pudo guardar el conector.');
    } finally {
      setIsSavingConnector(false);
    }
  }

  async function handleDeleteConnector() {
    if (!selectedConnector) {
      return;
    }

    const confirmed = window.confirm(
      `¿Eliminar el conector "${selectedConnector.displayName}"? Esta acción solo se permitirá si no tiene fuentes, jobs ni configuraciones Odoo asociadas.`,
    );
    if (!confirmed) {
      return;
    }

    setConnectorFormError(null);
    setConnectorFormInfo(null);
    setIsSavingConnector(true);
    try {
      await workspaceApi.deleteConnector(selectedConnector.id);
      setConnectorFormInfo('Conector eliminado correctamente.');
      const nextInstitutionId = institutions[0]?.id ?? '';
      setSelectedConnectorId(null);
      setConnectorForm(buildDefaultConnectorForm(nextInstitutionId));
      await loadModuleData();
    } catch (reason) {
      setConnectorFormError(reason instanceof Error ? reason.message : 'No se pudo eliminar el conector.');
    } finally {
      setIsSavingConnector(false);
    }
  }

  return (
    <section>
      <AdministrationWorkspaceHeader description={`${connectors.length} conectores registrados`} />
      <PageLead
        eyebrow="Conectores"
        title="SIGI Conectores"
        description="Conectores, fuentes y sincronizaciones."
        icon="database"
      />

      {error ? <MessageBlock tone="danger" icon="alert">{error}</MessageBlock> : null}

      {isLoading ? (
        <MessageBlock icon="database">Cargando el estado actual del módulo de conectores...</MessageBlock>
      ) : null}

      {!isLoading && !error ? (
        <>
          <MetricGrid>
            <MetricCard label="Fuentes registradas" value={String(sources.length)} hint="Catálogo visible para importación, sincronización o preprocesamiento." icon="database" tone="neutral" />
            <MetricCard label="Conectores activos" value={String(activeConnectors.length)} hint="Canales técnicos disponibles para sincronización." icon="flow" tone="good" />
            <MetricCard label="Lotes procesados" value={String(completedBatches.length)} hint="Lotes completados o completados con observaciones." icon="overview" tone="warn" />
            <MetricCard label="Alertas abiertas" value={String(openIncidents.length)} hint="Incidencias activas que afectan operación o calidad." icon="alert" tone={openIncidents.length > 0 ? 'danger' : 'good'} />
          </MetricGrid>

          <Panel
            title="Menú del módulo"
            subtitle="Funciones disponibles."
            action={<StatPill tone="good">{workspaceCards.length} áreas</StatPill>}
            icon="flow"
            tone="good"
          >
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {workspaceCards.map((item) => (
                <button key={item.id} type="button" onClick={() => setWorkspace(item.id)} style={workspaceButtonStyle(workspace === item.id)}>
                  <span style={{ color: '#14532d', fontSize: 12, fontWeight: 700 }}>{item.short}</span>
                  <strong style={{ color: '#10233f' }}>{item.title}</strong>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>{item.subtitle}</span>
                </button>
              ))}
            </div>
          </Panel>

          <div style={{ height: 18 }} />

          <Panel
            title="Management de conectores y credenciales"
            subtitle="Alta, edición y borrado controlado de conectores técnicos con perfil de acceso, endpoint y credenciales genéricas dentro de la misma vista unificada."
            action={<StatPill tone="good">CRUD de conectores</StatPill>}
            icon="database"
            tone="neutral"
          >
            <div
              style={{
                display: 'grid',
                gap: 18,
                gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)',
              }}
            >
              <form onSubmit={handleSaveConnector} style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <strong style={{ color: '#10233f' }}>
                    {connectorForm.id ? 'Editar conector seleccionado' : 'Crear nuevo conector'}
                  </strong>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedConnectorId(null);
                        setConnectorForm(
                          buildDefaultConnectorForm(
                            connectorForm.institutionId || institutions[0]?.id || '',
                          ),
                        );
                        setConnectorFormError(null);
                        setConnectorFormInfo(null);
                      }}
                      disabled={!canCreateConnectors}
                      style={secondaryButtonStyle}
                    >
                      Nuevo conector
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteConnector}
                      disabled={!selectedConnector || isSavingConnector || !canDeleteConnectors}
                      style={dangerButtonStyle(!selectedConnector || isSavingConnector || !canDeleteConnectors)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Institución</span>
                  <select
                    disabled={connectorForm.id ? !canUpdateConnectors : !canCreateConnectors}
                    value={connectorForm.institutionId}
                    onChange={(event) =>
                      setConnectorForm((current) => ({ ...current, institutionId: event.target.value }))
                    }
                  >
                    <option value="">Selecciona institución</option>
                    {institutions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  }}
                >
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>Tipo de conector</span>
                    <select
                      disabled={connectorForm.id ? !canUpdateConnectors : !canCreateConnectors}
                      value={connectorForm.connectorType}
                      onChange={(event) =>
                        setConnectorForm((current) => ({
                          ...current,
                          connectorType: event.target.value as ConnectorFormState['connectorType'],
                        }))
                      }
                    >
                      <option value="excel">Excel / CSV</option>
                      <option value="api">Web Service / API</option>
                      <option value="kobo">KoboToolbox</option>
                      <option value="odoo">Odoo / ERP</option>
                      <option value="postgis">SQL / PostGIS</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>Estado</span>
                    <select
                      disabled={connectorForm.id ? !canUpdateConnectors : !canCreateConnectors}
                      value={connectorForm.status}
                      onChange={(event) =>
                        setConnectorForm((current) => ({
                          ...current,
                          status: event.target.value as 'active' | 'inactive',
                        }))
                      }
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Nombre visible</span>
                  <input
                    disabled={connectorForm.id ? !canUpdateConnectors : !canCreateConnectors}
                    type="text"
                    value={connectorForm.displayName}
                    onChange={(event) =>
                      setConnectorForm((current) => ({ ...current, displayName: event.target.value }))
                    }
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Descripción</span>
                  <textarea
                    disabled={connectorForm.id ? !canUpdateConnectors : !canCreateConnectors}
                    rows={3}
                    value={connectorForm.description}
                    onChange={(event) =>
                      setConnectorForm((current) => ({ ...current, description: event.target.value }))
                    }
                    style={textAreaStyle}
                  />
                </label>

                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  }}
                >
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>
                      {connectorEndpointLabel(connectorForm.connectorType)}
                    </span>
                    <input
                      disabled={connectorForm.id ? !canUpdateConnectors : !canCreateConnectors}
                      type="text"
                      value={connectorForm.endpointUrl}
                      onChange={(event) =>
                        setConnectorForm((current) => ({ ...current, endpointUrl: event.target.value }))
                      }
                      placeholder={
                        connectorForm.connectorType === 'postgis'
                          ? 'Ej. postgresql://host:5432/base o host SQL'
                          : connectorForm.connectorType === 'api'
                            ? 'Ej. https://servicio.ejemplo.org/api'
                            : ''
                      }
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>
                      {connectorUserLabel(connectorForm.connectorType)}
                    </span>
                    <input
                      disabled={connectorForm.id ? !canUpdateConnectors : !canCreateConnectors}
                      type="text"
                      value={connectorForm.userName}
                      onChange={(event) =>
                        setConnectorForm((current) => ({ ...current, userName: event.target.value }))
                      }
                      placeholder={
                        connectorForm.connectorType === 'postgis'
                          ? 'Usuario de base de datos'
                          : connectorForm.connectorType === 'api'
                            ? 'Usuario técnico o client id'
                            : ''
                      }
                    />
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>
                    {connectorSecretLabel(connectorForm.connectorType)}
                  </span>
                  <input
                    disabled={connectorForm.id ? !canUpdateConnectors : !canCreateConnectors}
                    type="password"
                    value={connectorForm.credentialSecret}
                    onChange={(event) =>
                      setConnectorForm((current) => ({ ...current, credentialSecret: event.target.value }))
                    }
                    placeholder={
                      connectorForm.id
                        ? 'Déjalo vacío para conservar la credencial actual'
                        : connectorForm.connectorType === 'postgis'
                          ? 'Ingresa password SQL'
                          : 'Ingresa token, api key o secreto técnico'
                    }
                  />
                </label>

                {connectorForm.connectorType === 'kobo' ? (
                  <MessageBlock>
                    Para Kobo configura aquí la URL del servidor, por ejemplo `https://kf.kobotoolbox.org`, y la API key/token del usuario con acceso al proyecto.
                  </MessageBlock>
                ) : null}

                {connectorForm.connectorType === 'postgis' ? (
                  <MessageBlock>
                    El conector `SQL / PostGIS` usa los campos de arriba como `host o URI SQL`,
                    `usuario SQL` y `password SQL`. Esto permite registrar conexiones técnicas a
                    PostgreSQL/PostGIS sin abrir otro módulo.
                  </MessageBlock>
                ) : null}

                {connectorForm.connectorType === 'api' ? (
                  <MessageBlock>
                    El conector `Web Service / API` usa la URL base del servicio, el usuario técnico
                    opcional y el token o API key de acceso.
                  </MessageBlock>
                ) : null}

                <button
                  type="submit"
                  disabled={isSavingConnector || (connectorForm.id ? !canUpdateConnectors : !canCreateConnectors)}
                  style={{
                    border: 'none',
                    borderRadius: 12,
                    padding: '10px 14px',
                    background: isSavingConnector ? '#94a3b8' : '#14532d',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: isSavingConnector ? 'wait' : 'pointer',
                  }}
                >
                  {isSavingConnector
                    ? 'Guardando conector...'
                    : connectorForm.id
                      ? 'Guardar cambios'
                      : 'Crear conector'}
                </button>

                {connectorFormError ? <MessageBlock tone="danger">{connectorFormError}</MessageBlock> : null}
                {connectorFormInfo ? <MessageBlock>{connectorFormInfo}</MessageBlock> : null}
              </form>

              <div style={{ display: 'grid', gap: 12 }}>
                <strong style={{ color: '#10233f' }}>Conectores visibles</strong>
                <div style={{ display: 'grid', gap: 10, maxHeight: 560, overflow: 'auto' }}>
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      type="button"
                      onClick={() => {
                        setSelectedConnectorId(connector.id);
                        setConnectorForm(buildConnectorFormFromConnector(connector));
                        setConnectorFormError(null);
                        setConnectorFormInfo(null);
                      }}
                      style={{
                        textAlign: 'left',
                        border:
                          connector.id === selectedConnectorId
                            ? '1px solid #14532d'
                            : '1px solid #d7dde5',
                        borderRadius: 14,
                        padding: 12,
                        background: connector.id === selectedConnectorId ? '#f2f8f4' : '#ffffff',
                        display: 'grid',
                        gap: 6,
                        cursor: 'pointer',
                      }}
                      disabled={!canReadConnectors}
                    >
                      <div style={articleHeaderStyle}>
                        <strong>{connector.displayName}</strong>
                        <StatPill tone={sourceStatusTone(connector.status)}>
                          {connector.status === 'active' ? 'Activo' : 'Inactivo'}
                        </StatPill>
                      </div>
                      <span style={metaStyle}>
                        {connectorTypeLabel(connector.connectorType)} · {formatTimestamp(connector.lastSyncAt)}
                      </span>
                      <span style={metaStyle}>
                        {institutions.find((item) => item.id === connector.institutionId)?.name ?? 'Institución no visible'}
                      </span>
                      <span style={metaStyle}>
                        {connector.credentialsConfigured
                          ? `Credenciales configuradas · ${connector.userName ?? 'usuario técnico definido'}`
                          : 'Sin credenciales registradas'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <div style={{ height: 18 }} />

          <Panel
            title="Management de fuentes"
            subtitle="Alta, edición y borrado controlado de fuentes para administrar importaciones desde cualquier sección del módulo."
            action={<StatPill tone="good">CRUD de fuentes</StatPill>}
          >
            <div
              style={{
                display: 'grid',
                gap: 18,
                gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)',
              }}
            >
              <form onSubmit={handleCreateSource} style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <strong style={{ color: '#10233f' }}>
                    {sourceForm.id ? 'Editar fuente seleccionada' : 'Crear nueva fuente'}
                  </strong>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceId(null);
                        setSourceForm(buildDefaultSourceForm(sourceForm.institutionId || institutions[0]?.id || ''));
                        setSourceFormError(null);
                        setSourceFormInfo(null);
                      }}
                      disabled={!canCreateSources}
                      style={secondaryButtonStyle}
                    >
                      Nueva fuente
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSource}
                      disabled={!selectedSource || isCreatingSource || !canDeleteSources}
                      style={dangerButtonStyle(!selectedSource || isCreatingSource || !canDeleteSources)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Institución</span>
                  <select
                    disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                    value={sourceForm.institutionId}
                    onChange={(event) =>
                      setSourceForm((current) => ({ ...current, institutionId: event.target.value }))
                    }
                  >
                    <option value="">Selecciona institución</option>
                    {institutions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  }}
                >
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>Código</span>
                    <input
                      disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                      type="text"
                      value={sourceForm.code}
                      onChange={(event) =>
                        setSourceForm((current) => ({ ...current, code: event.target.value }))
                      }
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>Tipo de fuente</span>
                    <select
                      disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                      value={sourceForm.sourceType}
                      onChange={(event) =>
                        setSourceForm((current) => ({
                          ...current,
                          sourceType: event.target.value as SourceFormState['sourceType'],
                        }))
                      }
                    >
                      <option value="excel">Excel / CSV</option>
                      <option value="api">API REST</option>
                      <option value="kobo">KoboToolbox</option>
                      <option value="odoo">Odoo / ERP</option>
                      <option value="postgis">ArcGIS / PostGIS</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Nombre visible</span>
                  <input
                    disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                    type="text"
                    value={sourceForm.name}
                    onChange={(event) =>
                      setSourceForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>

                {sourceForm.sourceType === 'kobo' ? (
                  <>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ color: '#5f6b7a', fontSize: 13 }}>Asset UID de Kobo</span>
                      <input
                        disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                        type="text"
                        value={sourceForm.assetUid}
                        onChange={(event) =>
                          setSourceForm((current) => ({ ...current, assetUid: event.target.value }))
                        }
                        placeholder="Ej. a4etXeWtqcoodSxLV8a6Uq"
                      />
                    </label>
                    <MessageBlock>
                      El Asset UID corresponde al proyecto/formulario Kobo y se usa para extraer submissions desde `/api/v2/assets/{'{uid}'}/data/`.
                    </MessageBlock>
                  </>
                ) : null}

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Descripción</span>
                  <textarea
                    disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                    rows={3}
                    value={sourceForm.description}
                    onChange={(event) =>
                      setSourceForm((current) => ({ ...current, description: event.target.value }))
                    }
                    style={textAreaStyle}
                  />
                </label>

                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  }}
                >
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>Usuario responsable</span>
                    <input
                      disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                      type="text"
                      value={sourceForm.userName}
                      onChange={(event) =>
                        setSourceForm((current) => ({ ...current, userName: event.target.value }))
                      }
                      />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>Estado</span>
                    <select
                      disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                      value={sourceForm.status}
                      onChange={(event) =>
                        setSourceForm((current) => ({
                          ...current,
                          status: event.target.value as 'active' | 'inactive',
                        }))
                      }
                    >
                      <option value="active">Activa</option>
                      <option value="inactive">Inactiva</option>
                    </select>
                  </label>
                </div>

                <div
                  style={{
                    border: '1px solid #d7dde5',
                    borderRadius: 12,
                    background: '#f8fafc',
                    padding: 12,
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <strong style={{ color: '#10233f', fontSize: 13 }}>Contexto territorial de la fuente</strong>
                  <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                    Usa estos campos para endurecer validación de imports por país y alcance operativo sin mezclar territorios.
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gap: 12,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    }}
                  >
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ color: '#5f6b7a', fontSize: 13 }}>País principal</span>
                      <input
                        disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                        type="text"
                        value={sourceForm.country}
                        onChange={(event) =>
                          setSourceForm((current) => ({ ...current, country: event.target.value }))
                        }
                        placeholder="Ej. El Salvador"
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ color: '#5f6b7a', fontSize: 13 }}>Alcance territorial visible</span>
                      <input
                        disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                        type="text"
                        value={sourceForm.territorialScope}
                        onChange={(event) =>
                          setSourceForm((current) => ({ ...current, territorialScope: event.target.value }))
                        }
                        placeholder="Ej. Región Central o Cobertura nacional"
                      />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>Países permitidos</span>
                    <textarea
                      disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                      rows={3}
                      value={sourceForm.allowedCountriesText}
                      onChange={(event) =>
                        setSourceForm((current) => ({ ...current, allowedCountriesText: event.target.value }))
                      }
                      style={textAreaStyle}
                      placeholder="Ej. El Salvador, Honduras"
                    />
                    <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                      Separa países por coma o salto de línea. Si lo dejas vacío, el pipeline usará el país principal si existe.
                    </span>
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#5f6b7a', fontSize: 13 }}>Conector técnico</span>
                  <select
                    disabled={sourceForm.id ? !canUpdateSources : !canCreateSources}
                    value={sourceForm.connectorId}
                    onChange={(event) =>
                      setSourceForm((current) => ({ ...current, connectorId: event.target.value }))
                    }
                  >
                    <option value="">Sin conector explícito</option>
                    {sourceConnectorOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName} ({connectorTypeLabel(item.connectorType)})
                        </option>
                      ))}
                  </select>
                </label>

                <button
                  type="submit"
                  disabled={isCreatingSource || (sourceForm.id ? !canUpdateSources : !canCreateSources)}
                  style={{
                    border: 'none',
                    borderRadius: 12,
                    padding: '10px 14px',
                    background: isCreatingSource ? '#94a3b8' : '#14532d',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: isCreatingSource ? 'wait' : 'pointer',
                  }}
                >
                  {isCreatingSource
                    ? 'Guardando fuente...'
                    : sourceForm.id
                      ? 'Guardar cambios'
                      : 'Crear fuente'}
                </button>

                {sourceFormError ? <MessageBlock tone="danger">{sourceFormError}</MessageBlock> : null}
                {sourceFormInfo ? <MessageBlock>{sourceFormInfo}</MessageBlock> : null}
              </form>

              <div style={{ display: 'grid', gap: 12 }}>
                <strong style={{ color: '#10233f' }}>Fuentes visibles</strong>
                <div style={{ display: 'grid', gap: 10, maxHeight: 560, overflow: 'auto' }}>
                  {sources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => {
                        setSelectedSourceId(source.id);
                        setSourceForm(buildSourceFormFromSource(source));
                        setSourceFormError(null);
                        setSourceFormInfo(null);
                      }}
                      style={{
                        textAlign: 'left',
                        border: source.id === selectedSourceId ? '1px solid #14532d' : '1px solid #d7dde5',
                        borderRadius: 14,
                        padding: 12,
                        background:
                          source.id === selectedSourceId
                            ? 'linear-gradient(180deg, rgba(20,83,45,0.08) 0%, #ffffff 100%)'
                            : '#ffffff',
                        display: 'grid',
                        gap: 6,
                        cursor: 'pointer',
                      }}
                      disabled={!canReadSources}
                    >
                      <div style={articleHeaderStyle}>
                        <strong style={{ color: '#10233f' }}>{source.name}</strong>
                        <StatPill tone={sourceStatusTone(source.status)}>
                          {statusLabel(source.status)}
                        </StatPill>
                      </div>
                      <span style={metaStyle}>
                        {connectorTypeLabel(source.sourceType)} · {source.code ?? 'sin código'}
                      </span>
                      <span style={metaStyle}>
                        {source.institutionName} · {source.userName ?? 'sin usuario'}
                      </span>
                      {source.country || source.territorialScope || (source.allowedCountries?.length ?? 0) > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {source.country ? <StatPill tone="neutral">{source.country}</StatPill> : null}
                          {source.territorialScope ? <StatPill tone="neutral">{source.territorialScope}</StatPill> : null}
                          {(source.allowedCountries?.length ?? 0) > 0 ? (
                            <StatPill tone="good">
                              {source.allowedCountries!.length} país(es) permitidos
                            </StatPill>
                          ) : null}
                        </div>
                      ) : null}
                      {source.sourceType === 'kobo' ? (
                        <span style={metaStyle}>
                          Asset UID: {source.assetUid ?? 'sin configurar'}
                        </span>
                      ) : null}
                      <span style={metaStyle}>
                        {source.description ?? 'Sin descripción registrada'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <div style={{ height: 18 }} />

          {workspace === 'overview' ? (
            <PanelGrid>
            <Panel title="Estado actual" subtitle="Conectores y fuentes importables." action={<StatPill tone="good">Activo</StatPill>}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <MessageBlock>
                    El backend ya soporta catálogo de fuentes, catálogo de conectores, ejecución de sync jobs, carga manual de CSV/XLSX, staging por batch y operación avanzada de Odoo con preview, test de conexión y shapefiles.
                  </MessageBlock>
                  <MessageBlock>
                    La principal debilidad no es técnica sino de experiencia: las funciones estaban repartidas entre `Fuentes`, `Odoo`, `Flow`, `Imports` y polling de jobs.
                  </MessageBlock>
                  <MessageBlock>
                    Con esta vista nueva el módulo ya se organiza como un solo centro operativo: catálogo, orquestador, mapeo, batches, monitoreo, seguridad y bitácora.
                  </MessageBlock>
                </div>
              </Panel>

              <Panel title="Entradas soportadas hoy" subtitle="Fuentes reales ya visibles para importar o sincronizar." action={<StatPill tone="neutral">{connectorFamilies.size} familias</StatPill>}>
                <CompactList items={sourceTypeCoverage.map((item) => ({ id: item.sourceType, title: connectorTypeLabel(item.sourceType), detail: `${item.total} fuentes registradas` }))} />
              </Panel>

              <Panel title="Último movimiento operativo" subtitle="Señales rápidas del módulo para la operación diaria." action={<StatPill tone="good">Snapshot</StatPill>}>
                <DetailList
                  items={[
                    { label: 'Última fuente visible', value: latestSource?.name ?? 'Sin fuentes registradas' },
                    { label: 'Último batch', value: latestBatch ? `${latestBatch.fileName} · ${latestBatch.status}` : 'Sin batches' },
                    { label: 'Última fuente Odoo', value: latestOdooSource?.sourceName ?? 'Sin fuentes Odoo' },
                    { label: 'Bitácora reciente', value: audit[0]?.action ?? 'Sin eventos recientes' },
                  ]}
                />
              </Panel>

              <Panel title="Cobertura" subtitle="Funciones disponibles y pendientes." action={<StatPill tone="warn">En revisión</StatPill>}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <MessageBlock>
                    Ya cubierto: catálogo de conectores y fuentes, sync jobs, mapeos Odoo, batches y staging, validación, shapefiles, monitoreo básico y auditoría.
                  </MessageBlock>
                  <MessageBlock>
                    Más liviano todavía: gestión explícita de colas, programación visual de jobs, edición avanzada de perfiles fuera de Odoo y administración transversal de credenciales por tipo de fuente.
                  </MessageBlock>
                </div>
              </Panel>
            </PanelGrid>
          ) : null}

          {workspace === 'catalog' ? (
            <PanelGrid>
              <Panel title="Catálogo operativo" subtitle="Inventario actual de fuentes y conectores listos para operar." action={<StatPill tone="good">{activeSources.length} activas</StatPill>}>
                <DataTable rows={sources} rowKey={(source) => source.id} empty="No hay fuentes registradas." columns={[
                  { id: 'source', header: 'Fuente', cell: (source) => <div className="sigi-table-primary"><strong>{source.name}</strong><span>{source.code ?? 'Sin código'}</span></div>, sortValue: (source) => source.name },
                  { id: 'type', header: 'Tipo', cell: (source) => connectorTypeLabel(source.sourceType), sortValue: (source) => source.sourceType },
                  { id: 'institution', header: 'Institución', cell: (source) => source.institutionName, sortValue: (source) => source.institutionName },
                  { id: 'connector', header: 'Conector', cell: (source) => source.connectorName ?? 'Sin conector' },
                  { id: 'status', header: 'Estado', cell: (source) => <StatusBadge status={source.status} label={statusLabel(source.status)} /> },
                ]} />
              </Panel>
            </PanelGrid>
          ) : null}

          {workspace === 'orchestrator' ? (
            <PanelGrid>
              <Panel title="Orquestador de sincronizaciones" subtitle="Ejecución actual y cobertura por conector sobre la infraestructura existente." action={<StatPill tone="good">{activeConnectors.length} activos</StatPill>} icon="flow" tone="good">
                <DataTable rows={connectors} rowKey={(connector) => connector.id} empty="No hay conectores configurados." columns={[
                  { id: 'connector', header: 'Conector', cell: (connector) => <strong>{connector.displayName}</strong>, sortValue: (connector) => connector.displayName },
                  { id: 'type', header: 'Tipo', cell: (connector) => connectorTypeLabel(connector.connectorType), sortValue: (connector) => connector.connectorType },
                  { id: 'lastSync', header: 'Última señal', cell: (connector) => formatTimestamp(connector.lastSyncAt), sortValue: (connector) => connector.lastSyncAt },
                  { id: 'status', header: 'Estado', cell: (connector) => <StatusBadge status={connector.status} label={statusLabel(connector.status)} /> },
                ]} />
              </Panel>

              <Panel title="Mapeo y transformación" subtitle="Estado actual de homologación y normalización por tipo de fuente." action={<StatPill tone="neutral">Cobertura actual</StatPill>} icon="validation" tone="neutral">
                <div style={{ display: 'grid', gap: 8 }}>
                  <MessageBlock icon="validation">
                    Odoo ya cuenta con perfiles de mapeo, preview de sync y homologación controlada contra el modelo canónico.
                  </MessageBlock>
                  <MessageBlock icon="database">
                    La carga manual CSV/XLSX soporta mapeo JSON por columna y auto-detección básica de entidades.
                  </MessageBlock>
                  <MessageBlock icon="flow">
                    El siguiente nivel deseable sería una administración visual de perfiles para Excel/API/Kobo/PostGIS, no solo para Odoo.
                  </MessageBlock>
                </div>
              </Panel>
            </PanelGrid>
          ) : null}

          {workspace === 'manual-import' ? <SourcesPage mode="general" embedded /> : null}
          {workspace === 'odoo-erp' ? <SourcesPage mode="odoo" embedded /> : null}

          {workspace === 'monitoring' ? (
            <PanelGrid>
              <Panel title="Monitoreo y alertas" subtitle="Incidencias, validaciones y batches visibles del módulo." action={<StatPill tone={openIncidents.length > 0 ? 'warn' : 'good'}>{openIncidents.length} abiertas</StatPill>}>
                <DetailList
                  items={[
                    { label: 'Advertencias de validación', value: String(validationSummary.warning) },
                    { label: 'Fallos de validación', value: String(validationSummary.failed) },
                    { label: 'Incidencias abiertas', value: String(openIncidents.length) },
                    { label: 'Batches fallidos', value: String(batches.filter((item) => item.status === 'failed').length) },
                  ]}
                />
              </Panel>

              <Panel title="Bitácora y auditoría" subtitle="Eventos recientes del módulo relacionados con conectores, fuentes e importaciones." action={<StatPill tone="neutral">{audit.length} eventos</StatPill>}>
                <ActivityList items={audit.filter((item) => ['connector', 'data_source', 'import_batch'].includes(item.entityType)).map((item) => ({ id: item.id, event: item.action, actor: item.actorEmail ?? 'Sistema', timestamp: item.createdAt, status: item.result, entity: item.entityType }))} />
              </Panel>

              <Panel title="Seguridad y credenciales" subtitle="Control actual de acceso y configuración sensible." action={<StatPill tone="warn">Centralizado parcialmente</StatPill>}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <MessageBlock>
                    El módulo ya permite gestionar conectores genéricos con endpoint, usuario técnico y secreto básico desde esta vista unificada.
                  </MessageBlock>
                  <MessageBlock>
                    Odoo mantiene además su flujo especializado para conexión, prueba técnica y configuración operacional detallada dentro del bloque ERP.
                  </MessageBlock>
                </div>
              </Panel>
            </PanelGrid>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

const articleStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 16,
  padding: 14,
  display: 'grid',
  gap: 8,
  background: '#ffffff',
};

const softArticleStyle = {
  borderRadius: 16,
  padding: 14,
  background: '#f5f7fb',
  display: 'grid',
  gap: 6,
};

const articleHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
};

const metaStyle = {
  color: '#5f6b7a',
  fontSize: 13,
};

const textAreaStyle = {
  borderRadius: 10,
  border: '1px solid #d7dde5',
  padding: 10,
  color: '#10233f',
  background: '#ffffff',
  resize: 'vertical' as const,
};

const secondaryButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 10,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#10233f',
  fontWeight: 700,
  cursor: 'pointer',
};

function dangerButtonStyle(disabled: boolean) {
  return {
    border: 'none',
    borderRadius: 10,
    padding: '8px 12px',
    background: disabled ? '#cbd5e1' : '#b42318',
    color: '#ffffff',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
