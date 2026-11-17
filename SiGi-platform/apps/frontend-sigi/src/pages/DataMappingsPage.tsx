import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { DataSource } from '@sigi/domain';
import { PageHeader } from '@sigi/ui';
import { MessageBlock, Panel, StatPill } from '../components/section-kit';
import { workspaceApi, type ImportBatch, type SourceMappingProfile } from '../services/api';

type MappingEntity = ImportBatch['entityType'];

export function DataMappingsPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [profiles, setProfiles] = useState<SourceMappingProfile[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [entityType, setEntityType] = useState<MappingEntity>('projects');
  const [name, setName] = useState('');
  const [mappingText, setMappingText] = useState('{}');
  const [isDefault, setIsDefault] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workspaceApi.getSources().then((response) => {
      setSources(response.data.sources);
      setSourceId((current) => current || response.data.sources[0]?.id || '');
    }).catch((reason: Error) => setError(reason.message));
  }, []);

  async function loadProfiles(nextSourceId = sourceId, nextEntity = entityType) {
    if (!nextSourceId) { setProfiles([]); return; }
    try {
      const response = await workspaceApi.getImportMappingProfiles({ sourceId: nextSourceId, entityType: nextEntity });
      setProfiles(response.data.mappingProfiles);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  useEffect(() => { void loadProfiles(); }, [sourceId, entityType]);

  function selectProfile(profile: SourceMappingProfile) {
    setSelectedId(profile.id); setName(profile.profileName);
    setMappingText(JSON.stringify(profile.mappingJson, null, 2)); setIsDefault(profile.isDefault);
    setNotice(null); setError(null);
  }

  function resetForm() {
    setSelectedId(null); setName(''); setMappingText('{}'); setIsDefault(false); setNotice(null); setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(null); setNotice(null);
    if (!sourceId || !name.trim()) { setError('Selecciona una fuente e indica un nombre.'); return; }
    let mappingJson: Record<string, string>;
    try {
      const parsed = JSON.parse(mappingText) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      mappingJson = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
    } catch { setError('El mapeo debe ser un objeto JSON válido.'); return; }
    try {
      if (selectedId) {
        await workspaceApi.updateImportMappingProfile(selectedId, { profileName: name.trim(), mappingJson, isDefault });
        setNotice('Perfil actualizado.');
      } else {
        await workspaceApi.createImportMappingProfile({ sourceId, entityType, profileName: name.trim(), mappingJson, isDefault });
        setNotice('Perfil creado.');
      }
      await loadProfiles();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function toggleStatus(profile: SourceMappingProfile) {
    setError(null); setNotice(null);
    try {
      await workspaceApi.updateImportMappingProfile(profile.id, { status: profile.status === 'active' ? 'inactive' : 'active' });
      setNotice(`Perfil ${profile.status === 'active' ? 'desactivado' : 'activado'}.`);
      await loadProfiles();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  return <section>
    <PageHeader eyebrow="Configuración · Datos" title="Perfiles de mapeo"
      description="Equivalencias versionadas por fuente, separadas del asistente operativo de importación."
      actions={<Link className="sigi-module-header__configuration" to="/admin/data/config">Volver a configuración</Link>} />
    {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
    {notice ? <MessageBlock>{notice}</MessageBlock> : null}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, .8fr) minmax(360px, 1.2fr)', gap: 18 }}>
      <Panel title="Perfiles existentes" subtitle="Seleccione una fuente y entidad para revisar sus versiones.">
        <label style={fieldStyle}>Fuente<select value={sourceId} onChange={(event) => { setSourceId(event.target.value); resetForm(); }}>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select></label>
        <label style={fieldStyle}>Entidad<select value={entityType} onChange={(event) => { setEntityType(event.target.value as MappingEntity); resetForm(); }}>
          <option value="institutions">Instituciones</option><option value="projects">Proyectos</option>
          <option value="project_indicators">Indicadores</option><option value="project_territories">Territorios</option>
        </select></label>
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{profiles.map((profile) => <article key={profile.id} style={profileStyle}>
          <button type="button" onClick={() => selectProfile(profile)} style={profileButtonStyle}>
            <strong>{profile.profileName}</strong><span>v{profile.version} · {profile.sourceName}</span>
          </button>
          <div style={{ display: 'flex', gap: 6 }}><StatPill tone={profile.status === 'active' ? 'good' : 'warn'}>{profile.status}</StatPill>{profile.isDefault ? <StatPill tone="neutral">default</StatPill> : null}</div>
          <button type="button" onClick={() => void toggleStatus(profile)}>{profile.status === 'active' ? 'Desactivar' : 'Activar'}</button>
        </article>)}</div>
        {!profiles.length ? <MessageBlock>No hay perfiles para esta selección.</MessageBlock> : null}
      </Panel>
      <Panel title={selectedId ? 'Editar perfil' : 'Nuevo perfil'} subtitle="El JSON relaciona campos canónicos con columnas de origen.">
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <label style={fieldStyle}>Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label style={fieldStyle}>Mapeo JSON<textarea rows={16} value={mappingText} onChange={(event) => setMappingText(event.target.value)} style={{ fontFamily: 'monospace' }} /></label>
          <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />Usar como perfil predeterminado</label>
          <div style={{ display: 'flex', gap: 8 }}><button type="submit">{selectedId ? 'Guardar cambios' : 'Crear perfil'}</button><button type="button" onClick={resetForm}>Nuevo</button></div>
        </form>
      </Panel>
    </div>
  </section>;
}

const fieldStyle = { display: 'grid', gap: 6, marginBottom: 10 };
const profileStyle = { border: '1px solid #d7dde5', borderRadius: 12, padding: 10, display: 'grid', gap: 8 };
const profileButtonStyle = { border: 0, padding: 0, background: 'transparent', textAlign: 'left' as const, display: 'grid', gap: 4, color: '#10233f', cursor: 'pointer' };
