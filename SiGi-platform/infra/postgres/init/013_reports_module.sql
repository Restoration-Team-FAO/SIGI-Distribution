-- Informes Nacionales e Internacionales. Idempotent extension of the legacy
-- report_templates/report_runs model; existing public report endpoints remain valid.

CREATE TABLE IF NOT EXISTS core.report_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN (
    'NATIONAL_CHAPTER', 'REGIONAL_RESTORATION', 'BTR', 'NDC',
    'GBF_TARGET_2', 'LDN', 'CUSTOM'
  )),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE core.report_templates
  ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES core.report_frameworks(id),
  ADD COLUMN IF NOT EXISTS egi_id UUID REFERENCES core.egi_spaces(id),
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES core.institutions(id),
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES core.users(id);

CREATE TABLE IF NOT EXISTS core.report_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES core.report_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  change_summary TEXT,
  configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS core.report_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id UUID NOT NULL REFERENCES core.report_template_versions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  narrative_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK (narrative_mode IN ('AUTO', 'MANUAL', 'HYBRID')),
  UNIQUE (template_version_id, code),
  UNIQUE (template_version_id, position)
);

CREATE TABLE IF NOT EXISTS core.report_template_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES core.report_template_sections(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN (
    'TEXT', 'RICH_TEXT', 'TITLE', 'SUBTITLE', 'INDICATOR', 'KPI', 'TABLE',
    'BAR_CHART', 'LINE_CHART', 'PIE_CHART', 'TIME_SERIES', 'MAP', 'GEO_LAYER',
    'PROJECT_CARD', 'INSTITUTION_CARD', 'CASE_STUDY', 'IMAGE', 'DOCUMENT',
    'SOURCE', 'METHODOLOGY', 'NOTE', 'ANNEX'
  )),
  position INTEGER NOT NULL CHECK (position >= 0),
  configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (section_id, code),
  UNIQUE (section_id, position)
);

CREATE TABLE IF NOT EXISTS core.report_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  egi_id UUID NOT NULL REFERENCES core.egi_spaces(id),
  institution_id UUID REFERENCES core.institutions(id),
  template_id UUID NOT NULL REFERENCES core.report_templates(id),
  name TEXT NOT NULL,
  country_code TEXT,
  period_start DATE,
  period_end DATE,
  cutoff_at TIMESTAMPTZ,
  language_code TEXT NOT NULL DEFAULT 'es',
  visibility TEXT NOT NULL DEFAULT 'institutional' CHECK (visibility IN ('private', 'institutional', 'national', 'public')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'UNDER_REVIEW',
    'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED'
  )),
  scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  selection_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_json JSONB NOT NULL DEFAULT '{"minimumValidation":"approved"}'::jsonb,
  created_by_user_id UUID NOT NULL REFERENCES core.users(id),
  updated_by_user_id UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS core.report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES core.report_instances(id) ON DELETE CASCADE,
  version_major INTEGER NOT NULL DEFAULT 0 CHECK (version_major >= 0),
  version_minor INTEGER NOT NULL DEFAULT 1 CHECK (version_minor >= 0),
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  change_summary TEXT,
  template_version INTEGER NOT NULL,
  cutoff_at TIMESTAMPTZ,
  parameters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID NOT NULL REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, version_major, version_minor)
);

CREATE TABLE IF NOT EXISTS core.report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES core.report_instances(id) ON DELETE CASCADE,
  report_version_id UUID REFERENCES core.report_versions(id),
  format TEXT NOT NULL CHECK (format IN ('JSON', 'CSV', 'XLSX', 'DOCX', 'PDF')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  parameters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum_sha256 TEXT,
  storage_url TEXT,
  created_by_user_id UUID NOT NULL REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.report_data_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id UUID NOT NULL REFERENCES core.report_template_versions(id) ON DELETE CASCADE,
  section_code TEXT NOT NULL,
  variable_code TEXT NOT NULL,
  label TEXT NOT NULL,
  source_type TEXT,
  source_id UUID,
  indicator_id UUID REFERENCES core.indicators(id),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  minimum_validation TEXT NOT NULL DEFAULT 'approved',
  eligibility_rule TEXT,
  transformation_rule TEXT,
  UNIQUE (template_version_id, variable_code)
);

