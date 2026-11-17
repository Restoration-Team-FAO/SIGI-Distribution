from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.db import dumps_json, execute_returning, fetch_all, fetch_one
from app.core.settings import settings
from app.services.kobo_connector import run_kobo_sync
from app.services.odoo_connector import run_odoo_sync


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


def _map_job(row: dict[str, Any]) -> dict[str, Any]:
    return {
        'job_id': str(row['id']),
        'institution_id': str(row['institution_id']),
        'connector_id': str(row['connector_id']),
        'platform_sync_job_id': str(row['platform_sync_job_id']),
        'connector_type': row['connector_type'],
        'status': row['status'],
        'retry_count': row['retry_count'],
        'checkpoint_json': row['checkpoint_json'] or {},
        'payload_json': row['payload_json'] or {},
        'error': row['error_json'],
        'started_at': _parse_timestamp(row['started_at']),
        'finished_at': _parse_timestamp(row['finished_at']),
        'created_at': _parse_timestamp(row['created_at']),
        'updated_at': _parse_timestamp(row['updated_at']),
    }


def _record_failure(
    *,
    job_id: str,
    institution_id: str,
    connector_id: str,
    failure_stage: str,
    error: Exception,
    source_record_key: str | None = None,
    raw_payload_id: str | None = None,
) -> None:
    error_payload = {
        'message': str(error),
        'type': error.__class__.__name__,
        'stage': failure_stage,
    }

    execute_returning(
        """
        INSERT INTO integration.transform_failures (
          institution_id,
          connector_id,
          sync_job_id,
          source_record_key,
          failure_stage,
          error_json,
          raw_payload_id
        )
        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
        RETURNING id
        """,
        (
            institution_id,
            connector_id,
            job_id,
            source_record_key,
            failure_stage,
            dumps_json(error_payload),
            raw_payload_id,
        ),
    )

    execute_returning(
        """
        UPDATE integration.sync_jobs
        SET
          status = %s,
          retry_count = retry_count + 1,
          error_json = %s::jsonb,
          finished_at = NOW(),
          updated_at = NOW()
        WHERE id = %s
        RETURNING id
        """,
        ('failed', dumps_json(error_payload), job_id),
    )


