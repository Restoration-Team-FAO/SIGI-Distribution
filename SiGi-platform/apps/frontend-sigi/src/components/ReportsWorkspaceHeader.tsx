import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleWorkspaceHeader } from './ModuleWorkspaceHeader';

export function ReportsWorkspaceHeader(props: {
  title?: string;
  description: string;
  primaryAction?: ReactNode;
  configuration?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const contextualPath = (path: string, keys: string[]) => {
    const next = new URLSearchParams();
    for (const key of keys) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `${path}?${query}` : path;
  };

  return (
    <ModuleWorkspaceHeader
      eyebrow={props.configuration ? 'Configuración · Informes' : 'Operación · Informes'}
      title={props.title ?? 'Informes'}
      description={props.description}
      primaryAction={props.primaryAction}
      configurationPath={props.configuration ? undefined : '/admin/reports/config'}
      configurationPermissions={['reports.config.manage', 'reports.mappings.manage', 'reports.templates.manage']}
      tabs={props.configuration ? [
        { label: 'Mapeos', to: '/admin/reports/config', requiredPermissions: ['reports.mappings.manage'] },
        { label: 'Plantillas', to: '/admin/reports/templates', requiredPermissions: ['reports.templates.manage'] },
        { label: 'Programación', to: '/admin/reports/schedules', requiredPermissions: ['reports.commitments.manage'] },
      ] : [
        { label: 'Catálogo', to: '/admin/reports', requiredPermissions: ['reports.read'] },
        { label: 'Generar', to: '/admin/reports/new', requiredPermissions: ['reports.create'] },
        { label: 'Compromisos', to: contextualPath('/admin/reports/commitments', ['calendarView', 'year', 'month', 'commitmentStatus', 'commitmentUrgency', 'institutionId']), requiredPermissions: ['reports.read'] },
        { label: 'Historial', to: contextualPath('/admin/reports/history', ['q', 'status', 'framework', 'projectId', 'documentId']), requiredPermissions: ['reports.read'] },
      ]}
    />
  );
}
