import type { CSSProperties, ReactNode } from 'react';

const palette = {
  border: '#d7dde5',
  borderSoft: '#e6edf2',
  muted: '#5f6b7a',
  surface: '#ffffff',
  surfaceAlt: '#f5f7fb',
  accent: '#0b4f3a',
  accentStrong: '#1f8a5b',
  accentSoft: '#e8f5ef',
  warn: '#b45309',
  warnSoft: '#fff1dd',
  danger: '#b42318',
  dangerSoft: '#fdecea',
  text: '#10233f',
};

export type SectionIcon =
  | 'overview'
  | 'metrics'
  | 'activity'
  | 'status'
  | 'map'
  | 'database'
  | 'validation'
  | 'publication'
  | 'users'
  | 'flow'
  | 'audit'
  | 'alert'
  | 'globe';

type Tone = 'neutral' | 'good' | 'warn' | 'danger';

function iconWrapStyle() {
  return {
    width: 18,
    height: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
  } satisfies CSSProperties;
}

function renderSectionIcon(icon?: SectionIcon) {
  if (!icon) {
    return null;
  }

  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (icon) {
    case 'overview':
      return (
        <svg {...props}>
          <path d="M4 19h16" />
          <path d="M7 15v-4" />
          <path d="M12 19V8" />
          <path d="M17 19v-7" />
        </svg>
      );
    case 'metrics':
      return (
        <svg {...props}>
          <rect x="4" y="4" width="6" height="6" rx="1.2" />
          <rect x="14" y="4" width="6" height="6" rx="1.2" />
          <rect x="4" y="14" width="6" height="6" rx="1.2" />
          <rect x="14" y="14" width="6" height="6" rx="1.2" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...props}>
          <path d="m4 12 4-4 4 6 4-8 4 6" />
        </svg>
      );
    case 'status':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.5 12 2.2 2.2 4.8-4.8" />
        </svg>
      );
    case 'map':
      return (
        <svg {...props}>
          <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
          <path d="M9 4v14" />
          <path d="M15 6v14" />
        </svg>
      );
    case 'database':
      return (
        <svg {...props}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      );
    case 'validation':
      return (
        <svg {...props}>
          <path d="M7 5.5h10" />
          <path d="M7 10h10" />
          <path d="M7 14.5h6" />
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
        </svg>
      );
    case 'publication':
      return (
        <svg {...props}>
          <path d="M12 16V6" />
          <path d="m8 10 4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
      );
    case 'users':
      return (
        <svg {...props}>
          <path d="M16.5 19v-1.2a3.3 3.3 0 0 0-3.3-3.3H8.8a3.3 3.3 0 0 0-3.3 3.3V19" />
          <circle cx="11" cy="8" r="3" />
          <path d="M19.5 19v-1a2.8 2.8 0 0 0-2.2-2.7" />
        </svg>
      );
    case 'flow':
      return (
        <svg {...props}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="M8 6h8" />
          <path d="m7.5 7.5 3.2 7" />
          <path d="m16.5 7.5-3.2 7" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...props}>
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M15 4v4h4" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...props}>
          <path d="M12 4 20 19H4z" />
          <path d="M12 9v4" />
          <path d="M12 16h.01" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.8 12h16.4" />
          <path d="M12 3.8a13.5 13.5 0 0 1 0 16.4" />
          <path d="M12 3.8a13.5 13.5 0 0 0 0 16.4" />
        </svg>
      );
    default:
      return null;
  }
}

function toneAccent(tone: Tone) {
  return {
    neutral: { line: '#cbd5e1', iconBg: '#f5f7fb', iconColor: '#475569' },
    good: { line: palette.accentStrong, iconBg: palette.accentSoft, iconColor: palette.accent },
    warn: { line: palette.warn, iconBg: palette.warnSoft, iconColor: palette.warn },
    danger: { line: palette.danger, iconBg: palette.dangerSoft, iconColor: palette.danger },
  }[tone];
}

export function PageLead(props: {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: SectionIcon;
}) {
  return null;
}

export function MetricGrid(props: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        marginBottom: 12,
      }}
    >
      {props.children}
    </div>
  );
}

