import { useEffect, useState } from 'react';
import type { AuditEvent } from '@sigi/domain';
import { workspaceApi } from '../services/api';
import { AdministrationWorkspaceHeader } from '../components/AdministrationWorkspaceHeader';
import { ActivityList } from '../components/data-display';
import {
  MessageBlock,
  MetricCard,
  MetricGrid,
  Panel,
} from '../components/section-kit';

function getAuditTone(result: string): 'neutral' | 'good' | 'warn' | 'danger' {
  const normalized = result.toLowerCase();
  if (normalized.includes('success') || normalized.includes('ok') || normalized.includes('done')) {
    return 'good';
  }

  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'danger';
  }

  if (normalized.includes('queued') || normalized.includes('pending')) {
    return 'warn';
  }

  return 'neutral';
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString('es-CR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function AuditPage() {
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workspaceApi
      .getAudit()
      .then((response) => setAudit(response.data.audit))
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const uniqueActors = new Set(
    audit.map((entry) => entry.actorEmail ?? entry.actorUserId ?? 'system'),
  );
  const successfulEvents = audit.filter(
    (entry) => getAuditTone(entry.result) === 'good',
  );

  return (
    <section>
      <AdministrationWorkspaceHeader description="Actividad cronológica registrada en el EGI activo." />

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}

      {!error && audit.length === 0 ? (
        <MessageBlock>Cargando eventos de auditoria del entorno...</MessageBlock>
      ) : null}

      {audit.length > 0 ? (
        <>
          <MetricGrid>
            <MetricCard
              label="Eventos visibles"
              value={String(audit.length)}
              hint="Rastro disponible desde el backend."
            />
            <MetricCard
              label="Actores unicos"
              value={String(uniqueActors.size)}
              hint="Usuarios o procesos con actividad registrada."
            />
            <MetricCard
              label="Eventos exitosos"
              value={String(successfulEvents.length)}
              hint="Acciones con resultado positivo reconocido."
            />
            <MetricCard
              label="Ultimo corte"
              value={formatTimestamp(audit[0]?.createdAt ?? '')}
              hint="Marca temporal mas reciente en bitacora."
            />
          </MetricGrid>

          <Panel title="Actividad reciente" subtitle={`${audit.length} eventos · ${uniqueActors.size} actores`} icon="audit">
            <ActivityList
              ariaLabel="Eventos de auditoría"
              items={audit.map((entry) => ({
                id: entry.id,
                event: entry.action,
                actor: entry.actorEmail ?? entry.actorUserId ?? 'Sistema',
                timestamp: entry.createdAt,
                status: entry.result,
                entity: entry.entityType,
                metadata: { source: entry.source, entityId: entry.entityId, ...(entry.details ?? {}) },
              }))}
            />
          </Panel>
        </>
      ) : null}
    </section>
  );
}
