\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS core.project_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  visibility TEXT NOT NULL DEFAULT 'public',
  priority_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE core.projects
  ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES core.project_portfolios(id),
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS theme TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS core.project_actors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  institution_id UUID REFERENCES core.institutions(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  role_label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  activity_code TEXT,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed_at DATE,
  status TEXT NOT NULL DEFAULT 'planned',
  progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.project_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  due_date DATE,
  published_at DATE,
  output_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS core.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS core.project_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES core.datasets(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'evidence',
  validation_status TEXT,
  evidence_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, dataset_id, relationship_type)
);

ALTER TABLE core.incidents
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES core.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE core.project_indicators
  ADD COLUMN IF NOT EXISTS baseline_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS target_value NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_core_projects_portfolio_id
  ON core.projects (portfolio_id);

CREATE INDEX IF NOT EXISTS idx_core_projects_visibility
  ON core.projects (visibility);

CREATE INDEX IF NOT EXISTS idx_core_project_actors_project_id
  ON core.project_actors (project_id);

CREATE INDEX IF NOT EXISTS idx_core_project_milestones_project_id
  ON core.project_milestones (project_id);

CREATE INDEX IF NOT EXISTS idx_core_project_deliverables_project_id
  ON core.project_deliverables (project_id);

CREATE INDEX IF NOT EXISTS idx_core_project_documents_project_id
  ON core.project_documents (project_id);

CREATE INDEX IF NOT EXISTS idx_core_project_datasets_project_id
  ON core.project_datasets (project_id);

CREATE INDEX IF NOT EXISTS idx_core_incidents_project_id
  ON core.incidents (project_id);

INSERT INTO core.project_portfolios (id, code, name, description, objective, status, visibility, priority_label)
VALUES
  (
    '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5001',
    'landscape-restoration',
    'Portafolio de restauración y resiliencia',
    'Cartera nacional de proyectos con impacto territorial en restauración, cuencas, cobertura y prevención de riesgos.',
    'Coordinar proyectos multisectoriales con evidencia territorial, trazabilidad técnica y capacidad de reporte país.',
    'active',
    'public',
    'Alta coordinación'
  ),
  (
    '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5002',
    'water-climate-territory',
    'Portafolio de agua, clima y territorio',
    'Iniciativas enfocadas en nacientes, resiliencia climática, monitoreo e infraestructura natural.',
    'Dar seguimiento ejecutivo a proyectos con resultados hidrológicos, climáticos y de gestión territorial.',
    'active',
    'public',
    'Implementación'
  ),
  (
    '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5003',
    'institutional-cooperation',
    'Portafolio institucional y cooperación técnica',
    'Cartera transversal para gobernanza, interoperabilidad, monitoreo y cooperación entre instituciones.',
    'Conectar proyectos del SIGI con actores, datasets, entregables y mecanismos de reporte institucional.',
    'active',
    'internal',
    'Gobernanza'
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  objective = EXCLUDED.objective,
  status = EXCLUDED.status,
  visibility = EXCLUDED.visibility,
  priority_label = EXCLUDED.priority_label,
  updated_at = NOW();

UPDATE core.projects p
SET code = mapped.code
FROM (
  VALUES
    ('Restauración de Manglares del Pacífico Norte', 'CR-PRJ-001'),
    ('Corredor Biológico Talamanca-Caribe', 'CR-PRJ-002'),
    ('Recuperación de Cuencas del Río Tempisque', 'CR-PRJ-003'),
    ('PSA en Territorios Indígenas Bribri-Cabécar', 'CR-PRJ-004'),
    ('Reforestación Productiva Zona Norte', 'CR-PRJ-005'),
    ('Protección de Nacientes GAM', 'CR-PRJ-006'),
    ('Control de Incendios Forestales Guanacaste', 'CR-PRJ-007'),
    ('Restauración de Bosque Seco en Nicoya', 'CR-PRJ-008')
) AS mapped(title, code)
WHERE p.title = mapped.title
  AND p.code IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM core.projects existing
    WHERE existing.code = mapped.code
  );

