import type { GeoFeature, GeoLayer, GeoLayerMetadata, GeoNearbyTerritoryResult } from '@sigi/domain';
import { MessageBlock } from './section-kit';
import {
  formatGeoArea as formatArea,
  formatGeoDate as formatDate,
  formatGeoDistance as formatDistance,
  GEO_NEARBY_RADIUS_OPTIONS as NEARBY_RADIUS_OPTIONS,
  GEO_NOT_AVAILABLE as NOT_AVAILABLE,
  getGeoFeatureProjectContext,
  geoTextOrFallback as textOrFallback,
} from '../features/territory/feature-identification';

/**
 * Authenticated feature identification panel
 * (P0-5 parity — see docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.3). Same fields,
 * same "No disponible" contract for absent metadata, same real-relationship
 * rule for contextual actions (only "Ver proyecto", only when the feature
 * actually carries a projectId) — restyled for admin's palette.
 */

type FeatureIdentificationPanelProps = {
  layerName: string;
  feature: GeoFeature;
  metadata: GeoLayerMetadata | null;
  metadataLoading: boolean;
  metadataError: string | null;
  layer: GeoLayer | null;
  institutionName: string | null;
  onClose: () => void;
  onViewProject: (projectId: string) => void;
  onViewProjectIndicators: (projectId: string) => void;
  onViewProjectDocuments: (projectId: string) => void;
  /** P1-6 — proximity search (spec §10): every feature of a chosen layer within a radius of this one. */
  nearbyLayerOptions: GeoLayer[];
  nearbyLayerCode: string | null;
  onNearbyLayerChange: (code: string) => void;
  nearbyRadiusMeters: number;
  onNearbyRadiusChange: (radiusMeters: number) => void;
  onSearchNearby: () => void;
  nearbyLoading: boolean;
  nearbyError: string | null;
  nearbyResults: GeoNearbyTerritoryResult[] | null;
  onSelectNearbyResult: (result: GeoNearbyTerritoryResult) => void;
};

