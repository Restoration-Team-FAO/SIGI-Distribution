export const GEO_NOT_AVAILABLE = 'No disponible';

export const GEO_NEARBY_RADIUS_OPTIONS = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
] as const;

export function getGeoFeatureProjectContext(properties: Record<string, unknown>) {
  return {
    projectId: typeof properties.projectId === 'string' ? properties.projectId : null,
    projectTitle: typeof properties.projectTitle === 'string' ? properties.projectTitle : null,
  };
}

export function formatGeoDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString('es-CR', { maximumFractionDigits: 1 })} km`
    : `${Math.round(meters).toLocaleString('es-CR')} m`;
}

export function formatGeoDate(value: string | null | undefined) {
  if (!value) return GEO_NOT_AVAILABLE;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatGeoArea(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric)
    ? `${numeric.toLocaleString('es-CR', { maximumFractionDigits: 2 })} ha`
    : GEO_NOT_AVAILABLE;
}

export function geoTextOrFallback(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : GEO_NOT_AVAILABLE;
}