UPDATE core.projects p
SET
  title = CASE p.code
    WHEN 'CR-PRJ-001' THEN 'Restauración de Manglares del Pacífico Norte'
    WHEN 'CR-PRJ-002' THEN 'Corredor Biológico Talamanca-Caribe'
    WHEN 'CR-PRJ-003' THEN 'Recuperación de Cuencas del Río Tempisque'
    WHEN 'CR-PRJ-004' THEN 'PSA en Territorios Indígenas Bribri-Cabécar'
    WHEN 'CR-PRJ-005' THEN 'Reforestación Productiva Zona Norte'
    WHEN 'CR-PRJ-006' THEN 'Protección de Nacientes GAM'
    WHEN 'CR-PRJ-007' THEN 'Control de Incendios Forestales Guanacaste'
    WHEN 'CR-PRJ-008' THEN 'Restauración de Bosque Seco en Nicoya'
    ELSE p.title
  END,
  portfolio_id = CASE p.code
    WHEN 'CR-PRJ-001' THEN '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5001'::uuid
    WHEN 'CR-PRJ-002' THEN '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5001'::uuid
    WHEN 'CR-PRJ-003' THEN '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5002'::uuid
    WHEN 'CR-PRJ-004' THEN '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5001'::uuid
    WHEN 'CR-PRJ-005' THEN '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5002'::uuid
    WHEN 'CR-PRJ-006' THEN '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5002'::uuid
    WHEN 'CR-PRJ-007' THEN '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5001'::uuid
    WHEN 'CR-PRJ-008' THEN '9dc84ad3-8fc8-4ff5-8f4d-e86ccb6d5001'::uuid
    ELSE p.portfolio_id
  END,
  objective = CASE p.code
    WHEN 'CR-PRJ-001' THEN 'Recuperar mosaicos de manglar prioritarios y fortalecer el control comunitario del litoral.'
    WHEN 'CR-PRJ-002' THEN 'Consolidar conectividad ecológica y gobernanza interinstitucional en el corredor Talamanca-Caribe.'
    WHEN 'CR-PRJ-003' THEN 'Reducir degradación de cuencas mediante restauración, monitoreo y coordinación territorial.'
    WHEN 'CR-PRJ-004' THEN 'Escalar contratos PSA con trazabilidad territorial en territorios indígenas prioritarios.'
    WHEN 'CR-PRJ-005' THEN 'Aumentar cobertura productiva reforestada y adopción técnica en fincas de la Zona Norte.'
    WHEN 'CR-PRJ-006' THEN 'Proteger nacientes urbanas y periurbanas con gestión interinstitucional y evidencia geográfica.'
    WHEN 'CR-PRJ-007' THEN 'Reducir riesgo operativo y territorial ante incendios forestales mediante respuesta coordinada.'
    WHEN 'CR-PRJ-008' THEN 'Recuperar bosque seco y servicios ecosistémicos en paisajes productivos de Nicoya.'
    ELSE p.objective
  END,
  summary = CASE p.code
    WHEN 'CR-PRJ-001' THEN 'Proyecto costero con enfoque restaurativo, gobernanza local e indicadores de cobertura.'
    WHEN 'CR-PRJ-002' THEN 'Iniciativa de conectividad biológica con múltiples actores y enfoque territorial.'
    WHEN 'CR-PRJ-003' THEN 'Programa de restauración de cuencas con seguimiento operativo y resultados publicados.'
    WHEN 'CR-PRJ-004' THEN 'Portafolio de PSA con articulación entre financiamiento, trazabilidad e interculturalidad.'
    WHEN 'CR-PRJ-005' THEN 'Proyecto productivo-climático con seguimiento de área, socios y asistencia técnica.'
    WHEN 'CR-PRJ-006' THEN 'Iniciativa de agua y ciudad con cobertura metropolitana y reportes listos para publicación.'
    WHEN 'CR-PRJ-007' THEN 'Proyecto de prevención y control con hitos operativos, alertas y coordinación rápida.'
    WHEN 'CR-PRJ-008' THEN 'Restauración de bosque seco con paquetes de entregables y monitoreo territorial.'
    ELSE p.summary
  END,
  description = COALESCE(
    p.description,
    'Ficha maestra institucional gestionada desde el módulo transversal de proyectos del SIGI.'
  ),
  theme = CASE p.code
    WHEN 'CR-PRJ-001' THEN 'Restauración costera'
    WHEN 'CR-PRJ-002' THEN 'Biodiversidad y conectividad'
    WHEN 'CR-PRJ-003' THEN 'Cuencas y clima'
    WHEN 'CR-PRJ-004' THEN 'Financiamiento e inclusión territorial'
    WHEN 'CR-PRJ-005' THEN 'Agricultura y reforestación'
    WHEN 'CR-PRJ-006' THEN 'Agua y gobernanza territorial'
    WHEN 'CR-PRJ-007' THEN 'Gestión del riesgo'
    WHEN 'CR-PRJ-008' THEN 'Restauración de ecosistemas secos'
    ELSE COALESCE(p.theme, 'Gestión institucional')
  END,
  priority = CASE p.code
    WHEN 'CR-PRJ-001' THEN 'high'
    WHEN 'CR-PRJ-002' THEN 'high'
    WHEN 'CR-PRJ-003' THEN 'critical'
    WHEN 'CR-PRJ-004' THEN 'high'
    WHEN 'CR-PRJ-005' THEN 'medium'
    WHEN 'CR-PRJ-006' THEN 'medium'
    WHEN 'CR-PRJ-007' THEN 'critical'
    WHEN 'CR-PRJ-008' THEN 'medium'
    ELSE p.priority
  END,
  visibility = CASE
    WHEN p.code IN ('CR-PRJ-001','CR-PRJ-002','CR-PRJ-003','CR-PRJ-004','CR-PRJ-005','CR-PRJ-006','CR-PRJ-007','CR-PRJ-008')
      THEN 'public'
    ELSE COALESCE(p.visibility, 'internal')
  END,
  progress_pct = CASE p.code
    WHEN 'CR-PRJ-001' THEN 72
    WHEN 'CR-PRJ-002' THEN 58
    WHEN 'CR-PRJ-003' THEN 84
    WHEN 'CR-PRJ-004' THEN 77
    WHEN 'CR-PRJ-005' THEN 46
    WHEN 'CR-PRJ-006' THEN 100
    WHEN 'CR-PRJ-007' THEN 63
    WHEN 'CR-PRJ-008' THEN 91
    ELSE p.progress_pct
  END,
  featured = CASE
    WHEN p.code IN ('CR-PRJ-001','CR-PRJ-003','CR-PRJ-007') THEN TRUE
    ELSE COALESCE(p.featured, FALSE)
  END,
  start_date = CASE p.code
    WHEN 'CR-PRJ-001' THEN DATE '2024-01-15'
    WHEN 'CR-PRJ-002' THEN DATE '2024-03-01'
    WHEN 'CR-PRJ-003' THEN DATE '2023-08-01'
    WHEN 'CR-PRJ-004' THEN DATE '2024-02-10'
    WHEN 'CR-PRJ-005' THEN DATE '2025-01-05'
    WHEN 'CR-PRJ-006' THEN DATE '2023-01-01'
    WHEN 'CR-PRJ-007' THEN DATE '2024-11-01'
    WHEN 'CR-PRJ-008' THEN DATE '2023-04-20'
    ELSE p.start_date
  END,
  end_date = CASE p.code
    WHEN 'CR-PRJ-001' THEN DATE '2026-12-31'
    WHEN 'CR-PRJ-002' THEN DATE '2027-06-30'
    WHEN 'CR-PRJ-003' THEN DATE '2026-09-30'
    WHEN 'CR-PRJ-004' THEN DATE '2026-12-31'
    WHEN 'CR-PRJ-005' THEN DATE '2027-12-31'
    WHEN 'CR-PRJ-006' THEN DATE '2025-12-31'
    WHEN 'CR-PRJ-007' THEN DATE '2026-05-31'
    WHEN 'CR-PRJ-008' THEN DATE '2025-11-30'
    ELSE p.end_date
  END,
  updated_at = NOW()
