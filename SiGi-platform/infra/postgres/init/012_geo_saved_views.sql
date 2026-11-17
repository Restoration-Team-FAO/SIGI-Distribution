-- P1-4 — Análisis guardados / vistas guardadas (spec §19).
--
-- A saved view snapshots which layers were active, with what color/opacity/
-- filters, so a user can restore that exact configuration later without
-- re-building it by hand. Owned by a real user (core.users); there is no
-- anonymous variant because saved views require an authenticated owner.
-- see docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.14 for the full design rationale.
--
-- view_state is a JSONB snapshot, not individual columns: it is UI state
-- (active layer codes, colors, opacities, per-layer filters), not a domain
-- entity this schema needs to query or join on. Over-normalizing it into
-- columns would only add migration churn every time the frontend's captured
-- state gains a field.

CREATE TABLE IF NOT EXISTS gis.geo_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  view_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS geo_saved_views_user_id_idx
  ON gis.geo_saved_views (user_id);

COMMENT ON TABLE gis.geo_saved_views IS
  'P1-4 saved map configurations (spec §19) — owned by a user, restorable '
  'later. view_state is a JSONB UI-state snapshot (active layers, colors, '
  'opacity, filters), deliberately not normalized into columns.';
