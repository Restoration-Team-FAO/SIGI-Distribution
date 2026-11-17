\set ON_ERROR_STOP on

-- SIGI Costa Rica demo dataset.
-- Opt-in and idempotent: deterministic IDs/codes allow safe re-application.
-- Geographic shapes are illustrative demo geometries, not official boundaries.

BEGIN;

-- Reuse the validated national EGI and the existing authenticated users.
INSERT INTO core.institutions (id, code, name, status, updated_at)
VALUES
  ('ef5d5978-2da3-413c-9a4d-f29022443735', 'minae-cr', 'Ministerio de Ambiente y Energía (MINAE)', 'active', NOW()),
  ('3c14d133-a47e-4f97-96a3-82cf506c84b8', 'sinac-cr', 'Sistema Nacional de Áreas de Conservación (SINAC)', 'active', NOW()),
  ('8d5d4d5c-24b3-4b93-9c4e-c8be38d70431', 'minsa-cr', 'Ministerio de Salud de Costa Rica', 'active', NOW()),
  ('10000000-0000-4000-8000-000000000004', 'mag-cr', 'Ministerio de Agricultura y Ganadería (MAG)', 'active', NOW()),
  ('10000000-0000-4000-8000-000000000005', 'aya-cr', 'Instituto Costarricense de Acueductos y Alcantarillados (AyA)', 'active', NOW()),
  ('10000000-0000-4000-8000-000000000006', 'fonafifo-cr', 'Fondo Nacional de Financiamiento Forestal (FONAFIFO)', 'active', NOW())
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Autónomo: crea el EGI demostrativo si la instancia está vacía (perfil empty-demo / entorno de pruebas).
INSERT INTO core.egi_spaces (id, institution_id, code, name, description, responsible, territorial_scope, thematic_scope, visibility, status, updated_at)
VALUES (
  '21b82169-17c9-4b36-87a6-8b827a2b7fe9',
  'ef5d5978-2da3-413c-9a4d-f29022443735',
  'cr-demo-nacional',
  'SIGI Costa Rica — Demo Nacional',
  'Espacio demostrativo para restauración, biodiversidad, agua y acción climática en Costa Rica.',
  'MINAE — Unidad SIGI',
  'Costa Rica',
  'Restauración, biodiversidad, agua y clima',
  'institutional',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  institution_id = EXCLUDED.institution_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  responsible = EXCLUDED.responsible,
  territorial_scope = EXCLUDED.territorial_scope,
  thematic_scope = EXCLUDED.thematic_scope,
  visibility = EXCLUDED.visibility,
  status = 'active',
  updated_at = NOW();

INSERT INTO core.egi_memberships (egi_id, user_id, role_code, membership_status, permissions_json, updated_at)
SELECT
  '21b82169-17c9-4b36-87a6-8b827a2b7fe9'::uuid,
  u.id,
  CASE
    WHEN EXISTS (SELECT 1 FROM core.user_roles ur JOIN core.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code IN ('superadmin', 'national_admin')) THEN 'egi_owner'
    WHEN EXISTS (SELECT 1 FROM core.user_roles ur JOIN core.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code IN ('institution_editor', 'technical_integration')) THEN 'egi_editor'
    WHEN EXISTS (SELECT 1 FROM core.user_roles ur JOIN core.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'technical_validator') THEN 'egi_validator'
    ELSE 'egi_viewer'
  END,
  'active',
  '[]'::jsonb,
  NOW()
FROM core.users u
ON CONFLICT (egi_id, user_id) DO UPDATE SET
  role_code = EXCLUDED.role_code,
  membership_status = 'active',
  updated_at = NOW();

INSERT INTO core.user_preferences (user_id, active_egi_id, preferences_json, last_egi_selected_at, updated_at)
SELECT id, '21b82169-17c9-4b36-87a6-8b827a2b7fe9'::uuid, '{}'::jsonb, NOW(), NOW()
FROM core.users
ON CONFLICT (user_id) DO UPDATE SET
  active_egi_id = EXCLUDED.active_egi_id,
  last_egi_selected_at = NOW(),
  updated_at = NOW();

-- Remove only the two legacy Salvadoran demo shapes so the default map extent is Costa Rica.
DELETE FROM gis.territory_features
WHERE territory_id IN (SELECT id FROM core.territories WHERE code IN ('sv-centro', 'sv-occidente'));
DELETE FROM core.project_territories
WHERE territory_id IN (SELECT id FROM core.territories WHERE code IN ('sv-centro', 'sv-occidente'));
DELETE FROM core.territories WHERE code IN ('sv-centro', 'sv-occidente');
DELETE FROM core.territories WHERE code = 'sv' AND NOT EXISTS (
  SELECT 1 FROM core.territories child WHERE child.parent_territory_id = core.territories.id
);

INSERT INTO core.territories (id, code, name, level, parent_territory_id, status, updated_at)
VALUES ('40000000-0000-4000-8000-000000000001', 'cr', 'Costa Rica', 'country', NULL, 'active', NOW())
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, level = EXCLUDED.level, status = 'active', updated_at = NOW();

INSERT INTO core.territories (id, code, name, level, parent_territory_id, status, updated_at)
VALUES
  ('40000000-0000-4000-8000-000000000011', 'cr-chorotega', 'Región Chorotega', 'region', (SELECT id FROM core.territories WHERE code = 'cr'), 'active', NOW()),
  ('40000000-0000-4000-8000-000000000012', 'cr-huetar-norte', 'Región Huetar Norte', 'region', (SELECT id FROM core.territories WHERE code = 'cr'), 'active', NOW()),
  ('40000000-0000-4000-8000-000000000013', 'cr-central', 'Región Central', 'region', (SELECT id FROM core.territories WHERE code = 'cr'), 'active', NOW()),
  ('40000000-0000-4000-8000-000000000014', 'cr-pacifico-central', 'Región Pacífico Central', 'region', (SELECT id FROM core.territories WHERE code = 'cr'), 'active', NOW()),
  ('40000000-0000-4000-8000-000000000015', 'cr-brunca', 'Región Brunca', 'region', (SELECT id FROM core.territories WHERE code = 'cr'), 'active', NOW()),
  ('40000000-0000-4000-8000-000000000016', 'cr-caribe', 'Región Huetar Caribe', 'region', (SELECT id FROM core.territories WHERE code = 'cr'), 'active', NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  parent_territory_id = EXCLUDED.parent_territory_id,
  status = 'active',
  updated_at = NOW();

INSERT INTO gis.geo_layers (id, code, name, layer_type, visibility, status, description, category, group_name, geometry_type, crs, sort_order, updated_at)
VALUES
  ('ea0f06b8-cad1-468c-baa4-5d3a9f863b12', 'territories', 'Regiones de planificación — Costa Rica', 'boundary', 'public', 'published', 'Geometrías ilustrativas para la demostración SIGI Costa Rica.', 'territory', 'Contexto territorial', 'MultiPolygon', 'EPSG:4326', 10, NOW()),
  ('60000000-0000-4000-8000-000000000002', 'project_polygons', 'Polígonos de proyectos — Costa Rica', 'project-polygon', 'public', 'published', 'Coberturas demostrativas de proyectos dentro de Costa Rica.', 'projects', 'Operación territorial', 'MultiPolygon', 'EPSG:4326', 20, NOW()),
  ('60000000-0000-4000-8000-000000000003', 'corredor_seco', 'Corredor Seco de Costa Rica — Demo', 'reference', 'public', 'published', 'Áreas ilustrativas para análisis de resiliencia hídrica y productiva.', 'climate', 'Capas de referencia', 'MultiPolygon', 'EPSG:4326', 30, NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  layer_type = EXCLUDED.layer_type,
  visibility = EXCLUDED.visibility,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  group_name = EXCLUDED.group_name,
  geometry_type = EXCLUDED.geometry_type,
  crs = EXCLUDED.crs,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

WITH shapes(id, code, wkt) AS (
  VALUES
    ('50000000-0000-4000-8000-000000000011'::uuid, 'cr-chorotega', 'POLYGON((-86.05 11.15,-85.55 11.25,-85.00 11.10,-84.95 10.78,-85.18 10.45,-85.55 10.30,-85.92 10.48,-86.15 10.72,-86.05 11.15))'),
    ('50000000-0000-4000-8000-000000000012'::uuid, 'cr-huetar-norte', 'POLYGON((-85.25 11.12,-84.70 11.28,-84.10 11.18,-83.72 10.88,-83.92 10.50,-84.45 10.38,-84.95 10.52,-85.25 10.78,-85.25 11.12))'),
    ('50000000-0000-4000-8000-000000000013'::uuid, 'cr-central', 'POLYGON((-84.95 10.55,-84.48 10.58,-83.95 10.42,-83.78 10.05,-84.05 9.72,-84.55 9.65,-84.92 9.88,-85.02 10.20,-84.95 10.55))'),
    ('50000000-0000-4000-8000-000000000014'::uuid, 'cr-pacifico-central', 'POLYGON((-85.35 10.18,-84.95 10.20,-84.62 9.92,-84.42 9.50,-84.62 9.18,-85.02 9.02,-85.32 9.28,-85.46 9.72,-85.35 10.18))'),
    ('50000000-0000-4000-8000-000000000015'::uuid, 'cr-brunca', 'POLYGON((-84.65 9.55,-84.18 9.68,-83.70 9.50,-83.20 9.15,-82.83 8.62,-83.02 8.08,-83.62 8.12,-84.20 8.35,-84.62 8.78,-84.80 9.20,-84.65 9.55))'),
    ('50000000-0000-4000-8000-000000000016'::uuid, 'cr-caribe', 'POLYGON((-83.92 10.88,-83.42 10.98,-82.78 10.70,-82.55 10.25,-82.62 9.72,-82.90 9.30,-83.25 9.22,-83.62 9.62,-83.88 10.20,-83.92 10.88))')
), normalized AS (
  SELECT id, code, ST_Multi(ST_GeomFromText(wkt, 4326)) AS geom FROM shapes
)
INSERT INTO gis.territory_features (id, territory_id, layer_id, area_ha, geometry, properties_json, updated_at)
SELECT
  n.id,
  t.id,
  (SELECT id FROM gis.geo_layers WHERE code = 'territories'),
  ROUND((ST_Area(n.geom::geography) / 10000)::numeric, 2),
  n.geom,
  jsonb_build_object('code', t.code, 'name', t.name, 'level', t.level, 'country', 'Costa Rica', 'demo', true),
  NOW()
FROM normalized n JOIN core.territories t ON t.code = n.code
ON CONFLICT (id) DO UPDATE SET
  territory_id = EXCLUDED.territory_id,
  layer_id = EXCLUDED.layer_id,
  area_ha = EXCLUDED.area_ha,
  geometry = EXCLUDED.geometry,
  properties_json = EXCLUDED.properties_json,
  updated_at = NOW();

-- Institutional data pipeline.
INSERT INTO core.connectors (id, institution_id, connector_type, display_name, status, config_json, last_sync_at, updated_at)
VALUES
  ('70000000-0000-4000-8000-000000000001', 'ef5d5978-2da3-413c-9a4d-f29022443735', 'api', 'API Monitoreo Ambiental MINAE', 'active', '{"mode":"demo","country":"Costa Rica"}', NOW() - INTERVAL '2 hours', NOW()),
  ('70000000-0000-4000-8000-000000000002', '3c14d133-a47e-4f97-96a3-82cf506c84b8', 'postgis', 'PostGIS Coberturas SINAC', 'active', '{"schema":"demo_cr","srid":4326}', NOW() - INTERVAL '4 hours', NOW()),
  ('70000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'kobo', 'Kobo Restauración Productiva MAG', 'active', '{"mode":"demo","country":"Costa Rica"}', NOW() - INTERVAL '7 hours', NOW())
ON CONFLICT (id) DO UPDATE SET institution_id=EXCLUDED.institution_id, connector_type=EXCLUDED.connector_type, display_name=EXCLUDED.display_name, status='active', config_json=EXCLUDED.config_json, last_sync_at=EXCLUDED.last_sync_at, updated_at=NOW();

INSERT INTO core.data_sources (id, institution_id, connector_id, code, name, source_type, status, config_json, last_ingested_at, egi_id, updated_at)
VALUES
  ('71000000-0000-4000-8000-000000000001', 'ef5d5978-2da3-413c-9a4d-f29022443735', '70000000-0000-4000-8000-000000000001', 'cr-monitoreo-ambiental', 'Monitoreo ambiental nacional', 'api', 'active', '{"frequency":"daily","demo":true}', NOW() - INTERVAL '2 hours', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW()),
  ('71000000-0000-4000-8000-000000000002', '3c14d133-a47e-4f97-96a3-82cf506c84b8', '70000000-0000-4000-8000-000000000002', 'cr-coberturas-sinac', 'Coberturas de conservación SINAC', 'postgis', 'active', '{"frequency":"monthly","demo":true}', NOW() - INTERVAL '4 hours', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW()),
  ('71000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000003', 'cr-restauracion-productiva', 'Seguimiento de fincas y restauración productiva', 'kobo', 'active', '{"frequency":"weekly","demo":true}', NOW() - INTERVAL '7 hours', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW())
ON CONFLICT (code) DO UPDATE SET institution_id=EXCLUDED.institution_id, connector_id=EXCLUDED.connector_id, name=EXCLUDED.name, source_type=EXCLUDED.source_type, status='active', config_json=EXCLUDED.config_json, last_ingested_at=EXCLUDED.last_ingested_at, egi_id=EXCLUDED.egi_id, updated_at=NOW();

INSERT INTO core.datasets (id, institution_id, source_id, schema_code, title, status, egi_id, updated_at)
VALUES
  ('72000000-0000-4000-8000-000000000001', 'ef5d5978-2da3-413c-9a4d-f29022443735', '71000000-0000-4000-8000-000000000001', 'environmental_monitoring', 'Indicadores ambientales Costa Rica 2026', 'published', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW()),
  ('72000000-0000-4000-8000-000000000002', '3c14d133-a47e-4f97-96a3-82cf506c84b8', '71000000-0000-4000-8000-000000000002', 'conservation_coverage', 'Coberturas de conservación y restauración', 'published', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW()),
  ('72000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000003', 'productive_restoration', 'Restauración productiva en fincas', 'validated', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW())
ON CONFLICT (id) DO UPDATE SET institution_id=EXCLUDED.institution_id, source_id=EXCLUDED.source_id, schema_code=EXCLUDED.schema_code, title=EXCLUDED.title, status=EXCLUDED.status, egi_id=EXCLUDED.egi_id, updated_at=NOW();

INSERT INTO core.dataset_versions (id, dataset_id, version_number, status, submitted_by_user_id, payload_json, submitted_at, updated_at)
VALUES
  ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 1, 'approved', '11111111-1111-4111-8111-111111111111', '{"records":128,"country":"Costa Rica","demo":true}', NOW() - INTERVAL '2 hours', NOW()),
  ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', 1, 'approved', '11111111-1111-4111-8111-111111111111', '{"records":42,"country":"Costa Rica","demo":true}', NOW() - INTERVAL '4 hours', NOW()),
  ('73000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003', 1, 'validated_with_warnings', '11111111-1111-4111-8111-111111111111', '{"records":86,"country":"Costa Rica","demo":true}', NOW() - INTERVAL '7 hours', NOW())
ON CONFLICT (dataset_id, version_number) DO UPDATE SET status=EXCLUDED.status, submitted_by_user_id=EXCLUDED.submitted_by_user_id, payload_json=EXCLUDED.payload_json, submitted_at=EXCLUDED.submitted_at, updated_at=NOW();

INSERT INTO core.validation_results (id, dataset_version_id, rule_code, status, message, assigned_to_user_id, egi_id, updated_at)
VALUES
  ('74000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', 'territory_code_valid', 'passed', 'Todos los registros corresponden a territorios de Costa Rica.', '11111111-1111-4111-8111-111111111111', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW()),
  ('74000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002', 'geometry_valid', 'passed', 'Las geometrías son válidas y usan EPSG:4326.', '11111111-1111-4111-8111-111111111111', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW()),
  ('74000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000003', 'required_title', 'warning', 'Dos registros requieren completar el nombre de finca.', '11111111-1111-4111-8111-111111111111', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', NOW())
ON CONFLICT (id) DO UPDATE SET dataset_version_id=EXCLUDED.dataset_version_id, rule_code=EXCLUDED.rule_code, status=EXCLUDED.status, message=EXCLUDED.message, assigned_to_user_id=EXCLUDED.assigned_to_user_id, egi_id=EXCLUDED.egi_id, updated_at=NOW();

-- Portfolios and project operation.
INSERT INTO core.project_portfolios (id, code, name, description, objective, status, visibility, priority_label, updated_at)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'CR-REST-2030', 'Restauración de Paisajes Costa Rica 2030', 'Cartera demostrativa de restauración ecológica y productiva.', 'Recuperar conectividad, servicios ecosistémicos y resiliencia climática.', 'active', 'public', 'Prioridad nacional', NOW()),
  ('20000000-0000-4000-8000-000000000002', 'CR-AGUA-CLIMA', 'Agua y Resiliencia Climática', 'Cartera demostrativa para seguridad hídrica y adaptación.', 'Mejorar la resiliencia de cuencas y comunidades vulnerables.', 'active', 'public', 'Alta', NOW())
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, objective=EXCLUDED.objective, status='active', visibility='public', priority_label=EXCLUDED.priority_label, updated_at=NOW();

INSERT INTO core.projects (id, dataset_id, institution_id, title, status, area_ha, code, start_date, end_date, egi_id, portfolio_id, objective, summary, description, theme, priority, visibility, progress_pct, featured, updated_at)
VALUES
  ('30000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', '3c14d133-a47e-4f97-96a3-82cf506c84b8', 'Restauración del paisaje Osa–Golfo Dulce', 'active', 12850, 'CR-OSA-001', '2025-01-15', '2028-12-15', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', '20000000-0000-4000-8000-000000000001', 'Restaurar conectividad entre bosque, manglar y sistemas productivos.', 'Restauración participativa en la Región Brunca.', 'Proyecto demostrativo con monitoreo de cobertura, actores locales e hitos verificables.', 'Restauración ecológica', 'high', 'public', 46, true, NOW()),
  ('30000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'ef5d5978-2da3-413c-9a4d-f29022443735', 'Corredor Biológico San Juan–La Selva', 'active', 9400, 'CR-SJLS-002', '2024-07-01', '2027-06-30', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', '20000000-0000-4000-8000-000000000001', 'Fortalecer conectividad ecológica y monitoreo de biodiversidad.', 'Acciones de conectividad en Huetar Norte y Sarapiquí.', 'Proyecto demostrativo para integrar indicadores, parcelas y evidencia territorial.', 'Biodiversidad', 'high', 'public', 63, true, NOW()),
  ('30000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'Paisajes productivos resilientes del Tempisque', 'active', 7650, 'CR-TEMP-003', '2025-03-01', '2029-02-28', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', '20000000-0000-4000-8000-000000000002', 'Restaurar suelos y mejorar la eficiencia hídrica en fincas.', 'Adaptación productiva en el Corredor Seco de Guanacaste.', 'Proyecto demostrativo con fincas, cobertura y seguimiento de prácticas regenerativas.', 'Agricultura regenerativa', 'medium', 'public', 31, true, NOW()),
  ('30000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Seguridad hídrica en cuencas del Caribe Sur', 'planning', 5200, 'CR-CARIBE-004', '2026-07-01', '2030-06-30', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', '20000000-0000-4000-8000-000000000002', 'Proteger zonas de recarga y reducir vulnerabilidad hídrica.', 'Planificación hídrica participativa en Talamanca y Caribe Sur.', 'Proyecto demostrativo en formulación para mostrar estados y alertas tempranas.', 'Seguridad hídrica', 'medium', 'public', 12, false, NOW()),
  -- Proyecto INTERNO: no debe aparecer en el portal público, WMS/WFS ni /api/geo anónimo (V2-02/V2-06).
  ('30000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Piloto interno de pagos por servicios ambientales', 'active', 1800, 'CR-PSA-005', '2026-02-01', '2027-12-31', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', '20000000-0000-4000-8000-000000000001', 'Probar esquemas de pago por resultados con fincas privadas.', 'Piloto confidencial en negociación con propietarios.', 'Proyecto demostrativo de visibilidad interna para verificar la confidencialidad del SIGI.', 'Servicios ambientales', 'high', 'internal', 22, false, NOW())
ON CONFLICT (code) DO UPDATE SET dataset_id=EXCLUDED.dataset_id, institution_id=EXCLUDED.institution_id, title=EXCLUDED.title, status=EXCLUDED.status, area_ha=EXCLUDED.area_ha, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, egi_id=EXCLUDED.egi_id, portfolio_id=EXCLUDED.portfolio_id, objective=EXCLUDED.objective, summary=EXCLUDED.summary, description=EXCLUDED.description, theme=EXCLUDED.theme, priority=EXCLUDED.priority, visibility=EXCLUDED.visibility, progress_pct=EXCLUDED.progress_pct, featured=EXCLUDED.featured, updated_at=NOW();

INSERT INTO core.indicators (id, code, name, unit, category, current_value, updated_at)
VALUES
  ('75000000-0000-4000-8000-000000000001', 'CR-HA-REST', 'Hectáreas bajo restauración', 'ha', 'restoration', 8120, NOW()),
  ('75000000-0000-4000-8000-000000000002', 'CR-CONNECT', 'Conectividad ecológica mejorada', 'km', 'biodiversity', 184, NOW()),
  ('75000000-0000-4000-8000-000000000003', 'CR-FINCAS', 'Fincas con prácticas regenerativas', 'fincas', 'production', 236, NOW()),
  ('75000000-0000-4000-8000-000000000004', 'CR-AGUA', 'Fuentes de agua protegidas', 'fuentes', 'water', 47, NOW())
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, unit=EXCLUDED.unit, category=EXCLUDED.category, current_value=EXCLUDED.current_value, updated_at=NOW();

INSERT INTO core.project_indicators (id, project_id, indicator_code, indicator_name, unit, value_numeric, category, observed_at, baseline_value, target_value, updated_at)
VALUES
  ('76000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'CR-HA-REST', 'Hectáreas bajo restauración', 'ha', 3250, 'restoration', CURRENT_DATE - 30, 1200, 7000, NOW()),
  ('76000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'CR-CONNECT', 'Conectividad ecológica mejorada', 'km', 116, 'biodiversity', CURRENT_DATE - 30, 40, 180, NOW()),
  ('76000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'CR-FINCAS', 'Fincas con prácticas regenerativas', 'fincas', 96, 'production', CURRENT_DATE - 30, 20, 300, NOW()),
  ('76000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'CR-AGUA', 'Fuentes de agua protegidas', 'fuentes', 8, 'water', CURRENT_DATE - 30, 5, 60, NOW()),
  ('76000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', 'CR-HA-REST', 'Hectáreas bajo restauración', 'ha', 640, 'restoration', CURRENT_DATE - 30, 0, 1800, NOW())
ON CONFLICT (id) DO UPDATE SET project_id=EXCLUDED.project_id, indicator_code=EXCLUDED.indicator_code, indicator_name=EXCLUDED.indicator_name, unit=EXCLUDED.unit, value_numeric=EXCLUDED.value_numeric, category=EXCLUDED.category, observed_at=EXCLUDED.observed_at, baseline_value=EXCLUDED.baseline_value, target_value=EXCLUDED.target_value, updated_at=NOW();

INSERT INTO core.project_actors (id, project_id, actor_type, institution_id, display_name, role_label, status, updated_at)
VALUES
  ('78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'institution', '3c14d133-a47e-4f97-96a3-82cf506c84b8', 'SINAC — Área de Conservación Osa', 'Coordinación territorial', 'active', NOW()),
  ('78000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'institution', 'ef5d5978-2da3-413c-9a4d-f29022443735', 'MINAE — Programa Nacional de Corredores Biológicos', 'Coordinación nacional', 'active', NOW()),
  ('78000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'institution', '10000000-0000-4000-8000-000000000004', 'MAG — Región Chorotega', 'Implementación productiva', 'active', NOW()),
  ('78000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'institution', '10000000-0000-4000-8000-000000000005', 'AyA — Gestión de cuencas', 'Asistencia técnica', 'active', NOW()),
  ('78000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', 'institution', '10000000-0000-4000-8000-000000000006', 'FONAFIFO — Unidad de pagos', 'Coordinación del piloto', 'active', NOW())
ON CONFLICT (id) DO UPDATE SET project_id=EXCLUDED.project_id, actor_type=EXCLUDED.actor_type, institution_id=EXCLUDED.institution_id, display_name=EXCLUDED.display_name, role_label=EXCLUDED.role_label, status='active', updated_at=NOW();

INSERT INTO core.project_milestones (id, project_id, activity_code, title, description, due_date, completed_at, status, progress_pct, updated_at)
VALUES
  ('77000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'OSA-MON-01', 'Monitoreo de cobertura 2026', 'Levantamiento de parcelas y validación de cobertura.', CURRENT_DATE + 45, NULL, 'in_progress', 70, NOW()),
  ('77000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'SJLS-CON-01', 'Acuerdos de conectividad', 'Formalización de acuerdos con propietarios y organizaciones.', CURRENT_DATE - 20, CURRENT_DATE - 18, 'completed', 100, NOW()),
  ('77000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'TEMP-FIN-01', 'Escalamiento a 150 fincas', 'Incorporación y línea base productiva.', CURRENT_DATE + 75, NULL, 'in_progress', 54, NOW()),
  ('77000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'CAR-DIS-01', 'Diseño de intervención hídrica', 'Priorización de zonas de recarga y soluciones basadas en naturaleza.', CURRENT_DATE + 120, NULL, 'planned', 15, NOW())
ON CONFLICT (id) DO UPDATE SET project_id=EXCLUDED.project_id, activity_code=EXCLUDED.activity_code, title=EXCLUDED.title, description=EXCLUDED.description, due_date=EXCLUDED.due_date, completed_at=EXCLUDED.completed_at, status=EXCLUDED.status, progress_pct=EXCLUDED.progress_pct, updated_at=NOW();

INSERT INTO core.project_deliverables (id, project_id, code, title, deliverable_type, description, status, due_date, published_at, output_url, updated_at)
VALUES
  ('79000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'OSA-MAPA-2026', 'Mapa de áreas en restauración', 'map', 'Cobertura validada para revisión técnica.', 'published', CURRENT_DATE - 30, CURRENT_DATE - 25, '/admin/geobi?view=viewer&projectId=30000000-0000-4000-8000-000000000001', NOW()),
  ('79000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'SJLS-IND-2026', 'Ficha de conectividad ecológica', 'indicator-sheet', 'Indicadores y metodología del corredor.', 'published', CURRENT_DATE - 15, CURRENT_DATE - 12, '/admin/indicators?view=catalog', NOW()),
  ('79000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'TEMP-LINEA-BASE', 'Línea base de fincas', 'dataset', 'Consolidado de prácticas productivas.', 'in_progress', CURRENT_DATE + 30, NULL, NULL, NOW()),
  ('79000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'CAR-PLAN', 'Plan participativo de seguridad hídrica', 'plan', 'Documento en formulación.', 'planned', CURRENT_DATE + 100, NULL, NULL, NOW())
ON CONFLICT (project_id, code) DO UPDATE SET title=EXCLUDED.title, deliverable_type=EXCLUDED.deliverable_type, description=EXCLUDED.description, status=EXCLUDED.status, due_date=EXCLUDED.due_date, published_at=EXCLUDED.published_at, output_url=EXCLUDED.output_url, updated_at=NOW();

-- Demonstration planning workspaces: WBS, schedule, budget and risks.
INSERT INTO core.project_tasks (id, project_id, parent_task_id, owner_actor_id, task_type, code, title, description, start_date, end_date, status, progress_pct, weight, sort_order, updated_at)
VALUES
  ('84000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',NULL,'78000000-0000-4000-8000-000000000001','phase','OSA-F1','Preparación y línea base','Validación técnica, social y cartográfica del área de intervención.','2025-01-15','2025-09-30','done',100,20,10,NOW()),
  ('84000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001','activity','OSA-A1.1','Diagnóstico de conectividad','Análisis de fragmentación y priorización de corredores.','2025-02-01','2025-06-30','done',100,10,11,NOW()),
  ('84000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',NULL,'78000000-0000-4000-8000-000000000001','phase','OSA-F2','Restauración en campo','Implementación de restauración activa y regeneración asistida.','2025-10-01','2027-12-31','in_progress',44,55,20,NOW()),
  ('84000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','78000000-0000-4000-8000-000000000001','task','OSA-T2.1','Establecer parcelas piloto','Intervención inicial en 420 hectáreas priorizadas.','2025-10-15','2026-08-31','in_progress',68,25,21,NOW()),
  ('84000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','78000000-0000-4000-8000-000000000001','task','OSA-T2.2','Escalar restauración comunitaria','Ampliación a asociaciones productivas del Golfo Dulce.','2026-09-01','2027-12-31','planned',0,30,22,NOW()),
  ('84000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000002',NULL,'78000000-0000-4000-8000-000000000002','phase','SJLS-F1','Acuerdos de conectividad','Negociación y formalización con propietarios.','2024-07-01','2025-12-15','done',100,30,10,NOW()),
  ('84000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000002',NULL,'78000000-0000-4000-8000-000000000002','phase','SJLS-F2','Intervención y monitoreo','Restauración de pasos y monitoreo de biodiversidad.','2026-01-10','2027-06-30','in_progress',48,70,20,NOW()),
  ('84000000-0000-4000-8000-000000000008','30000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000007','78000000-0000-4000-8000-000000000002','task','SJLS-T2.1','Monitorear pasos de fauna','Instalación y lectura de cámaras trampa.','2026-02-01','2026-11-30','in_progress',58,35,21,NOW()),
  ('84000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000003',NULL,'78000000-0000-4000-8000-000000000003','phase','TEMP-F1','Diseño productivo','Línea base y planes de finca.','2025-03-01','2026-02-28','done',100,25,10,NOW()),
  ('84000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000003',NULL,'78000000-0000-4000-8000-000000000003','phase','TEMP-F2','Implementación regenerativa','Asistencia técnica, agua y cobertura arbórea.','2026-03-01','2028-08-31','in_progress',22,60,20,NOW()),
  ('84000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000003','task','TEMP-T2.1','Incorporar 150 fincas','Diagnóstico e implementación de prácticas regenerativas.','2026-03-01','2027-04-30','in_progress',32,35,21,NOW()),
  ('84000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000004',NULL,'78000000-0000-4000-8000-000000000004','phase','CAR-F1','Formulación participativa','Diseño territorial y acuerdos de gobernanza.','2026-07-01','2027-03-31','planned',12,30,10,NOW()),
  ('84000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000004','84000000-0000-4000-8000-000000000012','78000000-0000-4000-8000-000000000004','activity','CAR-A1.1','Priorizar zonas de recarga','Análisis hídrico y consulta comunitaria.','2026-07-15','2026-12-15','in_progress',18,15,11,NOW()),
  ('84000000-0000-4000-8000-000000000014','30000000-0000-4000-8000-000000000004',NULL,'78000000-0000-4000-8000-000000000004','phase','CAR-F2','Soluciones basadas en naturaleza','Ejecución de protección y restauración hídrica.','2027-04-01','2030-06-30','planned',0,70,20,NOW())
ON CONFLICT (project_id, code) DO UPDATE SET parent_task_id=EXCLUDED.parent_task_id,owner_actor_id=EXCLUDED.owner_actor_id,task_type=EXCLUDED.task_type,title=EXCLUDED.title,description=EXCLUDED.description,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,status=EXCLUDED.status,progress_pct=EXCLUDED.progress_pct,weight=EXCLUDED.weight,sort_order=EXCLUDED.sort_order,updated_at=NOW();

INSERT INTO core.project_task_dependencies (task_id, predecessor_task_id, dependency_type, lag_days)
VALUES
 ('84000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000001','finish_to_start',0),
 ('84000000-0000-4000-8000-000000000005','84000000-0000-4000-8000-000000000004','finish_to_start',0),
 ('84000000-0000-4000-8000-000000000007','84000000-0000-4000-8000-000000000006','finish_to_start',15),
 ('84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000009','finish_to_start',0),
 ('84000000-0000-4000-8000-000000000014','84000000-0000-4000-8000-000000000012','finish_to_start',0)
ON CONFLICT (task_id, predecessor_task_id) DO UPDATE SET dependency_type=EXCLUDED.dependency_type,lag_days=EXCLUDED.lag_days;

INSERT INTO core.project_budget_items (id,project_id,task_id,code,category,name,funding_source,currency,planned_amount,committed_amount,actual_amount,notes,updated_at)
VALUES
 ('85000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','OSA-P01','Restauración','Insumos y establecimiento de parcelas','Fondo de Biodiversidad Sostenible','USD',1250000,910000,620000,'Incluye viveros, transporte y establecimiento.',NOW()),
 ('85000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002','OSA-P02','Monitoreo','Línea base y monitoreo ecológico','Cooperación técnica','USD',340000,310000,285000,'Monitoreo anual de cobertura y biodiversidad.',NOW()),
 ('85000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000007','SJLS-P01','Conectividad','Restauración de pasos biológicos','Presupuesto nacional','USD',890000,640000,405000,NULL,NOW()),
 ('85000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000008','SJLS-P02','Monitoreo','Red de cámaras y análisis','Cooperación técnica','USD',260000,240000,172000,NULL,NOW()),
 ('85000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000011','TEMP-P01','Asistencia técnica','Planes regenerativos de finca','Fondo de Adaptación','USD',1420000,780000,360000,NULL,NOW()),
 ('85000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000010','TEMP-P02','Infraestructura','Cosecha y eficiencia de agua','Crédito verde','USD',980000,410000,195000,NULL,NOW()),
 ('85000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000004','84000000-0000-4000-8000-000000000012','CAR-P01','Formulación','Estudios y participación','Cooperación bilateral','USD',420000,155000,48000,NULL,NOW()),
 ('85000000-0000-4000-8000-000000000008','30000000-0000-4000-8000-000000000004','84000000-0000-4000-8000-000000000014','CAR-P02','Implementación','Protección de zonas de recarga','Por confirmar','USD',2100000,0,0,'Partida sujeta al cierre de formulación.',NOW())
ON CONFLICT (project_id, code) DO UPDATE SET task_id=EXCLUDED.task_id,category=EXCLUDED.category,name=EXCLUDED.name,funding_source=EXCLUDED.funding_source,currency=EXCLUDED.currency,planned_amount=EXCLUDED.planned_amount,committed_amount=EXCLUDED.committed_amount,actual_amount=EXCLUDED.actual_amount,notes=EXCLUDED.notes,updated_at=NOW();

INSERT INTO core.project_risks (id,project_id,owner_actor_id,code,title,description,category,probability,impact,status,response_strategy,mitigation,review_date,updated_at)
VALUES
 ('86000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001','OSA-R01','Eventos extremos afectan parcelas','Inundación o marejada puede reducir supervivencia.','Climático',4,5,'monitoring','mitigate','Diversificar sitios, especies y calendario de establecimiento.',CURRENT_DATE+30,NOW()),
 ('86000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001','OSA-R02','Participación comunitaria insuficiente','Disponibilidad desigual de organizaciones locales.','Social',2,4,'open','mitigate','Convenios y promotores territoriales con seguimiento mensual.',CURRENT_DATE+45,NOW()),
 ('86000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','78000000-0000-4000-8000-000000000002','SJLS-R01','Pérdida de acuerdos prediales','Cambios de propietario pueden afectar la continuidad.','Gobernanza',3,4,'monitoring','transfer','Registrar servidumbres ecológicas y acuerdos institucionales.',CURRENT_DATE+60,NOW()),
 ('86000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000002','78000000-0000-4000-8000-000000000002','SJLS-R02','Fallas de equipos de monitoreo','Cámaras expuestas a humedad y vandalismo.','Operativo',3,3,'open','mitigate','Inventario de repuestos y rotación preventiva.',CURRENT_DATE+20,NOW()),
 ('86000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000003','78000000-0000-4000-8000-000000000003','TEMP-R01','Sequía prolongada','Reducción de disponibilidad hídrica en fincas.','Climático',5,5,'open','avoid','Priorizar sistemas de captación y ajustar calendario productivo.',CURRENT_DATE+15,NOW()),
 ('86000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000003','78000000-0000-4000-8000-000000000003','TEMP-R02','Adopción técnica menor a la prevista','Productores pueden abandonar prácticas por costo inicial.','Adopción',3,4,'monitoring','mitigate','Parcelas demostrativas, incentivos y acompañamiento continuo.',CURRENT_DATE+35,NOW()),
 ('86000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000004','78000000-0000-4000-8000-000000000004','CAR-R01','Financiamiento de implementación no confirmado','La fase de ejecución depende de cooperación adicional.','Financiero',4,5,'open','mitigate','Preparar cartera de financiamiento y diseño modular por cuenca.',CURRENT_DATE+25,NOW()),
 ('86000000-0000-4000-8000-000000000008','30000000-0000-4000-8000-000000000004','78000000-0000-4000-8000-000000000004','CAR-R02','Conflictos por uso del agua','Intereses productivos y comunitarios pueden diferir.','Social',3,5,'open','mitigate','Mesa de gobernanza y reglas transparentes de priorización.',CURRENT_DATE+40,NOW())
ON CONFLICT (project_id, code) DO UPDATE SET owner_actor_id=EXCLUDED.owner_actor_id,title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,probability=EXCLUDED.probability,impact=EXCLUDED.impact,status=EXCLUDED.status,response_strategy=EXCLUDED.response_strategy,mitigation=EXCLUDED.mitigation,review_date=EXCLUDED.review_date,updated_at=NOW();

-- Four differentiated financial modes. `none` and `external` intentionally have no local transactional budget.
DELETE FROM core.project_budget_items WHERE project_id IN ('30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004');
UPDATE core.projects SET financial_management_mode='execution',financial_base_currency='USD',financial_source_system=NULL,external_project_code=NULL,financial_data_cutoff_date=NULL,updated_at=NOW() WHERE id='30000000-0000-4000-8000-000000000001';
UPDATE core.projects SET financial_management_mode='none',financial_base_currency=NULL,financial_source_system=NULL,external_project_code=NULL,external_budget_amount=NULL,external_committed_amount=NULL,external_executed_amount=NULL,external_available_amount=NULL,updated_at=NOW() WHERE id='30000000-0000-4000-8000-000000000002';
UPDATE core.projects SET financial_management_mode='planning',financial_base_currency='USD',financial_source_system=NULL,external_project_code=NULL,updated_at=NOW() WHERE id='30000000-0000-4000-8000-000000000003';
UPDATE core.projects SET financial_management_mode='external',financial_base_currency='USD',financial_source_system='Odoo Institucional',external_project_code='AYA-CR-HIDRICA-2026',external_financial_url='https://odoo.example.invalid/projects/AYA-CR-HIDRICA-2026',financial_data_source='Resumen financiero certificado por AyA',financial_update_method='connector',financial_sync_status='synchronized',financial_data_cutoff_date=CURRENT_DATE-7,financial_data_last_updated_at=NOW(),external_budget_amount=2850000,external_committed_amount=1120000,external_executed_amount=735000,external_available_amount=1730000,updated_at=NOW() WHERE id='30000000-0000-4000-8000-000000000004';

INSERT INTO core.project_funding_sources(id,project_id,code,name,source_type,funder,currency,approved_amount,received_amount,valid_from,valid_to,restrictions,observations,status,updated_at)
VALUES
 ('87000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','FBS','Fondo de Biodiversidad Sostenible','donor','Fondo de Biodiversidad Sostenible','USD',1200000,900000,'2025-01-01','2028-12-31','Uso exclusivo en restauración y monitoreo territorial.','Fuente principal de la ejecución demostrativa.','active',NOW()),
 ('87000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','CT-OSA','Cooperación técnica Osa','cooperation','Cooperación bilateral','USD',550000,420000,'2025-01-01','2027-12-31','Reportes técnicos semestrales.',NULL,'active',NOW()),
 ('87000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','FA-TEMP','Fondo de Adaptación Tempisque','donor','Fondo de Adaptación','USD',2400000,850000,'2025-03-01','2029-02-28','Sujeto a programación anual aprobada.','Modo planning: sin compromisos ni pagos en SIGI.','active',NOW())
ON CONFLICT(project_id,code) DO UPDATE SET name=EXCLUDED.name,source_type=EXCLUDED.source_type,funder=EXCLUDED.funder,currency=EXCLUDED.currency,approved_amount=EXCLUDED.approved_amount,received_amount=EXCLUDED.received_amount,valid_from=EXCLUDED.valid_from,valid_to=EXCLUDED.valid_to,restrictions=EXCLUDED.restrictions,observations=EXCLUDED.observations,status=EXCLUDED.status,updated_at=NOW();

INSERT INTO core.project_budget_versions(id,project_id,version_number,name,reason,status,effective_date,total_amount,change_amount,approval_notes,approved_at,updated_at)
VALUES
 ('88000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'Presupuesto inicial v1','Aprobación del documento de proyecto.','approved','2025-01-15',1590000,0,'Aprobado por comité directivo.','2025-01-10',NOW()),
 ('88000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',2,'Reprogramación 2026','Ampliación de parcelas y monitoreo climático.','approved','2026-07-01',1750000,160000,'Ajuste respaldado por convenio modificatorio.','2026-06-20',NOW()),
 ('88000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003',1,'Programación inicial Tempisque','Distribución plurianual para formulación.','approved','2025-03-01',2400000,0,'Versión de planificación; no habilita ejecución.','2025-02-20',NOW())
ON CONFLICT(project_id,version_number) DO UPDATE SET name=EXCLUDED.name,reason=EXCLUDED.reason,status=EXCLUDED.status,effective_date=EXCLUDED.effective_date,total_amount=EXCLUDED.total_amount,change_amount=EXCLUDED.change_amount,approval_notes=EXCLUDED.approval_notes,approved_at=EXCLUDED.approved_at,updated_at=NOW();

UPDATE core.project_budget_items SET funding_source_id='87000000-0000-4000-8000-000000000001',budget_version_id='88000000-0000-4000-8000-000000000002',initial_amount=1250000,fiscal_year=2026,component='Restauración',period_label='2025-2027' WHERE project_id='30000000-0000-4000-8000-000000000001' AND code='OSA-P01';
UPDATE core.project_budget_items SET funding_source_id='87000000-0000-4000-8000-000000000002',budget_version_id='88000000-0000-4000-8000-000000000002',initial_amount=340000,fiscal_year=2026,component='Monitoreo',period_label='2025-2027' WHERE project_id='30000000-0000-4000-8000-000000000001' AND code='OSA-P02';
UPDATE core.project_budget_items SET funding_source_id='87000000-0000-4000-8000-000000000003',budget_version_id='88000000-0000-4000-8000-000000000003',initial_amount=planned_amount,fiscal_year=2026,period_label='2025-2028' WHERE project_id='30000000-0000-4000-8000-000000000003';

INSERT INTO core.project_financial_movements(id,project_id,budget_item_id,funding_source_id,task_id,movement_type,budget_effect,movement_date,amount,currency,exchange_rate,base_amount,supplier_or_beneficiary,concept,external_reference,document_number,status,approved_at,updated_at)
VALUES
 ('89000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','adjustment','increase','2026-07-01',160000,'USD',1,160000,NULL,'Ampliación aprobada para parcelas y viveros','MOD-OSA-2026-01','CD-2026-14','approved','2026-06-20',NOW()),
 ('89000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000004','commitment','neutral','2026-07-15',600000,'USD',1,600000,'Consorcio Restauración Osa','Establecimiento de parcelas piloto','CTR-OSA-044','OC-2026-118','approved','2026-07-16',NOW()),
 ('89000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000002','commitment','neutral','2026-02-10',290000,'USD',1,290000,'Universidad Nacional','Monitoreo ecológico y análisis','CONV-UNA-021','OC-2026-031','approved','2026-02-11',NOW()),
 ('89000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000004','payment','neutral','2026-08-15',400000,'USD',1,400000,'Consorcio Restauración Osa','Primer pago contra avance de parcelas','CTR-OSA-044','FAC-OSA-188','approved','2026-08-18',NOW()),
 ('89000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000002','payment','neutral','2026-06-30',240000,'USD',1,240000,'Universidad Nacional','Productos de línea base y monitoreo','CONV-UNA-021','FAC-UNA-077','approved','2026-07-02',NOW()),
 ('89000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000001',NULL,'87000000-0000-4000-8000-000000000001',NULL,'disbursement','neutral','2026-01-20',450000,'USD',1,450000,'Fondo de Biodiversidad Sostenible','Segundo desembolso anual','DES-FBS-2026-02','REC-2026-02','approved','2026-01-20',NOW())
ON CONFLICT(id) DO UPDATE SET budget_item_id=EXCLUDED.budget_item_id,funding_source_id=EXCLUDED.funding_source_id,task_id=EXCLUDED.task_id,movement_type=EXCLUDED.movement_type,budget_effect=EXCLUDED.budget_effect,movement_date=EXCLUDED.movement_date,amount=EXCLUDED.amount,currency=EXCLUDED.currency,exchange_rate=EXCLUDED.exchange_rate,base_amount=EXCLUDED.base_amount,supplier_or_beneficiary=EXCLUDED.supplier_or_beneficiary,concept=EXCLUDED.concept,external_reference=EXCLUDED.external_reference,document_number=EXCLUDED.document_number,status=EXCLUDED.status,approved_at=EXCLUDED.approved_at,updated_at=NOW();

INSERT INTO core.project_management_records(id,project_id,record_type,code,title,description,status,priority,owner_actor_id,requested_at,due_date,impact_scope,impact_schedule_days,impact_amount,previous_value_json,proposed_value_json,resolution,updated_at)
VALUES
 ('8a000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','issue','OSA-I01','Retraso en entrega de plantas','El vivero reportó atraso por lluvias intensas.','open','high','78000000-0000-4000-8000-000000000001','2026-08-05','2026-10-20','Cronograma de parcelas',21,0,NULL,NULL,'Reprogramar lotes y activar vivero alterno.',NOW()),
 ('8a000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','decision','OSA-D01','Priorizar microcuenca Rincón','Decisión del comité basada en conectividad y disponibilidad comunitaria.','closed','high','78000000-0000-4000-8000-000000000001','2026-05-12',NULL,'Alcance territorial',0,0,NULL,'{"territory":"Microcuenca Rincón"}','Aprobado en sesión CD-06-2026.',NOW()),
 ('8a000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','change_request','OSA-C01','Ampliar parcelas y presupuesto 2026','Incorporar 80 hectáreas adicionales aprovechando acuerdos locales.','approved','high','78000000-0000-4000-8000-000000000001','2026-06-01','2026-06-30','Alcance, cronograma y presupuesto',30,160000,'{"areaHa":340,"budget":1590000}','{"areaHa":420,"budget":1750000}','Aprobado mediante convenio modificatorio MOD-OSA-2026-01.',NOW())
ON CONFLICT(project_id,code) DO UPDATE SET record_type=EXCLUDED.record_type,title=EXCLUDED.title,description=EXCLUDED.description,status=EXCLUDED.status,priority=EXCLUDED.priority,owner_actor_id=EXCLUDED.owner_actor_id,requested_at=EXCLUDED.requested_at,due_date=EXCLUDED.due_date,impact_scope=EXCLUDED.impact_scope,impact_schedule_days=EXCLUDED.impact_schedule_days,impact_amount=EXCLUDED.impact_amount,previous_value_json=EXCLUDED.previous_value_json,proposed_value_json=EXCLUDED.proposed_value_json,resolution=EXCLUDED.resolution,updated_at=NOW();

INSERT INTO core.project_status_updates(id,project_id,cutoff_date,period_label,physical_progress_pct,financial_progress_pct,financial_data_mode,executive_summary,achievements,delays,main_risks,issues,decisions_required,next_steps,status,responsible_actor_id,approved_at,updated_at)
VALUES
 ('8b000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-07-31','Julio 2026',38,31,'execution','Se completó la línea base y comenzó el establecimiento intensivo.','Parcelas piloto delimitadas y contratos formalizados.','Lluvias retrasaron preparación de dos sitios.','Eventos extremos y disponibilidad de plantas.','Atraso inicial del vivero.','Validar ampliación presupuestaria.','Iniciar establecimiento en Rincón.','approved','78000000-0000-4000-8000-000000000001','2026-08-05',NOW()),
 ('8b000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','2026-08-31','Agosto 2026',43,36.6,'execution','La intervención avanza en tres bloques territoriales.','Primer bloque establecido y pago contra avance validado.','Persisten retrasos menores de suministro.','Supervivencia temprana y lluvias.','Entrega parcial de plantas.','Activar vivero alterno si el atraso supera 15 días.','Completar segundo bloque y monitoreo de supervivencia.','approved','78000000-0000-4000-8000-000000000001','2026-09-05',NOW()),
 ('8b000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','2026-09-30','Septiembre 2026',46,36.6,'execution','El proyecto mantiene avance físico superior al financiero ejecutado.','420 hectáreas incorporadas al plan operativo.','La entrega de insumos se normaliza gradualmente.','Clima y coordinación comunitaria.','Sin nuevos problemas críticos.','Confirmar calendario de desembolso 2027.','Cerrar establecimiento piloto y preparar evaluación trimestral.','approved','78000000-0000-4000-8000-000000000001','2026-10-05',NOW())
ON CONFLICT(project_id,cutoff_date) DO UPDATE SET period_label=EXCLUDED.period_label,physical_progress_pct=EXCLUDED.physical_progress_pct,financial_progress_pct=EXCLUDED.financial_progress_pct,financial_data_mode=EXCLUDED.financial_data_mode,executive_summary=EXCLUDED.executive_summary,achievements=EXCLUDED.achievements,delays=EXCLUDED.delays,main_risks=EXCLUDED.main_risks,issues=EXCLUDED.issues,decisions_required=EXCLUDED.decisions_required,next_steps=EXCLUDED.next_steps,status=EXCLUDED.status,responsible_actor_id=EXCLUDED.responsible_actor_id,approved_at=EXCLUDED.approved_at,updated_at=NOW();

-- Project polygons and their canonical territory links.
INSERT INTO core.territories (id, code, name, level, status, updated_at)
VALUES
  ('41000000-0000-4000-8000-000000000001', 'project-CR-OSA-001-polygon', 'Cobertura Osa–Golfo Dulce', 'custom', 'inactive', NOW()),
  ('41000000-0000-4000-8000-000000000002', 'project-CR-SJLS-002-polygon', 'Cobertura San Juan–La Selva', 'custom', 'inactive', NOW()),
  ('41000000-0000-4000-8000-000000000003', 'project-CR-TEMP-003-polygon', 'Cobertura Tempisque', 'custom', 'inactive', NOW()),
  ('41000000-0000-4000-8000-000000000004', 'project-CR-CARIBE-004-polygon', 'Cobertura Caribe Sur', 'custom', 'inactive', NOW()),
  ('41000000-0000-4000-8000-000000000005', 'project-CR-PSA-005-polygon', 'Cobertura piloto PSA (interno)', 'custom', 'inactive', NOW())
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, level='custom', status='inactive', updated_at=NOW();

WITH shapes(project_id, territory_code, wkt) AS (
  VALUES
    ('30000000-0000-4000-8000-000000000001'::uuid, 'project-CR-OSA-001-polygon', 'POLYGON((-83.82 8.78,-83.55 8.82,-83.36 8.63,-83.42 8.38,-83.68 8.30,-83.91 8.48,-83.82 8.78))'),
    ('30000000-0000-4000-8000-000000000002'::uuid, 'project-CR-SJLS-002-polygon', 'POLYGON((-84.20 10.62,-83.92 10.70,-83.70 10.55,-83.72 10.28,-84.02 10.18,-84.28 10.36,-84.20 10.62))'),
    ('30000000-0000-4000-8000-000000000003'::uuid, 'project-CR-TEMP-003-polygon', 'POLYGON((-85.72 10.62,-85.40 10.72,-85.12 10.55,-85.18 10.24,-85.50 10.12,-85.78 10.32,-85.72 10.62))'),
    ('30000000-0000-4000-8000-000000000004'::uuid, 'project-CR-CARIBE-004-polygon', 'POLYGON((-83.18 9.82,-82.92 9.88,-82.72 9.65,-82.76 9.38,-83.02 9.30,-83.24 9.52,-83.18 9.82))'),
    ('30000000-0000-4000-8000-000000000005'::uuid, 'project-CR-PSA-005-polygon', 'POLYGON((-84.62 9.98,-84.45 10.02,-84.36 9.90,-84.42 9.78,-84.58 9.76,-84.66 9.86,-84.62 9.98))')
), normalized AS (
  SELECT project_id, territory_code, ST_Multi(ST_GeomFromText(wkt, 4326)) geom FROM shapes
)
INSERT INTO core.project_territories (id, project_id, territory_id, territory_code, territory_name, country, area_ha, updated_at)
SELECT
  CASE s.territory_code
    WHEN 'project-CR-OSA-001-polygon' THEN '42000000-0000-4000-8000-000000000001'::uuid
    WHEN 'project-CR-SJLS-002-polygon' THEN '42000000-0000-4000-8000-000000000002'::uuid
    WHEN 'project-CR-TEMP-003-polygon' THEN '42000000-0000-4000-8000-000000000003'::uuid
    WHEN 'project-CR-PSA-005-polygon' THEN '42000000-0000-4000-8000-000000000005'::uuid
    ELSE '42000000-0000-4000-8000-000000000004'::uuid
  END,
  s.project_id,
  t.id,
  t.code,
  t.name,
  'Costa Rica',
  ROUND((ST_Area(s.geom::geography) / 10000)::numeric, 2),
  NOW()
FROM normalized s JOIN core.territories t ON t.code=s.territory_code
ON CONFLICT (project_id, territory_code, country) DO UPDATE SET territory_id=EXCLUDED.territory_id, territory_name=EXCLUDED.territory_name, area_ha=EXCLUDED.area_ha, updated_at=NOW();

WITH shapes(id, project_id, territory_code, wkt) AS (
  VALUES
    ('51000000-0000-4000-8000-000000000001'::uuid, '30000000-0000-4000-8000-000000000001'::uuid, 'project-CR-OSA-001-polygon', 'POLYGON((-83.82 8.78,-83.55 8.82,-83.36 8.63,-83.42 8.38,-83.68 8.30,-83.91 8.48,-83.82 8.78))'),
    ('51000000-0000-4000-8000-000000000002'::uuid, '30000000-0000-4000-8000-000000000002'::uuid, 'project-CR-SJLS-002-polygon', 'POLYGON((-84.20 10.62,-83.92 10.70,-83.70 10.55,-83.72 10.28,-84.02 10.18,-84.28 10.36,-84.20 10.62))'),
    ('51000000-0000-4000-8000-000000000003'::uuid, '30000000-0000-4000-8000-000000000003'::uuid, 'project-CR-TEMP-003-polygon', 'POLYGON((-85.72 10.62,-85.40 10.72,-85.12 10.55,-85.18 10.24,-85.50 10.12,-85.78 10.32,-85.72 10.62))'),
    ('51000000-0000-4000-8000-000000000004'::uuid, '30000000-0000-4000-8000-000000000004'::uuid, 'project-CR-CARIBE-004-polygon', 'POLYGON((-83.18 9.82,-82.92 9.88,-82.72 9.65,-82.76 9.38,-83.02 9.30,-83.24 9.52,-83.18 9.82))'),
    ('51000000-0000-4000-8000-000000000005'::uuid, '30000000-0000-4000-8000-000000000005'::uuid, 'project-CR-PSA-005-polygon', 'POLYGON((-84.62 9.98,-84.45 10.02,-84.36 9.90,-84.42 9.78,-84.58 9.76,-84.66 9.86,-84.62 9.98))')
), normalized AS (
  SELECT id, project_id, territory_code, ST_Multi(ST_GeomFromText(wkt,4326)) geom FROM shapes
)
INSERT INTO gis.territory_features (id, territory_id, layer_id, area_ha, geometry, properties_json, updated_at)
SELECT s.id, t.id, (SELECT id FROM gis.geo_layers WHERE code='project_polygons'), ROUND((ST_Area(s.geom::geography)/10000)::numeric,2), s.geom,
  jsonb_build_object('projectId', p.id, 'projectCode', p.code, 'projectTitle', p.title, 'territoryCode', t.code, 'territoryName', t.name, 'country', 'Costa Rica', 'demo', true), NOW()
FROM normalized s JOIN core.territories t ON t.code=s.territory_code JOIN core.projects p ON p.id=s.project_id
ON CONFLICT (id) DO UPDATE SET territory_id=EXCLUDED.territory_id, layer_id=EXCLUDED.layer_id, area_ha=EXCLUDED.area_ha, geometry=EXCLUDED.geometry, properties_json=EXCLUDED.properties_json, updated_at=NOW();

-- Corredor Seco reference polygons reuse dedicated non-project territories.
INSERT INTO core.territories (id, code, name, level, status, updated_at)
VALUES
  ('43000000-0000-4000-8000-000000000001', 'cr-corredor-seco-guanacaste', 'Corredor Seco — Guanacaste', 'reference', 'active', NOW()),
  ('43000000-0000-4000-8000-000000000002', 'cr-corredor-seco-pacifico', 'Corredor Seco — Pacífico Central', 'reference', 'active', NOW())
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, level='reference', status='active', updated_at=NOW();

WITH shapes(id, code, wkt) AS (
  VALUES
    ('52000000-0000-4000-8000-000000000001'::uuid, 'cr-corredor-seco-guanacaste', 'POLYGON((-85.95 11.02,-85.52 11.05,-85.15 10.80,-85.22 10.42,-85.58 10.24,-85.92 10.48,-85.95 11.02))'),
    ('52000000-0000-4000-8000-000000000002'::uuid, 'cr-corredor-seco-pacifico', 'POLYGON((-85.42 10.10,-85.02 10.08,-84.72 9.78,-84.82 9.40,-85.18 9.28,-85.48 9.58,-85.42 10.10))')
), normalized AS (SELECT id, code, ST_Multi(ST_GeomFromText(wkt,4326)) geom FROM shapes)
INSERT INTO gis.territory_features (id, territory_id, layer_id, area_ha, geometry, properties_json, updated_at)
SELECT s.id, t.id, (SELECT id FROM gis.geo_layers WHERE code='corredor_seco'), ROUND((ST_Area(s.geom::geography)/10000)::numeric,2), s.geom,
  jsonb_build_object('code',t.code,'name',t.name,'level','reference','country','Costa Rica','demo',true), NOW()
FROM normalized s JOIN core.territories t ON t.code=s.code
ON CONFLICT (id) DO UPDATE SET territory_id=EXCLUDED.territory_id, layer_id=EXCLUDED.layer_id, area_ha=EXCLUDED.area_ha, geometry=EXCLUDED.geometry, properties_json=EXCLUDED.properties_json, updated_at=NOW();

INSERT INTO core.publications (id, dataset_id, target, status, updated_at)
VALUES
  ('7a000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Tablero público ambiental Costa Rica', 'published', NOW()),
  ('7a000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', 'GeoServer — coberturas de restauración', 'published', NOW()),
  ('7a000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003', 'Catálogo institucional de datos', 'queued', NOW())
ON CONFLICT (id) DO UPDATE SET dataset_id=EXCLUDED.dataset_id, target=EXCLUDED.target, status=EXCLUDED.status, updated_at=NOW();

INSERT INTO core.incidents (id, title, severity, status, project_id, notes, updated_at)
VALUES
  ('7b000000-0000-4000-8000-000000000001', 'Validar dos fincas sin nombre en lote MAG', 'medium', 'open', '30000000-0000-4000-8000-000000000003', 'Incidente demostrativo derivado de la validación de datos.', NOW()),
  ('7b000000-0000-4000-8000-000000000002', 'Actualizar línea base hídrica Caribe Sur', 'low', 'in_progress', '30000000-0000-4000-8000-000000000004', 'Seguimiento demostrativo para la preparación del proyecto.', NOW()),
  ('7b000000-0000-4000-8000-000000000003', 'Sincronización SINAC completada', 'low', 'resolved', '30000000-0000-4000-8000-000000000001', 'Evento resuelto para mostrar trazabilidad operativa.', NOW())
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, severity=EXCLUDED.severity, status=EXCLUDED.status, project_id=EXCLUDED.project_id, notes=EXCLUDED.notes, updated_at=NOW();

-- One real report instance, version and commitment for report review flows.
INSERT INTO core.report_instances (id, egi_id, institution_id, template_id, name, country_code, period_start, period_end, cutoff_at, language_code, visibility, status, scope_json, selection_json, quality_json, created_by_user_id, updated_by_user_id, updated_at)
SELECT
  '80000000-0000-4000-8000-000000000001',
  '21b82169-17c9-4b36-87a6-8b827a2b7fe9',
  'ef5d5978-2da3-413c-9a4d-f29022443735',
  rt.id,
  'Informe de avance NDC Costa Rica 2026',
  'CR', '2025-01-01', '2026-12-31', NOW(), 'es', 'national', 'UNDER_REVIEW',
  '{"country":"Costa Rica","demo":true}',
  '{"projectIds":["30000000-0000-4000-8000-000000000001","30000000-0000-4000-8000-000000000002","30000000-0000-4000-8000-000000000003"]}',
  '{"minimumValidation":"approved","coveragePct":82}',
  '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', NOW()
FROM core.report_templates rt WHERE rt.code='NDC_BASE'
ON CONFLICT (id) DO UPDATE SET egi_id=EXCLUDED.egi_id, institution_id=EXCLUDED.institution_id, template_id=EXCLUDED.template_id, name=EXCLUDED.name, country_code=EXCLUDED.country_code, period_start=EXCLUDED.period_start, period_end=EXCLUDED.period_end, cutoff_at=EXCLUDED.cutoff_at, visibility=EXCLUDED.visibility, status=EXCLUDED.status, scope_json=EXCLUDED.scope_json, selection_json=EXCLUDED.selection_json, quality_json=EXCLUDED.quality_json, updated_by_user_id=EXCLUDED.updated_by_user_id, updated_at=NOW();

INSERT INTO core.report_versions (id, report_id, version_major, version_minor, label, status, change_summary, template_version, cutoff_at, parameters_json, snapshot_json, created_by_user_id, created_at)
VALUES ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 0, 1, 'Borrador consolidado v0.1', 'UNDER_REVIEW', 'Versión demostrativa con indicadores y proyectos de Costa Rica.', 1, NOW(), '{"country":"CR"}', '{"coveragePct":82,"projects":3,"demo":true}', '11111111-1111-4111-8111-111111111111', NOW())
ON CONFLICT (report_id, version_major, version_minor) DO UPDATE SET label=EXCLUDED.label, status=EXCLUDED.status, change_summary=EXCLUDED.change_summary, template_version=EXCLUDED.template_version, cutoff_at=EXCLUDED.cutoff_at, parameters_json=EXCLUDED.parameters_json, snapshot_json=EXCLUDED.snapshot_json, created_by_user_id=EXCLUDED.created_by_user_id;

INSERT INTO core.report_commitments (id, egi_id, framework_id, coordinating_institution_id, report_id, title, country_code, reporting_period_start, reporting_period_end, due_date, internal_cutoff_date, instructions, status, created_by_user_id, updated_by_user_id, updated_at)
SELECT '82000000-0000-4000-8000-000000000001', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', rf.id, 'ef5d5978-2da3-413c-9a4d-f29022443735', '80000000-0000-4000-8000-000000000001', 'Consolidación NDC Costa Rica — corte 2026', 'CR', '2025-01-01', '2026-12-31', CURRENT_DATE + 21, CURRENT_DATE + 10, 'Revisar cobertura, fuentes e indicadores antes del cierre interno.', 'OPEN', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', NOW()
FROM core.report_frameworks rf WHERE rf.code='NDC'
ON CONFLICT (id) DO UPDATE SET egi_id=EXCLUDED.egi_id, framework_id=EXCLUDED.framework_id, coordinating_institution_id=EXCLUDED.coordinating_institution_id, report_id=EXCLUDED.report_id, title=EXCLUDED.title, country_code=EXCLUDED.country_code, reporting_period_start=EXCLUDED.reporting_period_start, reporting_period_end=EXCLUDED.reporting_period_end, due_date=EXCLUDED.due_date, internal_cutoff_date=EXCLUDED.internal_cutoff_date, instructions=EXCLUDED.instructions, status=EXCLUDED.status, updated_by_user_id=EXCLUDED.updated_by_user_id, updated_at=NOW();

INSERT INTO core.report_notifications (id, egi_id, commitment_id, user_id, kind, title, message, status, dedup_key, created_at)
VALUES ('83000000-0000-4000-8000-000000000001', '21b82169-17c9-4b36-87a6-8b827a2b7fe9', '82000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'DUE_SOON', 'Cierre interno NDC próximo', 'La consolidación demostrativa de Costa Rica requiere revisión antes del corte interno.', 'UNREAD', 'demo-cr-ndc-2026-due-soon', NOW())
ON CONFLICT (dedup_key) DO UPDATE SET title=EXCLUDED.title, message=EXCLUDED.message, status='UNREAD', read_at=NULL, created_at=NOW();

COMMIT;

-- Verification result returned to the operator.
SELECT
  (SELECT count(*) FROM core.projects WHERE egi_id='21b82169-17c9-4b36-87a6-8b827a2b7fe9') AS projects,
  (SELECT count(*) FROM gis.territory_features tf JOIN gis.geo_layers gl ON gl.id=tf.layer_id WHERE gl.code='territories') AS territory_polygons,
  (SELECT count(*) FROM gis.territory_features tf JOIN gis.geo_layers gl ON gl.id=tf.layer_id WHERE gl.code='project_polygons') AS project_polygons,
  (SELECT count(*) FROM gis.v_public_territories WHERE territory_code = 'project-CR-PSA-005-polygon') AS internal_polygons_public,
  (SELECT count(*) FROM gis.territory_features tf JOIN gis.geo_layers gl ON gl.id=tf.layer_id WHERE gl.code='corredor_seco') AS reference_polygons,
  (SELECT ST_Extent(tf.geometry) FROM gis.territory_features tf JOIN gis.geo_layers gl ON gl.id=tf.layer_id WHERE gl.code IN ('territories','project_polygons','corredor_seco')) AS costa_rica_extent;