CREATE TABLE IF NOT EXISTS core.report_requirement_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES core.report_instances(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES core.report_data_requirements(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'AVAILABLE', 'PARTIAL', 'MISSING', 'NOT_APPLICABLE',
    'PENDING_VALIDATION', 'MANUAL_REQUIRED'
  )),
  dataset_id UUID REFERENCES core.datasets(id),
  source_id UUID REFERENCES core.data_sources(id),
  validation_status TEXT,
  value_json JSONB,
  notes TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, requirement_id)
);

CREATE TABLE IF NOT EXISTS core.report_indicator_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  egi_id UUID NOT NULL REFERENCES core.egi_spaces(id),
  source_indicator_id UUID NOT NULL REFERENCES core.indicators(id),
  report_framework_id UUID NOT NULL REFERENCES core.report_frameworks(id),
  report_variable_code TEXT NOT NULL,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('DIRECT', 'DERIVED', 'AGGREGATED', 'MANUAL', 'NOT_EQUIVALENT')),
  transformation_rule TEXT,
  eligibility_rule TEXT,
  notes TEXT,
  valid_from DATE,
  valid_to DATE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'inactive')),
  created_by_user_id UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (egi_id, source_indicator_id, report_framework_id, report_variable_code, version),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (mapping_type <> 'DIRECT' OR eligibility_rule IS NOT NULL),
  CHECK (mapping_type NOT IN ('DERIVED', 'AGGREGATED') OR transformation_rule IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS core.report_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES core.report_instances(id) ON DELETE CASCADE,
  report_version_id UUID REFERENCES core.report_versions(id),
  action TEXT NOT NULL CHECK (action IN ('SUBMITTED', 'REVIEW_STARTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED')),
  comment TEXT,
  actor_user_id UUID NOT NULL REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  egi_id UUID NOT NULL REFERENCES core.egi_spaces(id),
  template_id UUID NOT NULL REFERENCES core.report_templates(id),
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'annual')),
  next_run_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID NOT NULL REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.report_reference_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  due_year INTEGER NOT NULL CHECK (due_year BETWEEN 2000 AND 2200),
  label TEXT NOT NULL,
  short_label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('PREPARATION', 'BIODIVERSITY', 'CLIMATE', 'LAND', 'SUSTAINABLE_DEVELOPMENT', 'REGIONAL')),
  related_framework_code TEXT REFERENCES core.report_frameworks(code),
  timing_precision TEXT NOT NULL DEFAULT 'YEAR' CHECK (timing_precision IN ('YEAR', 'QUARTER', 'DATE')),
  guidance TEXT NOT NULL,
  source_note TEXT NOT NULL,
  reference_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'reference' CHECK (status IN ('reference', 'confirmed', 'superseded')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.report_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  egi_id UUID NOT NULL REFERENCES core.egi_spaces(id) ON DELETE CASCADE,
  framework_id UUID REFERENCES core.report_frameworks(id),
  reference_milestone_id UUID REFERENCES core.report_reference_milestones(id),
  coordinating_institution_id UUID REFERENCES core.institutions(id),
  report_id UUID REFERENCES core.report_instances(id),
  title TEXT NOT NULL,
  country_code TEXT,
  reporting_period_start DATE,
  reporting_period_end DATE,
  due_date DATE NOT NULL,
  internal_cutoff_date DATE,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'IN_REVIEW', 'CLOSED', 'CANCELLED')),
  created_by_user_id UUID NOT NULL REFERENCES core.users(id),
  updated_by_user_id UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reporting_period_end IS NULL OR reporting_period_start IS NULL OR reporting_period_end >= reporting_period_start),
  CHECK (internal_cutoff_date IS NULL OR internal_cutoff_date <= due_date)
);

CREATE TABLE IF NOT EXISTS core.report_commitment_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID NOT NULL REFERENCES core.report_commitments(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES core.institutions(id),
  responsible_user_id UUID REFERENCES core.users(id),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'VALIDATED', 'CHANGES_REQUESTED', 'NOT_APPLICABLE')),
  notes TEXT,
  submission_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES core.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (commitment_id, institution_id)
);

