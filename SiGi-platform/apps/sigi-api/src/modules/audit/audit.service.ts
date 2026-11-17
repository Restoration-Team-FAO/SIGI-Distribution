import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';

@Injectable()
export class AuditService {
  constructor(private readonly postgresService: PostgresService) {}

  async list() {
    const result = await this.postgresService.query<AuditRow>(
      `
        SELECT
          ae.id,
          ae.actor_user_id,
          u.email AS actor_email,
          ae.egi_id,
          ae.action,
          ae.entity_type,
          ae.entity_id,
          ae.source,
          ae.result,
          ae.details_json,
          ae.created_at
        FROM core.audit_events ae
        LEFT JOIN core.users u ON u.id = ae.actor_user_id
        ORDER BY ae.created_at DESC
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email,
      egiId: row.egi_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      source: row.source,
      result: row.result,
      details: row.details_json,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async recordAccessEvent(input: {
    actorUserId?: string | null;
    egiId?: string | null;
    action: string;
    result?: string;
    details?: Record<string, unknown>;
  }) {
    const result = await this.postgresService.query<{ id: string }>(
      `
        INSERT INTO core.audit_events (
          actor_user_id,
          egi_id,
          action,
          entity_type,
          entity_id,
          source,
          result,
          details_json
        )
        VALUES ($1::uuid, $2::uuid, $3, 'http_request', NULL, 'api', $4, $5::jsonb)
        RETURNING id
      `,
      [
        input.actorUserId ?? null,
        input.egiId ?? null,
        input.action,
        input.result ?? 'failed',
        JSON.stringify(input.details ?? {}),
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Audit event was not persisted');
    return id;
  }
}

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  egi_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  source: string;
  result: string;
  details_json: Record<string, unknown>;
  created_at: Date;
};
