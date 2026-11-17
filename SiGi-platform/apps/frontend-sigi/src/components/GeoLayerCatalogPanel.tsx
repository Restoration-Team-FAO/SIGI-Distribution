import type { GeoDatasetProfile, GeoLayer, GeoLayerField } from '@sigi/domain';
import { MessageBlock } from './section-kit';
import {
  GeoLayerFilterControls,
  GeoLayerFilterFormState,
  GeoLayerFilterValue,
} from './GeoLayerFilterControls';

/**
 * Authenticated geospatial layer catalog
 * (P0-4/P0-6 — see docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.2). Same
 * behavior and data contract, restyled for admin's section-kit palette
 * (accent #0b4f3a vs. country's #0f766e) — the two design systems already
 * diverged (515 vs. 193 lines) before this module existed, so this is a
 * fresh, admin-native component rather than a copy with different colors
 * pretending to be shared.
 */

export type GeoLayerCatalogEntry = {
  layer: GeoLayer;
  active: boolean;
  color: string;
  opacity: number;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  schema: GeoLayerField[] | null;
  schemaLoading: boolean;
  filterForm: GeoLayerFilterFormState;
  activeFilterCount: number;
  /** P1-2 — cached per-layer profile (spec §11); null while loading or if the layer was never profiled. */
  profile: GeoDatasetProfile | null;
  profileLoading: boolean;
};

type GeoLayerCatalogPanelProps = {
  entries: GeoLayerCatalogEntry[];
  onToggle: (code: string) => void;
  onOpacityChange: (code: string, opacity: number) => void;
  onZoomToLayer: (code: string) => void;
  onFilterFieldChange: (code: string, fieldName: string, value: GeoLayerFilterValue) => void;
  onClearFilters: (code: string) => void;
  onShowTable: (code: string) => void;
  tableLayerCode: string | null;
};

const UNCATEGORIZED_LABEL = 'Sin categoría';

const CATEGORY_LABELS: Record<string, string> = {
  territory: 'Territorio',
  territories: 'Territorio',
  projects: 'Proyectos',
  project: 'Proyectos',
  climate: 'Clima',
  biodiversity: 'Biodiversidad',
  water: 'Agua',
  restoration: 'Restauración',
  production: 'Producción',
  reference: 'Referencia',
  infrastructure: 'Infraestructura',
  monitoring: 'Monitoreo',
};

function categoryLabel(value: string) {
  return CATEGORY_LABELS[value.toLowerCase()] ?? value;
}

function visibilityLabel(value: string) {
  return (
    {
      public: 'Pública',
      institutional: 'Institucional',
      restricted: 'Restringida',
      private: 'Privada',
      internal: 'Interna',
    }[value] ?? value
  );
}

/** P1-2 — compact readout of gis.geo_layer_profile; spec §11 "estadísticas dinámicas". */
function formatProfileSummary(profile: GeoDatasetProfile): string {
  const validCount = profile.featureCount - profile.nullGeometryCount - profile.invalidGeometryCount;
  const validPct = profile.featureCount > 0 ? Math.round((validCount / profile.featureCount) * 100) : 100;
  const profiledLabel = profile.profiledAt
    ? new Date(profile.profiledAt).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'No disponible';
  return `${profile.featureCount.toLocaleString('es-CR')} elementos · ${validPct}% con geometría válida · Perfilado: ${profiledLabel}`;
}

function groupEntries(entries: GeoLayerCatalogEntry[]) {
  const groups = new Map<string, GeoLayerCatalogEntry[]>();
  for (const entry of entries) {
    const key = entry.layer.category?.trim() || UNCATEGORIZED_LABEL;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  }
  return Array.from(groups.entries()).sort(([left], [right]) => {
    if (left === UNCATEGORIZED_LABEL) return 1;
    if (right === UNCATEGORIZED_LABEL) return -1;
    return left.localeCompare(right, 'es');
  });
}