WHERE p.code IN ('CR-PRJ-001','CR-PRJ-002','CR-PRJ-003','CR-PRJ-004','CR-PRJ-005','CR-PRJ-006','CR-PRJ-007','CR-PRJ-008');

UPDATE core.project_indicators pi
SET
  indicator_name = CASE
    WHEN p.code IN ('CR-PRJ-001','CR-PRJ-002') AND pi.indicator_code = 'restored_area_ha'
      THEN 'Área restaurada reportada'
    WHEN p.code = 'CR-PRJ-001' AND pi.indicator_code = 'co2e_captured'
      THEN 'CO2e estimado capturado'
    WHEN p.code = 'CR-PRJ-002' AND pi.indicator_code = 'households_benefited'
      THEN 'Hogares beneficiados'
    WHEN p.code = 'CR-PRJ-003' AND pi.indicator_code = 'watersheds_monitored_pct'
      THEN 'Cuencas con monitoreo activo'
    WHEN p.code = 'CR-PRJ-004' AND pi.indicator_code = 'households_benefited'
      THEN 'Hogares beneficiados'
    ELSE pi.indicator_name
  END,
  baseline_value = CASE
    WHEN p.code = 'CR-PRJ-001' AND pi.indicator_code = 'restored_area_ha' THEN 1200
    WHEN p.code = 'CR-PRJ-001' AND pi.indicator_code = 'co2e_captured' THEN 6500
    WHEN p.code = 'CR-PRJ-002' AND pi.indicator_code = 'restored_area_ha' THEN 1800
    WHEN p.code = 'CR-PRJ-002' AND pi.indicator_code = 'households_benefited' THEN 600
    WHEN p.code = 'CR-PRJ-003' AND pi.indicator_code = 'watersheds_monitored_pct' THEN 35
    WHEN p.code = 'CR-PRJ-004' AND pi.indicator_code = 'households_benefited' THEN 2100
    ELSE pi.baseline_value
  END,
  target_value = CASE
    WHEN p.code = 'CR-PRJ-001' AND pi.indicator_code = 'restored_area_ha' THEN 2200
    WHEN p.code = 'CR-PRJ-001' AND pi.indicator_code = 'co2e_captured' THEN 15000
    WHEN p.code = 'CR-PRJ-002' AND pi.indicator_code = 'restored_area_ha' THEN 3000
    WHEN p.code = 'CR-PRJ-002' AND pi.indicator_code = 'households_benefited' THEN 1500
    WHEN p.code = 'CR-PRJ-003' AND pi.indicator_code = 'watersheds_monitored_pct' THEN 100
    WHEN p.code = 'CR-PRJ-004' AND pi.indicator_code = 'households_benefited' THEN 4200
    ELSE pi.target_value
  END,
  updated_at = NOW()
