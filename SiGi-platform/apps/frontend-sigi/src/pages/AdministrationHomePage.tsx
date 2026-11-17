import { Link } from 'react-router-dom';
import { AdministrationWorkspaceHeader } from '../components/AdministrationWorkspaceHeader';
import { MessageBlock, MetricCard, MetricGrid, Panel, PanelGrid } from '../components/section-kit';
import { useEgi } from '../contexts/EgiContext';
import { canAccessCapability } from '../app/capabilities';

const ADMIN_ROLES = ['superadmin', 'admin', 'national_admin', 'egi_admin'];

type AdministrationDestination = {
  group: 'institutional' | 'technical';
  label: string;
  description: string;
  to: string;
  permissions: string[];
  permissionMatch?: 'all' | 'any';
  roles?: string[];
};

const destinations: AdministrationDestination[] = [
  {
    group: 'institutional',
    label: 'Espacios de gestión',
    description: 'Identidad, alcance y gobierno del EGI activo.',
    to: '/admin/egi',
    permissions: ['egi.update'],
    roles: ['superadmin', 'national_admin', 'institution_editor'],
  },
  {
    group: 'institutional',
    label: 'Instituciones',
    description: 'Entidades participantes, estados y coordinación.',
    to: '/admin/institutions',
    permissions: ['institutions.read'],
  },
  {
    group: 'institutional',
    label: 'Usuarios',
    description: 'Accesos, alcance institucional y estado de las cuentas.',
    to: '/admin/users',
    permissions: ['users.read'],
  },
  {
    group: 'institutional',
    label: 'Roles y permisos',
    description: 'Perfiles autorizados y capacidades efectivas.',
    to: '/admin/users?view=roles',
    permissions: ['roles.read', 'permissions.read'],
    permissionMatch: 'any',
  },
  {
    group: 'technical',
    label: 'Conectores',
    description: 'Conexiones, credenciales, mapeos y ejecución técnica.',
    to: '/admin/connectors',
    permissions: ['connectors.read', 'connectors.update', 'connectors.run'],
    permissionMatch: 'any',
  },
  {
    group: 'technical',
    label: 'Publicaciones',
    description: 'Canales, colas y salidas institucionales.',
    to: '/admin/publications',
    permissions: ['publications.read'],
  },
  {
    group: 'technical',
    label: 'Auditoría',
    description: 'Eventos, actores y trazabilidad del sistema.',
    to: '/admin/audit',
    permissions: ['audit.read'],
  },
  {
    group: 'technical',
    label: 'API y operación',
    description: 'Servicios, exportaciones y mantenimiento controlado.',
    to: '/admin/api',
    permissions: ['audit.read'],
  },
];

export function AdministrationHomePage() {
  const { activeEgi, currentUser } = useEgi();
  const visibleDestinations = destinations.filter((item) => canAccessCapability({
    permissions: item.permissions,
    permissionMatch: item.permissionMatch,
    roles: item.roles,
  }, currentUser));
  const institutional = visibleDestinations.filter((item) => item.group === 'institutional');
  const technical = visibleDestinations.filter((item) => item.group === 'technical');

  return (
    <section>
      <AdministrationWorkspaceHeader description={`${visibleDestinations.length} funciones disponibles para tu perfil`} />
      <MetricGrid>
        <MetricCard label="EGI activo" value={activeEgi?.code ?? '—'} hint={activeEgi?.name ?? 'Sin espacio seleccionado'} icon="globe" />
        <MetricCard label="Funciones autorizadas" value={String(visibleDestinations.length)} hint="Calculadas desde roles y permisos efectivos." icon="status" tone="good" />
        <MetricCard label="Gobierno institucional" value={String(institutional.length)} hint="Espacios, instituciones, usuarios, roles y permisos." icon="users" />
        <MetricCard label="Operación técnica" value={String(technical.length)} hint="Conectores, publicaciones, auditoría y servicios." icon="flow" />
      </MetricGrid>
      {visibleDestinations.length === 0 ? (
        <MessageBlock tone="danger">Tu sesión no tiene capacidades administrativas habilitadas.</MessageBlock>
      ) : (
        <PanelGrid>
          <Panel title="Administración institucional" subtitle="Identidad, participantes y control de acceso." icon="users">
            <DestinationGrid items={institutional} />
          </Panel>
          <Panel title="Administración técnica" subtitle="Integraciones, publicación, trazabilidad y soporte." icon="flow">
            <DestinationGrid items={technical} />
          </Panel>
        </PanelGrid>
      )}
    </section>
  );
}

function DestinationGrid(props: { items: AdministrationDestination[] }) {
  if (props.items.length === 0) {
    return <MessageBlock>No hay funciones disponibles para este perfil.</MessageBlock>;
  }
  return (
    <div className="sigi-administration-grid">
      {props.items.map((item) => (
        <Link className="sigi-administration-card" key={item.to} to={item.to}>
          <strong>{item.label}</strong>
          <span>{item.description}</span>
        </Link>
      ))}
    </div>
  );
}