export function GeoLayerCatalogPanel(props: GeoLayerCatalogPanelProps) {
  if (props.entries.length === 0) {
    return <MessageBlock>No hay capas geoespaciales disponibles para tu rol.</MessageBlock>;
  }

  const groups = groupEntries(props.entries);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {groups.map(([category, items]) => (
        <div key={category} style={{ display: 'grid', gap: 8 }}>
          <strong style={categoryLabelStyle}>{categoryLabel(category)}</strong>
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map((entry) => (
              <LayerRow
                key={entry.layer.code}
                entry={entry}
                onToggle={props.onToggle}
                onOpacityChange={props.onOpacityChange}
                onZoomToLayer={props.onZoomToLayer}
                onFilterFieldChange={props.onFilterFieldChange}
                onClearFilters={props.onClearFilters}
                onShowTable={props.onShowTable}
                isTableLayer={props.tableLayerCode === entry.layer.code}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LayerRow(props: {
  entry: GeoLayerCatalogEntry;
  onToggle: (code: string) => void;
  onOpacityChange: (code: string, opacity: number) => void;
  onZoomToLayer: (code: string) => void;
  onFilterFieldChange: (code: string, fieldName: string, value: GeoLayerFilterValue) => void;
  onClearFilters: (code: string) => void;
  onShowTable: (code: string) => void;
  isTableLayer: boolean;
}) {
  const { entry } = props;

  return (
    <div style={rowStyle(entry.active)}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }} title={entry.layer.description ?? undefined}>
        <input type="checkbox" checked={entry.active} onChange={() => props.onToggle(entry.layer.code)} />
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            background: entry.color,
            opacity: entry.active ? 1 : 0.55,
            border: '1px solid rgba(16,35,63,0.2)',
            flexShrink: 0,
          }}
        />
        <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
          <strong style={{ color: '#10233f', fontSize: 13, lineHeight: 1.3 }}>{entry.layer.name}</strong>
          {entry.layer.visibility !== 'public' ? (
            <span style={{ color: '#9a3412', fontSize: 11, fontWeight: 700 }}>{visibilityLabel(entry.layer.visibility)}</span>
          ) : null}
        </span>
      </label>

      {entry.active ? (
        <div style={{ display: 'grid', gap: 6, marginTop: 8, paddingLeft: 24 }}>
          {entry.loading ? <span style={statusMutedStyle}>Cargando…</span> : null}
          {entry.error ? <span style={statusDangerStyle}>{entry.error}</span> : null}
          {entry.truncated ? (
            <span style={statusWarnStyle}>
              Mostrando una muestra de la capa; el mapa carga un máximo de features por capa en esta
              versión.
            </span>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              value={entry.opacity}
              onChange={(event) => props.onOpacityChange(entry.layer.code, Number(event.target.value))}
              style={{ flex: 1, minWidth: 60 }}
              aria-label={'Opacidad de ' + entry.layer.name}
              title="Opacidad"
            />
            <button type="button" onClick={() => props.onZoomToLayer(entry.layer.code)} style={zoomButtonStyle} title="Encuadrar esta capa">
              Zoom
            </button>
            <button type="button" onClick={() => props.onShowTable(entry.layer.code)} style={zoomButtonStyle} aria-pressed={props.isTableLayer} title="Tabla de atributos">
              {props.isTableLayer ? 'Tabla ✓' : 'Tabla'}
            </button>
          </div>

          <details>
            <summary style={{ cursor: 'pointer', color: '#475569', fontSize: 12, fontWeight: 700 }}>
              Filtros y estadísticas{entry.activeFilterCount ? ' (' + entry.activeFilterCount + ')' : ''}
            </summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {entry.profileLoading ? <span style={statusMutedStyle}>Cargando estadísticas…</span> : null}
          {!entry.profileLoading && entry.profile ? (
            <span style={statusMutedStyle}>{formatProfileSummary(entry.profile)}</span>
          ) : null}
          {!entry.profileLoading && entry.profile === null ? (
            <span style={statusMutedStyle}>Sin estadísticas de capa disponibles todavía.</span>
          ) : null}

          {entry.schemaLoading ? <span style={statusMutedStyle}>Cargando filtros…</span> : null}
          {entry.schema ? (
            <GeoLayerFilterControls
              fields={entry.schema}
              form={entry.filterForm}
              activeFilterCount={entry.activeFilterCount}
              onChange={(fieldName, value) => props.onFilterFieldChange(entry.layer.code, fieldName, value)}
              onClear={() => props.onClearFilters(entry.layer.code)}
            />
          ) : null}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}

const categoryLabelStyle = {
  fontSize: 12,
  color: '#5f6b7a',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
};

function rowStyle(isActive: boolean) {
  return {
    border: isActive ? '1px solid #93b4dc' : '1px solid #e2e8f0',
    background: isActive ? '#f2f7fd' : '#ffffff',
    borderRadius: 11,
    padding: '9px 10px',
  };
}

const statusMutedStyle = { color: '#5f6b7a', fontSize: 12 };
const statusDangerStyle = { color: '#b42318', fontSize: 12 };
const statusWarnStyle = { color: '#b45309', fontSize: 12 };

const zoomButtonStyle = {
  justifySelf: 'start',
  border: '1px solid #d7dde5',
  borderRadius: 8,
  padding: '4px 9px',
  background: '#ffffff',
  color: '#10233f',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
