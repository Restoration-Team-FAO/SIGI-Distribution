import { type FormEvent, useEffect, useState } from 'react';
import type { DataSource, Institution, IntegrationConnector, User } from '@sigi/domain';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';
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

type InstitutionViewModel = Institution & {
  sourceCount: number;
  connectorCount: number;
  userCount: number;
  activeUsers: number;
};

type InstitutionFormState = {
  code: string;
  name: string;
  status: 'active' | 'inactive';
};

const initialFormState: InstitutionFormState = {
  code: '',
  name: '',
  status: 'active',
};

function getInstitutionTone(
  institution: InstitutionViewModel,
): 'neutral' | 'good' | 'warn' {
  if (
    institution.status === 'active' &&
    institution.sourceCount > 0 &&
    institution.connectorCount > 0
  ) {
    return 'good';
  }

  if (institution.status === 'active') {
    return 'neutral';
  }

  return 'warn';
}

function getInstitutionSignal(institution: InstitutionViewModel): string {
  if (
    institution.status === 'active' &&
    institution.sourceCount > 0 &&
    institution.connectorCount > 0
  ) {
    return 'operacion conectada';
  }

  if (institution.status === 'active') {
    return 'presencia activa';
  }

  return 'seguimiento requerido';
}

function canDeleteInstitution(institution: InstitutionViewModel): boolean {
  return (
    institution.sourceCount === 0 &&
    institution.connectorCount === 0 &&
    institution.userCount === 0
  );
}

function buildInstitutionViewModels(
  institutions: Institution[],
  sources: DataSource[],
  connectors: IntegrationConnector[],
  users: User[],
) {
  return institutions.map((institution) => {
    const institutionSources = sources.filter(
      (source) => source.institutionId === institution.id,
    );
    const institutionConnectors = connectors.filter(
      (connector) => connector.institutionId === institution.id,
    );
    const institutionUsers = users.filter((user) => user.institutionId === institution.id);

    return {
      ...institution,
      sourceCount: institutionSources.length,
      connectorCount: institutionConnectors.length,
      userCount: institutionUsers.length,
      activeUsers: institutionUsers.filter((user) => user.status === 'active').length,
    };
  });
}

