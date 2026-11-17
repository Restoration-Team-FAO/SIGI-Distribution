import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
} from 'react';
import './tokens.css';

export type UiTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  loading?: boolean;
}) {
  const { variant = 'primary', loading = false, className = '', children, disabled, ...rest } = props;
  return <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={`sigi-ui-button sigi-ui-button--${variant} ${className}`.trim()}>{loading ? 'Guardando…' : children}</button>;
}

export function IconButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const { label, className = '', children, ...rest } = props;
  return <button {...rest} aria-label={label} title={label} className={`sigi-ui-icon-button ${className}`.trim()}>{children}</button>;
}

type FieldShellProps = { label: string; hint?: string; error?: string; required?: boolean; inputId?: string; children: (id: string, describedBy?: string) => ReactNode };
function FieldShell(props: FieldShellProps) {
  const generatedId = useId();
  const id = props.inputId ?? generatedId;
  const hintId = props.hint ? `${id}-hint` : undefined;
  const errorId = props.error ? `${id}-error` : undefined;
  return <label className="sigi-ui-field" htmlFor={id}><span className="sigi-ui-field__label">{props.label}{props.required ? <span className="sigi-ui-field__required"> *</span> : null}</span>{props.children(id, errorId ?? hintId)}{props.error ? <p id={errorId} className="sigi-ui-field__error">{props.error}</p> : props.hint ? <p id={hintId} className="sigi-ui-field__hint">{props.hint}</p> : null}</label>;
}

export function InputField(props: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const { label, hint, error, className = '', id, ...rest } = props;
  return <FieldShell label={label} hint={hint} error={error} required={rest.required} inputId={id}>{(fieldId, describedBy) => <input {...rest} id={fieldId} aria-describedby={describedBy} aria-invalid={Boolean(error) || undefined} className={`sigi-ui-control ${className}`.trim()} />}</FieldShell>;
}

export function SelectField(props: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string; children: ReactNode }) {
  const { label, hint, error, className = '', id, children, ...rest } = props;
  return <FieldShell label={label} hint={hint} error={error} required={rest.required} inputId={id}>{(fieldId, describedBy) => <select {...rest} id={fieldId} aria-describedby={describedBy} aria-invalid={Boolean(error) || undefined} className={`sigi-ui-control ${className}`.trim()}>{children}</select>}</FieldShell>;
}

export function TextareaField(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const { label, hint, error, className = '', id, ...rest } = props;
  return <FieldShell label={label} hint={hint} error={error} required={rest.required} inputId={id}>{(fieldId, describedBy) => <textarea {...rest} id={fieldId} aria-describedby={describedBy} aria-invalid={Boolean(error) || undefined} className={`sigi-ui-control ${className}`.trim()} />}</FieldShell>;
}

export function Checkbox(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return <label className="sigi-ui-field__label" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><input {...rest} type="checkbox" />{label}</label>;
}
export const Switch = Checkbox;

export function Badge(props: { tone?: UiTone; children: ReactNode }) {
  return <span className={`sigi-ui-badge sigi-ui-badge--${props.tone ?? 'neutral'}`}>{props.children}</span>;
}
export const StatusBadge = Badge;

export function Card(props: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`sigi-ui-card ${props.className ?? ''}`.trim()}>{props.title || props.description || props.action ? <header className="sigi-ui-card__header"><div>{props.title ? <h2 className="sigi-ui-card__title">{props.title}</h2> : null}{props.description ? <p className="sigi-ui-card__description">{props.description}</p> : null}</div>{props.action}</header> : null}<div className="sigi-ui-card__body">{props.children}</div></section>;
}

export function KPI(props: { label: string; value: ReactNode; context: string; tone?: UiTone }) {
  return <Card><Badge tone={props.tone}>{props.label}</Badge><div className="sigi-ui-kpi__value">{props.value}</div><p className="sigi-ui-card__description">{props.context}</p></Card>;
}

