import { type ReactNode, useMemo, useState } from 'react';
import { Drawer } from '@sigi/ui';

type StatusTone = 'neutral' | 'good' | 'warn' | 'danger';

const STATUS_PRESENTATION: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: 'Activo', tone: 'good' },
  success: { label: 'Exitoso', tone: 'good' },
  succeeded: { label: 'Exitoso', tone: 'good' },
  completed: { label: 'Completado', tone: 'good' },
  done: { label: 'Completado', tone: 'good' },
  validated: { label: 'Validado', tone: 'good' },
  published: { label: 'Publicado', tone: 'good' },
  approved: { label: 'Aprobado', tone: 'good' },
  draft: { label: 'Borrador', tone: 'neutral' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
  pending: { label: 'Pendiente', tone: 'warn' },
  queued: { label: 'En cola', tone: 'warn' },
  attention: { label: 'Requiere atención', tone: 'warn' },
  blocked: { label: 'Bloqueado', tone: 'warn' },
  failed: { label: 'Error', tone: 'danger' },
  failure: { label: 'Error', tone: 'danger' },
  error: { label: 'Error', tone: 'danger' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

const EVENT_LABELS: Record<string, string> = {
  'project.created': 'Proyecto creado',
  'project.updated': 'Proyecto actualizado',
  'project.deleted': 'Proyecto eliminado',
  'project.actor.created': 'Actor agregado',
  'project.actor.updated': 'Actor actualizado',
  'project.actor.deleted': 'Actor eliminado',
  'project.milestone.created': 'Hito creado',
  'project.milestone.updated': 'Hito actualizado',
  'project.milestone.deleted': 'Hito eliminado',
  'project.deliverable.created': 'Entregable creado',
  'project.deliverable.updated': 'Entregable actualizado',
  'project.deliverable.deleted': 'Entregable eliminado',
  'project.polygon.updated': 'Cobertura del mapa actualizada',
  'document.created': 'Documento agregado',
  'document.updated': 'Documento actualizado',
  'document.deleted': 'Documento eliminado',
  'document.downloaded': 'Documento descargado',
  'sync.job.created': 'Sincronización iniciada',
  'sync.job.completed': 'Sincronización completada',
  'sync.job.failed': 'Sincronización con error',
  'validation.created': 'Validación creada',
  'validation.updated': 'Validación actualizada',
  'report.created': 'Informe creado',
  'report.updated': 'Informe actualizado',
  'report.published': 'Informe publicado',
  'user.created': 'Usuario creado',
  'user.updated': 'Usuario actualizado',
  'user.role.updated': 'Roles de usuario actualizados',
};

export function eventLabel(event: string) {
  const normalized = event.trim().toLowerCase();
  if (EVENT_LABELS[normalized]) return EVENT_LABELS[normalized];
  return normalized
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part, index) => index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join(' ');
}

export function StatusBadge(props: { status: string; label?: string; tone?: StatusTone }) {
  const normalized = props.status.trim().toLowerCase();
  const presentation = STATUS_PRESENTATION[normalized] ?? {
    label: props.status || 'Sin estado',
    tone: 'neutral' as const,
  };
  const tone = props.tone ?? presentation.tone;
  return (
    <span className={`sigi-status-badge sigi-status-badge--${tone}`}>
      <span aria-hidden="true" />
      {props.label ?? presentation.label}
    </span>
  );
}

export type CompactListItem = {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  detail?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
};

export function CompactList(props: { items: CompactListItem[]; empty?: ReactNode; ariaLabel?: string }) {
  if (props.items.length === 0) return <EmptyState>{props.empty ?? 'No hay registros.'}</EmptyState>;
  return (
    <div className="sigi-compact-list" role="list" aria-label={props.ariaLabel}>
      {props.items.map((item) => (
        <article className="sigi-compact-row" role="listitem" key={item.id}>
          <div className="sigi-compact-row__main">
            <strong>{item.title}</strong>
            {item.meta ? <span>{item.meta}</span> : null}
          </div>
          {item.detail ? <div className="sigi-compact-row__detail">{item.detail}</div> : null}
          {item.status ? <div className="sigi-compact-row__status">{item.status}</div> : null}
          {item.actions ? <div className="sigi-compact-row__actions">{item.actions}</div> : null}
        </article>
      ))}
    </div>
  );
}

export type ActivityItem = {
  id: string;
  event: string;
  actor?: string | null;
  timestamp: string;
  status?: string | null;
  entity?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function ActivityList(props: { items: ActivityItem[]; empty?: ReactNode; ariaLabel?: string }) {
  const groups = useMemo(() => groupActivities(props.items), [props.items]);
  if (groups.length === 0) return <EmptyState>{props.empty ?? 'No hay actividad registrada.'}</EmptyState>;
  return (
    <div className="sigi-activity-list" aria-label={props.ariaLabel}>
      {groups.map((group) => (
        <section className="sigi-activity-group" key={group.key}>
          <h4>{group.label}</h4>
          <ol>
            {group.items.map((item) => (
              <li key={item.id}>
                <time dateTime={item.timestamp}>{formatTime(item.timestamp)}</time>
                <div className="sigi-activity-item__main">
                  <strong>{eventLabel(item.event)}</strong>
                  <span>{item.actor || 'Sistema'}{item.entity ? ` · ${item.entity}` : ''}</span>
                </div>
                <StatusBadge status={item.status || 'success'} />
                {item.metadata && Object.keys(item.metadata).length ? (
                  <details className="sigi-activity-item__detail">
                    <summary aria-label={`Detalle de ${eventLabel(item.event)}`}>Detalle</summary>
                    <dl>
                      <div><dt>Clave técnica</dt><dd>{item.event}</dd></div>
                      {Object.entries(item.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatMetadata(value)}</dd></div>)}
                    </dl>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export type DataTableColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  sortValue?: (row: Row) => string | number | null | undefined;
  className?: string;
};

export function DataTable<Row>(props: {
  rows: Row[];
  rowKey: (row: Row) => string;
  columns: DataTableColumn<Row>[];
  caption?: string;
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState<{ id: string; direction: 'asc' | 'desc' } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return props.rows;
    const column = props.columns.find((item) => item.id === sort.id);
    if (!column?.sortValue) return props.rows;
    return [...props.rows].sort((left, right) => {
      const a = column.sortValue?.(left);
      const b = column.sortValue?.(right);
      const comparison = String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [props.columns, props.rows, sort]);
  if (rows.length === 0) return <EmptyState>{props.empty ?? 'No hay registros.'}</EmptyState>;
  return (
    <div className="sigi-data-table-wrap">
      <table className="sigi-data-table">
        {props.caption ? <caption>{props.caption}</caption> : null}
        <thead><tr>{props.columns.map((column) => <th key={column.id} scope="col" className={column.className}>{column.sortValue ? <button type="button" onClick={() => setSort((current) => ({ id: column.id, direction: current?.id === column.id && current.direction === 'asc' ? 'desc' : 'asc' }))}>{column.header}<span aria-hidden="true">{sort?.id === column.id ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span></button> : column.header}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={props.rowKey(row)}>{props.columns.map((column) => <td key={column.id} data-label={column.header} className={column.className}>{column.cell(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function RowActions(props: { label: string; children: ReactNode }) {
  return <details className="sigi-row-actions"><summary aria-label={props.label}>⋯</summary><div>{props.children}</div></details>;
}

export function DetailDrawer(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <Drawer open={props.open} title={props.title} onClose={props.onClose}>{props.children}</Drawer>;
}

export function EmptyState(props: { children: ReactNode; action?: ReactNode }) {
  return <div className="sigi-empty-state"><span>{props.children}</span>{props.action}</div>;
}

function groupActivities(items: ActivityItem[]) {
  const groups = new Map<string, { key: string; label: string; items: ActivityItem[] }>();
  [...items].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).forEach((item) => {
    const date = new Date(item.timestamp);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? date.toISOString().slice(0, 10) : item.timestamp;
    const label = valid ? new Intl.DateTimeFormat('es-CR', { dateStyle: 'long' }).format(date) : item.timestamp;
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : new Intl.DateTimeFormat('es-CR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatMetadata(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