def create_job(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(uuid4())
    row = execute_returning(
        """
        INSERT INTO integration.sync_jobs (
          id,
          institution_id,
          connector_id,
          platform_sync_job_id,
          connector_type,
          status,
          payload_json,
          started_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
        RETURNING
          id,
          institution_id,
          connector_id,
          platform_sync_job_id,
          connector_type,
          status,
          retry_count,
          checkpoint_json,
          payload_json,
          error_json,
          started_at,
          finished_at,
          created_at,
          updated_at
        """,
        (
            job_id,
            payload['institutionId'],
            payload['connectorId'],
            payload['platformJobId'],
            payload.get('connectorType') or payload.get('connector_type') or 'kobo',
            'queued',
            dumps_json(payload),
        ),
    )

    return _map_job(row)


def get_job(job_id: str) -> dict[str, Any] | None:
    row = fetch_one(
        """
        SELECT
          id,
          institution_id,
          connector_id,
          platform_sync_job_id,
          connector_type,
          status,
          retry_count,
          checkpoint_json,
          payload_json,
          error_json,
          started_at,
          finished_at,
          created_at,
          updated_at
        FROM integration.sync_jobs
        WHERE id = %s
        """,
        (job_id,),
    )
    if row is None:
        return None
    return _map_job(row)


def list_jobs() -> list[dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT
          id,
          institution_id,
          connector_id,
          platform_sync_job_id,
          connector_type,
          status,
          retry_count,
          checkpoint_json,
          payload_json,
          error_json,
          started_at,
          finished_at,
          created_at,
          updated_at
        FROM integration.sync_jobs
        ORDER BY created_at DESC
        """
    )
    return [_map_job(row) for row in rows]


def run_job(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:
        return

    source_record_key: str | None = None
    raw_payload_id: str | None = None
    source_id: str | None = None

    try:
        execute_returning(
            """
            UPDATE integration.sync_jobs
            SET status = %s, started_at = COALESCE(started_at, NOW()), updated_at = NOW()
            WHERE id = %s
            RETURNING id
            """,
            ('running', job_id),
        )

        payload = job['payload_json']
        source_record_key = f"{job['connector_id']}:{job['connector_type']}:{_timestamp()}"
        raw_payload = {
            'connectorType': job['connector_type'],
            'institutionId': job['institution_id'],
            'mode': payload.get('mode', 'incremental'),
            'sourceRecordKey': source_record_key,
            'submittedAt': _timestamp(),
        }
        payload_hash = hashlib.sha256(dumps_json(raw_payload).encode('utf-8')).hexdigest()

        raw_payload_row = execute_returning(
            """
            INSERT INTO integration.raw_payloads (
              institution_id,
              connector_id,
              sync_job_id,
              source_record_key,
              payload,
              payload_hash
            )
            VALUES (%s, %s, %s, %s, %s::jsonb, %s)
            RETURNING id
            """,
            (
                job['institution_id'],
                job['connector_id'],
                job_id,
                source_record_key,
                dumps_json(raw_payload),
                payload_hash,
            ),
        )
        raw_payload_id = str(raw_payload_row['id'])

        requested_source_id = payload.get('source')
        connector_context = _load_connector_context(
            job['connector_id'],
            str(requested_source_id) if requested_source_id else None,
        )
        connector_config = (
            connector_context.get('config_json') if connector_context else {}
        ) or {}
        source_id = (
            str(connector_context['source_id'])
            if connector_context and connector_context.get('source_id')
            else None
        )
        source_config = (
            connector_context.get('source_config_json') if connector_context else {}
        ) or {}
        odoo_source_config = (
            _load_odoo_source_config(source_id) if source_id else None
        )
        previous_checkpoint = _load_latest_checkpoint(
            institution_id=job['institution_id'],
            connector_id=job['connector_id'],
            connector_type=job['connector_type'],
        )

        execution = _execute_connector_job(
            job_id=job_id,
            connector_type=job['connector_type'],
            connector_id=job['connector_id'],
            institution_id=job['institution_id'],
            source_id=source_id,
            connector_config=connector_config,
            source_config=source_config,
            odoo_source_config=odoo_source_config,
            payload=payload,
            previous_checkpoint=previous_checkpoint,
        )

        checkpoint = {
            'last_source_record_key': source_record_key,
            'processed_records': execution.get('totalRowsExtracted', 0),
            'promoted_records': execution.get('totalRowsPromoted', 0),
            'source_id': source_id,
            'asset_uid': execution.get('assetUid'),
            'last_submission_time': execution.get('lastSubmissionTime'),
            'last_submission_id': execution.get('lastSubmissionId'),
            'result': execution,
        }
        checkpoint_type = execution.get('checkpointType', f"{job['connector_type']}_cursor")
        job_status = execution.get('status', 'completed')

        _persist_checkpoint(
            institution_id=job['institution_id'],
            connector_id=job['connector_id'],
            job_id=job_id,
            checkpoint_type=checkpoint_type,
            checkpoint=checkpoint,
        )
        _mark_completed(job_id=job_id, status=job_status, checkpoint=checkpoint)

        if job_status in ('completed', 'partial_failed'):
            _touch_connector(job['connector_id'])
            if source_id:
                _touch_source(source_id)
            if job['connector_type'] == 'odoo' and source_id:
                _touch_odoo_source_sync(
                    source_id=source_id,
                    platform_sync_job_id=job['platform_sync_job_id'],
                    status=job_status,
                )
    except Exception as error:
        _record_failure(
            job_id=job_id,
            institution_id=job['institution_id'],
            connector_id=job['connector_id'],
            failure_stage='run_job',
            error=error,
            source_record_key=source_record_key,
            raw_payload_id=raw_payload_id,
        )
        if job['connector_type'] == 'odoo' and source_id:
            _mark_odoo_source_error(source_id=source_id, error=error)


def _execute_connector_job(
    *,
    job_id: str,
    connector_type: str,
    connector_id: str,
    institution_id: str,
    source_id: str | None,
    connector_config: dict[str, Any],
    source_config: dict[str, Any],
    odoo_source_config: dict[str, Any] | None,
    payload: dict[str, Any],
    previous_checkpoint: dict[str, Any] | None,
) -> dict[str, Any]:
    mode = payload.get('mode', 'incremental')
    options = payload.get('options')
    normalized_options = options if isinstance(options, dict) else {}

    if connector_type == 'odoo':
        result = run_odoo_sync(
            institution_id=institution_id,
            connector_id=connector_id,
            source_id=source_id,
            connector_config=connector_config,
            odoo_credentials=odoo_source_config,
            mapping_profile_id=(
                str(odoo_source_config['mapping_profile_id'])
                if odoo_source_config and odoo_source_config.get('mapping_profile_id')
                else None
            ),
            mode=mode,
            selection_options=normalized_options,
        )
        return {
            **result,
            'checkpointType': 'odoo_cursor',
        }

    if connector_type == 'kobo':
        result = run_kobo_sync(
            job_id=job_id,
            institution_id=institution_id,
            connector_id=connector_id,
            source_id=source_id,
            connector_config=connector_config,
            source_config=source_config,
            mode=mode,
            previous_checkpoint=previous_checkpoint,
        )
        return {
            **result,
            'checkpointType': 'kobo_cursor',
        }

    result = _run_sample_sync(
        connector_type=connector_type,
        connector_id=connector_id,
        institution_id=institution_id,
        source_id=source_id,
        mode=mode,
    )
    return {
        **result,
        'checkpointType': f'{connector_type}_cursor',
    }


def _run_sample_sync(
    *,
    connector_type: str,
    connector_id: str,
    institution_id: str,
    source_id: str | None,
    mode: str,
) -> dict[str, Any]:
    source_record_key = f'{connector_id}:sample-record'
    return {
        'status': 'completed',
        'mockMode': True,
        'connectorType': connector_type,
        'institutionId': institution_id,
        'sourceId': source_id,
        'mode': mode,
        'totalRowsExtracted': 1,
        'totalRowsPromoted': 0,
        'entities': [
            {
                'entityType': 'sample',
                'extractedRows': 1,
                'batchId': None,
                'batchStatus': 'not_applicable',
                'validRows': 1,
                'invalidRows': 0,
                'promotedRows': 0,
                'errors': 0,
                'sourceRecordKey': source_record_key,
            }
        ],
    }


def _persist_checkpoint(
    *,
    institution_id: str,
    connector_id: str,
    job_id: str,
    checkpoint_type: str,
    checkpoint: dict[str, Any],
) -> None:
    execute_returning(
        """
        INSERT INTO integration.sync_checkpoints (
          institution_id,
          connector_id,
          sync_job_id,
          checkpoint_type,
          checkpoint_value
        )
        VALUES (%s, %s, %s, %s, %s::jsonb)
        RETURNING id
        """,
        (
            institution_id,
            connector_id,
            job_id,
            checkpoint_type,
            dumps_json(checkpoint),
        ),
    )


def _mark_completed(*, job_id: str, status: str, checkpoint: dict[str, Any]) -> None:
    execute_returning(
        """
        UPDATE integration.sync_jobs
        SET
          status = %s,
          checkpoint_json = %s::jsonb,
          error_json = NULL,
          finished_at = NOW(),
          updated_at = NOW()
        WHERE id = %s
        RETURNING id
        """,
        (status, dumps_json(checkpoint), job_id),
    )


def _load_connector_context(
    connector_id: str,
    source_id: str | None = None,
) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT
          c.id AS connector_id,
          c.config_json,
          ds.id AS source_id,
          ds.config_json AS source_config_json
        FROM core.connectors c
        LEFT JOIN LATERAL (
            SELECT ds.id, ds.config_json
            FROM core.data_sources ds
            WHERE ds.connector_id = c.id
              AND ds.status = 'active'
              AND (%s::uuid IS NULL OR ds.id = %s::uuid)
            ORDER BY ds.updated_at DESC, ds.created_at DESC
            LIMIT 1
        ) ds ON TRUE
        WHERE c.id = %s::uuid
        """,
        (source_id, source_id, connector_id),
    )


def _touch_connector(connector_id: str) -> None:
    execute_returning(
        """
        UPDATE core.connectors
        SET
          last_sync_at = NOW(),
          updated_at = NOW()
        WHERE id = %s::uuid
        RETURNING id
        """,
        (connector_id,),
    )


def _touch_source(source_id: str) -> None:
    execute_returning(
        """
        UPDATE core.data_sources
        SET
          last_ingested_at = NOW(),
          updated_at = NOW()
        WHERE id = %s::uuid
        RETURNING id
        """,
        (source_id,),
    )


def _load_latest_checkpoint(
    *,
    institution_id: str,
    connector_id: str,
    connector_type: str,
) -> dict[str, Any] | None:
    row = fetch_one(
        """
        SELECT checkpoint_value
        FROM integration.sync_checkpoints
        WHERE institution_id = %s::uuid
          AND connector_id = %s::uuid
          AND checkpoint_type = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (institution_id, connector_id, f'{connector_type}_cursor'),
    )
    if row is None:
        return None
    checkpoint = row.get('checkpoint_value')
    return checkpoint if isinstance(checkpoint, dict) else None


def _load_odoo_source_config(source_id: str) -> dict[str, Any] | None:
    try:
        return fetch_one(
            """
            SELECT
              source_id,
              connector_id,
              base_url,
              database_name,
              username,
              pgp_sym_decrypt(password_encrypted, %s) AS password,
              mapping_profile_id,
              is_active,
              status
            FROM integration.odoo_source_configs
            WHERE source_id = %s::uuid
              AND is_active = TRUE
            """,
            (settings.sigi_secrets_key, source_id),
        )
    except Exception:
        return None


def _touch_odoo_source_sync(
    *,
    source_id: str,
    platform_sync_job_id: str,
    status: str,
) -> None:
    try:
        execute_returning(
            """
            UPDATE integration.odoo_source_configs
            SET
              last_sync_at = NOW(),
              last_sync_job_id = %s::uuid,
              status = CASE
                WHEN %s = 'completed' THEN 'healthy'
                ELSE 'warning'
              END,
              updated_at = NOW()
            WHERE source_id = %s::uuid
            RETURNING source_id
            """,
            (platform_sync_job_id, status, source_id),
        )
    except Exception:
        return


def _mark_odoo_source_error(*, source_id: str, error: Exception) -> None:
    try:
        execute_returning(
            """
            UPDATE integration.odoo_source_configs
            SET
              status = 'sync_failed',
              last_test_error = %s,
              updated_at = NOW()
            WHERE source_id = %s::uuid
            RETURNING source_id
            """,
            (str(error), source_id),
        )
    except Exception:
        return