export function Breadcrumb(props: { items: Array<{ label: string; href?: string }> }) {
  return <nav aria-label="Migas de pan"><ol className="sigi-ui-breadcrumb">{props.items.map((item, index) => <li key={`${item.label}-${index}`}>{index > 0 ? <span aria-hidden="true">/ </span> : null}{item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>;
}

export function PageHeader(props: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; breadcrumbs?: Array<{ label: string; href?: string }> }) {
  return <>{props.breadcrumbs ? <Breadcrumb items={props.breadcrumbs} /> : null}<header className="sigi-ui-page-header"><div>{props.eyebrow ? <span className="sigi-ui-page-header__eyebrow">{props.eyebrow}</span> : null}<h1>{props.title}</h1>{props.description ? <p>{props.description}</p> : null}</div>{props.actions ? <div className="sigi-ui-page-header__actions">{props.actions}</div> : null}</header></>;
}

export function SectionHeader(props: { title: string; description?: string; action?: ReactNode }) {
  return <header className="sigi-ui-card__header" style={{ padding: 0 }}><div><h2 className="sigi-ui-card__title">{props.title}</h2>{props.description ? <p className="sigi-ui-card__description">{props.description}</p> : null}</div>{props.action}</header>;
}
export function Toolbar(props: { children: ReactNode; label?: string }) { return <div role="toolbar" aria-label={props.label} className="sigi-ui-toolbar">{props.children}</div>; }
export function FilterBar(props: { children: ReactNode; label?: string }) { return <section aria-label={props.label ?? 'Filtros'} className="sigi-ui-filter-bar">{props.children}</section>; }

export function Tabs(props: { value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }> }) {
  return <div role="tablist" className="sigi-ui-tabs">{props.items.map((item) => <button key={item.value} type="button" role="tab" aria-selected={props.value === item.value} className="sigi-ui-tab" onClick={() => props.onChange(item.value)}>{item.label}</button>)}</div>;
}

export function StateMessage(props: { title: string; description: string; tone?: 'neutral' | 'danger'; action?: ReactNode; busy?: boolean }) {
  return <section className={`sigi-ui-state${props.tone === 'danger' ? ' sigi-ui-state--danger' : ''}`} aria-live="polite" aria-busy={props.busy || undefined}><h3>{props.title}</h3><p>{props.description}</p>{props.action}</section>;
}
export function LoadingState(props: { message?: string }) { return <StateMessage title="Cargando" description={props.message ?? 'Preparando la información solicitada…'} busy />; }
export function EmptyState(props: { title?: string; description: string; action?: ReactNode }) { return <StateMessage title={props.title ?? 'Sin información'} description={props.description} action={props.action} />; }
export function ErrorState(props: { title?: string; description: string; action?: ReactNode }) { return <StateMessage title={props.title ?? 'No fue posible completar la operación'} description={props.description} action={props.action} tone="danger" />; }
export const NoPermissionState = (props: { description: string }) => <StateMessage title="Sin permiso" description={props.description} />;
export const NoResultsState = (props: { description: string; action?: ReactNode }) => <StateMessage title="Sin resultados" description={props.description} action={props.action} />;
export const DependencyErrorState = (props: { description: string; action?: ReactNode }) => <StateMessage title="Servicio no disponible" description={props.description} action={props.action} tone="danger" />;

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

export function Modal(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useDismiss(props.open, props.onClose);
  if (!props.open) return null;
  return <div className="sigi-ui-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) props.onClose(); }}><section role="dialog" aria-modal="true" aria-label={props.title} className="sigi-ui-dialog"><div className="sigi-ui-card__body"><SectionHeader title={props.title} action={<IconButton label="Cerrar" onClick={props.onClose}>×</IconButton>} />{props.children}</div></section></div>;
}

export function Drawer(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useDismiss(props.open, props.onClose);
  if (!props.open) return null;
  return <><div className="sigi-ui-overlay" role="presentation" onMouseDown={props.onClose} /><aside role="dialog" aria-modal="true" aria-label={props.title} className="sigi-ui-drawer"><div className="sigi-ui-card__body"><SectionHeader title={props.title} action={<IconButton label="Cerrar" onClick={props.onClose}>×</IconButton>} />{props.children}</div></aside></>;
}

export function ToastRegion(props: { messages: Array<{ id: string; message: string }> }) { return <div className="sigi-ui-toast-region" aria-live="polite">{props.messages.map((item) => <div key={item.id} className="sigi-ui-toast">{item.message}</div>)}</div>; }
export function FormSection(props: { title: string; description?: string; children: ReactNode }) { return <section className="sigi-ui-form-section"><SectionHeader title={props.title} description={props.description} />{props.children}</section>; }
export function DetailPanel(props: { children: ReactNode; label?: string }) { return <aside aria-label={props.label} className="sigi-ui-detail-panel">{props.children}</aside>; }
export function Search(props: InputHTMLAttributes<HTMLInputElement> & { label?: string }) { const { label = 'Buscar', ...rest } = props; return <InputField {...rest} type="search" label={label} />; }