FROM core.projects p
WHERE p.id = pi.project_id
  AND p.code IN ('CR-PRJ-001','CR-PRJ-002','CR-PRJ-003','CR-PRJ-004');

INSERT INTO core.project_actors (id, project_id, actor_type, institution_id, display_name, role_label, status)
SELECT seeded.id, p.id, seeded.actor_type, seeded.institution_id, seeded.display_name, seeded.role_label, seeded.status
FROM (
  VALUES
    ('77f0b001-3d5b-4327-8b52-5fd0ab9a9001'::uuid, 'CR-PRJ-001', 'leader', '299f56d7-9f9e-4f07-8962-111111111001'::uuid, 'Mesa Costera MINAE', 'Lider institucional', 'active'),
    ('77f0b001-3d5b-4327-8b52-5fd0ab9a9002'::uuid, 'CR-PRJ-001', 'partner', '299f56d7-9f9e-4f07-8962-111111111002'::uuid, 'SINAC Pacífico Norte', 'Socio territorial', 'active'),
    ('77f0b001-3d5b-4327-8b52-5fd0ab9a9003'::uuid, 'CR-PRJ-003', 'leader', '299f56d7-9f9e-4f07-8962-111111111002'::uuid, 'SINAC Tempisque', 'Lider de cuenca', 'active'),
    ('77f0b001-3d5b-4327-8b52-5fd0ab9a9004'::uuid, 'CR-PRJ-003', 'approver', '299f56d7-9f9e-4f07-8962-111111111004'::uuid, 'IMN Hidroclima', 'Aprobador técnico', 'active'),
    ('77f0b001-3d5b-4327-8b52-5fd0ab9a9005'::uuid, 'CR-PRJ-004', 'leader', '299f56d7-9f9e-4f07-8962-111111111003'::uuid, 'FONAFIFO Territorios', 'Lider financiero', 'active'),
    ('77f0b001-3d5b-4327-8b52-5fd0ab9a9006'::uuid, 'CR-PRJ-005', 'responsible', '299f56d7-9f9e-4f07-8962-111111111005'::uuid, 'MAG Zona Norte', 'Responsable operativo', 'active'),
    ('77f0b001-3d5b-4327-8b52-5fd0ab9a9007'::uuid, 'CR-PRJ-006', 'leader', '299f56d7-9f9e-4f07-8962-111111111006'::uuid, 'AyA GAM', 'Lider de implementación', 'active'),
    ('77f0b001-3d5b-4327-8b52-5fd0ab9a9008'::uuid, 'CR-PRJ-007', 'approver', '8d5d4d5c-24b3-4b93-9c4e-c8be38d70431'::uuid, 'Salud Ambiental Guanacaste', 'Aprobador de contingencia', 'active')
) seeded(id, project_code, actor_type, institution_id, display_name, role_label, status)
JOIN core.projects p ON p.code = seeded.project_code
ON CONFLICT (id) DO UPDATE
SET
  actor_type = EXCLUDED.actor_type,
  institution_id = EXCLUDED.institution_id,
  display_name = EXCLUDED.display_name,
  role_label = EXCLUDED.role_label,
  status = EXCLUDED.status,
  updated_at = NOW();