export function FeatureIdentificationPanel(props: FeatureIdentificationPanelProps) {
  const { feature } = props;
  const properties = feature.properties ?? {};
  const { projectId, projectTitle } = getGeoFeatureProjectContext(properties);

  const otherAttributes = Object.entries(properties).filter(
    ([key]) => !['code', 'name', 'level', 'areaHa', 'updatedAt', 'projectId', 'projectCode', 'projectTitle', '__fillColor'].includes(key),
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <strong style={{ fontSize: 16, color: '#10233f' }}>
            {textOrFallback(String(properties.name ?? ''))}
          </strong>
          <div style={{ color: '#5f6b7a', fontSize: 12 }}>{props.layerName}</div>
        </div>
        <button type="button" onClick={props.onClose} style={closeButtonStyle}>
          Cerrar
        </button>
      </div>

      {projectId ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" onClick={() => props.onViewProject(projectId)} style={actionButtonStyle}>
            Ver proyecto{projectTitle ? `: ${projectTitle}` : ''}
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => props.onViewProjectIndicators(projectId)} style={relationButtonStyle}>
              Indicadores
            </button>
            <button type="button" onClick={() => props.onViewProjectDocuments(projectId)} style={relationButtonStyle}>
              Documentos
            </button>
          </div>
        </div>
      ) : null}

      <section style={{ display: 'grid', gap: 6 }}>
        <span style={sectionLabelStyle}>Ficha del elemento</span>
        <FieldRow label="Nombre" value={textOrFallback(String(properties.name ?? ''))} />
        <FieldRow label="Código" value={textOrFallback(String(properties.code ?? ''))} />
        <FieldRow label="Nivel / tipo" value={textOrFallback(String(properties.level ?? ''))} />
        <FieldRow label="Área" value={formatArea(properties.areaHa)} />
        <FieldRow label="Actualización" value={formatDate(properties.updatedAt as string | undefined)} />
      </section>

      <section style={{ display: 'grid', gap: 6 }}>
        <span style={sectionLabelStyle}>Fuente y metadatos de la capa</span>
        {props.metadataLoading ? <span style={mutedStyle}>Cargando metadatos…</span> : null}
        {props.metadataError ? <MessageBlock tone="danger">{props.metadataError}</MessageBlock> : null}
        {!props.metadataLoading && !props.metadataError ? (
          <>
            <FieldRow label="Institución" value={props.institutionName ?? NOT_AVAILABLE} />
            <FieldRow label="Fuente" value={textOrFallback(props.metadata?.sourceName ?? null)} />
            <FieldRow label="Propietario" value={textOrFallback(props.metadata?.owner ?? null)} />
            <FieldRow label="Responsable" value={textOrFallback(props.metadata?.responsible ?? null)} />
            <FieldRow label="Fecha del dato" value={textOrFallback(props.metadata?.dataDate ?? null)} />
            <FieldRow
              label="Frecuencia de actualización"
              value={textOrFallback(props.metadata?.updateFrequency ?? null)}
            />
            <FieldRow label="Licencia" value={textOrFallback(props.metadata?.license ?? null)} />
            <FieldRow label="Clasificación" value={textOrFallback(props.metadata?.classification ?? null)} />
            <FieldRow label="Nivel de acceso" value={textOrFallback(props.metadata?.accessLevel ?? null)} />
            <FieldRow label="Servicio de origen" value={textOrFallback(props.metadata?.serviceUrl ?? null)} />
            <FieldRow label="Calidad" value={textOrFallback(props.metadata?.qualityStatus ?? null)} />
            <FieldRow label="Tipo de geometría" value={textOrFallback(props.layer?.geometryType ?? null)} />
            <FieldRow label="CRS" value={textOrFallback(props.layer?.crs ?? null)} />
          </>
        ) : null}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <span style={sectionLabelStyle}>Elementos cercanos</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={props.nearbyLayerCode ?? ''}
            onChange={(event) => props.onNearbyLayerChange(event.target.value)}
            style={nearbySelectStyle}
            aria-label="Capa donde buscar elementos cercanos"
          >
            {props.nearbyLayerOptions.map((layer) => (
              <option key={layer.code} value={layer.code}>
                {layer.name}
              </option>
            ))}
          </select>
          <select
            value={props.nearbyRadiusMeters}
            onChange={(event) => props.onNearbyRadiusChange(Number(event.target.value))}
            style={nearbySelectStyle}
            aria-label="Radio de búsqueda"
          >
            {NEARBY_RADIUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={props.onSearchNearby} style={nearbyButtonStyle}>
            {props.nearbyLoading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {props.nearbyError ? <MessageBlock tone="danger">{props.nearbyError}</MessageBlock> : null}
        {!props.nearbyLoading && props.nearbyResults && props.nearbyResults.length === 0 ? (
          <span style={mutedStyle}>Sin elementos dentro del radio seleccionado.</span>
        ) : null}
        {props.nearbyResults && props.nearbyResults.length > 0 ? (
          <div style={{ display: 'grid', gap: 4 }}>
            {props.nearbyResults.map((result) => (
              <button
                key={`${result.layerCode}:${result.territoryCode}`}
                type="button"
                onClick={() => props.onSelectNearbyResult(result)}
                style={nearbyResultRowStyle}
              >
                <span style={{ color: '#10233f' }}>{result.territoryName}</span>
                <span style={{ color: '#5f6b7a' }}>{formatDistance(result.distanceMeters)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {otherAttributes.length > 0 ? (
        <details>
          <summary style={{ cursor: 'pointer', color: '#0b4f3a', fontSize: 13, fontWeight: 700 }}>
            Ver todos los atributos ({otherAttributes.length})
          </summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {otherAttributes.map(([key, value]) => (
              <FieldRow key={key} label={key} value={String(value ?? NOT_AVAILABLE)} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function FieldRow(props: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
      <span style={{ color: '#5f6b7a' }}>{props.label}</span>
      <span style={{ color: '#10233f', textAlign: 'right', wordBreak: 'break-word' }}>{props.value}</span>
    </div>
  );
}

const sectionLabelStyle = {
  fontSize: 12,
  color: '#5f6b7a',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
};

const mutedStyle = { color: '#5f6b7a', fontSize: 12 };

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

const nearbySelectStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 8,
  padding: '6px 8px',
  background: '#ffffff',
  color: '#10233f',
  fontSize: 12,
  fontWeight: 700,
  flex: '1 1 120px',
};

const nearbyButtonStyle = {
  border: '1px solid #0b4f3a',
  borderRadius: 999,
  padding: '6px 14px',
  background: '#0b4f3a',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const relationButtonStyle = {
  ...closeButtonStyle,
  color: '#0b4f3a',
};

const nearbyResultRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  border: '1px solid #d7dde5',
  borderRadius: 8,
  padding: '6px 10px',
  background: '#ffffff',
  fontSize: 12,
  cursor: 'pointer',
  textAlign: 'left' as const,
};

const actionButtonStyle = {
  border: '1px solid #0b4f3a',
  borderRadius: 12,
  padding: '10px 12px',
  background: '#e8f5ef',
  color: '#0b4f3a',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  textAlign: 'left' as const,
};
