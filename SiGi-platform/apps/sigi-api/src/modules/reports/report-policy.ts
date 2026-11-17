import { BadRequestException } from '@nestjs/common';

export const REPORT_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'READY_FOR_REVIEW',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const COVERAGE_STATUSES = [
  'AVAILABLE',
  'PARTIAL',
  'MISSING',
  'NOT_APPLICABLE',
  'PENDING_VALIDATION',
  'MANUAL_REQUIRED',
] as const;

export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

const TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  DRAFT: ['IN_PROGRESS', 'READY_FOR_REVIEW', 'ARCHIVED'],
  IN_PROGRESS: ['READY_FOR_REVIEW', 'ARCHIVED'],
  READY_FOR_REVIEW: ['UNDER_REVIEW', 'CHANGES_REQUESTED'],
  UNDER_REVIEW: ['CHANGES_REQUESTED', 'APPROVED'],
  CHANGES_REQUESTED: ['IN_PROGRESS', 'READY_FOR_REVIEW', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function normalizeReportStatus(value: unknown): ReportStatus {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!REPORT_STATUSES.includes(normalized as ReportStatus)) {
    throw new BadRequestException(`Estado de informe no válido: ${normalized || '(vacío)'}.`);
  }
  return normalized as ReportStatus;
}

export function assertReportTransition(from: ReportStatus, to: ReportStatus) {
  if (!TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(`La transición ${from} → ${to} no está permitida.`);
  }
}

export type CoverageRequirement = {
  required: boolean;
  status: CoverageStatus;
  sectionCode?: string | null;
};

export function calculateCoverage(requirements: CoverageRequirement[]) {
  const quantifiable = requirements.filter(
    (item) => item.required && item.status !== 'NOT_APPLICABLE',
  );
  const available = quantifiable.filter((item) => item.status === 'AVAILABLE').length;
  const partial = quantifiable.filter((item) => item.status === 'PARTIAL').length;
  const pending = quantifiable.filter((item) =>
    ['PENDING_VALIDATION', 'MANUAL_REQUIRED'].includes(item.status),
  ).length;
  const missing = quantifiable.filter((item) => item.status === 'MISSING').length;
  const score = quantifiable.length === 0
    ? null
    : Math.round(((available + partial * 0.5) / quantifiable.length) * 100);

  return {
    score,
    total: requirements.length,
    quantifiable: quantifiable.length,
    available,
    partial,
    pending,
    missing,
    notApplicable: requirements.filter((item) => item.status === 'NOT_APPLICABLE').length,
  };
}

export function validateTemplateDefinition(input: {
  frameworkCode?: unknown;
  name?: unknown;
  sections?: Array<{ code?: unknown; title?: unknown }>;
}) {
  const frameworkCode = String(input.frameworkCode ?? '').trim().toUpperCase();
  const name = String(input.name ?? '').trim();
  if (!frameworkCode) {
    throw new BadRequestException('frameworkCode es requerido.');
  }
  if (!name) {
    throw new BadRequestException('name es requerido.');
  }
  const sections = input.sections ?? [];
  const codes = sections.map((section) => String(section.code ?? '').trim());
  if (codes.some((code) => !code)) {
    throw new BadRequestException('Toda sección debe tener código.');
  }
  if (new Set(codes).size !== codes.length) {
    throw new BadRequestException('Los códigos de sección no pueden repetirse.');
  }
  if (sections.some((section) => !String(section.title ?? '').trim())) {
    throw new BadRequestException('Toda sección debe tener título.');
  }
  return { frameworkCode, name };
}

export function assertMappingConfiguration(input: {
  mappingType?: unknown;
  transformationRule?: unknown;
  eligibilityRule?: unknown;
}) {
  const mappingType = String(input.mappingType ?? '').trim().toUpperCase();
  const allowed = ['DIRECT', 'DERIVED', 'AGGREGATED', 'MANUAL', 'NOT_EQUIVALENT'];
  if (!allowed.includes(mappingType)) {
    throw new BadRequestException('mappingType no válido.');
  }
  if (
    ['DERIVED', 'AGGREGATED'].includes(mappingType) &&
    !String(input.transformationRule ?? '').trim()
  ) {
    throw new BadRequestException('Los mapeos derivados o agregados requieren transformationRule.');
  }
  if (mappingType === 'DIRECT' && !String(input.eligibilityRule ?? '').trim()) {
    throw new BadRequestException('Un mapeo DIRECT requiere una regla de elegibilidad expresa.');
  }
  return mappingType;
}

export const CONTRIBUTION_STATUSES = [
  'PENDING', 'IN_PROGRESS', 'SUBMITTED', 'VALIDATED',
  'CHANGES_REQUESTED', 'NOT_APPLICABLE',
] as const;

export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export function validateCommitmentInput(input: Record<string, unknown>) {
  const title = String(input.title ?? '').trim();
  const dueDate = String(input.dueDate ?? '').trim();
  const internalCutoffDate = String(input.internalCutoffDate ?? '').trim() || null;
  const institutionIds = Array.isArray(input.institutionIds)
    ? Array.from(new Set(input.institutionIds.map(String).map((value) => value.trim()).filter(Boolean)))
    : [];
  if (!title) throw new BadRequestException('El título del compromiso es requerido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new BadRequestException('dueDate debe ser una fecha válida con formato AAAA-MM-DD.');
  }
  if (internalCutoffDate && !/^\d{4}-\d{2}-\d{2}$/.test(internalCutoffDate)) {
    throw new BadRequestException('internalCutoffDate debe usar el formato AAAA-MM-DD.');
  }
  if (internalCutoffDate && internalCutoffDate > dueDate) {
    throw new BadRequestException('La fecha de corte interno no puede ser posterior al compromiso del país.');
  }
  if (!institutionIds.length) {
    throw new BadRequestException('Seleccione al menos una institución que aportará información.');
  }
  return { title, dueDate, internalCutoffDate, institutionIds };
}

export function normalizeContributionReviewStatus(value: unknown): Extract<ContributionStatus, 'VALIDATED' | 'CHANGES_REQUESTED'> {
  const status = String(value ?? '').trim().toUpperCase();
  if (!['VALIDATED', 'CHANGES_REQUESTED'].includes(status)) {
    throw new BadRequestException('La revisión debe validar el aporte o solicitar cambios.');
  }
  return status as Extract<ContributionStatus, 'VALIDATED' | 'CHANGES_REQUESTED'>;
}