INSERT INTO core.project_milestones (id, project_id, activity_code, title, description, due_date, completed_at, status, progress_pct)
SELECT seeded.id, p.id, seeded.activity_code, seeded.title, seeded.description, seeded.due_date, seeded.completed_at, seeded.status, seeded.progress_pct
FROM (
  VALUES
    ('77f0b002-3d5b-4327-8b52-5fd0ab9a9001'::uuid, 'CR-PRJ-001', 'M1', 'Diagnóstico costero validado', 'Línea base de cobertura y presión antrópica validada por mesa técnica.', DATE '2025-03-31', DATE '2025-03-25', 'done', 100),
    ('77f0b002-3d5b-4327-8b52-5fd0ab9a9002'::uuid, 'CR-PRJ-001', 'M2', 'Paquete de restauración Q3', 'Ejecución de franjas restaurativas y seguimiento comunitario.', DATE '2026-09-30', NULL, 'in_progress', 68),
    ('77f0b002-3d5b-4327-8b52-5fd0ab9a9003'::uuid, 'CR-PRJ-003', 'M1', 'Mapa priorizado de cuencas', 'Clasificación de microcuencas críticas para inversión y monitoreo.', DATE '2024-12-15', DATE '2024-12-10', 'done', 100),
    ('77f0b002-3d5b-4327-8b52-5fd0ab9a9004'::uuid, 'CR-PRJ-003', 'M2', 'Ronda de acuerdos institucionales', 'Compromisos operativos con instituciones de la cuenca.', DATE '2025-06-30', DATE '2025-06-18', 'done', 100),
    ('77f0b002-3d5b-4327-8b52-5fd0ab9a9005'::uuid, 'CR-PRJ-007', 'M1', 'Plan de contingencia unificado', 'Plan interinstitucional para ventana seca 2026.', DATE '2025-12-20', NULL, 'in_progress', 63),
    ('77f0b002-3d5b-4327-8b52-5fd0ab9a9006'::uuid, 'CR-PRJ-008', 'M1', 'Paquete de parcelas demostrativas', 'Parcelas y bitácora de monitoreo en Nicoya listas para validación.', DATE '2025-08-30', DATE '2025-08-20', 'done', 100)
) seeded(id, project_code, activity_code, title, description, due_date, completed_at, status, progress_pct)
JOIN core.projects p ON p.code = seeded.project_code
ON CONFLICT (id) DO UPDATE
SET
  activity_code = EXCLUDED.activity_code,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  due_date = EXCLUDED.due_date,
  completed_at = EXCLUDED.completed_at,
  status = EXCLUDED.status,
  progress_pct = EXCLUDED.progress_pct,
  updated_at = NOW();

