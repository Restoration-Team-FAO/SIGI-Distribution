import type { ReportInstance } from '@sigi/domain';

export const projectWorkspaceViews = [
  'summary',
  'planning',
  'schedule',
  'budget',
  'risks',
  'monitoring',
  'governance',
  'portfolio',
  'actors',
  'milestones',
  'indicators',
  'territory',
  'deliverables',
  'documents',
  'reports',
  'activity',
] as const;

export type ProjectWorkspaceView = (typeof projectWorkspaceViews)[number];

export function parseProjectWorkspaceView(value: string | null): ProjectWorkspaceView {
  return projectWorkspaceViews.includes(value as ProjectWorkspaceView)
    ? (value as ProjectWorkspaceView)
    : 'summary';
}

export function projectWorkspacePath(view: ProjectWorkspaceView, projectId?: string | null) {
  if (!projectId) return '/projects';
  return view === 'summary'
    ? `/projects/${encodeURIComponent(projectId)}`
    : `/projects/${encodeURIComponent(projectId)}/${view}`;
}

export function legacyProjectWorkspacePath(view: ProjectWorkspaceView, projectId: string) {
  const params = new URLSearchParams({ view, projectId });
  return `/admin/projects?${params.toString()}`;
}

export function reportIncludesProject(report: ReportInstance, projectId: string) {
  const projects = report.selection?.projects;
  return Array.isArray(projects) && projects.some((value) => value === projectId);
}
