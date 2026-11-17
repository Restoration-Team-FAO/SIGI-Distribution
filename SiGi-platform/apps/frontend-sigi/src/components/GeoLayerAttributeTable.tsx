import type { GeoFeature, GeoLayer, GeoLayerField, GeoLayerFieldStats } from '@sigi/domain';
import { MessageBlock } from './section-kit';

/**
 * Authenticated geospatial attribute table
 * (P0-7 — see docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.6). Server-side
 * pagination and sorting, columns from the same schema the filter panel
 * already loaded, no separate "buscar" box (the per-field filters cover it).
 *
 * Export (P0-8, spec §17) mirrors the country version exactly: CSV/Excel/
 * GeoJSON of the current filtered/sorted result set.
 */

export type GeoExportFormat = 'csv' | 'xlsx' | 'geojson';

type GeoLayerAttributeTableProps = {
  layer: GeoLayer;
  schema: GeoLayerField[] | null;
  schemaLoading: boolean;
  features: GeoFeature[];
  page: number;
  pageSize: number;
  totalFeatures: number;
  loading: boolean;
  error: string | null;
  sort: string | null;
  order: 'asc' | 'desc';
  selectedFeatureCode: string | null;
  onPageChange: (page: number) => void;
  onSortChange: (field: string) => void;
  onSelectRow: (feature: GeoFeature) => void;
  onClose: () => void;
  exportFormat: GeoExportFormat;
  onExportFormatChange: (format: GeoExportFormat) => void;
  onExport: () => void;
  exporting: boolean;
  exportError: string | null;
  exportNotice: string | null;
  /** P1-5 — distribution chart (spec §12) over the whole filtered set, not just this page. */
  chartField: string | null;
  onChartFieldChange: (field: string) => void;
  chartData: GeoLayerFieldStats | null;
  chartLoading: boolean;
  chartError: string | null;
};

function getFeatureCode(feature: GeoFeature): string {
  const value = feature.properties.code;
  return typeof value === 'string' ? value : String(feature.id ?? '');
}

function formatCellValue(value: unknown, field: GeoLayerField): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (field.type === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  if (field.type === 'number') {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num.toLocaleString('es-CR', { maximumFractionDigits: 2 }) : String(value);
  }
  return String(value);
}