export function InstitutionsPage() {
  const { currentUser, globalViewScope } = useEgi();
  const canReadInstitutions = hasPermission(currentUser, 'institutions.read');
  const canCreateInstitutions = hasPermission(currentUser, 'institutions.create');
  const canUpdateInstitutions = hasPermission(currentUser, 'institutions.update');
  const canDeleteInstitutions = hasPermission(currentUser, 'institutions.delete');
  const canReadSources = hasPermission(currentUser, 'sources.read');
  const canReadConnectors = hasPermission(currentUser, 'connectors.read');
  const canReadUsers = hasPermission(currentUser, 'users.read');
  const [institutions, setInstitutions] = useState<InstitutionViewModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingInstitutionId, setEditingInstitutionId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingInstitutionId, setDeletingInstitutionId] = useState<string | null>(null);
  const [form, setForm] = useState<InstitutionFormState>(initialFormState);

  async function loadInstitutions() {
    setIsLoading(true);
    setError(null);

    try {
      const [institutionsResponse, sourcesResponse, connectorsResponse, usersResponse] =
        await Promise.all([
          canReadInstitutions ? workspaceApi.getInstitutions() : Promise.resolve(null),
          canReadSources ? workspaceApi.getSources(globalViewScope) : Promise.resolve(null),
          canReadConnectors ? workspaceApi.getConnectors() : Promise.resolve(null),
          canReadUsers ? workspaceApi.getUsers() : Promise.resolve(null),
        ]);

      setInstitutions(
        buildInstitutionViewModels(
          institutionsResponse?.data.institutions ?? [],
          sourcesResponse?.data.sources ?? [],
          connectorsResponse?.data.connectors ?? [],
          usersResponse?.data.users ?? [],
        ),
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadInstitutions();
  }, [canReadConnectors, canReadInstitutions, canReadSources, canReadUsers, globalViewScope]);

  async function handleCreateInstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isEditing = editingInstitutionId !== null;
    if (isEditing) {
      setIsSavingEdit(true);
    } else {
      setIsCreating(true);
    }
    setError(null);
    setNotice(null);

    try {
      const trimmedCode = form.code.trim();
      const trimmedName = form.name.trim();
      if (editingInstitutionId) {
        await workspaceApi.updateInstitution(editingInstitutionId, {
          code: trimmedCode,
          name: trimmedName,
          status: form.status,
        });
        setNotice(`Institución ${trimmedName} actualizada correctamente.`);
      } else {
        await workspaceApi.createInstitution({
          code: trimmedCode,
          name: trimmedName,
          status: form.status,
        });
        setNotice(`Institución ${trimmedName} creada correctamente.`);
      }
      setForm(initialFormState);
      setEditingInstitutionId(null);
      await loadInstitutions();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setIsCreating(false);
      setIsSavingEdit(false);
    }
  }

  function handleStartEditInstitution(institution: InstitutionViewModel) {
    setEditingInstitutionId(institution.id);
    setForm({
      code: institution.code,
      name: institution.name,
      status: institution.status,
    });
    setError(null);
    setNotice(null);
  }

  function handleCancelEdit() {
    setEditingInstitutionId(null);
    setForm(initialFormState);
    setError(null);
  }

  async function handleDeleteInstitution(institution: InstitutionViewModel) {
    const confirmed = window.confirm(
      `¿Eliminar la institución ${institution.name}? Esta acción solo funciona si no tiene dependencias activas.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingInstitutionId(institution.id);
    setError(null);
    setNotice(null);

    try {
      await workspaceApi.deleteInstitution(institution.id);
      setNotice(`Institución ${institution.name} eliminada.`);
      await loadInstitutions();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setDeletingInstitutionId(null);
    }
  }

  const activeInstitutions = institutions.filter((institution) => institution.status === 'active');
  const connectedInstitutions = institutions.filter(
    (institution) => institution.sourceCount > 0 || institution.connectorCount > 0,
  );
  const totalUsers = institutions.reduce((sum, institution) => sum + institution.userCount, 0);
  const totalSources = institutions.reduce((sum, institution) => sum + institution.sourceCount, 0);
  const totalConnectors = institutions.reduce(
    (sum, institution) => sum + institution.connectorCount,
    0,
  );
  const leadInstitution =
    institutions.length > 0
      ? [...institutions].sort(
          (left, right) =>
            right.sourceCount +
            right.connectorCount +
            right.activeUsers -
            (left.sourceCount + left.connectorCount + left.activeUsers),
        )[0]
      : null;

  return (
    <section>
      <AdministrationWorkspaceHeader description={`${institutions.length} instituciones registradas`} />
      <PageLead
        eyebrow="Instituciones"
        title="Instituciones conectadas"
        description="Estado, usuarios y conectividad por institución."
      />

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {notice ? <MessageBlock>{notice}</MessageBlock> : null}
      {!canReadInstitutions ? (
        <MessageBlock tone="danger">
          Tu sesión no tiene permiso para consultar instituciones desde esta consola.
        </MessageBlock>
      ) : null}

      {!error && canReadInstitutions && isLoading ? (
        <MessageBlock>Cargando instituciones habilitadas en el entorno SIGI...</MessageBlock>
      ) : null}

      {!error && canReadInstitutions && !isLoading ? (
        <>
          <div
            style={{
              display: 'grid',
              gap: 18,
              gridTemplateColumns: 'minmax(0, 1.45fr) minmax(280px, 0.95fr)',
              marginBottom: 20,
            }}
          >
            <section
              style={{
                borderRadius: 28,
                padding: 24,
                border: '1px solid #d7dde5',
                background:
                  'radial-gradient(circle at top left, rgba(20, 83, 45, 0.16), transparent 38%), linear-gradient(135deg, #10233f 0%, #183b5a 56%, #14532d 100%)',
                color: '#f8fbff',
                boxShadow: '0 22px 48px rgba(16, 35, 63, 0.16)',
              }}
            >
              <div style={{ display: 'grid', gap: 14 }}>
                <StatPill tone="good">Gobernanza activa</StatPill>
                <h3 style={{ margin: 0, fontSize: 30, lineHeight: 1.12 }}>
                  La red institucional ya tiene lectura operativa para despliegue, adopción y
                  articulación de datos país.
                </h3>
                <p style={{ margin: 0, color: 'rgba(248, 251, 255, 0.82)', maxWidth: 760 }}>
                  Esta consola resume cuántas instituciones están activas, qué tan conectadas se
                  ven al ecosistema SIGI y cuánta capacidad operativa muestran hoy en fuentes,
                  conectores y usuarios.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.08)',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <strong style={{ fontSize: 28 }}>{institutions.length}</strong>
                    <span style={{ color: 'rgba(248, 251, 255, 0.72)', fontSize: 13 }}>
                      instituciones registradas
                    </span>
                  </div>
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.08)',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <strong style={{ fontSize: 28 }}>{connectedInstitutions.length}</strong>
                    <span style={{ color: 'rgba(248, 251, 255, 0.72)', fontSize: 13 }}>
                      con operación visible
                    </span>
                  </div>
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.08)',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <strong style={{ fontSize: 28 }}>{totalUsers}</strong>
                    <span style={{ color: 'rgba(248, 251, 255, 0.72)', fontSize: 13 }}>
                      usuarios vinculados
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <Panel
              title="Lectura rápida"
              subtitle="Estado ejecutivo de cobertura y adopción."
              action={
                <StatPill tone={connectedInstitutions.length > 0 ? 'good' : 'warn'}>
                  {connectedInstitutions.length > 0 ? 'Conectado' : 'Sin despliegue'}
                </StatPill>
              }
            >
              <DetailList
                items={[
                  { label: 'Instituciones activas', value: String(activeInstitutions.length) },
                  {
                    label: 'Instituciones conectadas',
                    value: String(connectedInstitutions.length),
                  },
                  { label: 'Fuentes visibles', value: String(totalSources) },
                  { label: 'Conectores visibles', value: String(totalConnectors) },
                ]}
              />
            </Panel>
          </div>

          <MetricGrid>
            <MetricCard
              label="Instituciones registradas"
              value={String(institutions.length)}
              hint="Catálogo actual bajo administración nacional."
            />
            <MetricCard
              label="Instituciones activas"
              value={String(activeInstitutions.length)}
              hint="Con presencia vigente en la operación."
            />
            <MetricCard
              label="Instituciones conectadas"
              value={String(connectedInstitutions.length)}
              hint="Con fuentes o conectores visibles."
            />
            <MetricCard
              label="Cobertura institucional"
              value={`${institutions.length > 0 ? Math.round((connectedInstitutions.length / institutions.length) * 100) : 0}%`}
              hint="Proporción con señal operativa dentro del entorno."
            />
          </MetricGrid>

          <PanelGrid>
            <Panel
              title={editingInstitutionId ? 'Editar institución' : 'Agregar institución'}
              subtitle={
                editingInstitutionId
                  ? 'Actualiza identidad institucional sin salir de la consola.'
                  : 'Alta rápida para ampliar la malla institucional desde la consola nacional.'
              }
              action={
                <StatPill tone={editingInstitutionId ? 'warn' : 'neutral'}>
                  {editingInstitutionId ? 'Modo edición' : 'Admin nacional'}
                </StatPill>
              }
            >
              <form
                onSubmit={(event) => {
                  void handleCreateInstitution(event);
                }}
                style={{ display: 'grid', gap: 14 }}
              >
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>
                    Código
                  </span>
                  <input
                    disabled={editingInstitutionId ? !canUpdateInstitutions : !canCreateInstitutions}
                    value={form.code}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        code: event.target.value,
                      }))
                    }
                    placeholder="ej. marn, inab, maga"
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>
                    Nombre
                  </span>
                  <input
                    disabled={editingInstitutionId ? !canUpdateInstitutions : !canCreateInstitutions}
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Nombre institucional visible"
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>
                    Estado inicial
                  </span>
                  <select
                    disabled={editingInstitutionId ? !canUpdateInstitutions : !canCreateInstitutions}
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as InstitutionFormState['status'],
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {editingInstitutionId ? (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        style={secondaryButtonStyle}
                        disabled={!canUpdateInstitutions}
                      >
                        Cancelar
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={
                        isCreating ||
                        isSavingEdit ||
                        (editingInstitutionId ? !canUpdateInstitutions : !canCreateInstitutions) ||
                        form.code.trim().length === 0 ||
                        form.name.trim().length === 0
                      }
                      style={{
                        ...primaryButtonStyle,
                        opacity:
                          isCreating ||
                          isSavingEdit ||
                          form.code.trim().length === 0 ||
                          form.name.trim().length === 0
                            ? 0.6
                            : 1,
                        cursor:
                          isCreating ||
                          isSavingEdit ||
                          form.code.trim().length === 0 ||
                          form.name.trim().length === 0
                            ? 'not-allowed'
                            : 'pointer',
                      }}
                    >
                      {isSavingEdit
                        ? 'Guardando...'
                        : isCreating
                          ? 'Creando...'
                          : editingInstitutionId
                            ? 'Guardar cambios'
                            : 'Agregar institución'}
                    </button>
                  </div>
                </div>
              </form>
            </Panel>

            <Panel
              title="Mapa de instituciones"
              subtitle="Lectura compacta por institución con estado, adopción y capacidad visible."
              action={<StatPill tone="good">{activeInstitutions.length} activas</StatPill>}
            >
              <div style={{ display: 'grid', gap: 14 }}>
                {institutions.length === 0 ? (
                  <MessageBlock>
                    Aún no hay instituciones registradas. Usa el formulario para crear la primera.
                  </MessageBlock>
                ) : null}
                {institutions.map((institution) => (
                  <article
                    key={institution.id}
                    style={{
                      border: '1px solid #d7dde5',
                      borderRadius: 18,
                      padding: 16,
                      display: 'grid',
                      gap: 10,
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(245,247,251,1) 100%)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong style={{ color: '#10233f' }}>{institution.name}</strong>
                      <StatPill tone={getInstitutionTone(institution)}>
                        {institution.status}
                      </StatPill>
                    </div>
                    <div style={{ color: '#5f6b7a', fontSize: 14 }}>
                      Código institucional: {institution.code}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                      }}
                    >
                      <div
                        style={{
                          borderRadius: 14,
                          padding: 12,
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          display: 'grid',
                          gap: 2,
                        }}
                      >
                        <strong style={{ color: '#10233f' }}>{institution.sourceCount}</strong>
                        <span style={{ color: '#5f6b7a', fontSize: 12 }}>fuentes</span>
                      </div>
                      <div
                        style={{
                          borderRadius: 14,
                          padding: 12,
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          display: 'grid',
                          gap: 2,
                        }}
                      >
                        <strong style={{ color: '#10233f' }}>{institution.connectorCount}</strong>
                        <span style={{ color: '#5f6b7a', fontSize: 12 }}>conectores</span>
                      </div>
                      <div
                        style={{
                          borderRadius: 14,
                          padding: 12,
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          display: 'grid',
                          gap: 2,
                        }}
                      >
                        <strong style={{ color: '#10233f' }}>{institution.activeUsers}</strong>
                        <span style={{ color: '#5f6b7a', fontSize: 12 }}>usuarios activos</span>
                      </div>
                    </div>
                    <div style={{ color: '#5f6b7a', fontSize: 13 }}>
                      Señal operativa: {getInstitutionSignal(institution)}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        paddingTop: 6,
                        borderTop: '1px solid #e2e8f0',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleStartEditInstitution(institution)}
                        disabled={isSavingEdit || isCreating || deletingInstitutionId === institution.id || !canUpdateInstitutions}
                        style={{
                          ...secondaryButtonStyle,
                          opacity:
                            isSavingEdit || isCreating || deletingInstitutionId === institution.id
                              ? 0.55
                              : 1,
                          cursor:
                            isSavingEdit || isCreating || deletingInstitutionId === institution.id
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteInstitution(institution);
                        }}
                        disabled={
                          deletingInstitutionId === institution.id ||
                          !canDeleteInstitution(institution) ||
                          !canDeleteInstitutions
                        }
                        style={{
                          ...dangerButtonStyle,
                          opacity:
                            deletingInstitutionId === institution.id ||
                            !canDeleteInstitution(institution)
                              ? 0.55
                              : 1,
                          cursor:
                            deletingInstitutionId === institution.id ||
                            !canDeleteInstitution(institution)
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        {deletingInstitutionId === institution.id
                          ? 'Eliminando...'
                          : 'Eliminar'}
                      </button>
                      {!canDeleteInstitution(institution) ? (
                        <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                          Elimina primero sus vínculos para habilitar este botón.
                        </span>
                      ) : null}
                    </div>
                    {!canDeleteInstitution(institution) ? (
                      <div style={{ color: '#b45309', fontSize: 12 }}>
                        El borrado se bloquea mientras existan usuarios, fuentes o conectores
                        asociados.
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </Panel>

            <Panel
              title="Institución líder"
              subtitle="Mayor densidad operativa visible dentro del corte actual."
              action={
                <StatPill tone={leadInstitution ? 'good' : 'neutral'}>
                  {leadInstitution ? 'Mayor actividad' : 'Sin señal'}
                </StatPill>
              }
            >
              {leadInstitution ? (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 18,
                      background:
                        'linear-gradient(180deg, rgba(20, 83, 45, 0.08) 0%, rgba(255,255,255,0.96) 100%)',
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <strong style={{ fontSize: 22, color: '#10233f' }}>
                      {leadInstitution.name}
                    </strong>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <StatPill tone="neutral">{leadInstitution.code}</StatPill>
                      <StatPill tone={getInstitutionTone(leadInstitution)}>
                        {getInstitutionSignal(leadInstitution)}
                      </StatPill>
                    </div>
                  </div>
                  <DetailList
                    items={[
                      { label: 'Fuentes visibles', value: String(leadInstitution.sourceCount) },
                      {
                        label: 'Conectores visibles',
                        value: String(leadInstitution.connectorCount),
                      },
                      { label: 'Usuarios totales', value: String(leadInstitution.userCount) },
                      { label: 'Usuarios activos', value: String(leadInstitution.activeUsers) },
                    ]}
                  />
                </div>
              ) : (
                <MessageBlock>No hay una institución líder visible en este corte.</MessageBlock>
              )}
            </Panel>

            <Panel
              title="Lectura de gobernanza"
              subtitle="Resumen para saber si la malla institucional está lista para operar."
            >
              <DetailList
                items={[
                  { label: 'Total registradas', value: String(institutions.length) },
                  { label: 'Activas', value: String(activeInstitutions.length) },
                  { label: 'Conectadas', value: String(connectedInstitutions.length) },
                  {
                    label: 'Estado dominante',
                    value:
                      institutions.length === 0
                        ? 'sin instituciones'
                        : connectedInstitutions.length >= institutions.length / 2
                          ? 'despliegue activo'
                          : 'seguimiento requerido',
                  },
                ]}
              />
            </Panel>
          </PanelGrid>
        </>
      ) : null}
    </section>
  );
}

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

const primaryButtonStyle = {
  border: 'none',
  borderRadius: 999,
  padding: '10px 16px',
  background: '#14532d',
  color: '#f8fbff',
  fontWeight: 700,
};

const dangerButtonStyle = {
  border: '1px solid #f0c6c2',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#fff4f3',
  color: '#b42318',
  fontWeight: 700,
};

const secondaryButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#10233f',
  fontWeight: 700,
};