INSERT INTO core.project_deliverables (id, project_id, code, title, deliverable_type, description, status, due_date, published_at, output_url)
SELECT seeded.id, p.id, seeded.code, seeded.title, seeded.deliverable_type, seeded.description, seeded.status, seeded.due_date, seeded.published_at, seeded.output_url
FROM (
  VALUES
    ('77f0b003-3d5b-4327-8b52-5fd0ab9a9001'::uuid, 'CR-PRJ-001', 'DEL-001', 'Dashboard costero trimestral', 'dashboard', 'Panel ejecutivo con avance territorial, indicadores y riesgos costeros.', 'published', DATE '2025-07-15', DATE '2025-07-18', '/reports/coastal-dashboard-q3'),
    ('77f0b003-3d5b-4327-8b52-5fd0ab9a9002'::uuid, 'CR-PRJ-003', 'DEL-001', 'Informe de cuencas priorizadas', 'report', 'Documento de priorización con anexos cartográficos y decisiones de comité.', 'published', DATE '2025-06-30', DATE '2025-07-02', '/reports/watershed-prioritization'),
    ('77f0b003-3d5b-4327-8b52-5fd0ab9a9003'::uuid, 'CR-PRJ-004', 'DEL-001', 'Boletín PSA intercultural', 'bulletin', 'Boletín con estado de contratos, cobertura y validaciones asociadas.', 'in_progress', DATE '2025-11-30', NULL, NULL),
    ('77f0b003-3d5b-4327-8b52-5fd0ab9a9004'::uuid, 'CR-PRJ-007', 'DEL-001', 'Protocolo de respuesta a incendios', 'document', 'Protocolo consensuado con responsables, rutas de activación y trazabilidad.', 'in_progress', DATE '2025-12-20', NULL, NULL)
) seeded(id, project_code, code, title, deliverable_type, description, status, due_date, published_at, output_url)
JOIN core.projects p ON p.code = seeded.project_code
ON CONFLICT (id) DO UPDATE
SET
  code = EXCLUDED.code,
  title = EXCLUDED.title,
  deliverable_type = EXCLUDED.deliverable_type,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  due_date = EXCLUDED.due_date,
  published_at = EXCLUDED.published_at,
  output_url = EXCLUDED.output_url,
  updated_at = NOW();

INSERT INTO core.project_documents (id, project_id, code, title, document_type, file_url, status)
SELECT seeded.id, p.id, seeded.code, seeded.title, seeded.document_type, seeded.file_url, seeded.status
FROM (
  VALUES
    ('77f0b004-3d5b-4327-8b52-5fd0ab9a9001'::uuid, 'CR-PRJ-001', 'DOC-001', 'Ficha maestra aprobada', 'project-charter', '/documents/cr-prj-001-charter.pdf', 'approved'),
    ('77f0b004-3d5b-4327-8b52-5fd0ab9a9002'::uuid, 'CR-PRJ-003', 'DOC-001', 'Mapa de microcuencas', 'map', '/documents/cr-prj-003-watersheds.pdf', 'published'),
    ('77f0b004-3d5b-4327-8b52-5fd0ab9a9003'::uuid, 'CR-PRJ-007', 'DOC-001', 'Matriz de brigadas y cobertura', 'matrix', '/documents/cr-prj-007-brigades.xlsx', 'approved')
) seeded(id, project_code, code, title, document_type, file_url, status)
JOIN core.projects p ON p.code = seeded.project_code
ON CONFLICT (id) DO UPDATE
SET
  code = EXCLUDED.code,
  title = EXCLUDED.title,
  document_type = EXCLUDED.document_type,
  file_url = EXCLUDED.file_url,
  status = EXCLUDED.status,
  updated_at = NOW();