export function GeoLayerAttributeTable(props: GeoLayerAttributeTableProps) {
  const columns = (props.schema ?? []).filter((field) => field.visible);
  const totalPages = Math.max(1, Math.ceil(props.totalFeatures / props.pageSize));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ color: '#10233f', fontSize: 15 }}>Tabla de atributos — {props.layer.name}</strong>
          <div style={{ color: '#5f6b7a', fontSize: 12 }}>
            {props.totalFeatures.toLocaleString('es-CR')} registros totales
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={props.exportFormat}
            onChange={(event) => props.onExportFormatChange(event.target.value as GeoExportFormat)}
            style={exportSelectStyle}
            aria-label="Formato de exportación"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="geojson">GeoJSON</option>
          </select>
          <button
            type="button"
            onClick={props.onExport}
            disabled={props.exporting || props.totalFeatures === 0}
            style={exportButtonStyle(props.exporting || props.totalFeatures === 0)}
          >
            {props.exporting ? 'Exportando…' : 'Exportar'}
          </button>
          <button type="button" onClick={props.onClose} style={closeButtonStyle}>
            Cerrar tabla
          </button>
        </div>
      </div>

      {props.exportError ? <MessageBlock tone="danger">{props.exportError}</MessageBlock> : null}
      {props.exportNotice ? <MessageBlock tone="neutral">{props.exportNotice}</MessageBlock> : null}
      {props.error ? <MessageBlock tone="danger">{props.error}</MessageBlock> : null}
      {props.schemaLoading || (!props.schema && !props.error) ? (
        <MessageBlock>Cargando columnas de la capa…</MessageBlock>
      ) : null}

      {columns.length > 0 ? (
        <div style={{ overflowX: 'auto', border: '1px solid #d7dde5', borderRadius: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map((field) => (
                  <th
                    key={field.name}
                    onClick={() => field.sortable && props.onSortChange(field.name)}
                    style={headerCellStyle(field.sortable)}
                  >
                    {field.label}
                    {field.unit ? ` (${field.unit})` : ''}
                    {props.sort === field.name ? (props.order === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.loading ? (
                <tr>
                  <td colSpan={columns.length} style={{ ...cellStyle, textAlign: 'center', color: '#5f6b7a' }}>
                    Cargando…
                  </td>
                </tr>
              ) : null}
              {!props.loading && props.features.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ ...cellStyle, textAlign: 'center', color: '#5f6b7a' }}>
                    Sin registros para los filtros actuales.
                  </td>
                </tr>
              ) : null}
              {!props.loading &&
                props.features.map((feature) => {
                  const code = getFeatureCode(feature);
                  const isSelected = code === props.selectedFeatureCode;
                  return (
                    <tr
                      key={code || feature.id}
                      onClick={() => props.onSelectRow(feature)}
                      style={rowStyle(isSelected)}
                    >
                      {columns.map((field) => (
                        <td key={field.name} style={cellStyle}>
                          {formatCellValue(feature.properties[field.name], field)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#5f6b7a', fontSize: 12 }}>
          Página {props.page} de {totalPages}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={props.page <= 1}
            onClick={() => props.onPageChange(props.page - 1)}
            style={pageButtonStyle(props.page <= 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={props.page >= totalPages}
            onClick={() => props.onPageChange(props.page + 1)}
            style={pageButtonStyle(props.page >= totalPages)}
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* P1-5 — distribution chart (spec §12): always the whole filtered set, never this page alone. */}
      <div style={chartSectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <strong style={{ color: '#10233f', fontSize: 13 }}>Distribución</strong>
          <select
            value={props.chartField ?? ''}
            onChange={(event) => props.onChartFieldChange(event.target.value)}
            style={exportSelectStyle}
            aria-label="Campo para el gráfico de distribución"
          >
            <option value="" disabled>
              Elegir campo...
            </option>
            {(props.schema ?? []).map((field) => (
              <option key={field.name} value={field.name}>
                {field.label}
              </option>
            ))}
          </select>
        </div>
        {props.chartLoading ? <MessageBlock>Calculando distribución…</MessageBlock> : null}
        {props.chartError ? <MessageBlock tone="danger">{props.chartError}</MessageBlock> : null}
        {!props.chartLoading && !props.chartError && props.chartData ? (
          <GeoLayerFieldChart stats={props.chartData} />
        ) : null}
      </div>
    </div>
  );
}

function GeoLayerFieldChart(props: { stats: GeoLayerFieldStats }) {
  const { stats } = props;

  if (stats.kind === 'numeric') {
    return (
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
        <ChartStat label="Elementos" value={stats.count.toLocaleString('es-CR')} />
        <ChartStat label="Mínimo" value={stats.min !== null ? stats.min.toLocaleString('es-CR', { maximumFractionDigits: 2 }) : '—'} />
        <ChartStat label="Máximo" value={stats.max !== null ? stats.max.toLocaleString('es-CR', { maximumFractionDigits: 2 }) : '—'} />
        <ChartStat label="Promedio" value={stats.avg !== null ? stats.avg.toLocaleString('es-CR', { maximumFractionDigits: 2 }) : '—'} />
      </div>
    );
  }

  if (stats.kind === 'date') {
    return (
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
        <ChartStat label="Elementos" value={stats.count.toLocaleString('es-CR')} />
        <ChartStat label="Más antiguo" value={stats.min ?? '—'} />
        <ChartStat label="Más reciente" value={stats.max ?? '—'} />
      </div>
    );
  }

  if (stats.groups.length === 0) {
    return <MessageBlock>Sin datos para graficar con los filtros actuales.</MessageBlock>;
  }

  const maxCount = Math.max(...stats.groups.map((group) => group.count));

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      {stats.groups.map((group) => (
        <div key={group.value} style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
            <span style={{ color: '#10233f' }}>{group.value}</span>
            <span style={{ color: '#5f6b7a' }}>{group.count.toLocaleString('es-CR')}</span>
          </div>
          <div style={chartBarTrackStyle}>
            <div style={{ ...chartBarFillStyle, width: `${maxCount > 0 ? (group.count / maxCount) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
      {stats.truncated ? (
        <span style={{ color: '#5f6b7a', fontSize: 11 }}>
          Mostrando los 20 valores más frecuentes; hay más valores distintos sin graficar.
        </span>
      ) : null}
    </div>
  );
}

function ChartStat(props: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span style={{ color: '#5f6b7a', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>
        {props.label}
      </span>
      <strong style={{ color: '#10233f', fontSize: 16 }}>{props.value}</strong>
    </div>
  );
}

function headerCellStyle(sortable: boolean) {
  return {
    textAlign: 'left' as const,
    padding: '8px 10px',
    borderBottom: '1px solid #d7dde5',
    background: '#f5f7fb',
    color: '#10233f',
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
    cursor: sortable ? 'pointer' : 'default',
    userSelect: 'none' as const,
  };
}

const cellStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid #eef1f5',
  color: '#334155',
  whiteSpace: 'nowrap' as const,
};

function rowStyle(isSelected: boolean) {
  return {
    cursor: 'pointer',
    background: isSelected ? '#e8f5ef' : '#ffffff',
  };
}

function pageButtonStyle(disabled: boolean) {
  return {
    border: '1px solid #d7dde5',
    borderRadius: 8,
    padding: '6px 12px',
    background: disabled ? '#f5f7fb' : '#ffffff',
    color: disabled ? '#9aa4b2' : '#10233f',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const exportSelectStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 8,
  padding: '6px 8px',
  background: '#ffffff',
  color: '#10233f',
  fontSize: 12,
  fontWeight: 700,
};

function exportButtonStyle(disabled: boolean) {
  return {
    border: '1px solid #0b4f3a',
    borderRadius: 999,
    padding: '6px 14px',
    background: disabled ? '#9fc4b4' : '#0b4f3a',
    borderColor: disabled ? '#9fc4b4' : '#0b4f3a',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const chartSectionStyle = {
  borderTop: '1px solid #eef1f5',
  paddingTop: 12,
  marginTop: 4,
  display: 'grid' as const,
  gap: 4,
};

const chartBarTrackStyle = {
  width: '100%',
  height: 10,
  borderRadius: 999,
  background: '#eef1f5',
  overflow: 'hidden' as const,
};

const chartBarFillStyle = {
  height: '100%',
  borderRadius: 999,
  background: '#0b4f3a',
};

const closeButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '6px 12px',
  background: '#ffffff',
  color: '#10233f',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
