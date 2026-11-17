import type { GeoLayerField } from '@sigi/domain';
import { buildGeoFiltersFromForm, GeoFilterFormState, GeoFilterValue } from '@sigi/shared';

/**
 * Authenticated layer filter controls (P0-6). The form->filter conversion
 * itself (buildGeoFiltersFromForm)
 * lives in @sigi/shared. See docs/geo/MAPA_SIGI_DIAGNOSTICO.md (D5).
 */
export type GeoLayerFilterValue = GeoFilterValue;
export type GeoLayerFilterFormState = GeoFilterFormState;

export const buildFiltersFromForm = buildGeoFiltersFromForm;

type GeoLayerFilterControlsProps = {
  fields: GeoLayerField[];
  form: GeoLayerFilterFormState;
  onChange: (fieldName: string, value: GeoLayerFilterValue) => void;
  onClear: () => void;
  activeFilterCount: number;
};

export function GeoLayerFilterControls(props: GeoLayerFilterControlsProps) {
  const filterableFields = props.fields.filter((field) => field.filterable);

  if (filterableFields.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={sectionLabelStyle}>Filtros ({props.activeFilterCount} activos)</span>
        {props.activeFilterCount > 0 ? (
          <button type="button" onClick={props.onClear} style={clearButtonStyle}>
            Limpiar
          </button>
        ) : null}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {filterableFields.map((field) => (
          <FilterField key={field.name} field={field} value={props.form[field.name]} onChange={props.onChange} />
        ))}
      </div>
    </div>
  );
}

function FilterField(props: {
  field: GeoLayerField;
  value: GeoLayerFilterValue;
  onChange: (fieldName: string, value: GeoLayerFilterValue) => void;
}) {
  const { field } = props;
  const unitSuffix = field.unit ? ` (${field.unit})` : '';

  if (field.type === 'enum') {
    const selected = (props.value as string[] | undefined) ?? [];
    return (
      <div style={fieldWrapStyle}>
        <span style={fieldLabelStyle}>{field.label}</span>
        <div style={{ display: 'grid', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
          {(field.enumValues ?? []).map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={option} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked ? selected.filter((item) => item !== option) : [...selected, option];
                    props.onChange(field.name, next.length > 0 ? next : undefined);
                  }}
                />
                <span style={{ color: '#334155' }}>{option}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === 'boolean') {
    const value = (props.value as string | undefined) ?? '';
    return (
      <div style={fieldWrapStyle}>
        <span style={fieldLabelStyle}>{field.label}</span>
        <select
          value={value}
          onChange={(event) => props.onChange(field.name, event.target.value || undefined)}
          style={selectStyle}
        >
          <option value="">Cualquiera</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </div>
    );
  }

  if (field.type === 'number' || field.type === 'date') {
    const range = (props.value as { min: string; max: string } | undefined) ?? { min: '', max: '' };
    const inputType = field.type === 'number' ? 'number' : 'date';
    return (
      <div style={fieldWrapStyle}>
        <span style={fieldLabelStyle}>
          {field.label}
          {unitSuffix}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type={inputType}
            value={range.min}
            placeholder="Mín."
            onChange={(event) => props.onChange(field.name, { ...range, min: event.target.value })}
            style={rangeInputStyle}
          />
          <input
            type={inputType}
            value={range.max}
            placeholder="Máx."
            onChange={(event) => props.onChange(field.name, { ...range, max: event.target.value })}
            style={rangeInputStyle}
          />
        </div>
      </div>
    );
  }

  const text = (props.value as string | undefined) ?? '';
  return (
    <div style={fieldWrapStyle}>
      <span style={fieldLabelStyle}>{field.label}</span>
      <input
        type="text"
        value={text}
        placeholder="Contiene…"
        onChange={(event) => props.onChange(field.name, event.target.value || undefined)}
        style={selectStyle}
      />
    </div>
  );
}

const sectionLabelStyle = {
  fontSize: 12,
  color: '#5f6b7a',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
};

const fieldWrapStyle = { display: 'grid', gap: 4 };
const fieldLabelStyle = { fontSize: 12, color: '#5f6b7a' };

const selectStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 12,
  color: '#10233f',
  background: '#ffffff',
};

const rangeInputStyle = { ...selectStyle, width: '50%', minWidth: 0 };

const clearButtonStyle = {
  border: 'none',
  background: 'none',
  color: '#0b4f3a',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  padding: 0,
};
