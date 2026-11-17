import { Link } from 'react-router-dom';
import { DataWorkspaceHeader } from '../components/DataWorkspaceHeader';
import { MetricCard, MetricGrid, Panel } from '../components/section-kit';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';

export function DataHomePage() {
  const { activeEgi, currentUser } = useEgi();
  const destinations = [
    { label: 'Fuentes', description: 'Inventario de entradas institucionales.', to: '/admin/sources?view=sources', permission: 'sources.read' },
    { label: 'Importar', description: 'Carga guiada de archivos CSV y Excel.', to: '/admin/sources?view=imports', permission: 'imports.upload' },
    { label: 'Calidad', description: 'Resultados de validación y responsables.', to: '/admin/validations', permission: 'validations.read' },
    { label: 'Pendientes', description: 'Lotes fallidos o con observaciones.', to: '/admin/sources?view=pending', permission: 'imports.read' },
    { label: 'Documentos', description: 'Archivos, versiones y metadatos.', to: '/admin/files', permission: 'files.read' },
    { label: 'Historial', description: 'Trazabilidad completa de importaciones.', to: '/admin/sources?view=history', permission: 'imports.read' },
  ].filter((item) => hasPermission(currentUser, item.permission));

  return <section>
    <DataWorkspaceHeader
      description="Fuentes, importaciones, calidad y documentos."
      primaryAction={hasPermission(currentUser, 'imports.upload') ? <Link className="reports-button reports-button--primary" to="/admin/sources?view=imports">Importar</Link> : undefined}
    />
    <MetricGrid>
      <MetricCard label="EGI activo" value={activeEgi?.code ?? '—'} hint={activeEgi?.name ?? 'Sin espacio seleccionado'} icon="globe" />
      <MetricCard label="Funciones disponibles" value={String(destinations.length)} hint="Determinadas por los permisos de la sesión." icon="database" tone="good" />
    </MetricGrid>
    <Panel title="Acciones" subtitle="Opciones disponibles para tu perfil." icon="flow">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        {destinations.map((item) => <Link key={item.to} to={item.to} style={cardStyle}>
          <strong>{item.label}</strong><span>{item.description}</span>
        </Link>)}
      </div>
    </Panel>
  </section>;
}

const cardStyle = {
  border: '1px solid #d7dde5', borderRadius: 12, padding: 12, display: 'grid', gap: 5,
  color: '#10233f', textDecoration: 'none', background: '#fff',
};