CREATE TABLE IF NOT EXISTS core.report_contribution_documents (
  contribution_id UUID NOT NULL REFERENCES core.report_commitment_contributions(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES documents.files(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contribution_id, file_id)
);

CREATE TABLE IF NOT EXISTS core.report_contribution_datasets (
  contribution_id UUID NOT NULL REFERENCES core.report_commitment_contributions(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES core.datasets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contribution_id, dataset_id)
);

CREATE TABLE IF NOT EXISTS core.report_contribution_indicators (
  contribution_id UUID NOT NULL REFERENCES core.report_commitment_contributions(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES core.indicators(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contribution_id, indicator_id)
);

CREATE TABLE IF NOT EXISTS core.report_reminder_rules (
  commitment_id UUID PRIMARY KEY REFERENCES core.report_commitments(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  days_before INTEGER[] NOT NULL DEFAULT ARRAY[30,15,7,1,0],
  overdue_every_days INTEGER NOT NULL DEFAULT 7 CHECK (overdue_every_days BETWEEN 1 AND 90),
  channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP')),
  updated_by_user_id UUID REFERENCES core.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.report_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  egi_id UUID NOT NULL REFERENCES core.egi_spaces(id) ON DELETE CASCADE,
  commitment_id UUID NOT NULL REFERENCES core.report_commitments(id) ON DELETE CASCADE,
  contribution_id UUID REFERENCES core.report_commitment_contributions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ASSIGNED', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'CHANGES_REQUESTED')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ')),
  dedup_key TEXT NOT NULL UNIQUE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_framework ON core.report_templates(framework_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_egi ON core.report_templates(egi_id);
CREATE INDEX IF NOT EXISTS idx_report_instances_egi_status ON core.report_instances(egi_id, status);
CREATE INDEX IF NOT EXISTS idx_report_instances_institution ON core.report_instances(institution_id);
CREATE INDEX IF NOT EXISTS idx_report_versions_report ON core.report_versions(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_exports_report ON core.report_exports(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_requirements_version ON core.report_data_requirements(template_version_id);
CREATE INDEX IF NOT EXISTS idx_report_requirement_status_report ON core.report_requirement_status(report_id, status);
CREATE INDEX IF NOT EXISTS idx_report_mappings_egi_framework ON core.report_indicator_mappings(egi_id, report_framework_id);
CREATE INDEX IF NOT EXISTS idx_report_reviews_report ON core.report_reviews(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_reference_milestones_year ON core.report_reference_milestones(due_year, display_order);
CREATE INDEX IF NOT EXISTS idx_report_commitments_egi_due ON core.report_commitments(egi_id, due_date);
CREATE INDEX IF NOT EXISTS idx_report_contributions_institution ON core.report_commitment_contributions(institution_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_report_contribution_documents_file ON core.report_contribution_documents(file_id);
CREATE INDEX IF NOT EXISTS idx_report_contribution_datasets_dataset ON core.report_contribution_datasets(dataset_id);
CREATE INDEX IF NOT EXISTS idx_report_contribution_indicators_indicator ON core.report_contribution_indicators(indicator_id);
CREATE INDEX IF NOT EXISTS idx_report_notifications_user_status ON core.report_notifications(user_id, status, created_at DESC);

INSERT INTO core.report_frameworks (code, name, description) VALUES
  ('NATIONAL_CHAPTER', 'Acápite Nacional', 'Informe nacional configurable por país.'),
  ('REGIONAL_RESTORATION', 'Informe Regional de Restauración', 'Consolidación homologada de múltiples países.'),
  ('BTR', 'BTR', 'Organización de información SIGI para transparencia climática; no constituye automáticamente un BTR oficial.'),
  ('NDC', 'NDC', 'Seguimiento de contribuciones determinadas a nivel nacional.'),
  ('GBF_TARGET_2', 'Meta 2 — Marco Mundial de Biodiversidad', 'Seguimiento configurable de restauración de ecosistemas degradados.'),
  ('LDN', 'LDN', 'Neutralidad de la Degradación de las Tierras.'),
  ('CUSTOM', 'Personalizado', 'Plantillas institucionales configurables.')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = NOW();

INSERT INTO core.report_templates (code, name, target, description, status, framework_id, configuration_json)
SELECT seed.code, seed.name, 'sigi_reports', seed.description, 'active', rf.id,
       jsonb_build_object('scope', seed.scope, 'baseTemplate', true)
FROM (VALUES
  ('NATIONAL_CHAPTER_BASE', 'Acápite Nacional', 'Estructura nacional configurable por país.', 'country'),
  ('REGIONAL_RESTORATION_BASE', 'Informe Regional de Restauración', 'Consolidación multipaís con comparaciones metodológicamente compatibles.', 'regional'),
  ('BTR_BASE', 'BTR', 'Organiza información disponible, derivable, faltante o manual para BTR.', 'country'),
  ('NDC_BASE', 'NDC', 'Seguimiento de metas e indicadores NDC.', 'country'),
  ('GBF_TARGET_2_BASE', 'Meta 2 — Marco Mundial de Biodiversidad', 'Seguimiento de información elegible para Meta 2.', 'country'),
  ('LDN_BASE', 'LDN', 'Organiza línea base, metas y evaluación LDN.', 'country'),
  ('CUSTOM_BASE', 'Informe personalizado', 'Base para construir informes institucionales.', 'institution')
) AS seed(code, name, description, scope)
JOIN core.report_frameworks rf ON rf.code = replace(seed.code, '_BASE', '')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  framework_id = EXCLUDED.framework_id, configuration_json = EXCLUDED.configuration_json,
  updated_at = NOW();

INSERT INTO core.report_template_versions (template_id, version, change_summary, configuration_json)
SELECT id, 1, 'Plantilla base SIGI', configuration_json
FROM core.report_templates
WHERE code IN ('NATIONAL_CHAPTER_BASE','REGIONAL_RESTORATION_BASE','BTR_BASE','NDC_BASE','GBF_TARGET_2_BASE','LDN_BASE','CUSTOM_BASE')
ON CONFLICT (template_id, version) DO NOTHING;

-- Section catalogs are data, not React conditionals. Additional country-specific
-- versions can reorder, hide or replace them without a deployment.
WITH sections(framework, position, code, title, required) AS (VALUES
 ('NATIONAL_CHAPTER',1,'context','Contexto nacional',true), ('NATIONAL_CHAPTER',2,'institutional','Marco institucional',true),
 ('NATIONAL_CHAPTER',3,'information_systems','Sistemas nacionales de información',false), ('NATIONAL_CHAPTER',4,'restoration_status','Estado de la restauración',true),
 ('NATIONAL_CHAPTER',5,'period_progress','Avances del período',true), ('NATIONAL_CHAPTER',6,'territorial_analysis','Análisis territorial',false),
 ('NATIONAL_CHAPTER',7,'ecosystem_analysis','Análisis por ecosistema',false), ('NATIONAL_CHAPTER',8,'interventions','Tipos de intervención',false),
 ('NATIONAL_CHAPTER',9,'indicators','Indicadores nacionales',true), ('NATIONAL_CHAPTER',10,'projects','Proyectos destacados',false),
 ('NATIONAL_CHAPTER',11,'institutional_strengthening','Fortalecimiento institucional',false), ('NATIONAL_CHAPTER',12,'gaps','Brechas y desafíos',false),
 ('NATIONAL_CHAPTER',13,'next_steps','Próximos pasos',false), ('NATIONAL_CHAPTER',14,'case_studies','Casos de estudio',false),
 ('NATIONAL_CHAPTER',15,'maps_charts','Mapas y gráficos',false), ('NATIONAL_CHAPTER',16,'sources_methodology','Fuentes y metodología',true),
 ('NATIONAL_CHAPTER',17,'annexes','Anexos',false),
 ('REGIONAL_RESTORATION',1,'executive_summary','Resumen ejecutivo',true), ('REGIONAL_RESTORATION',2,'regional_context','Contexto regional',true),
 ('REGIONAL_RESTORATION',3,'objectives','Objetivos',true), ('REGIONAL_RESTORATION',4,'methodology','Metodología',true),
 ('REGIONAL_RESTORATION',5,'regional_status','Estado regional de la restauración',true), ('REGIONAL_RESTORATION',6,'country_results','Resultados por país',true),
 ('REGIONAL_RESTORATION',7,'regional_comparison','Análisis comparativo regional',false), ('REGIONAL_RESTORATION',8,'ecosystems','Resultados por ecosistema',false),
 ('REGIONAL_RESTORATION',9,'interventions','Resultados por tipo de intervención',false), ('REGIONAL_RESTORATION',10,'projects','Portafolio regional de proyectos',false),
 ('REGIONAL_RESTORATION',11,'indicators','Indicadores regionales',true), ('REGIONAL_RESTORATION',12,'commitments','Contribución a compromisos',false),
 ('REGIONAL_RESTORATION',13,'capacities','Fortalecimiento de capacidades',false), ('REGIONAL_RESTORATION',14,'governance','Gobernanza e interoperabilidad',false),
 ('REGIONAL_RESTORATION',15,'case_studies','Casos de estudio',false), ('REGIONAL_RESTORATION',16,'gaps','Brechas y desafíos',false),
 ('REGIONAL_RESTORATION',17,'priorities','Prioridades regionales',false), ('REGIONAL_RESTORATION',18,'conclusions','Conclusiones',true),
 ('REGIONAL_RESTORATION',19,'statistical_annexes','Anexos estadísticos',false), ('REGIONAL_RESTORATION',20,'cartographic_annexes','Anexos cartográficos',false),
 ('BTR',1,'general','Información general',true), ('BTR',2,'national_circumstances','Circunstancias nacionales relevantes',false),
 ('BTR',3,'institutional_arrangements','Arreglos institucionales',true), ('BTR',4,'ghg_inventory','Información relacionada con inventarios GEI',false),
 ('BTR',5,'ndc_progress','Seguimiento de progreso de NDC',false), ('BTR',6,'ndc_indicators','Indicadores NDC',false),
 ('BTR',7,'policies','Políticas y medidas',false), ('BTR',8,'land_restoration','Restauración y sector uso de la tierra',false),
 ('BTR',9,'mitigation','Mitigación',false), ('BTR',10,'adaptation','Adaptación',false),
 ('BTR',11,'support','Apoyo recibido/proporcionado',false), ('BTR',12,'capacity_needs','Necesidades de fortalecimiento',false),
 ('BTR',13,'sources_methodology','Fuentes y metodología',true), ('BTR',14,'annexes','Anexos',false),
 ('NDC',1,'general','Información general de la NDC',true), ('NDC',2,'restoration_targets','Metas relacionadas con restauración',true),
 ('NDC',3,'afolu_targets','Metas AFOLU / uso de la tierra',false), ('NDC',4,'indicators','Indicadores de seguimiento',true),
 ('NDC',5,'target_progress','Avance por meta',true), ('NDC',6,'policies_projects','Políticas, programas y proyectos relacionados',false),
 ('NDC',7,'territorial','Distribución territorial',false), ('NDC',8,'sigi_contribution','Contribución de proyectos SIGI',false),
 ('NDC',9,'gaps','Brechas',false), ('NDC',10,'methodology','Metodología',true), ('NDC',11,'evidence','Evidencias',false),
 ('GBF_TARGET_2',1,'national_target','Meta nacional relacionada',true), ('GBF_TARGET_2',2,'baseline','Línea base',true),
 ('GBF_TARGET_2',3,'ecosystems','Ecosistemas considerados',true), ('GBF_TARGET_2',4,'degraded_ecosystems','Ecosistemas degradados',true),
 ('GBF_TARGET_2',5,'restoration_area','Área bajo restauración',true), ('GBF_TARGET_2',6,'intervention','Tipo de intervención',false),
 ('GBF_TARGET_2',7,'territorial','Distribución territorial',false), ('GBF_TARGET_2',8,'indicators','Indicadores',true),
 ('GBF_TARGET_2',9,'progress','Progreso de la meta',true), ('GBF_TARGET_2',10,'projects','Proyectos e iniciativas',false),
 ('GBF_TARGET_2',11,'institutions','Instituciones responsables',true), ('GBF_TARGET_2',12,'methodology','Metodología',true),
 ('GBF_TARGET_2',13,'sources','Fuentes',true), ('GBF_TARGET_2',14,'quality','Calidad y limitaciones',true),
 ('GBF_TARGET_2',15,'geospatial_evidence','Evidencias geoespaciales',false), ('GBF_TARGET_2',16,'maps','Mapas',false),
 ('GBF_TARGET_2',17,'annexes','Anexos',false),
 ('LDN',1,'context','Contexto nacional',true), ('LDN',2,'baseline','Línea base',true), ('LDN',3,'targets','Metas LDN',true),
 ('LDN',4,'land_cover','Cobertura del suelo',true), ('LDN',5,'land_productivity','Productividad de la tierra',true),
 ('LDN',6,'soil_carbon','Carbono orgánico del suelo',true), ('LDN',7,'degradation','Evaluación de degradación',true),
 ('LDN',8,'improved_areas','Áreas mejoradas',false), ('LDN',9,'degraded_areas','Áreas degradadas',true),
 ('LDN',10,'restoration','Intervenciones de restauración',false), ('LDN',11,'progress','Progreso respecto a metas',true),
 ('LDN',12,'territorial','Análisis territorial',false), ('LDN',13,'methodology','Metodología',true),
 ('LDN',14,'sources','Fuentes',true), ('LDN',15,'limitations','Limitaciones',true),
 ('LDN',16,'geospatial_evidence','Evidencias geoespaciales',false), ('LDN',17,'annexes','Anexos',false)
)
INSERT INTO core.report_template_sections (template_version_id, code, title, position, is_required, narrative_mode)
SELECT rtv.id, s.code, s.title, s.position, s.required, 'MANUAL'
FROM sections s
JOIN core.report_frameworks rf ON rf.code = s.framework
JOIN core.report_templates rt ON rt.framework_id = rf.id AND rt.code = s.framework || '_BASE'
JOIN core.report_template_versions rtv ON rtv.template_id = rt.id AND rtv.version = 1
ON CONFLICT (template_version_id, code) DO UPDATE SET
  title = EXCLUDED.title, position = EXCLUDED.position, is_required = EXCLUDED.is_required;

WITH requirements(framework, section_code, variable_code, label, source_type, required) AS (VALUES
 ('NATIONAL_CHAPTER','context','reporting_period','Período del informe','period',true),
 ('NATIONAL_CHAPTER','restoration_status','restored_area','Área bajo procesos de restauración','indicator',true),
 ('NATIONAL_CHAPTER','indicators','national_indicators','Indicadores nacionales seleccionados','indicator',true),
 ('NATIONAL_CHAPTER','sources_methodology','institutional_sources','Fuentes institucionales','source',true),
 ('REGIONAL_RESTORATION','regional_context','countries','Países incluidos','country',true),
 ('REGIONAL_RESTORATION','regional_status','restored_area_by_country','Superficie por país','indicator',true),
 ('REGIONAL_RESTORATION','indicators','regional_indicators','Indicadores homologados','indicator',true),
 ('BTR','general','reporting_period','Período del informe','period',true),
 ('BTR','ghg_inventory','ghg_inventory','Información de inventarios GEI','external',false),
 ('BTR','ndc_progress','ndc_progress','Seguimiento de progreso NDC','indicator',false),
 ('BTR','sources_methodology','institutional_sources','Fuentes y metodología','source',true),
 ('NDC','general','reporting_period','Período del informe','period',true),
 ('NDC','restoration_targets','ndc_targets','Metas NDC relacionadas con restauración','indicator',true),
 ('NDC','indicators','ndc_indicators','Indicadores NDC','indicator',true),
 ('NDC','evidence','supporting_evidence','Evidencias','document',false),
 ('GBF_TARGET_2','baseline','ecosystem_baseline','Línea base de ecosistemas','dataset',true),
 ('GBF_TARGET_2','degraded_ecosystems','degraded_area','Área degradada elegible','indicator',true),
 ('GBF_TARGET_2','restoration_area','reportable_restoration_area','Área oficialmente reportable','mapping',true),
 ('GBF_TARGET_2','sources','institutional_sources','Fuentes institucionales','source',true),
 ('LDN','baseline','ldn_baseline','Línea base LDN','dataset',true),
 ('LDN','land_cover','land_cover','Cobertura del suelo','dataset',true),
 ('LDN','land_productivity','land_productivity','Productividad de la tierra','indicator',true),
 ('LDN','soil_carbon','soil_organic_carbon','Carbono orgánico del suelo','external',true),
 ('LDN','sources','institutional_sources','Fuentes institucionales','source',true)
)
INSERT INTO core.report_data_requirements (
  template_version_id, section_code, variable_code, label, source_type, required
)
SELECT rtv.id, r.section_code, r.variable_code, r.label, r.source_type, r.required
FROM requirements r
JOIN core.report_frameworks rf ON rf.code = r.framework
JOIN core.report_templates rt ON rt.framework_id = rf.id AND rt.code = r.framework || '_BASE'
JOIN core.report_template_versions rtv ON rtv.template_id = rt.id AND rtv.version = 1
ON CONFLICT (template_version_id, variable_code) DO UPDATE SET
  section_code = EXCLUDED.section_code, label = EXCLUDED.label,
  source_type = EXCLUDED.source_type, required = EXCLUDED.required;

INSERT INTO core.report_reference_milestones (
  code, due_year, label, short_label, category, related_framework_code,
  guidance, source_note, display_order
) VALUES
 ('PREPARATION_2025',2025,'Preparación del ciclo de informes','Preparación','PREPARATION',NULL,'Organizar responsables, fuentes, brechas y reglas metodológicas antes del primer ciclo de entregas.','Calendario de referencia proporcionado para orientar al usuario; confirmar con cada proceso oficial.',10),
 ('CBD_7_2026',2026,'Séptimo informe nacional del Convenio sobre la Diversidad Biológica','CBD 7.0','BIODIVERSITY','GBF_TARGET_2','Preparar información de biodiversidad y restauración elegible para el proceso CBD.','Calendario de referencia proporcionado para orientar al usuario; confirmar con la Secretaría del CBD.',10),
 ('LDN_2026',2026,'Reporte de Neutralidad de la Degradación de las Tierras','LDN','LAND','LDN','Revisar línea base, cobertura, productividad, carbono del suelo y reglas nacionales de elegibilidad.','Calendario de referencia proporcionado para orientar al usuario; confirmar con el proceso UNCCD/PRAIS.',20),
 ('BTR_2_2026',2026,'Segundo Informe Bienal de Transparencia','BTR-2','CLIMATE','BTR','Identificar información SIGI disponible, derivable, faltante o proveniente de otros sistemas.','Calendario de referencia proporcionado para orientar al usuario; confirmar con el proceso UNFCCC.',30),
 ('AFOLU_2040_2026',2026,'Hito de la iniciativa regional AFOLU 2040','AFOLU 2040','REGIONAL','REGIONAL_RESTORATION','Coordinar la contribución regional y verificar compatibilidad metodológica entre países.','Calendario de referencia proporcionado para orientar al usuario; confirmar con la coordinación regional AFOLU 2040.',40),
 ('LDN_2027',2027,'Reporte de Neutralidad de la Degradación de las Tierras','LDN','LAND','LDN','Actualizar las dimensiones LDN únicamente con fuentes y metodología confirmadas.','Calendario de referencia proporcionado para orientar al usuario; confirmar con el proceso UNCCD/PRAIS.',10),
 ('VNR_2027',2027,'Informe Nacional Voluntario sobre los Objetivos de Desarrollo Sostenible','VNR','SUSTAINABLE_DEVELOPMENT',NULL,'Identificar indicadores SIGI pertinentes sin asumir equivalencia automática con indicadores ODS.','Calendario de referencia proporcionado para orientar al usuario; confirmar con la coordinación nacional del VNR.',20),
 ('BTR_3_2028',2028,'Tercer Informe Bienal de Transparencia','BTR-3','CLIMATE','BTR','Planificar revisión técnica y cierre de brechas de información antes de la entrega.','Calendario de referencia proporcionado para orientar al usuario; confirmar con el proceso UNFCCC.',10),
 ('CBD_8_2029',2029,'Octavo informe nacional del Convenio sobre la Diversidad Biológica','CBD 8.0','BIODIVERSITY','GBF_TARGET_2','Actualizar indicadores, fuentes y evidencia geoespacial para el ciclo CBD.','Calendario de referencia proporcionado para orientar al usuario; confirmar con la Secretaría del CBD.',10),
 ('NDC_4_2030',2030,'Cuarta Contribución Determinada a Nivel Nacional','NDC 4.0','CLIMATE','NDC','Consolidar metas, progreso, proyectos, territorio, metodología y evidencias NDC.','Calendario de referencia proporcionado para orientar al usuario; confirmar con el proceso nacional NDC/UNFCCC.',10),
 ('BTR_4_2030',2030,'Cuarto Informe Bienal de Transparencia','BTR-4','CLIMATE','BTR','Coordinar el corte de datos BTR con el ciclo NDC sin fusionar requisitos incompatibles.','Calendario de referencia proporcionado para orientar al usuario; confirmar con el proceso UNFCCC.',20),
 ('AFOLU_2040_2030',2030,'Hito de la iniciativa regional AFOLU 2040','AFOLU 2040','REGIONAL','REGIONAL_RESTORATION','Preparar consolidación regional reproducible y comparaciones metodológicamente compatibles.','Calendario de referencia proporcionado para orientar al usuario; confirmar con la coordinación regional AFOLU 2040.',30),
 ('LDN_2031',2031,'Reporte de Neutralidad de la Degradación de las Tierras','LDN','LAND','LDN','Verificar cambios respecto de la línea base y documentar metodología y limitaciones.','Calendario de referencia proporcionado para orientar al usuario; confirmar con el proceso UNCCD/PRAIS.',10),
 ('BTR_5_2032',2032,'Quinto Informe Bienal de Transparencia','BTR-5','CLIMATE','BTR','Preparar el siguiente ciclo BTR preservando versiones y trazabilidad de cada cifra.','Calendario de referencia proporcionado para orientar al usuario; confirmar con el proceso UNFCCC.',10)
ON CONFLICT (code) DO UPDATE SET
  due_year=EXCLUDED.due_year, label=EXCLUDED.label, short_label=EXCLUDED.short_label,
  category=EXCLUDED.category, related_framework_code=EXCLUDED.related_framework_code,
  guidance=EXCLUDED.guidance, source_note=EXCLUDED.source_note,
  display_order=EXCLUDED.display_order, updated_at=NOW();

INSERT INTO core.permissions (code, name) VALUES
 ('reports.read','Ver informes'), ('reports.create','Crear informes'), ('reports.edit','Editar informes'),
 ('reports.delete','Eliminar informes'), ('reports.generate','Generar versiones de informes'),
 ('reports.review','Revisar informes'), ('reports.approve','Aprobar informes'),
 ('reports.publish','Publicar informes'), ('reports.export','Exportar informes'),
 ('reports.templates.read','Ver plantillas de informes'), ('reports.templates.manage','Gestionar plantillas de informes'),
 ('reports.mappings.read','Ver correspondencias de marcos'), ('reports.mappings.manage','Gestionar correspondencias de marcos'),
 ('reports.config.manage','Gestionar configuración de informes'),
 ('reports.commitments.manage','Gestionar calendario de compromisos'),
 ('reports.contributions.submit','Enviar aportes institucionales'),
 ('reports.contributions.review','Revisar aportes institucionales')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

WITH grants(role_code, permission_code) AS (VALUES
 ('superadmin','reports.read'),('superadmin','reports.create'),('superadmin','reports.edit'),('superadmin','reports.delete'),
 ('superadmin','reports.generate'),('superadmin','reports.review'),('superadmin','reports.approve'),('superadmin','reports.publish'),
 ('superadmin','reports.export'),('superadmin','reports.templates.read'),('superadmin','reports.templates.manage'),
 ('superadmin','reports.mappings.read'),('superadmin','reports.mappings.manage'),('superadmin','reports.config.manage'),
 ('superadmin','reports.commitments.manage'),('superadmin','reports.contributions.submit'),('superadmin','reports.contributions.review'),
 ('national_admin','reports.read'),('national_admin','reports.create'),('national_admin','reports.edit'),
 ('national_admin','reports.generate'),('national_admin','reports.review'),('national_admin','reports.approve'),
 ('national_admin','reports.publish'),('national_admin','reports.export'),('national_admin','reports.templates.read'),
 ('national_admin','reports.templates.manage'),('national_admin','reports.mappings.read'),('national_admin','reports.mappings.manage'),
 ('national_admin','reports.commitments.manage'),('national_admin','reports.contributions.submit'),('national_admin','reports.contributions.review'),
 ('institution_editor','reports.read'),('institution_editor','reports.create'),('institution_editor','reports.edit'),
 ('institution_editor','reports.generate'),('institution_editor','reports.export'),('institution_editor','reports.templates.read'),
 ('institution_editor','reports.contributions.submit'),
 ('technical_validator','reports.read'),('technical_validator','reports.review'),('technical_validator','reports.templates.read'),
 ('technical_validator','reports.mappings.read'),('technical_integration','reports.read'),
 ('technical_validator','reports.contributions.review'),
 ('technical_integration','reports.templates.read'),('technical_integration','reports.mappings.read'),
 ('read_consumer','reports.read'),('read_consumer','reports.templates.read')
)
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM grants g
JOIN core.roles r ON r.code = g.role_code
JOIN core.permissions p ON p.code = g.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
