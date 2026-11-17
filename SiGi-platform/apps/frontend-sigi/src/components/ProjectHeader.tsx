import { Link } from 'react-router-dom';
import type { Project, ProjectPortfolio } from '@sigi/domain';
import { Badge, Breadcrumb, Button } from '@sigi/ui';

export function ProjectHeader(props: {
  project: Project;
  portfolio?: ProjectPortfolio | null;
  alertCount: number;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const project = props.project;
  return (
    <header className="project-header">
      <Breadcrumb items={[{ label: 'Proyectos', href: '/projects' }, { label: project.title }]} />
      <div className="project-header__main">
        <div className="project-header__identity">
          <div className="project-header__eyebrow">
            <span>{project.code ?? 'Sin código'}</span>
            <Badge tone={project.status === 'active' || project.status === 'published' ? 'success' : 'neutral'}>
              {projectStatus(project.status)}
            </Badge>
            {props.alertCount > 0 ? <Badge tone="warning">{props.alertCount} alerta{props.alertCount === 1 ? '' : 's'}</Badge> : null}
          </div>
          <h1>{project.title}</h1>
          <p>{project.theme ?? project.summary ?? 'Proyecto institucional'}</p>
        </div>
        <div className="project-header__actions">
          {props.canEdit ? <Button type="button" onClick={props.onEdit}>Editar proyecto</Button> : null}
          <Link className="sigi-ui-button sigi-ui-button--secondary" to={`/admin/geobi?view=viewer&projectId=${encodeURIComponent(project.id)}`}>Ver en mapa</Link>
          <Link className="sigi-ui-button sigi-ui-button--secondary" to={`/admin/reports/new?projectId=${encodeURIComponent(project.id)}`}>Generar informe</Link>
          <details className="project-header__menu">
            <summary aria-label="Más acciones">⋯</summary>
            <div>
              <Link to={`/admin/reports/history?projectId=${encodeURIComponent(project.id)}`}>Ver historial de informes</Link>
              <Link to={`/projects/${encodeURIComponent(project.id)}/activity`}>Ver actividad</Link>
            </div>
          </details>
        </div>
      </div>
      <dl className="project-header__facts">
        <div><dt>Institución líder</dt><dd>{project.institutionName ?? 'Sin institución'}</dd></div>
        <div><dt>Portafolio</dt><dd>{props.portfolio?.name ?? project.portfolioName ?? 'Sin portafolio'}</dd></div>
        <div><dt>Avance</dt><dd>{project.progressPct ?? 0}%</dd></div>
        <div><dt>Periodo</dt><dd>{formatYear(project.startDate)}–{formatYear(project.endDate)}</dd></div>
        <div><dt>Área</dt><dd>{typeof project.areaHa === 'number' ? `${project.areaHa.toLocaleString('es-CR')} ha` : 'Sin dato'}</dd></div>
      </dl>
    </header>
  );
}

function formatYear(value?: string | null) {
  return value ? value.slice(0, 4) : '—';
}

function projectStatus(status: string) {
  return ({ draft: 'Borrador', active: 'Activo', completed: 'Completado', published: 'Publicado' } as Record<string, string>)[status] ?? status;
}
