import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleWorkspaceHeader } from './ModuleWorkspaceHeader';

export function DataWorkspaceHeader(props: {
  description: string;
  primaryAction?: ReactNode;
}) {
  const [searchParams] = useSearchParams();
  const dataViewPath = (view: 'pending' | 'history') => {
    const next = new URLSearchParams();
    next.set('view', view);
    for (const key of ['entity', 'status', 'attention', 'q']) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    return `/admin/sources?${next.toString()}`;
  };

  return (
    <ModuleWorkspaceHeader
      eyebrow="Operación · Datos"
      title="Datos"
      description={props.description}
      primaryAction={props.primaryAction}
      configurationPath="/admin/data/config"
      configurationPermissions={['data.configure', 'sources.update', 'connectors.update']}
      tabs={[
        { label: 'Fuentes', to: '/admin/sources?view=sources', requiredPermissions: ['sources.read'] },
        { label: 'Importar', to: '/admin/sources?view=imports', requiredPermissions: ['imports.upload'] },
        { label: 'Calidad', to: '/admin/validations', requiredPermissions: ['validations.read'] },
        { label: 'Pendientes', to: dataViewPath('pending'), requiredPermissions: ['imports.read'] },
        { label: 'Documentos', to: '/admin/files', requiredPermissions: ['files.read'] },
        { label: 'Historial', to: dataViewPath('history'), requiredPermissions: ['imports.read'] },
      ]}
    />
  );
}
