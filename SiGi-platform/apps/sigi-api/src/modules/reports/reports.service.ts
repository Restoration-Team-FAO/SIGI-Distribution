import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { PostgresService } from '../../common/db/postgres.service';
import { AdminService } from '../admin/admin.service';
import { AuthPrincipal } from '../auth/auth.types';
import {
  assertMappingConfiguration,
  assertReportTransition,
  calculateCoverage,
  CoverageStatus,
  normalizeContributionReviewStatus,
  normalizeReportStatus,
  ReportStatus,
  validateCommitmentInput,
  validateTemplateDefinition,
} from './report-policy';

type RequestContext = { principal: AuthPrincipal; requestedEgiId: string | null };
type CreateReportInput = {
  templateId?: string; name?: string; institutionId?: string | null;
  countryCode?: string | null; periodStart?: string | null; periodEnd?: string | null;
  cutoffAt?: string | null; languageCode?: string; visibility?: string;
  scope?: Record<string, unknown>; selection?: Record<string, unknown>;
  quality?: Record<string, unknown>;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: PostgresService,
    private readonly adminService: AdminService,
  ) {}

  // Backwards-compatible, read-only endpoint used by the public country portal.
  async list() {
    const result = await this.db.query<LegacyReportRow>(legacySelect());
    return result.rows.map(mapLegacyReportRow);
  }

  async findOne(id: string) {
    const result = await this.db.query<LegacyReportRow>(
      `${legacySelect()} AND (rt.id::text = $1 OR rt.code = $1)`, [id],
    );
    return result.rows[0] ? mapLegacyReportRow(result.rows[0]) : null;
  }

  async listFrameworks(context: RequestContext) {
    await this.resolveEgi(context);
    const result = await this.db.query(`
      SELECT id, code, name, description, status, created_at, updated_at
      FROM core.report_frameworks WHERE status = 'active' ORDER BY name
    `);
    return result.rows.map(camelizeDates);
  }

  async referenceCalendar(context: RequestContext) {
    await this.resolveEgi(context);
    const result = await this.db.query<ReferenceMilestoneRow>(`
      SELECT id,code,due_year,label,short_label,category,related_framework_code,
        timing_precision,guidance,source_note,reference_url,status
      FROM core.report_reference_milestones
      WHERE active=TRUE AND due_year BETWEEN 2025 AND 2033
      ORDER BY due_year,display_order,label
    `);
    const milestones = result.rows.map((row) => ({
      id: row.id, code: row.code, dueYear: row.due_year, label: row.label,
      shortLabel: row.short_label, category: row.category,
      relatedFrameworkCode: row.related_framework_code,
      timingPrecision: row.timing_precision, guidance: row.guidance,
      sourceNote: row.source_note, referenceUrl: row.reference_url, status: row.status,
    }));
    return {
      startYear: 2025,
      endYear: 2033,
      disclaimer: 'Calendario de referencia. Confirme fechas y requisitos con la autoridad o secretaría responsable antes de programar o publicar.',
      milestones,
    };
  }

  async listCommitments(context: RequestContext) {
    const access = await this.scope(context);
    const canReviewAll = context.principal.permissions.includes('reports.contributions.review');
    const result = await this.db.query<CommitmentRow>(`
      SELECT rc.*,rf.code AS framework_code,rf.name AS framework_name,
        coordinator.name AS coordinating_institution_name,rrm.short_label AS reference_label,
        COALESCE((SELECT jsonb_build_object('enabled',rule.enabled,'daysBefore',rule.days_before,
          'overdueEveryDays',rule.overdue_every_days) FROM core.report_reminder_rules rule
          WHERE rule.commitment_id=rc.id),jsonb_build_object('enabled',TRUE,'daysBefore',ARRAY[30,15,7,1,0],
          'overdueEveryDays',7)) AS reminder_rule,
        COUNT(rcc.id)::int AS contribution_count,
        COUNT(rcc.id) FILTER (WHERE rcc.status='VALIDATED')::int AS validated_count,
        COUNT(rcc.id) FILTER (WHERE rcc.status='SUBMITTED')::int AS submitted_count,
        COALESCE(jsonb_agg(jsonb_build_object(
          'id',rcc.id,'institutionId',rcc.institution_id,'institutionName',institution.name,
          'responsibleUserId',rcc.responsible_user_id,'responsibleName',responsible.display_name,
          'responsibleEmail',responsible.email,'dueDate',rcc.due_date,
          'status',rcc.status,'notes',rcc.notes,'submission',rcc.submission_json,
          'submittedAt',rcc.submitted_at,'reviewedAt',rcc.reviewed_at,
          'documents',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',file.id,'name',file.name,'validationStatus',file.validation_status) ORDER BY file.name)
            FROM core.report_contribution_documents link JOIN documents.files file ON file.id=link.file_id
            WHERE link.contribution_id=rcc.id),'[]'::jsonb),
          'datasets',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',dataset.id,'title',dataset.title,'status',dataset.status) ORDER BY dataset.title)
            FROM core.report_contribution_datasets link JOIN core.datasets dataset ON dataset.id=link.dataset_id
            WHERE link.contribution_id=rcc.id),'[]'::jsonb),
          'indicators',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',indicator.id,'code',indicator.code,'name',indicator.name,'unit',indicator.unit,'value',indicator.current_value) ORDER BY indicator.name)
            FROM core.report_contribution_indicators link JOIN core.indicators indicator ON indicator.id=link.indicator_id
            WHERE link.contribution_id=rcc.id),'[]'::jsonb)
        ) ORDER BY institution.name) FILTER (WHERE rcc.id IS NOT NULL),'[]'::jsonb) AS contributions
      FROM core.report_commitments rc
      LEFT JOIN core.report_frameworks rf ON rf.id=rc.framework_id
      LEFT JOIN core.report_reference_milestones rrm ON rrm.id=rc.reference_milestone_id
      LEFT JOIN core.institutions coordinator ON coordinator.id=rc.coordinating_institution_id
      LEFT JOIN core.report_commitment_contributions rcc ON rcc.commitment_id=rc.id
      LEFT JOIN core.institutions institution ON institution.id=rcc.institution_id
      LEFT JOIN core.users responsible ON responsible.id=rcc.responsible_user_id
      WHERE rc.egi_id=$1::uuid AND ($2::boolean OR rc.coordinating_institution_id=$3::uuid
        OR EXISTS (SELECT 1 FROM core.report_commitment_contributions own
          WHERE own.commitment_id=rc.id AND own.institution_id=$3::uuid))
      GROUP BY rc.id,rf.id,coordinator.id,rrm.id
      ORDER BY rc.due_date,rc.title
    `, [access.egiId, access.canReadAll || canReviewAll, access.institutionId]);
    return result.rows.map(mapCommitmentRow);
  }

  async contributionEvidenceCatalog(context: RequestContext) {
    const access = await this.scope(context);
    if (!access.institutionId) throw new BadRequestException('El usuario no tiene una institución asociada.');
    const [documents, datasets, indicators] = await Promise.all([
      this.db.query(`SELECT id,name,title,validation_status FROM documents.files
        WHERE egi_id=$1::uuid AND deleted_at IS NULL AND (institution_id=$2::uuid OR institution_id IS NULL)
        ORDER BY updated_at DESC`, [access.egiId, access.institutionId]),
      this.db.query(`SELECT id,title,schema_code,status FROM core.datasets
        WHERE egi_id=$1::uuid AND institution_id=$2::uuid ORDER BY updated_at DESC`, [access.egiId, access.institutionId]),
      this.db.query(`SELECT id,code,name,unit,current_value FROM core.indicators ORDER BY code`, []),
    ]);
    return {
      documents: documents.rows.map((item) => ({ id: item.id, name: item.title ?? item.name, validationStatus: item.validation_status })),
      datasets: datasets.rows.map((item) => ({ id: item.id, title: item.title, schemaCode: item.schema_code, status: item.status })),
      indicators: indicators.rows.map((item) => ({ id: item.id, code: item.code, name: item.name, unit: item.unit, currentValue: item.current_value === null ? null : Number(item.current_value) })),
    };
  }

  async contributionParticipants(context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const result = await this.db.query(`
      SELECT institution.id,institution.code,institution.name,
        COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'displayName',u.display_name,'email',u.email)
          ORDER BY u.display_name) FILTER (WHERE u.id IS NOT NULL),'[]'::jsonb) AS users
      FROM core.institutions institution
      LEFT JOIN core.users u ON u.institution_id=institution.id AND u.status='active'
        AND EXISTS (SELECT 1 FROM core.egi_memberships membership
          WHERE membership.egi_id=$1::uuid AND membership.user_id=u.id AND membership.membership_status='active')
      WHERE institution.status='active'
      GROUP BY institution.id ORDER BY institution.name
    `, [egiId]);
    return result.rows.map((item) => ({ id: item.id, code: item.code, name: item.name, users: item.users }));
  }

  async updateContributionAssignments(id: string, input: Record<string, unknown>, context: RequestContext) {
    const commitment = await this.requireCommitment(id, context);
    if (!['DRAFT','OPEN'].includes(commitment.status)) throw new BadRequestException('Las instituciones solo pueden editarse mientras el compromiso está en borrador o abierto.');
    const assignments = normalizeAssignments(input.assignments);
    if (!assignments.length) throw new BadRequestException('Seleccione al menos una institución participante.');
    const dueDate = commitment.internalCutoffDate ?? commitment.dueDate;
    await this.db.transaction(async (client) => {
      await this.assertAssignments(client, commitment.egiId, assignments);
      const retainedIds = assignments.map((item) => item.institutionId);
      const blocked = await client.query<{ count: number }>(`SELECT COUNT(*)::int AS count
        FROM core.report_commitment_contributions WHERE commitment_id=$1::uuid
          AND NOT (institution_id=ANY($2::uuid[])) AND status NOT IN ('PENDING','IN_PROGRESS')`, [id, retainedIds]);
      if ((blocked.rows[0]?.count ?? 0) > 0) throw new BadRequestException('No se puede retirar una institución que ya envió información o recibió observaciones.');
      await client.query(`DELETE FROM core.report_commitment_contributions
        WHERE commitment_id=$1::uuid AND NOT (institution_id=ANY($2::uuid[]))`, [id, retainedIds]);
      for (const assignment of assignments) {
        const saved = await client.query<{ id: string }>(`INSERT INTO core.report_commitment_contributions
          (commitment_id,institution_id,responsible_user_id,due_date)
          VALUES ($1::uuid,$2::uuid,$3::uuid,$4::date)
          ON CONFLICT (commitment_id,institution_id) DO UPDATE SET
            responsible_user_id=EXCLUDED.responsible_user_id,due_date=EXCLUDED.due_date,updated_at=NOW()
          RETURNING id`, [id, assignment.institutionId, assignment.responsibleUserId, dueDate]);
        if (assignment.responsibleUserId) {
          await client.query(`INSERT INTO core.report_notifications
            (egi_id,commitment_id,contribution_id,user_id,kind,title,message,dedup_key)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'ASSIGNED',$5,$6,$7)
            ON CONFLICT (dedup_key) DO NOTHING`, [commitment.egiId, id, saved.rows[0].id,
            assignment.responsibleUserId, 'Nuevo aporte de informe asignado',
            `Su institución debe aportar información para “${commitment.title}” antes del ${dueDate}.`,
            `ASSIGNED:${saved.rows[0].id}:${assignment.responsibleUserId}`]);
        }
      }
      await client.query(`INSERT INTO core.report_reminder_rules (commitment_id,updated_by_user_id)
        VALUES ($1::uuid,$2::uuid) ON CONFLICT (commitment_id) DO NOTHING`, [id, context.principal.userId]);
      await this.audit(client, context, commitment.egiId, 'REPORT_ASSIGNMENTS_UPDATED', id, { assignments });
    });
    return this.requireCommitment(id, context);
  }

  async updateReminderRule(id: string, input: Record<string, unknown>, context: RequestContext) {
    const commitment = await this.requireCommitment(id, context);
    const daysBefore = normalizeReminderDays(input.daysBefore);
    const overdueEveryDays = Math.max(1, Math.min(90, Number(input.overdueEveryDays ?? 7) || 7));
    await this.db.query(`INSERT INTO core.report_reminder_rules
      (commitment_id,enabled,days_before,overdue_every_days,updated_by_user_id,updated_at)
      VALUES ($1::uuid,$2,$3::int[],$4,$5::uuid,NOW()) ON CONFLICT (commitment_id) DO UPDATE SET
        enabled=EXCLUDED.enabled,days_before=EXCLUDED.days_before,overdue_every_days=EXCLUDED.overdue_every_days,
        updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()`,
    [id, input.enabled !== false, daysBefore, overdueEveryDays, context.principal.userId]);
    return { commitmentId: id, enabled: input.enabled !== false, daysBefore, overdueEveryDays, egiId: commitment.egiId };
  }

  async processReminders(context: RequestContext, onlyCurrentUser = false) {
    const egiId = await this.resolveEgi(context);
    const result = await this.db.query(`
      INSERT INTO core.report_notifications
        (egi_id,commitment_id,contribution_id,user_id,kind,title,message,dedup_key)
      SELECT commitment.egi_id,commitment.id,contribution.id,contribution.responsible_user_id,
        CASE WHEN contribution.due_date=CURRENT_DATE THEN 'DUE_TODAY'
          WHEN contribution.due_date<CURRENT_DATE THEN 'OVERDUE' ELSE 'DUE_SOON' END,
        CASE WHEN contribution.due_date<CURRENT_DATE THEN 'Aporte de informe vencido'
          ELSE 'Próximo vencimiento de aporte' END,
        'El aporte para “' || commitment.title || '” vence el ' || contribution.due_date::text || '.',
        'REMINDER:' || contribution.id::text || ':' || CURRENT_DATE::text
      FROM core.report_commitments commitment
      JOIN core.report_commitment_contributions contribution ON contribution.commitment_id=commitment.id
      LEFT JOIN core.report_reminder_rules rule ON rule.commitment_id=commitment.id
      WHERE commitment.egi_id=$1::uuid AND commitment.status IN ('OPEN','IN_REVIEW')
        AND contribution.status IN ('PENDING','IN_PROGRESS','CHANGES_REQUESTED')
        AND contribution.responsible_user_id IS NOT NULL
        AND ($2::uuid IS NULL OR contribution.responsible_user_id=$2::uuid)
        AND COALESCE(rule.enabled,TRUE)
        AND (contribution.due_date-CURRENT_DATE=ANY(COALESCE(rule.days_before,ARRAY[30,15,7,1,0]))
          OR (contribution.due_date<CURRENT_DATE AND MOD(CURRENT_DATE-contribution.due_date,COALESCE(rule.overdue_every_days,7))=0))
      ON CONFLICT (dedup_key) DO NOTHING RETURNING id
    `, [egiId, onlyCurrentUser ? context.principal.userId : null]);
    return { created: result.rowCount ?? 0, processedAt: new Date().toISOString() };
  }

  async listNotifications(context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const result = await this.db.query(`SELECT notification.*,commitment.title AS commitment_title
      FROM core.report_notifications notification
      JOIN core.report_commitments commitment ON commitment.id=notification.commitment_id
      WHERE notification.egi_id=$1::uuid AND notification.user_id=$2::uuid
      ORDER BY (notification.status='UNREAD') DESC,notification.created_at DESC LIMIT 50`, [egiId, context.principal.userId]);
    return result.rows.map((item) => ({ id: item.id, commitmentId: item.commitment_id,
      contributionId: item.contribution_id, kind: item.kind, title: item.title, message: item.message,
      status: item.status, createdAt: item.created_at.toISOString(), readAt: item.read_at?.toISOString?.() ?? item.read_at }));
  }

  async markNotificationRead(id: string, context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const result = await this.db.query(`UPDATE core.report_notifications SET status='READ',read_at=NOW()
      WHERE id=$1::uuid AND egi_id=$2::uuid AND user_id=$3::uuid RETURNING id`, [id, egiId, context.principal.userId]);
    if (!result.rows[0]) throw new NotFoundException('Notificación no encontrada.');
    return { id, status: 'READ' };
  }

  async exportCommitmentCalendar(format: 'xlsx' | 'ics', filters: Record<string, unknown>, context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const year = Number(filters.year ?? 0);
    const status = String(filters.status ?? '').trim().toUpperCase();
    const institutionId = String(filters.institutionId ?? '').trim();
    const visible = (await this.listCommitments(context)).filter((item) =>
      (!year || Number(item.dueDate.slice(0, 4)) === year) &&
      (!status || item.status === status) &&
      (!institutionId || item.contributions.some((contribution) => contribution.institutionId === institutionId)),
    );
    let body: Buffer;
    let filename: string;
    let contentType: string;
    if (format === 'xlsx') {
      const rows = visible.flatMap((item) => item.contributions.length ? item.contributions.map((contribution) => ({
        'Compromiso': item.title, 'Marco': item.frameworkName ?? '', 'País': item.countryCode ?? '',
        'Fecha país': item.dueDate, 'Corte interno': item.internalCutoffDate ?? '',
        'Estado compromiso': item.status, 'Institución coordinadora': item.coordinatingInstitutionName ?? '',
        'Institución aportante': contribution.institutionName, 'Responsable': contribution.responsibleName ?? '',
        'Correo responsable': contribution.responsibleEmail ?? '', 'Estado aporte': contribution.status,
        'Documentos': contribution.documents.length, 'Datasets': contribution.datasets.length,
        'Indicadores': contribution.indicators.length,
      })) : [{ 'Compromiso': item.title, 'Marco': item.frameworkName ?? '', 'País': item.countryCode ?? '',
        'Fecha país': item.dueDate, 'Corte interno': item.internalCutoffDate ?? '', 'Estado compromiso': item.status,
        'Institución coordinadora': item.coordinatingInstitutionName ?? '', 'Institución aportante': '',
        'Responsable': '', 'Correo responsable': '', 'Estado aporte': '', 'Documentos': 0, 'Datasets': 0, 'Indicadores': 0 }]);
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Sin resultados': 'No existen compromisos para los filtros seleccionados.' }]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Cronograma');
      body = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
      filename = `sigi-cronograma-${year || 'todos'}.xlsx`;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      const events = visible.map((item) => [`BEGIN:VEVENT`, `UID:${item.id}@sigi`,
        `DTSTAMP:${icsTimestamp(new Date())}`, `DTSTART;VALUE=DATE:${item.dueDate.replace(/-/g,'')}`,
        `DTEND;VALUE=DATE:${nextDate(item.dueDate).replace(/-/g,'')}`,
        `SUMMARY:${escapeIcs(item.title)}`, `DESCRIPTION:${escapeIcs(`${item.frameworkName ?? 'Informe'} · ${item.contributionCount} institución(es) · ${item.validatedCount} validada(s)`)}`,
        `STATUS:${item.status === 'CANCELLED' ? 'CANCELLED' : item.status === 'CLOSED' ? 'COMPLETED' : 'CONFIRMED'}`, `END:VEVENT`].join('\r\n'));
      body = Buffer.from(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SIGI//Calendario de Informes//ES','CALSCALE:GREGORIAN',...events,'END:VCALENDAR',''].join('\r\n'), 'utf8');
      filename = `sigi-cronograma-${year || 'todos'}.ics`;
      contentType = 'text/calendar; charset=utf-8';
    }
    await this.db.transaction((client) => this.audit(client, context, egiId!, 'REPORT_CALENDAR_EXPORTED', egiId!, { format, year: year || null, status: status || null, institutionId: institutionId || null, count: visible.length }));
    return { body, filename, contentType, count: visible.length };
  }

  async createCommitment(input: Record<string, unknown>, context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const normalized = validateCommitmentInput(input);
    const coordinatorId = text(input.coordinatingInstitutionId) ?? context.principal.institutionId;
    if (!coordinatorId) throw new BadRequestException('Seleccione la institución coordinadora.');
    const institutionIds = Array.from(new Set([coordinatorId, ...normalized.institutionIds]));
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM core.institutions WHERE id=ANY($1::uuid[]) AND status='active'`, [institutionIds],
    );
    if (existing.rowCount !== institutionIds.length) {
      throw new BadRequestException('Una o más instituciones seleccionadas no existen o están inactivas.');
    }
    const id = await this.db.transaction(async (client) => {
      const created = await client.query<{ id: string }>(`
        INSERT INTO core.report_commitments (
          egi_id,framework_id,reference_milestone_id,coordinating_institution_id,title,
          country_code,reporting_period_start,reporting_period_end,due_date,
          internal_cutoff_date,instructions,status,created_by_user_id,updated_by_user_id
        ) VALUES ($1::uuid,(SELECT id FROM core.report_frameworks WHERE code=$2),$3::uuid,$4::uuid,$5,
          $6,$7::date,$8::date,$9::date,$10::date,$11,$12,$13::uuid,$13::uuid) RETURNING id
      `, [egiId, text(input.frameworkCode)?.toUpperCase() ?? null,
        text(input.referenceMilestoneId), coordinatorId, normalized.title,
        text(input.countryCode)?.toUpperCase() ?? null, text(input.reportingPeriodStart),
        text(input.reportingPeriodEnd), normalized.dueDate, normalized.internalCutoffDate,
        text(input.instructions), normalizeCommitmentStatus(input.status), context.principal.userId]);
      for (const institutionId of institutionIds) {
        await client.query(`
          INSERT INTO core.report_commitment_contributions
            (commitment_id,institution_id,due_date,responsible_user_id)
          VALUES ($1::uuid,$2::uuid,$3::date,$4::uuid)
        `, [created.rows[0].id, institutionId,
          normalized.internalCutoffDate ?? normalized.dueDate,
          institutionId === context.principal.institutionId ? context.principal.userId : null]);
      }
      await this.audit(client, context, egiId!, 'REPORT_COMMITMENT_CREATED', created.rows[0].id, {
        dueDate: normalized.dueDate, institutionIds,
      });
      return created.rows[0].id;
    });
    return this.requireCommitment(id, context);
  }

  async updateCommitment(id: string, input: Record<string, unknown>, context: RequestContext) {
    const current = await this.requireCommitment(id, context);
    const dueDate = text(input.dueDate) ?? current.dueDate;
    const cutoff = input.internalCutoffDate === null ? null : (text(input.internalCutoffDate) ?? current.internalCutoffDate);
    if (cutoff && cutoff > dueDate) throw new BadRequestException('La fecha de corte interno no puede ser posterior al compromiso del país.');
    await this.db.transaction(async (client) => {
      await client.query(`UPDATE core.report_commitments SET
        title=COALESCE($2,title),due_date=$3::date,internal_cutoff_date=$4::date,
        instructions=CASE WHEN $5::boolean THEN $6 ELSE instructions END,
        status=COALESCE($7,status),updated_by_user_id=$8::uuid,updated_at=NOW()
        WHERE id=$1::uuid`, [id, text(input.title), dueDate, cutoff,
        Object.prototype.hasOwnProperty.call(input, 'instructions'), text(input.instructions),
        input.status === undefined ? null : normalizeCommitmentStatus(input.status), context.principal.userId]);
      await client.query(`UPDATE core.report_commitment_contributions SET due_date=$2::date,updated_at=NOW()
        WHERE commitment_id=$1::uuid AND status IN ('PENDING','IN_PROGRESS','CHANGES_REQUESTED')`, [id, cutoff ?? dueDate]);
      await this.audit(client, context, current.egiId, 'REPORT_COMMITMENT_UPDATED', id, { dueDate, internalCutoffDate: cutoff });
    });
    return this.requireCommitment(id, context);
  }

  async submitContribution(id: string, input: Record<string, unknown>, context: RequestContext) {
    const access = await this.scope(context);
    if (!access.institutionId) throw new BadRequestException('El usuario no tiene una institución asociada.');
    const submission = normalizeObject(input.submission);
    const documentIds = stringArray(submission.documentIds);
    const datasetIds = stringArray(submission.datasetIds);
    const indicatorIds = stringArray(submission.indicatorIds);
    if (!text(input.notes) && !documentIds.length && !datasetIds.length && !indicatorIds.length) {
      throw new BadRequestException('Incluya observaciones o seleccione al menos una evidencia institucional.');
    }
    const result = await this.db.transaction(async (client) => {
      await this.assertContributionEvidence(client, access.egiId!, access.institutionId!, documentIds, datasetIds, indicatorIds);
      const updated = await client.query<{ id: string }>(`
        UPDATE core.report_commitment_contributions contribution SET
          status='SUBMITTED',notes=$4,submission_json=$5::jsonb,responsible_user_id=$6::uuid,
          submitted_at=NOW(),reviewed_at=NULL,reviewed_by_user_id=NULL,updated_at=NOW()
        FROM core.report_commitments commitment
        WHERE contribution.commitment_id=commitment.id AND commitment.id=$1::uuid
          AND commitment.egi_id=$2::uuid AND contribution.institution_id=$3::uuid
          AND commitment.status IN ('OPEN','IN_REVIEW')
          AND contribution.status IN ('PENDING','IN_PROGRESS','CHANGES_REQUESTED')
        RETURNING contribution.id
      `, [id, access.egiId, access.institutionId, text(input.notes),
        JSON.stringify({ documentIds, datasetIds, indicatorIds }), context.principal.userId]);
      if (!updated.rows[0]) throw new NotFoundException('No existe una asignación abierta para su institución.');
      await client.query(`DELETE FROM core.report_contribution_documents WHERE contribution_id=$1::uuid`, [updated.rows[0].id]);
      await client.query(`DELETE FROM core.report_contribution_datasets WHERE contribution_id=$1::uuid`, [updated.rows[0].id]);
      await client.query(`DELETE FROM core.report_contribution_indicators WHERE contribution_id=$1::uuid`, [updated.rows[0].id]);
      if (documentIds.length) await client.query(`INSERT INTO core.report_contribution_documents (contribution_id,file_id) SELECT $1::uuid,unnest($2::uuid[])`, [updated.rows[0].id, documentIds]);
      if (datasetIds.length) await client.query(`INSERT INTO core.report_contribution_datasets (contribution_id,dataset_id) SELECT $1::uuid,unnest($2::uuid[])`, [updated.rows[0].id, datasetIds]);
      if (indicatorIds.length) await client.query(`INSERT INTO core.report_contribution_indicators (contribution_id,indicator_id) SELECT $1::uuid,unnest($2::uuid[])`, [updated.rows[0].id, indicatorIds]);
      await this.audit(client, context, access.egiId!, 'REPORT_CONTRIBUTION_SUBMITTED', id, { contributionId: updated.rows[0].id });
      return updated.rows[0].id;
    });
    return { contributionId: result, commitment: await this.requireCommitment(id, context) };
  }

  async reviewContribution(id: string, contributionId: string, input: Record<string, unknown>, context: RequestContext) {
    const commitment = await this.requireCommitment(id, context);
    const status = normalizeContributionReviewStatus(input.status);
    await this.db.transaction(async (client) => {
      const updated = await client.query<{ id:string;responsible_user_id:string|null;updated_at:Date }>(`UPDATE core.report_commitment_contributions SET
        status=$3,notes=COALESCE($4,notes),reviewed_at=NOW(),reviewed_by_user_id=$5::uuid,updated_at=NOW()
        WHERE id=$2::uuid AND commitment_id=$1::uuid AND status='SUBMITTED'
        RETURNING id,responsible_user_id,updated_at`, [id, contributionId, status, text(input.notes), context.principal.userId]);
      if (!updated.rows[0]) throw new NotFoundException('El aporte enviado no fue encontrado.');
      if (status === 'CHANGES_REQUESTED' && updated.rows[0].responsible_user_id) {
        await client.query(`INSERT INTO core.report_notifications
          (egi_id,commitment_id,contribution_id,user_id,kind,title,message,dedup_key)
          VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'CHANGES_REQUESTED','Cambios solicitados en un aporte',$5,$6)
          ON CONFLICT (dedup_key) DO NOTHING`, [commitment.egiId, id, contributionId,
          updated.rows[0].responsible_user_id,
          `El aporte para “${commitment.title}” requiere cambios. ${text(input.notes) ?? ''}`.trim(),
          `CHANGES:${contributionId}:${updated.rows[0].updated_at.toISOString()}`]);
      }
      await this.audit(client, context, commitment.egiId, 'REPORT_CONTRIBUTION_REVIEWED', id, { contributionId, status });
    });
    return this.requireCommitment(id, context);
  }

  async createConsolidatedReport(id: string, input: Record<string, unknown>, context: RequestContext) {
    const commitment = await this.requireCommitment(id, context);
    if (commitment.reportId) throw new BadRequestException('Este compromiso ya está vinculado a un informe.');
    const validated = commitment.contributions.filter((item) => item.status === 'VALIDATED');
    if (!validated.length) throw new BadRequestException('Se requiere al menos un aporte institucional validado para consolidar.');
    const template = await this.db.query<{ id: string }>(`
      SELECT rt.id FROM core.report_templates rt
      WHERE rt.status='active' AND rt.framework_id=$1::uuid
        AND (rt.egi_id IS NULL OR rt.egi_id=$2::uuid)
      ORDER BY (rt.egi_id IS NOT NULL) DESC,rt.updated_at DESC LIMIT 1
    `, [commitment.frameworkId, commitment.egiId]);
    if (!template.rows[0]) throw new NotFoundException('No existe una plantilla activa para el marco del compromiso.');
    const report = await this.create({
      templateId: template.rows[0].id,
      name: text(input.name) ?? commitment.title,
      countryCode: commitment.countryCode,
      periodStart: commitment.reportingPeriodStart,
      periodEnd: commitment.reportingPeriodEnd,
      cutoffAt: commitment.internalCutoffDate ? `${commitment.internalCutoffDate}T23:59:59.000Z` : null,
      selection: { contributionIds: validated.map((item) => item.id) },
      scope: { commitmentId: id, countryCode: commitment.countryCode },
    }, context);
    await this.db.transaction(async (client) => {
      await client.query(`UPDATE core.report_commitments SET report_id=$2::uuid,status='IN_REVIEW',updated_by_user_id=$3::uuid,updated_at=NOW() WHERE id=$1::uuid`, [id, report.id, context.principal.userId]);
      await this.audit(client, context, commitment.egiId, 'REPORT_COMMITMENT_CONSOLIDATED', id, { reportId: report.id, contributionIds: validated.map((item) => item.id) });
    });
    return { commitment: await this.requireCommitment(id, context), report };
  }

  async listTemplates(context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const result = await this.db.query<TemplateRow>(`
      SELECT rt.id, rt.code, rt.name, rt.description, rt.status, rt.country_code,
        rt.language_code, rt.current_version, rt.egi_id, rt.institution_id,
        rt.updated_at, rf.code AS framework_code, rf.name AS framework_name,
        COUNT(rts.id)::int AS section_count
      FROM core.report_templates rt
      JOIN core.report_frameworks rf ON rf.id = rt.framework_id
      LEFT JOIN core.report_template_versions rtv
        ON rtv.template_id = rt.id AND rtv.version = rt.current_version
      LEFT JOIN core.report_template_sections rts ON rts.template_version_id = rtv.id
      WHERE rt.status = 'active' AND (rt.egi_id IS NULL OR rt.egi_id = $1::uuid)
      GROUP BY rt.id, rf.id ORDER BY rf.name, rt.name
    `, [egiId]);
    return result.rows.map(mapTemplateRow);
  }

  async dashboard(context: RequestContext) {
    const access = await this.scope(context);
    const params = [access.egiId, access.canReadAll, access.institutionId];
    const [summary, byFramework, recent, templates, pending] = await Promise.all([
      this.db.query<DashboardRow>(`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status IN ('DRAFT','IN_PROGRESS','CHANGES_REQUESTED'))::int AS drafts,
          COUNT(*) FILTER (WHERE status IN ('READY_FOR_REVIEW','UNDER_REVIEW'))::int AS in_review,
          COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'PUBLISHED')::int AS published,
          COUNT(*) FILTER (WHERE period_start <= CURRENT_DATE AND (period_end IS NULL OR period_end >= CURRENT_DATE))::int AS current_period
        FROM core.report_instances
        WHERE egi_id = $1::uuid AND ($2::boolean OR institution_id IS NULL OR institution_id = $3::uuid)
      `, params),
      this.db.query<CountRow>(`
        SELECT rf.code AS key, COUNT(ri.id)::int AS count
        FROM core.report_frameworks rf
        LEFT JOIN core.report_templates rt ON rt.framework_id = rf.id
        LEFT JOIN core.report_instances ri ON ri.template_id = rt.id
          AND ri.egi_id = $1::uuid
          AND ($2::boolean OR ri.institution_id IS NULL OR ri.institution_id = $3::uuid)
        GROUP BY rf.code ORDER BY rf.code
      `, params),
      this.db.query<RecentRow>(`
        SELECT ae.id, ae.action, ae.created_at, u.email AS user_email,
          ri.id AS report_id, ri.name AS report_name, ri.status,
          rv.label AS version_label
        FROM core.audit_events ae
        JOIN core.report_instances ri ON ri.id = ae.entity_id
        LEFT JOIN core.users u ON u.id = ae.actor_user_id
        LEFT JOIN LATERAL (
          SELECT label FROM core.report_versions v WHERE v.report_id = ri.id
          ORDER BY v.created_at DESC LIMIT 1
        ) rv ON TRUE
        WHERE ae.entity_type = 'report' AND ae.egi_id = $1::uuid
          AND ($2::boolean OR ri.institution_id IS NULL OR ri.institution_id = $3::uuid)
        ORDER BY ae.created_at DESC LIMIT 10
      `, params),
      this.db.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count FROM core.report_templates
        WHERE status = 'active' AND (egi_id IS NULL OR egi_id = $1::uuid)
      `, [access.egiId]),
      this.db.query<{ reports: number; validations: number }>(`
        SELECT COUNT(DISTINCT rrs.report_id) FILTER (WHERE rrs.status IN ('MISSING','PARTIAL','MANUAL_REQUIRED'))::int AS reports,
          COUNT(DISTINCT rrs.report_id) FILTER (WHERE rrs.status = 'PENDING_VALIDATION')::int AS validations
        FROM core.report_requirement_status rrs
        JOIN core.report_instances ri ON ri.id = rrs.report_id
        WHERE ri.egi_id = $1::uuid AND ($2::boolean OR ri.institution_id IS NULL OR ri.institution_id = $3::uuid)
      `, params),
    ]);
    const row = summary.rows[0];
    return {
      summary: {
        total: row?.total ?? 0, drafts: row?.drafts ?? 0,
        inReview: row?.in_review ?? 0, approved: row?.approved ?? 0,
        published: row?.published ?? 0, activeTemplates: templates.rows[0]?.count ?? 0,
        currentPeriod: row?.current_period ?? 0,
        dataPending: pending.rows[0]?.reports ?? 0,
        validationPending: pending.rows[0]?.validations ?? 0,
      },
      byFramework: byFramework.rows.map((item) => ({ code: item.key, count: item.count })),
      recentActivity: recent.rows.map((item) => ({
        id: item.id, reportId: item.report_id, reportName: item.report_name,
        version: item.version_label, user: item.user_email, action: item.action,
        status: item.status, date: item.created_at.toISOString(),
      })),
    };
  }

  async listAdmin(context: RequestContext) {
    const access = await this.scope(context);
    const result = await this.db.query<ReportInstanceRow>(`${adminReportSelect()}
      WHERE ri.egi_id = $1::uuid
        AND ($2::boolean OR ri.institution_id IS NULL OR ri.institution_id = $3::uuid)
      ORDER BY ri.updated_at DESC
    `, [access.egiId, access.canReadAll, access.institutionId]);
    return result.rows.map(mapReportInstance);
  }

  async getAdmin(id: string, context: RequestContext) {
    const report = await this.requireReport(id, context);
    const [sections, versions, coverage] = await Promise.all([
      this.db.query(`
        SELECT rts.id, rts.code, rts.title, rts.description, rts.position,
          rts.is_required, rts.is_enabled, rts.narrative_mode
        FROM core.report_instances ri
        JOIN core.report_templates rt ON rt.id = ri.template_id
        JOIN core.report_template_versions rtv ON rtv.template_id = rt.id AND rtv.version = rt.current_version
        JOIN core.report_template_sections rts ON rts.template_version_id = rtv.id
        WHERE ri.id = $1::uuid ORDER BY rts.position
      `, [id]),
      this.listVersions(id, context), this.coverage(id, context),
    ]);
    return { ...report, sections: sections.rows.map(camelizeSection), versions, coverage };
  }

  async create(input: CreateReportInput, context: RequestContext) {
    const access = await this.scope(context);
    const templateId = input.templateId?.trim();
    const name = input.name?.trim();
    if (!templateId || !name) throw new BadRequestException('templateId y name son requeridos.');
    const template = await this.db.query<{ id: string }>(`
      SELECT id FROM core.report_templates
      WHERE id = $1::uuid AND status = 'active' AND (egi_id IS NULL OR egi_id = $2::uuid)
    `, [templateId, access.egiId]);
    if (!template.rows[0]) throw new NotFoundException('Plantilla no encontrada.');
    const institutionId = access.canReadAll
      ? (input.institutionId ?? context.principal.institutionId ?? null)
      : (context.principal.institutionId ?? null);
    const selection = normalizeObject(input.selection);
    const scope = normalizeObject(input.scope);
    const quality = { minimumValidation: 'approved', ...normalizeObject(input.quality) };

    const createdId = await this.db.transaction(async (client) => {
      const result = await client.query<{ id: string }>(`
        INSERT INTO core.report_instances (
          egi_id, institution_id, template_id, name, country_code, period_start,
          period_end, cutoff_at, language_code, visibility, scope_json,
          selection_json, quality_json, created_by_user_id, updated_by_user_id
        ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::date,$7::date,$8::timestamptz,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::uuid,$14::uuid)
        RETURNING id
      `, [access.egiId, institutionId, templateId, name,
        text(input.countryCode), text(input.periodStart), text(input.periodEnd), text(input.cutoffAt),
        input.languageCode === 'en' ? 'en' : 'es', normalizeVisibility(input.visibility),
        JSON.stringify(scope), JSON.stringify(selection), JSON.stringify(quality), context.principal.userId]);
      await this.initializeCoverage(client, result.rows[0].id, templateId, input, selection, scope);
      await this.audit(client, context, access.egiId!, 'REPORT_CREATED', result.rows[0].id, { templateId });
      return result.rows[0].id;
    });
    return this.getAdmin(createdId, context);
  }

  async update(id: string, input: CreateReportInput, context: RequestContext) {
    const current = await this.requireReport(id, context);
    if (!['DRAFT','IN_PROGRESS','CHANGES_REQUESTED'].includes(current.status)) {
      throw new BadRequestException('Solo se pueden editar borradores o informes con cambios solicitados.');
    }
    await this.db.transaction(async (client) => {
      await client.query(`
        UPDATE core.report_instances SET
          name=COALESCE($2,name), country_code=CASE WHEN $3 THEN $4 ELSE country_code END,
          period_start=CASE WHEN $5 THEN $6::date ELSE period_start END,
          period_end=CASE WHEN $7 THEN $8::date ELSE period_end END,
          cutoff_at=CASE WHEN $9 THEN $10::timestamptz ELSE cutoff_at END,
          language_code=COALESCE($11,language_code), visibility=COALESCE($12,visibility),
          scope_json=CASE WHEN $13 THEN $14::jsonb ELSE scope_json END,
          selection_json=CASE WHEN $15 THEN $16::jsonb ELSE selection_json END,
          quality_json=CASE WHEN $17 THEN $18::jsonb ELSE quality_json END,
          status=CASE WHEN status='DRAFT' THEN 'IN_PROGRESS' ELSE status END,
          updated_by_user_id=$19::uuid, updated_at=NOW()
        WHERE id=$1::uuid
      `, [id, input.name?.trim() || null, input.countryCode !== undefined, input.countryCode ?? null,
        input.periodStart !== undefined, input.periodStart ?? null, input.periodEnd !== undefined, input.periodEnd ?? null,
        input.cutoffAt !== undefined, input.cutoffAt ?? null, input.languageCode ?? null,
        input.visibility ? normalizeVisibility(input.visibility) : null,
        input.scope !== undefined, JSON.stringify(input.scope ?? {}), input.selection !== undefined,
        JSON.stringify(input.selection ?? {}), input.quality !== undefined, JSON.stringify(input.quality ?? {}),
        context.principal.userId]);
      if (input.countryCode !== undefined || input.periodStart !== undefined || input.periodEnd !== undefined || input.scope !== undefined || input.selection !== undefined) {
        const effectiveScope = input.scope ?? current.scope;
        const effectiveSelection = input.selection ?? current.selection;
        await client.query(`DELETE FROM core.report_requirement_status WHERE report_id=$1::uuid`, [id]);
        await this.initializeCoverage(client, id, current.templateId, {
          countryCode: input.countryCode !== undefined ? input.countryCode : current.countryCode,
          periodStart: input.periodStart !== undefined ? input.periodStart : current.periodStart,
          periodEnd: input.periodEnd !== undefined ? input.periodEnd : current.periodEnd,
        }, effectiveSelection, effectiveScope);
      }
      await this.audit(client, context, current.egiId, 'REPORT_UPDATED', id, {});
    });
    return this.getAdmin(id, context);
  }

  async coverage(id: string, context: RequestContext) {
    await this.requireReport(id, context);
    const result = await this.db.query<CoverageRow>(`
      SELECT rdr.id AS requirement_id, rdr.section_code, rdr.variable_code,
        rdr.label, rdr.required, rdr.minimum_validation, rdr.eligibility_rule,
        rdr.transformation_rule, rrs.status, rrs.validation_status,
        rrs.dataset_id, rrs.source_id, rrs.value_json, rrs.notes, rrs.evaluated_at,
        ds.title AS dataset_name, src.name AS source_name
      FROM core.report_requirement_status rrs
      JOIN core.report_data_requirements rdr ON rdr.id = rrs.requirement_id
      LEFT JOIN core.datasets ds ON ds.id = rrs.dataset_id
      LEFT JOIN core.data_sources src ON src.id = rrs.source_id
      WHERE rrs.report_id = $1::uuid ORDER BY rdr.section_code, rdr.label
    `, [id]);
    const items = result.rows.map(mapCoverageRow);
    return { summary: calculateCoverage(items), items };
  }

  async validate(id: string, context: RequestContext) {
    const report = await this.requireReport(id, context);
    const coverage = await this.coverage(id, context);
    const findings: Finding[] = [];
    if (!report.periodStart || !report.periodEnd) findings.push({ severity: 'ERROR', code: 'REPORT_PERIOD_REQUIRED', message: 'El período del informe está incompleto.' });
    if (!report.cutoffAt) findings.push({ severity: 'WARNING', code: 'CUTOFF_DATE_MISSING', message: 'No se indicó fecha de corte.' });
    for (const item of coverage.items) {
      if (item.required && ['MISSING','MANUAL_REQUIRED'].includes(item.status)) findings.push({ severity: 'ERROR', code: 'REQUIRED_DATA_MISSING', message: `${item.label}: información requerida no disponible.` });
      else if (item.required && ['PARTIAL','PENDING_VALIDATION'].includes(item.status)) findings.push({ severity: 'WARNING', code: 'DATA_NOT_READY', message: `${item.label}: información parcial o pendiente de validación.` });
    }
    return { valid: !findings.some((item) => item.severity === 'ERROR'), findings, coverage: coverage.summary };
  }

  async generate(id: string, context: RequestContext) {
    const report = await this.requireReport(id, context);
    if (report.status === 'ARCHIVED') throw new BadRequestException('No se puede generar un informe archivado.');
    const coverage = await this.coverage(id, context);
    const version = await this.db.transaction(async (client) => {
      const previous = await client.query<{ major: number; minor: number }>(`
        SELECT version_major AS major, version_minor AS minor FROM core.report_versions
        WHERE report_id=$1::uuid ORDER BY version_major DESC,version_minor DESC LIMIT 1
      `, [id]);
      const major = previous.rows[0]?.major ?? 0;
      const minor = (previous.rows[0]?.minor ?? 0) + 1;
      const created = await client.query(`
        INSERT INTO core.report_versions (
          report_id,version_major,version_minor,label,status,change_summary,
          template_version,cutoff_at,parameters_json,snapshot_json,created_by_user_id
        ) SELECT ri.id,$2,$3,$4,ri.status,'Generación de borrador reproducible',rt.current_version,ri.cutoff_at,
          jsonb_build_object('scope',ri.scope_json,'selection',ri.selection_json,'quality',ri.quality_json),
          $5::jsonb,$6::uuid
        FROM core.report_instances ri JOIN core.report_templates rt ON rt.id=ri.template_id
        WHERE ri.id=$1::uuid RETURNING *
      `, [id, major, minor, `v${major}.${minor}`,
        JSON.stringify({ coverage: coverage.items, generatedAt: new Date().toISOString() }), context.principal.userId]);
      await client.query(`UPDATE core.report_instances SET status=CASE WHEN status='DRAFT' THEN 'IN_PROGRESS' ELSE status END,updated_at=NOW(),updated_by_user_id=$2::uuid WHERE id=$1::uuid`, [id, context.principal.userId]);
      await this.audit(client, context, report.egiId, 'REPORT_GENERATED', id, { version: `v${major}.${minor}` });
      return created.rows[0];
    });
    return camelizeVersion(version);
  }

  submitReview(id: string, comment: string | undefined, context: RequestContext) {
    return this.transition(id, 'READY_FOR_REVIEW', 'REPORT_REVIEW_SUBMITTED', 'SUBMITTED', comment, context);
  }

  startReview(id: string, comment: string | undefined, context: RequestContext) {
    return this.transition(id, 'UNDER_REVIEW', 'REPORT_REVIEW_STARTED', 'REVIEW_STARTED', comment, context);
  }

  requestChanges(id: string, comment: string | undefined, context: RequestContext) {
    return this.transition(id, 'CHANGES_REQUESTED', 'REPORT_CHANGES_REQUESTED', 'CHANGES_REQUESTED', comment, context);
  }

  async approve(id: string, comment: string | undefined, context: RequestContext) {
    const validation = await this.validate(id, context);
    if (!validation.valid) throw new BadRequestException('El informe tiene errores bloqueantes. Consulte /validate.');
    const current = await this.requireReport(id, context);
    if (current.status === 'READY_FOR_REVIEW') {
      await this.transition(id, 'UNDER_REVIEW', 'REPORT_REVIEW_STARTED', 'REVIEW_STARTED', undefined, context);
    }
    const approved = await this.transition(id, 'APPROVED', 'REPORT_APPROVED', 'APPROVED', comment, context);
    await this.createApprovedVersion(id, context);
    return approved;
  }

  async publish(id: string, comment: string | undefined, context: RequestContext) {
    const validation = await this.validate(id, context);
    if (!validation.valid) throw new BadRequestException('El informe tiene errores bloqueantes y no puede publicarse.');
    return this.transition(id, 'PUBLISHED', 'REPORT_PUBLISHED', 'PUBLISHED', comment, context);
  }

  async listVersions(id: string, context: RequestContext) {
    await this.requireReport(id, context);
    const result = await this.db.query(`
      SELECT rv.*,u.email AS created_by FROM core.report_versions rv
      LEFT JOIN core.users u ON u.id=rv.created_by_user_id
      WHERE rv.report_id=$1::uuid ORDER BY rv.version_major DESC,rv.version_minor DESC
    `, [id]);
    return result.rows.map(camelizeVersion);
  }

  async traceability(id: string, context: RequestContext) {
    const report = await this.requireReport(id, context);
    const coverage = await this.coverage(id, context);
    return {
      report: { id: report.id, name: report.name, cutoffAt: report.cutoffAt },
      paths: coverage.items.map((item) => ({
        section: item.sectionCode, variable: item.variableCode, status: item.status,
        transformationRule: item.transformationRule,
        dataset: item.datasetId ? { id: item.datasetId, name: item.datasetName } : null,
        source: item.sourceId ? { id: item.sourceId, name: item.sourceName } : null,
        message: item.status === 'MISSING' ? 'Pendiente de configuración' : null,
      })),
    };
  }

  async exportJson(id: string, context: RequestContext) {
    const report = await this.getAdmin(id, context);
    const body = Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), report }, null, 2), 'utf8');
    const checksum = createHash('sha256').update(body).digest('hex');
    await this.db.transaction(async (client) => {
      await client.query(`
        INSERT INTO core.report_exports (report_id,report_version_id,format,status,parameters_json,checksum_sha256,created_by_user_id)
        SELECT $1::uuid,rv.id,'JSON','completed','{}'::jsonb,$2,$3::uuid
        FROM (SELECT 1) seed
        LEFT JOIN LATERAL (SELECT id FROM core.report_versions WHERE report_id=$1::uuid ORDER BY created_at DESC LIMIT 1) rv ON TRUE
      `, [id, checksum, context.principal.userId]);
      await this.audit(client, context, report.egiId, 'REPORT_EXPORTED', id, { format: 'json', checksum });
    });
    return body;
  }

  async listMappings(context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const result = await this.db.query(`
      SELECT rim.*,i.code AS indicator_code,i.name AS indicator_name,
        rf.code AS framework_code,rf.name AS framework_name
      FROM core.report_indicator_mappings rim
      JOIN core.indicators i ON i.id=rim.source_indicator_id
      JOIN core.report_frameworks rf ON rf.id=rim.report_framework_id
      WHERE rim.egi_id=$1::uuid ORDER BY i.name,rf.name,rim.version DESC
    `, [egiId]);
    return result.rows.map(camelizeMapping);
  }

  async createMapping(input: Record<string, unknown>, context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const mappingType = assertMappingConfiguration(input);
    const indicatorId = String(input.sourceIndicatorId ?? '').trim();
    const frameworkCode = String(input.reportFramework ?? '').trim().toUpperCase();
    const variableCode = String(input.reportVariableCode ?? '').trim();
    if (!indicatorId || !frameworkCode || !variableCode) throw new BadRequestException('Indicador, marco y variable son requeridos.');
    const result = await this.db.transaction(async (client) => {
      const inserted = await client.query(`
        INSERT INTO core.report_indicator_mappings (
          egi_id,source_indicator_id,report_framework_id,report_variable_code,
          mapping_type,transformation_rule,eligibility_rule,notes,valid_from,
          valid_to,version,status,created_by_user_id
        ) SELECT $1::uuid,$2::uuid,rf.id,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12,$13::uuid
          FROM core.report_frameworks rf WHERE rf.code=$3 RETURNING *
      `, [egiId, indicatorId, frameworkCode, variableCode, mappingType,
        text(input.transformationRule), text(input.eligibilityRule), text(input.notes),
        text(input.validFrom), text(input.validTo), Number(input.version ?? 1),
        input.status === 'draft' ? 'draft' : 'active', context.principal.userId]);
      if (!inserted.rows[0]) throw new NotFoundException('Marco no encontrado.');
      await this.audit(client, context, egiId!, 'REPORT_MAPPING_CHANGED', inserted.rows[0].id, { mappingType });
      return inserted.rows[0];
    });
    return camelizeMapping(result);
  }

  async createTemplate(input: Record<string, unknown>, context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    const sections = Array.isArray(input.sections)
      ? input.sections as Array<{code?: unknown;title?: unknown;required?: unknown;narrativeMode?: unknown}>
      : [];
    const normalized = validateTemplateDefinition({ frameworkCode: input.frameworkCode, name: input.name, sections });
    const id = await this.db.transaction(async (client) => {
      const created = await client.query<{ id: string }>(`
        INSERT INTO core.report_templates (code,name,target,description,status,framework_id,egi_id,institution_id,country_code,language_code,configuration_json,created_by_user_id)
        SELECT $1,$2,'sigi_reports',$3,'active',rf.id,$4::uuid,$5::uuid,$6,$7,$8::jsonb,$9::uuid
        FROM core.report_frameworks rf WHERE rf.code=$10 RETURNING id
      `, [String(input.code ?? `${normalized.frameworkCode}_${Date.now()}`).trim().toUpperCase(),
        normalized.name, String(input.description ?? '').trim(), egiId,
        context.principal.institutionId ?? null, text(input.countryCode),
        input.languageCode === 'en' ? 'en' : 'es', JSON.stringify(normalizeObject(input.configuration)),
        context.principal.userId, normalized.frameworkCode]);
      if (!created.rows[0]) throw new NotFoundException('Marco no encontrado.');
      const version = await client.query<{ id: string }>(`
        INSERT INTO core.report_template_versions (template_id,version,change_summary,configuration_json,created_by_user_id)
        VALUES ($1::uuid,1,'Versión inicial',$2::jsonb,$3::uuid) RETURNING id
      `, [created.rows[0].id, JSON.stringify(normalizeObject(input.configuration)), context.principal.userId]);
      for (let position = 0; position < sections.length; position += 1) {
        const section = sections[position];
        const mode = String(section.narrativeMode ?? '').toUpperCase();
        await client.query(`
          INSERT INTO core.report_template_sections (template_version_id,code,title,position,is_required,narrative_mode)
          VALUES ($1::uuid,$2,$3,$4,$5,$6)
        `, [version.rows[0].id, String(section.code).trim(), String(section.title).trim(),
          position + 1, Boolean(section.required), ['AUTO','HYBRID'].includes(mode) ? mode : 'MANUAL']);
      }
      await this.audit(client, context, egiId!, 'REPORT_TEMPLATE_CREATED', created.rows[0].id, {});
      return created.rows[0].id;
    });
    return (await this.listTemplates(context)).find((item) => item.id === id);
  }

  private async transition(id: string, target: ReportStatus, auditAction: string, reviewAction: string, comment: string | undefined, context: RequestContext) {
    const report = await this.requireReport(id, context);
    const from = normalizeReportStatus(report.status);
    assertReportTransition(from, target);
    await this.db.transaction(async (client) => {
      await client.query(`UPDATE core.report_instances SET status=$2,updated_by_user_id=$3::uuid,updated_at=NOW() WHERE id=$1::uuid`, [id, target, context.principal.userId]);
      await client.query(`INSERT INTO core.report_reviews (report_id,action,comment,actor_user_id) VALUES ($1::uuid,$2,$3,$4::uuid)`, [id, reviewAction, text(comment), context.principal.userId]);
      await this.audit(client, context, report.egiId, auditAction, id, { from, to: target });
    });
    return this.getAdmin(id, context);
  }

  private async createApprovedVersion(id: string, context: RequestContext) {
    const report = await this.requireReport(id, context);
    const coverage = await this.coverage(id, context);
    await this.db.transaction(async (client) => {
      const previous = await client.query<{ major: number }>(`SELECT COALESCE(MAX(version_major),0)::int AS major FROM core.report_versions WHERE report_id=$1::uuid`, [id]);
      const major = Math.max(1, (previous.rows[0]?.major ?? 0) + ((previous.rows[0]?.major ?? 0) > 0 ? 1 : 0));
      await client.query(`
        INSERT INTO core.report_versions (report_id,version_major,version_minor,label,status,change_summary,template_version,cutoff_at,parameters_json,snapshot_json,created_by_user_id)
        SELECT ri.id,$2,0,$3,'APPROVED','Versión aprobada',rt.current_version,ri.cutoff_at,
          jsonb_build_object('scope',ri.scope_json,'selection',ri.selection_json,'quality',ri.quality_json),$4::jsonb,$5::uuid
        FROM core.report_instances ri JOIN core.report_templates rt ON rt.id=ri.template_id WHERE ri.id=$1::uuid
      `, [id, major, `v${major}.0`, JSON.stringify({ coverage: coverage.items, approvedAt: new Date().toISOString() }), context.principal.userId]);
      await this.audit(client, context, report.egiId, 'REPORT_GENERATED', id, { version: `v${major}.0`, approvedSnapshot: true });
    });
  }

  private async initializeCoverage(client: PoolClient, reportId: string, templateId: string, input: CreateReportInput, selection: Record<string, unknown>, scope: Record<string, unknown>) {
    const sourceIds = stringArray(selection.sources);
    const datasetIds = stringArray(selection.datasets);
    const indicatorIds = stringArray(selection.indicators);
    const documentIds = stringArray(selection.documents);
    const countries = stringArray(scope.countries);
    await client.query(`
      INSERT INTO core.report_requirement_status (report_id,requirement_id,status,dataset_id,source_id,validation_status,value_json,notes)
      SELECT $1::uuid,rdr.id,
        CASE rdr.source_type
          WHEN 'period' THEN CASE WHEN $3::boolean THEN 'AVAILABLE' ELSE 'MISSING' END
          WHEN 'country' THEN CASE WHEN $4::boolean THEN 'AVAILABLE' ELSE 'MISSING' END
          WHEN 'source' THEN CASE WHEN cardinality($5::uuid[])>0 THEN 'PENDING_VALIDATION' ELSE 'MISSING' END
          WHEN 'dataset' THEN CASE
            WHEN EXISTS (SELECT 1 FROM core.datasets d WHERE d.id=ANY($6::uuid[]) AND d.status IN ('validated','published')) THEN 'AVAILABLE'
            WHEN cardinality($6::uuid[])>0 THEN 'PENDING_VALIDATION' ELSE 'MISSING' END
          WHEN 'indicator' THEN CASE
            WHEN EXISTS (SELECT 1 FROM core.indicators indicator WHERE indicator.id=ANY($7::uuid[]) AND indicator.current_value IS NOT NULL) THEN 'AVAILABLE'
            WHEN cardinality($7::uuid[])>0 THEN 'PARTIAL' ELSE 'MISSING' END
          WHEN 'document' THEN CASE WHEN cardinality($8::uuid[])>0 THEN 'AVAILABLE' ELSE 'MANUAL_REQUIRED' END
          WHEN 'external' THEN 'MANUAL_REQUIRED' WHEN 'mapping' THEN 'MISSING' ELSE 'MISSING' END,
        CASE WHEN rdr.source_type='dataset' THEN ($6::uuid[])[1] ELSE NULL END,
        CASE WHEN rdr.source_type='source' THEN ($5::uuid[])[1] ELSE NULL END,
        CASE WHEN rdr.source_type='dataset' AND EXISTS (SELECT 1 FROM core.datasets d WHERE d.id=ANY($6::uuid[]) AND d.status IN ('validated','published')) THEN 'validated'
             WHEN rdr.source_type='indicator' AND EXISTS (SELECT 1 FROM core.indicators indicator WHERE indicator.id=ANY($7::uuid[]) AND indicator.current_value IS NOT NULL) THEN 'available'
             WHEN rdr.source_type IN ('source','dataset') AND (cardinality($5::uuid[])+cardinality($6::uuid[]))>0 THEN 'pending' ELSE NULL END,
        CASE WHEN rdr.source_type='indicator' THEN (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('id',indicator.id,'code',indicator.code,'value',indicator.current_value,'unit',indicator.unit)), '[]'::jsonb)
          FROM core.indicators indicator WHERE indicator.id=ANY($7::uuid[])
        ) ELSE NULL END,
        CASE WHEN rdr.source_type='external' THEN 'Requiere otra institución o sistema.'
             WHEN rdr.source_type='mapping' THEN 'Pendiente de correspondencia metodológica expresa.' ELSE NULL END
      FROM core.report_data_requirements rdr
      JOIN core.report_template_versions rtv ON rtv.id=rdr.template_version_id
      JOIN core.report_templates rt ON rt.id=rtv.template_id AND rtv.version=rt.current_version
      WHERE rt.id=$2::uuid
    `, [reportId, templateId, Boolean(input.periodStart && input.periodEnd),
      Boolean(input.countryCode || countries.length), sourceIds, datasetIds, indicatorIds, documentIds]);
  }

  private async requireReport(id: string, context: RequestContext) {
    const access = await this.scope(context);
    const result = await this.db.query<ReportInstanceRow>(`${adminReportSelect()}
      WHERE ri.id=$1::uuid AND ri.egi_id=$2::uuid
        AND ($3::boolean OR ri.institution_id IS NULL OR ri.institution_id=$4::uuid)
    `, [id, access.egiId, access.canReadAll, access.institutionId]);
    if (!result.rows[0]) throw new NotFoundException('Informe no encontrado.');
    return mapReportInstance(result.rows[0]);
  }

  private async assertContributionEvidence(client: PoolClient, egiId: string, institutionId: string, documentIds: string[], datasetIds: string[], indicatorIds: string[]) {
    const [documents, datasets, indicators] = await Promise.all([
      client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM documents.files
        WHERE id=ANY($1::uuid[]) AND egi_id=$2::uuid AND deleted_at IS NULL
          AND (institution_id=$3::uuid OR institution_id IS NULL)`, [documentIds, egiId, institutionId]),
      client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM core.datasets
        WHERE id=ANY($1::uuid[]) AND institution_id=$2::uuid`, [datasetIds, institutionId]),
      client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM core.indicators
        WHERE id=ANY($1::uuid[])`, [indicatorIds]),
    ]);
    if ((documents.rows[0]?.count ?? 0) !== documentIds.length) throw new BadRequestException('Uno o más documentos no pertenecen al EGI o a la institución.');
    if ((datasets.rows[0]?.count ?? 0) !== datasetIds.length) throw new BadRequestException('Uno o más datasets no pertenecen a la institución.');
    if ((indicators.rows[0]?.count ?? 0) !== indicatorIds.length) throw new BadRequestException('Uno o más indicadores no existen.');
  }

  private async assertAssignments(client: PoolClient, egiId: string, assignments: ContributionAssignment[]) {
    for (const assignment of assignments) {
      const institution = await client.query(`SELECT id FROM core.institutions WHERE id=$1::uuid AND status='active'`, [assignment.institutionId]);
      if (!institution.rows[0]) throw new BadRequestException('Una institución participante no existe o está inactiva.');
      if (assignment.responsibleUserId) {
        const user = await client.query(`SELECT u.id FROM core.users u
          JOIN core.egi_memberships membership ON membership.user_id=u.id AND membership.egi_id=$2::uuid
          WHERE u.id=$1::uuid AND u.institution_id=$3::uuid AND u.status='active' AND membership.membership_status='active'`,
        [assignment.responsibleUserId, egiId, assignment.institutionId]);
        if (!user.rows[0]) throw new BadRequestException('El responsable debe ser un usuario activo de la institución y miembro del EGI.');
      }
    }
  }

  private async requireCommitment(id: string, context: RequestContext) {
    const commitments = await this.listCommitments(context);
    const commitment = commitments.find((item) => item.id === id);
    if (!commitment) throw new NotFoundException('Compromiso de informe no encontrado.');
    return commitment;
  }

  private resolveEgi(context: RequestContext) {
    return this.adminService.resolveAdminScopeEgiId(context.principal.subject, context.requestedEgiId);
  }

  private async scope(context: RequestContext) {
    const egiId = await this.resolveEgi(context);
    return {
      egiId,
      canReadAll: context.principal.roles.some((role) => ['superadmin','national_admin'].includes(role)),
      institutionId: context.principal.institutionId ?? null,
    };
  }

  private async audit(client: PoolClient, context: RequestContext, egiId: string, action: string, entityId: string, details: Record<string, unknown>) {
    await client.query(`
      INSERT INTO core.audit_events (actor_user_id,egi_id,action,entity_type,entity_id,source,result,details_json)
      VALUES ($1::uuid,$2::uuid,$3,'report',$4,'api','success',$5::jsonb)
    `, [context.principal.userId, egiId, action, entityId, JSON.stringify(details)]);
  }
}

function legacySelect() {
  return `SELECT rt.id AS template_id,rt.code,rt.name,rt.target,rt.description,
    rt.status AS template_status,rr.id AS report_run_id,rr.status AS report_status,
    rr.output_url,rr.started_at,rr.finished_at,rr.created_at AS report_created_at
    FROM core.report_templates rt
    LEFT JOIN LATERAL (SELECT * FROM core.report_runs candidate WHERE candidate.template_id=rt.id ORDER BY candidate.created_at DESC LIMIT 1) rr ON TRUE
    WHERE rt.status='active' AND rt.egi_id IS NULL`;
}
function adminReportSelect() {
  return `SELECT ri.*,rt.name AS template_name,rf.code AS framework_code,
    rf.name AS framework_name,i.name AS institution_name,latest.label AS latest_version
    FROM core.report_instances ri JOIN core.report_templates rt ON rt.id=ri.template_id
    JOIN core.report_frameworks rf ON rf.id=rt.framework_id
    LEFT JOIN core.institutions i ON i.id=ri.institution_id
    LEFT JOIN LATERAL (SELECT label FROM core.report_versions rv WHERE rv.report_id=ri.id ORDER BY rv.created_at DESC LIMIT 1) latest ON TRUE`;
}
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []; }
function normalizeObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { const normalized = typeof value === 'string' ? value.trim() : ''; return normalized || null; }
function normalizeVisibility(value: unknown) { const normalized = String(value ?? 'institutional'); return ['private','institutional','national','public'].includes(normalized) ? normalized : 'institutional'; }
function normalizeCommitmentStatus(value: unknown) { const status = String(value ?? 'DRAFT').trim().toUpperCase(); if (!['DRAFT','OPEN','IN_REVIEW','CLOSED','CANCELLED'].includes(status)) throw new BadRequestException('Estado de compromiso no válido.'); return status; }
function normalizeAssignments(value: unknown): ContributionAssignment[] { if (!Array.isArray(value)) return []; const byInstitution = new Map<string,ContributionAssignment>(); for (const raw of value) { if (!raw || typeof raw !== 'object') continue; const item = raw as Record<string,unknown>; const institutionId = String(item.institutionId ?? '').trim(); if (institutionId) byInstitution.set(institutionId,{ institutionId,responsibleUserId:text(item.responsibleUserId) }); } return Array.from(byInstitution.values()); }
function normalizeReminderDays(value: unknown) { const source = Array.isArray(value) ? value : [30,15,7,1,0]; const days = Array.from(new Set(source.map(Number).filter((item) => Number.isInteger(item) && item >= 0 && item <= 365))).sort((a,b) => b-a); if (!days.length) throw new BadRequestException('Configure al menos un día de anticipación entre 0 y 365.'); return days; }
function camelizeDates(row: any) { return { id: row.id, code: row.code, name: row.name, description: row.description, status: row.status, createdAt: row.created_at?.toISOString?.() ?? row.created_at, updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at }; }
function camelizeSection(row: any) { return { id: row.id, code: row.code, title: row.title, description: row.description, position: row.position, required: row.is_required, enabled: row.is_enabled, narrativeMode: row.narrative_mode }; }
function camelizeVersion(row: any) { return { id: row.id, reportId: row.report_id, versionMajor: row.version_major, versionMinor: row.version_minor, label: row.label, status: row.status, changeSummary: row.change_summary, templateVersion: row.template_version, cutoffAt: row.cutoff_at?.toISOString?.() ?? row.cutoff_at, parameters: row.parameters_json, snapshot: row.snapshot_json, createdBy: row.created_by, createdAt: row.created_at?.toISOString?.() ?? row.created_at }; }
function camelizeMapping(row: any) { return { id: row.id, egiId: row.egi_id, sourceIndicatorId: row.source_indicator_id, indicatorCode: row.indicator_code, indicatorName: row.indicator_name, reportFrameworkId: row.report_framework_id, frameworkCode: row.framework_code, frameworkName: row.framework_name, reportVariableCode: row.report_variable_code, mappingType: row.mapping_type, transformationRule: row.transformation_rule, eligibilityRule: row.eligibility_rule, notes: row.notes, validFrom: row.valid_from, validTo: row.valid_to, version: row.version, status: row.status }; }
function mapTemplateRow(row: TemplateRow) { return { id: row.id, code: row.code, name: row.name, description: row.description, status: row.status, frameworkCode: row.framework_code, frameworkName: row.framework_name, countryCode: row.country_code, languageCode: row.language_code, version: row.current_version, egiId: row.egi_id, institutionId: row.institution_id, sectionCount: row.section_count, updatedAt: row.updated_at.toISOString() }; }
function mapReportInstance(row: ReportInstanceRow) { return { id: row.id, egiId: row.egi_id, institutionId: row.institution_id, institutionName: row.institution_name, templateId: row.template_id, templateName: row.template_name, frameworkCode: row.framework_code, frameworkName: row.framework_name, name: row.name, countryCode: row.country_code, periodStart: dateOnly(row.period_start), periodEnd: dateOnly(row.period_end), cutoffAt: row.cutoff_at?.toISOString?.() ?? row.cutoff_at, languageCode: row.language_code, visibility: row.visibility, status: row.status, scope: row.scope_json, selection: row.selection_json, quality: row.quality_json, latestVersion: row.latest_version, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }; }
function mapCoverageRow(row: CoverageRow) { return { requirementId: row.requirement_id, sectionCode: row.section_code, variableCode: row.variable_code, label: row.label, required: row.required, minimumValidation: row.minimum_validation, eligibilityRule: row.eligibility_rule, transformationRule: row.transformation_rule, status: row.status, validationStatus: row.validation_status, datasetId: row.dataset_id, datasetName: row.dataset_name, sourceId: row.source_id, sourceName: row.source_name, value: row.value_json, notes: row.notes, evaluatedAt: row.evaluated_at.toISOString() }; }
function mapLegacyReportRow(row: LegacyReportRow) { return { id: row.template_id, code: row.code, name: row.name, target: row.target, description: row.description, status: row.template_status, latestRun: row.report_run_id ? { id: row.report_run_id, status: row.report_status, outputUrl: row.output_url, startedAt: row.started_at?.toISOString() ?? null, finishedAt: row.finished_at?.toISOString() ?? null, createdAt: row.report_created_at?.toISOString() ?? null } : null }; }
function mapCommitmentRow(row: CommitmentRow) {
  const contributions = row.contributions.map((item) => ({
    ...item,
    dueDate: dateOnly(item.dueDate),
    submittedAt: isoDateTime(item.submittedAt),
    reviewedAt: isoDateTime(item.reviewedAt),
  }));
  const dueDate = dateOnly(row.due_date)!;
  const internalCutoffDate = dateOnly(row.internal_cutoff_date);
  const timing = commitmentTiming(internalCutoffDate ?? dueDate, row.status);
  return { id: row.id, egiId: row.egi_id, frameworkId: row.framework_id, frameworkCode: row.framework_code, frameworkName: row.framework_name, referenceMilestoneId: row.reference_milestone_id, referenceLabel: row.reference_label, coordinatingInstitutionId: row.coordinating_institution_id, coordinatingInstitutionName: row.coordinating_institution_name, reportId: row.report_id, title: row.title, countryCode: row.country_code, reportingPeriodStart: dateOnly(row.reporting_period_start), reportingPeriodEnd: dateOnly(row.reporting_period_end), dueDate, internalCutoffDate, instructions: row.instructions, status: row.status, contributionCount: row.contribution_count, submittedCount: row.submitted_count, validatedCount: row.validated_count, reminderRule: row.reminder_rule, ...timing, contributions, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
function dateOnly(value: string | Date | null) { if (!value) return null; return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function isoDateTime(value: Date | string | null): string | null { return value instanceof Date ? value.toISOString() : value; }
function commitmentTiming(value: string, status: string) { const target = Date.parse(`${value}T00:00:00.000Z`); const today = new Date(); const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()); const daysRemaining = Math.ceil((target - todayUtc) / 86400000); const urgency = ['CLOSED','CANCELLED'].includes(status) ? 'CLOSED' : daysRemaining < 0 ? 'OVERDUE' : daysRemaining <= 30 ? 'DUE_SOON' : 'ON_TRACK'; return { daysRemaining, urgency }; }
function escapeIcs(value: string) { return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
function icsTimestamp(value: Date) { return value.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); }
function nextDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate()+1); return date.toISOString().slice(0,10); }

type Finding = { severity: 'ERROR'|'WARNING'|'INFO'; code: string; message: string };
type ContributionAssignment = { institutionId:string;responsibleUserId:string|null };
type LegacyReportRow = { template_id:string;code:string;name:string;target:string;description:string;template_status:string;report_run_id:string|null;report_status:string|null;output_url:string|null;started_at:Date|null;finished_at:Date|null;report_created_at:Date|null };
type TemplateRow = { id:string;code:string;name:string;description:string;status:string;country_code:string|null;language_code:string;current_version:number;egi_id:string|null;institution_id:string|null;updated_at:Date;framework_code:string;framework_name:string;section_count:number };
type ReportInstanceRow = { id:string;egi_id:string;institution_id:string|null;template_id:string;name:string;country_code:string|null;period_start:string|null;period_end:string|null;cutoff_at:Date|null;language_code:string;visibility:string;status:string;scope_json:Record<string,unknown>;selection_json:Record<string,unknown>;quality_json:Record<string,unknown>;created_at:Date;updated_at:Date;template_name:string;framework_code:string;framework_name:string;institution_name:string|null;latest_version:string|null };
type CoverageRow = { requirement_id:string;section_code:string;variable_code:string;label:string;required:boolean;minimum_validation:string;eligibility_rule:string|null;transformation_rule:string|null;status:CoverageStatus;validation_status:string|null;dataset_id:string|null;dataset_name:string|null;source_id:string|null;source_name:string|null;value_json:unknown;notes:string|null;evaluated_at:Date };
type DashboardRow = { total:number;drafts:number;in_review:number;approved:number;published:number;current_period:number };
type CountRow = { key:string;count:number };
type RecentRow = { id:string;action:string;created_at:Date;user_email:string|null;report_id:string;report_name:string;status:string;version_label:string|null };
type ReferenceMilestoneRow = { id:string;code:string;due_year:number;label:string;short_label:string;category:string;related_framework_code:string|null;timing_precision:string;guidance:string;source_note:string;reference_url:string|null;status:string };
type CommitmentContributionRow = { id:string;institutionId:string;institutionName:string;responsibleUserId:string|null;responsibleName:string|null;responsibleEmail:string|null;dueDate:string|Date;status:string;notes:string|null;submission:Record<string,unknown>;submittedAt:Date|string|null;reviewedAt:Date|string|null;documents:Array<{id:string;name:string;validationStatus:string}>;datasets:Array<{id:string;title:string;status:string}>;indicators:Array<{id:string;code:string;name:string;unit:string;value:number|null}> };
type CommitmentRow = { id:string;egi_id:string;framework_id:string|null;reference_milestone_id:string|null;coordinating_institution_id:string|null;report_id:string|null;title:string;country_code:string|null;reporting_period_start:string|Date|null;reporting_period_end:string|Date|null;due_date:string|Date;internal_cutoff_date:string|Date|null;instructions:string|null;status:string;created_at:Date;updated_at:Date;framework_code:string|null;framework_name:string|null;coordinating_institution_name:string|null;reference_label:string|null;reminder_rule:{enabled:boolean;daysBefore:number[];overdueEveryDays:number};contribution_count:number;submitted_count:number;validated_count:number;contributions:CommitmentContributionRow[] };