export function MetricCard(props: {
  label: string;
  value: string;
  hint: string;
  icon?: SectionIcon;
  tone?: Tone;
}) {
  const accent = toneAccent(props.tone ?? 'neutral');

  return (
    <article
      style={{
        background: `linear-gradient(180deg, ${palette.surface} 0%, ${palette.surfaceAlt} 100%)`,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        padding: 12,
        boxShadow: 'none',
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        gap: 6,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: '0 auto auto 0',
          width: '100%',
          height: 3,
          background: accent.line,
          opacity: 0.9,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div style={{ color: palette.muted, fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {props.label}
        </div>
        {props.icon ? (
          <span
            style={{
              ...iconWrapStyle(),
              width: 34,
              height: 34,
              borderRadius: 12,
              background: accent.iconBg,
              color: accent.iconColor,
            }}
          >
            {renderSectionIcon(props.icon)}
          </span>
        ) : null}
      </div>
      <div style={{ color: palette.text, fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{props.value}</div>
      <div style={{ color: palette.muted, fontSize: 15, lineHeight: 1.5 }}>{props.hint}</div>
    </article>
  );
}

export function PanelGrid(props: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      }}
    >
      {props.children}
    </div>
  );
}

export function Panel(props: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  icon?: SectionIcon;
  tone?: Tone;
}) {
  const accent = toneAccent(props.tone ?? 'neutral');

  return (
    <section
      style={{
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: 16,
        padding: 14,
        boxShadow: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: '0 auto auto 0',
          width: '100%',
          height: 3,
          background: accent.line,
          opacity: 0.9,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {props.icon ? (
            <span
              style={{
                ...iconWrapStyle(),
                width: 36,
                height: 36,
                borderRadius: 12,
                background: accent.iconBg,
                color: accent.iconColor,
                marginTop: 2,
              }}
            >
              {renderSectionIcon(props.icon)}
            </span>
          ) : null}
          <div>
            <h3 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, color: palette.text }}>{props.title}</h3>
            {props.subtitle ? (
              <p style={{ margin: '6px 0 0', color: palette.muted, fontSize: 16, lineHeight: 1.5 }}>
                {props.subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

export function StatPill(props: {
  tone?: Tone;
  children: ReactNode;
}) {
  const toneStyles: Record<Tone, CSSProperties> = {
    neutral: { background: palette.surfaceAlt, color: palette.text },
    good: { background: palette.accentSoft, color: palette.accent },
    warn: { background: palette.warnSoft, color: palette.warn },
    danger: { background: palette.dangerSoft, color: palette.danger },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        fontSize: 15,
        fontWeight: 800,
        padding: '6px 11px',
        letterSpacing: '0.02em',
        ...toneStyles[props.tone ?? 'neutral'],
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: 'currentColor',
          opacity: 0.72,
        }}
      />
      {props.children}
    </span>
  );
}

export function DetailList(props: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
      {props.items.map((item, index) => (
        <div
          key={`${item.label}-${item.value}`}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 14,
            padding: '0 0 10px',
            borderBottom: index === props.items.length - 1 ? 'none' : `1px solid ${palette.borderSoft}`,
          }}
        >
          <dt style={{ color: palette.muted, fontSize: 15 }}>{item.label}</dt>
          <dd style={{ color: palette.text, margin: 0, fontWeight: 700, textAlign: 'right', fontSize: 16 }}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MessageBlock(props: {
  tone?: 'neutral' | 'danger';
  children: ReactNode;
  icon?: SectionIcon;
}) {
  const tone = props.tone ?? 'neutral';
  const style =
    tone === 'danger'
      ? { background: palette.dangerSoft, color: palette.danger, border: '#f3c7c2' }
      : { background: palette.surfaceAlt, color: palette.muted, border: palette.borderSoft };

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 14,
        fontSize: 16,
        border: `1px solid ${style.border}`,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        lineHeight: 1.5,
        background: style.background,
        color: style.color,
      }}
    >
      <span
        style={{
          ...iconWrapStyle(),
          width: 18,
          height: 18,
          marginTop: 1,
          color: style.color,
        }}
      >
        {renderSectionIcon(props.icon ?? (tone === 'danger' ? 'alert' : 'overview'))}
      </span>
      <span style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        {renderMessageContent(props.children, tone)}
      </span>
    </div>
  );
}

function renderMessageContent(content: ReactNode, tone: 'neutral' | 'danger') {
  if (typeof content !== 'string') {
    return content;
  }

  const parsed = parseDiagnosticMessage(content);
  if (!parsed) {
    return content;
  }

  return (
    <>
      <strong style={{ color: tone === 'danger' ? palette.danger : palette.text, fontSize: 16 }}>
        {parsed.message}
      </strong>
      <span
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          fontSize: 14,
          color: tone === 'danger' ? '#8f2318' : palette.muted,
        }}
      >
        {parsed.code ? <span>Código: {parsed.code}</span> : null}
        {parsed.requestId ? <span>Ref: {parsed.requestId}</span> : null}
      </span>
    </>
  );
}

function parseDiagnosticMessage(content: string) {
  const segments = content
    .split('·')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const message = segments[0] ?? '';
  const codeSegment = segments.find((segment) => segment.toLowerCase().startsWith('código:'));
  const refSegment = segments.find((segment) => segment.toLowerCase().startsWith('ref:'));

  if (!codeSegment && !refSegment) {
    return null;
  }

  return {
    message,
    code: codeSegment?.slice(codeSegment.indexOf(':') + 1).trim() ?? null,
    requestId: refSegment?.slice(refSegment.indexOf(':') + 1).trim() ?? null,
  };
}
