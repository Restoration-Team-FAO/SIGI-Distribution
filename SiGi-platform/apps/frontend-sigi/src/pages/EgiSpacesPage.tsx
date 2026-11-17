import { FormEvent, useEffect, useState } from 'react';
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

type EgiFormState = {
  institutionId: string;
  code: string;
  name: string;
  description: string;
  responsible: string;
  territorialScope: string;
  thematicScope: string;
  visibility: 'public' | 'institutional' | 'internal';
  status: 'draft' | 'active' | 'inactive';
};

const initialFormState: EgiFormState = {
  institutionId: '',
  code: '',
  name: '',
  description: '',
  responsible: '',
  territorialScope: '',
  thematicScope: '',
  visibility: 'institutional',
  status: 'active',
};

export function EgiSpacesPage() {
  const {
    spaces,
    activeEgi,
    activeEgiId,
    currentUser,
    isLoading,
    error,
    requiresCreation,
    refresh,
    selectEgi,
    createEgi,
  } = useEgi();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof workspaceApi.getEgiSummary>>['data'] | null>(null);
  const [form, setForm] = useState<EgiFormState>(initialFormState);
  const [editingEgiId, setEditingEgiId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const canCreateEgi = ['superadmin', 'national_admin', 'institution_editor'].some((role) => hasRole(currentUser, role));
  const canEditActiveEgi = Boolean(activeEgi) && hasPermission(currentUser, 'egi.update');

  useEffect(() => {
    if (!activeEgiId) {
      setSummary(null);
      return;
    }
    workspaceApi
      .getEgiSummary(activeEgiId)
      .then((response) => setSummary(response.data))
      .catch(() => setSummary(null));
  }, [activeEgiId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    setFormError(null);
    try {
      const input = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        responsible: form.responsible.trim() || null,
        territorialScope: form.territorialScope.trim() || null,
        thematicScope: form.thematicScope.trim() || null,
        visibility: form.visibility,
        status: form.status,
      };
      if (editingEgiId) {
        await workspaceApi.updateEgi(editingEgiId, input);
        await refresh();
        setEditingEgiId(null);
        setNotice(`El espacio ${input.name} se actualizó correctamente.`);
      } else {
        await createEgi({
          ...input,
          institutionId: form.institutionId || null,
        });
        setNotice('El espacio se creó y quedó seleccionado como contexto activo.');
      }
      setForm(initialFormState);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSaving(false);
    }
  }

  function handleStartEdit() {
    if (!activeEgi || !canEditActiveEgi) return;
    setEditingEgiId(activeEgi.id);
    setForm({
      institutionId: activeEgi.institutionId ?? '',
      code: activeEgi.code,
      name: activeEgi.name,
      description: activeEgi.description ?? '',
      responsible: activeEgi.responsible ?? '',
      territorialScope: activeEgi.territorialScope ?? '',
      thematicScope: activeEgi.thematicScope ?? '',
      visibility: isEgiVisibility(activeEgi.visibility) ? activeEgi.visibility : 'institutional',
      status: isEgiStatus(activeEgi.status) ? activeEgi.status : 'active',
    });
    setNotice(null);
    setFormError(null);
  }

  function handleCancelEdit() {
    setEditingEgiId(null);
    setForm(initialFormState);
    setFormError(null);
  }

  return (
    <section>
      <AdministrationWorkspaceHeader description="Selecciona el contexto de trabajo y administra la identidad y el alcance de los espacios autorizados." />
      <PageLead
        eyebrow="Espacios de gestion"
        title={requiresCreation ? 'Crear primer Espacio de Gestión' : 'Mis espacios de gestión'}
        description="El EGI es el contenedor obligatorio de la operación SIGI. Desde aquí se crea, selecciona y gobierna el contexto activo para cargas, documentos, capas, validaciones y análisis."
        icon="globe"
      />

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {formError ? <MessageBlock tone="danger">{formError}</MessageBlock> : null}
      {notice ? <MessageBlock>{notice}</MessageBlock> : null}

      <MetricGrid>
        <MetricCard label="Espacios accesibles" value={String(spaces.length)} hint="Contenedores operativos disponibles para esta sesión." />
        <MetricCard label="Espacio activo" value={activeEgi?.code ?? 'Sin seleccionar'} hint="Contexto actual que gobierna la operación." tone={activeEgi ? 'good' : 'warn'} />
        <MetricCard label="Institución" value={activeEgi?.institutionName ?? 'Pendiente'} hint="Institución responsable del EGI seleccionado." />
        <MetricCard label="Estado" value={activeEgi?.status ?? 'Pendiente'} hint="Disponibilidad operativa del espacio." />
      </MetricGrid>

      <PanelGrid>
        <Panel
          title={requiresCreation ? 'Configuración inicial SIGI' : 'Mis espacios'}
          subtitle="Selecciona el EGI activo o crea uno nuevo para comenzar a operar."
          icon="overview"
          action={activeEgi ? <StatPill tone="good">Activo: {activeEgi.code}</StatPill> : undefined}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {spaces.length === 0 ? (
              <MessageBlock tone="danger">
                Sin EGI activo, el usuario no puede cargar, validar ni administrar información operativa.
              </MessageBlock>
            ) : null}
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                onClick={() => void selectEgi(space.id)}
                style={{
                  border: activeEgiId === space.id ? '1px solid #0b4f3a' : '1px solid #d7dde5',
                  background: activeEgiId === space.id ? '#e8f5ef' : '#ffffff',
                  borderRadius: 18,
                  padding: 16,
                  display: 'grid',
                  gap: 8,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <strong style={{ color: '#10233f', fontSize: 16 }}>{space.name}</strong>
                  <StatPill tone={activeEgiId === space.id ? 'good' : 'neutral'}>
                    {space.activeUserRole ?? 'acceso'}
                  </StatPill>
                </div>
                <span style={{ color: '#5f6b7a', fontSize: 13 }}>
                  {space.code} · {space.institutionName ?? 'Sin institución'}
                </span>
                <span style={{ color: '#5f6b7a', fontSize: 13 }}>
                  {space.territorialScope ?? 'Sin alcance territorial'} · {space.thematicScope ?? 'Sin alcance temático'}
                </span>
              </button>
            ))}
            {activeEgi && canEditActiveEgi ? (
              <button type="button" onClick={handleStartEdit} style={secondaryButtonStyle}>
                Editar información del EGI activo
              </button>
            ) : null}
          </div>
        </Panel>

        {editingEgiId || canCreateEgi ? <Panel
          title={editingEgiId ? 'Editar información del EGI' : requiresCreation ? 'Crear primer espacio' : 'Crear espacio'}
          subtitle={editingEgiId ? 'Actualiza la identificación, alcance y estado del espacio activo.' : 'Alta mínima para habilitar la operación dentro del SIGI.'}
          icon="flow"
        >
          <form onSubmit={(event) => void handleSubmit(event)} style={{ display: 'grid', gap: 12 }}>
            <input aria-label="Nombre del EGI" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre del EGI" required style={inputStyle} />
            <input aria-label="Código del EGI" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Código" required style={inputStyle} />
            <input aria-label="Responsable del EGI" value={form.responsible} onChange={(event) => setForm((current) => ({ ...current, responsible: event.target.value }))} placeholder="Responsable" style={inputStyle} />
            <input aria-label="Alcance territorial" value={form.territorialScope} onChange={(event) => setForm((current) => ({ ...current, territorialScope: event.target.value }))} placeholder="Alcance territorial" style={inputStyle} />
            <input aria-label="Alcance temático" value={form.thematicScope} onChange={(event) => setForm((current) => ({ ...current, thematicScope: event.target.value }))} placeholder="Alcance temático" style={inputStyle} />
            <textarea aria-label="Descripción operativa" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descripción operativa" rows={4} style={inputStyle} />
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value as EgiFormState['visibility'] }))} style={inputStyle}>
                <option value="institutional">Institucional</option>
                <option value="internal">Interno</option>
                <option value="public">Público</option>
              </select>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EgiFormState['status'] }))} style={inputStyle}>
                <option value="active">Activo</option>
                <option value="draft">Borrador</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
            <button type="submit" disabled={isSaving} style={primaryButtonStyle}>
              {isSaving ? 'Guardando...' : editingEgiId ? 'Guardar cambios' : requiresCreation ? 'Crear primer EGI' : 'Crear espacio'}
            </button>
            {editingEgiId ? (
              <button type="button" disabled={isSaving} onClick={handleCancelEdit} style={secondaryButtonStyle}>
                Cancelar edición
              </button>
            ) : null}
          </form>
        </Panel> : requiresCreation ? (
          <Panel title="Creación restringida" subtitle="Se requiere un perfil autorizado para crear el primer EGI." icon="flow">
            <MessageBlock tone="danger">Tu sesión puede seleccionar espacios asignados, pero no crear ni configurar un EGI.</MessageBlock>
          </Panel>
        ) : null}

        <Panel
          title="Panel principal del EGI"
          subtitle="Resumen operativo del espacio activo."
          icon="metrics"
        >
          {summary ? (
            <DetailList
              items={[
                { label: 'Usuarios asociados', value: String(summary.summary.users) },
                { label: 'Fuentes de datos', value: String(summary.summary.sources) },
                { label: 'Proyectos o iniciativas', value: String(summary.summary.projects) },
                { label: 'Documentos', value: String(summary.summary.documents) },
                { label: 'Cargas recientes', value: String(summary.summary.imports) },
                { label: 'Validaciones pendientes', value: String(summary.summary.validationsPending) },
                { label: 'Reportes / publicaciones', value: String(summary.summary.publications) },
                { label: 'Alertas', value: String(summary.summary.alerts) },
              ]}
            />
          ) : (
            <MessageBlock>
              Selecciona un EGI para ver su panel operativo, actividad y capacidad instalada.
            </MessageBlock>
          )}
        </Panel>
      </PanelGrid>
    </section>
  );
}

function isEgiVisibility(value: string): value is EgiFormState['visibility'] {
  return ['public', 'institutional', 'internal'].includes(value);
}

function isEgiStatus(value: string): value is EgiFormState['status'] {
  return ['draft', 'active', 'inactive'].includes(value);
}

const inputStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 12,
  padding: '11px 14px',
  fontSize: 14,
  background: '#ffffff',
  width: '100%',
};

const primaryButtonStyle = {
  border: 'none',
  borderRadius: 12,
  padding: '12px 16px',
  background: '#0b4f3a',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  border: '1px solid #0b4f3a',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#ffffff',
  color: '#0b4f3a',
  fontWeight: 700,
  cursor: 'pointer',
};
