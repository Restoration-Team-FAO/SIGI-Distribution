import { AuthPrincipal } from '../../modules/auth/auth.types';

/**
 * Single source of truth for gis.geo_layers visibility, shared by every
 * module that reads geo layers (geo-bi, territories, and the future
 * geo/* module in P0-3) so the definition of "public" and "who may read
 * non-public layers" is not duplicated per caller.
 *
 * The hierarchy mirrors gis.geo_visibility_rank() in
 * infra/postgres/init/011_geo_layer_intelligence.sql — see
 * docs/geo/permissions.md for the full rationale, including why the
 * pre-existing 'private'/'internal' rows are not reclassified and why
 * enforcement below is still binary (public / non-public) rather than
 * per-tier.
 */
export const GEO_VISIBILITY_LEVELS = [
  { value: 'public', rank: 0, label: 'Pública', legacy: false },
  { value: 'institutional', rank: 1, label: 'Institucional', legacy: false },
  { value: 'internal', rank: 1, label: 'Interna', legacy: true },
  { value: 'restricted', rank: 2, label: 'Restringida', legacy: false },
  { value: 'private', rank: 3, label: 'Privada', legacy: true },
] as const;

export type GeoVisibilityValue = (typeof GEO_VISIBILITY_LEVELS)[number]['value'];

/**
 * Permission that gates every non-public geo layer today. Deliberately a
 * single flat bar — matching current production behavior — rather than one
 * permission per tier. `geo.layers.read_institutional` /
 * `read_restricted` / `read_private` exist in `core.permissions` as inert
 * scaffolding for a future per-tier policy; nothing checks them yet.
 */
export const GEO_NON_PUBLIC_LAYERS_PERMISSION = 'connectors.read';

export function isPublicGeoVisibility(value: string): boolean {
  return value === 'public';
}

/**
 * Whether `principal` may read geo layers whose visibility is not
 * `'public'`. `null` means anonymous — always `false`.
 */
export function principalCanReadNonPublicGeoLayers(
  principal: AuthPrincipal | null | undefined,
): boolean {
  if (!principal) {
    return false;
  }

  return principal.permissions.includes(GEO_NON_PUBLIC_LAYERS_PERMISSION);
}

/**
 * SQL fragment equivalent to gis.geo_visibility_is_public(<alias>.visibility),
 * gated by whether the caller may see non-public layers. Kept as a helper so
 * every caller reads the same fragment instead of re-deriving it inline.
 */
export function buildGeoLayerVisibilitySql(alias: string, includeNonPublic: boolean): string {
  return includeNonPublic ? 'TRUE' : `gis.geo_visibility_is_public(${alias}.visibility)`;
}
