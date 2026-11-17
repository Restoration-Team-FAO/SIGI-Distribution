import type { ReactNode } from 'react';
import { ModuleWorkspaceHeader } from './ModuleWorkspaceHeader';

const ADMIN_ROLES = ['superadmin', 'admin', 'national_admin', 'egi_admin'];

export function AdministrationWorkspaceHeader(props: {
  description: string;
  primaryAction?: ReactNode;
}) {
  return (
    <ModuleWorkspaceHeader
      eyebrow="Gobierno · Administración"
      title="Administración"
      description={props.description}
      primaryAction={props.primaryAction}
      tabs={[
        {
          label: 'Resumen',
          to: '/admin/administration',
          requiredPermissions: [
            'egi.update',
            'institutions.read',
            'users.read',
            'roles.read',
            'permissions.read',
            'connectors.read',
            'connectors.update',
            'publications.read',
            'audit.read',
          ],
          permissionMatch: 'any',
          requiredRoles: ADMIN_ROLES,
        },
        { label: 'Espacios', to: '/admin/egi' },
        { label: 'Instituciones', to: '/admin/institutions', requiredPermissions: ['institutions.read'] },
        {
          label: 'Usuarios y roles',
          to: '/admin/users',
          requiredPermissions: ['users.read', 'roles.read', 'permissions.read'],
          permissionMatch: 'any',
        },
        {
          label: 'Conectores',
          to: '/admin/connectors',
          requiredPermissions: ['connectors.read', 'connectors.update', 'connectors.run'],
          permissionMatch: 'any',
        },
        { label: 'Publicaciones', to: '/admin/publications', requiredPermissions: ['publications.read'] },
        { label: 'Auditoría', to: '/admin/audit', requiredPermissions: ['audit.read'] },
        { label: 'API', to: '/admin/api', requiredPermissions: ['audit.read'] },
      ]}
    />
  );
}
