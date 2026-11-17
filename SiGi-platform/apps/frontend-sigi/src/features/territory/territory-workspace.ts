export const territoryWorkspaceViews = ['viewer', 'catalog', 'analysis'] as const;

export type TerritoryWorkspaceView = (typeof territoryWorkspaceViews)[number];

export function parseTerritoryWorkspaceView(value: string | null): TerritoryWorkspaceView {
  return territoryWorkspaceViews.includes(value as TerritoryWorkspaceView)
    ? (value as TerritoryWorkspaceView)
    : 'viewer';
}

export function territoryWorkspacePath(view: TerritoryWorkspaceView, projectId?: string | null) {
  const params = new URLSearchParams({ view });
  if (projectId) params.set('projectId', projectId);
  return `/admin/geobi?${params.toString()}`;
}