INSERT INTO core.project_datasets (id, project_id, dataset_id, relationship_type, validation_status, evidence_note)
SELECT seeded.id, p.id, d.id, seeded.relationship_type, seeded.validation_status, seeded.evidence_note
FROM (
  VALUES
    ('77f0b005-3d5b-4327-8b52-5fd0ab9a9001'::uuid, 'CR-PRJ-001', 'source', 'validated', 'Dataset de línea base utilizado para seguimiento trimestral.'),
    ('77f0b005-3d5b-4327-8b52-5fd0ab9a9002'::uuid, 'CR-PRJ-003', 'evidence', 'validated', 'Versión validada asociada al portafolio de cuencas.'),
    ('77f0b005-3d5b-4327-8b52-5fd0ab9a9003'::uuid, 'CR-PRJ-007', 'evidence', 'warning', 'Dataset operativo en consolidación por ventana seca 2026.')
) seeded(id, project_code, relationship_type, validation_status, evidence_note)
JOIN core.projects p ON p.code = seeded.project_code
JOIN LATERAL (
  SELECT id
  FROM core.datasets
  ORDER BY created_at ASC
  LIMIT 1
) d ON TRUE
ON CONFLICT (project_id, dataset_id, relationship_type) DO UPDATE
SET
  validation_status = EXCLUDED.validation_status,
  evidence_note = EXCLUDED.evidence_note,
  updated_at = NOW();

INSERT INTO core.incidents (id, title, severity, status, project_id, notes)
SELECT seeded.id, seeded.title, seeded.severity, seeded.status, p.id, seeded.notes
FROM (
  VALUES
    ('77f0b006-3d5b-4327-8b52-5fd0ab9a9001'::uuid, 'Retraso en permisos costeros', 'medium', 'investigating', 'CR-PRJ-001', 'Permisos municipales siguen en validación y afectan el lote Q4.'),
    ('77f0b006-3d5b-4327-8b52-5fd0ab9a9002'::uuid, 'Observación hidrometeorológica pendiente', 'low', 'open', 'CR-PRJ-003', 'Se requiere validación de serie diaria previa a publicación del boletín.'),
    ('77f0b006-3d5b-4327-8b52-5fd0ab9a9003'::uuid, 'Bloqueo logístico en brigadas', 'high', 'open', 'CR-PRJ-007', 'Cobertura incompleta en distrito priorizado por falta de relevo operativo.')
) seeded(id, title, severity, status, project_code, notes)
JOIN core.projects p ON p.code = seeded.project_code
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  severity = EXCLUDED.severity,
  status = EXCLUDED.status,
  project_id = EXCLUDED.project_id,
  notes = EXCLUDED.notes,
  updated_at = NOW();

INSERT INTO core.audit_events (id, actor_user_id, action, entity_type, entity_id, source, result, details_json)
SELECT seeded.id, seeded.actor_user_id, seeded.action, seeded.entity_type, p.id, seeded.source, seeded.result, seeded.details_json
FROM (
  VALUES
    (
      '77f0b007-3d5b-4327-8b52-5fd0ab9a9001'::uuid,
      '222b8042-3399-4941-b96d-8b5e93d35347'::uuid,
      'project.master_data_refreshed',
      'project',
      'CR-PRJ-001',
      'api',
      'success',
      '{"field":"summary","phase":"module-seed"}'::jsonb
    ),
    (
      '77f0b007-3d5b-4327-8b52-5fd0ab9a9002'::uuid,
      '4b9cc5ab-a911-4e6f-8f2d-444444440004'::uuid,
      'project.deliverable_published',
      'project',
      'CR-PRJ-003',
      'api',
      'success',
      '{"deliverableCode":"DEL-001","channel":"public_portal"}'::jsonb
    ),
    (
      '77f0b007-3d5b-4327-8b52-5fd0ab9a9003'::uuid,
      '4b9cc5ab-a911-4e6f-8f2d-444444440003'::uuid,
      'project.incident_logged',
      'project',
      'CR-PRJ-007',
      'api',
      'warning',
      '{"incident":"Bloqueo logístico en brigadas"}'::jsonb
    )
) seeded(id, actor_user_id, action, entity_type, project_code, source, result, details_json)
JOIN core.projects p ON p.code = seeded.project_code
ON CONFLICT (id) DO UPDATE
SET
  actor_user_id = EXCLUDED.actor_user_id,
  action = EXCLUDED.action,
  entity_type = EXCLUDED.entity_type,
  entity_id = EXCLUDED.entity_id,
  source = EXCLUDED.source,
  result = EXCLUDED.result,
  details_json = EXCLUDED.details_json;
