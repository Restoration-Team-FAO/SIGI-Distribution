import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoFeature, GeoFeatureCollection } from '@sigi/domain';
import { DetailList, MessageBlock, StatPill } from './section-kit';
import { MapBasemapSelector, MapEmptyState, MapErrorState, MapFullscreenButton, MapResultsPanel, MapToolbar, MapWorkspace } from './map-system';
import { createBasemapLayer, ensureLeafletReady, MAP_BASEMAPS, type MapBasemapKey, useBasemapPreference, useMapViewportResize } from './map-runtime';

type OperationalLayerMapProps = {
  featureCollection: GeoFeatureCollection | null;
  title: string;
  subtitle: string;
  emptyMessage: string;
};

type FeatureGroup = {
  key: string;
  label: string;
  featureCount: number;
  totalAreaHa: number;
  sampleNames: string[];
};

type BasemapKey = MapBasemapKey;
const basemapOptions = MAP_BASEMAPS;

function getStringProperty(feature: GeoFeature, key: string): string | null {
  const value = feature.properties[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getFeatureId(feature: GeoFeature, index: number): string {
  if (typeof feature.id === 'string') {
    return feature.id;
  }

  const code = getStringProperty(feature, 'code');
  return code || `feature-${index}`;
}

function getFeatureName(feature: GeoFeature): string {
  return getStringProperty(feature, 'name') ?? 'Geometría sin nombre';
}

function getFeatureCode(feature: GeoFeature): string {
  return getStringProperty(feature, 'code') ?? 'Sin código';
}

function getFeatureProjectCode(feature: GeoFeature): string {
  return (
    getStringProperty(feature, 'projectCode') ??
    getStringProperty(feature, 'COD_PROY') ??
    'Sin proyecto'
  );
}

function getFeatureAreaHa(feature: GeoFeature): number {
  const value = feature.properties.areaHa;
  return typeof value === 'number' ? value : 0;
}

function formatArea(areaHa: number): string {
  return `${areaHa.toLocaleString('es-CR')} ha`;
}

function basemapButtonStyle(isActive: boolean) {
  return {
    border: isActive ? '1px solid #14532d' : '1px solid #d7dde5',
    borderRadius: 999,
    padding: '8px 12px',
    background: isActive ? '#e8f3ec' : '#ffffff',
    color: isActive ? '#14532d' : '#10233f',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  };
}

export function OperationalLayerMap(props: OperationalLayerMapProps) {
  const [basemap, setBasemap] = useBasemapPreference();
  const [leafletError, setLeafletError] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [executorFilter, setExecutorFilter] = useState<string>('all');
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  useMapViewportResize(mapRef);
  const baseLayerRef = useRef<any>(null);
  const contextLayerRef = useRef<any>(null);
  const highlightLayerRef = useRef<any>(null);

  const features = props.featureCollection?.features ?? [];
  const departments = useMemo(() => buildFilterOptions(features, 'DEPTO'), [features]);
  const executors = useMemo(() => buildFilterOptions(features, 'EJECUTORA'), [features]);
  const filteredFeatures = useMemo(
    () =>
      features.filter((feature) => {
        const matchesDepartment =
          departmentFilter === 'all' ||
          (getStringProperty(feature, 'DEPTO') ?? 'Sin departamento') === departmentFilter;
        const matchesExecutor =
          executorFilter === 'all' ||
          (getStringProperty(feature, 'EJECUTORA') ?? 'Sin ejecutora') === executorFilter;
        return matchesDepartment && matchesExecutor;
      }),
    [departmentFilter, executorFilter, features],
  );
  const groupedProjects = useMemo(() => buildGroups(filteredFeatures), [filteredFeatures]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedGroupKey((current) =>
      current && groupedProjects.some((group) => group.key === current)
        ? current
        : groupedProjects[0]?.key ?? null,
    );
  }, [groupedProjects]);

  const selectedGroupFeatures = useMemo(
    () => filteredFeatures.filter((feature) => getFeatureProjectCode(feature) === selectedGroupKey),
    [filteredFeatures, selectedGroupKey],
  );

  useEffect(() => {
    setSelectedFeatureId((current) => {
      const selectedIds = selectedGroupFeatures.map((feature, index) =>
        getFeatureId(feature, index),
      );
      return current && selectedIds.includes(current) ? current : selectedIds[0] ?? null;
    });
  }, [selectedGroupFeatures]);

  const selectedFeature =
    selectedGroupFeatures.find(
      (feature, index) => getFeatureId(feature, index) === selectedFeatureId,
    ) ?? null;

  const selectedGroup = groupedProjects.find((group) => group.key === selectedGroupKey) ?? null;
  const totalAreaHa = filteredFeatures.reduce((sum, feature) => sum + getFeatureAreaHa(feature), 0);
  const displayedGroups = groupedProjects.slice(0, 12);
  const selectedDepartment =
    selectedFeature
      ? getStringProperty(selectedFeature, 'DEPTO') ?? 'Sin dato'
      : departmentFilter === 'all'
        ? 'Todos'
        : departmentFilter;

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!mapContainerRef.current || filteredFeatures.length === 0) {
      return;
    }

    void ensureLeafletReady()
      .then((L) => {
        if (cancelled || !mapContainerRef.current) {
          return;
        }

        setLeafletError(null);

        if (!mapRef.current) {
          mapRef.current = L.map(mapContainerRef.current, {
            zoomControl: true,
            attributionControl: true,
          });
        }

        const map = mapRef.current;

        if (baseLayerRef.current) {
          map.removeLayer(baseLayerRef.current);
          baseLayerRef.current = null;
        }

        const selectedBasemap = basemapOptions.find((option) => option.key === basemap);
        if (selectedBasemap?.url) {
          baseLayerRef.current = createBasemapLayer(L, selectedBasemap.key).addTo(map);
        }

        if (contextLayerRef.current) {
          map.removeLayer(contextLayerRef.current);
        }
        if (highlightLayerRef.current) {
          map.removeLayer(highlightLayerRef.current);
        }

        contextLayerRef.current = L.geoJSON(
          {
            type: 'FeatureCollection',
            features: filteredFeatures as any,
          },
          {
          style: () => ({
            color: '#7eb7aa',
            weight: 0.8,
            fillColor: basemap === 'satellite' ? '#d7ebe7' : '#b6d7d2',
            fillOpacity: basemap === 'none' ? 0.18 : 0.3,
          }),
          onEachFeature: (feature: any, layer: any) => {
            const label = feature?.properties?.name ?? 'Geometría';
            layer.bindTooltip(String(label), {
              permanent: false,
              direction: 'top',
              sticky: true,
            });
            layer.on('click', () => {
              const clickedId = String(feature?.id ?? '');
              if (clickedId) {
                setSelectedFeatureId(clickedId);
              }
            });
          },
          },
        ).addTo(map);

        if (selectedGroupFeatures.length > 0) {
          highlightLayerRef.current = L.geoJSON(
            {
              type: 'FeatureCollection',
              features: selectedGroupFeatures as any,
            },
            {
              style: (feature: any) => ({
                color:
                  String(feature?.id ?? '') === selectedFeatureId ? '#0b3b22' : '#2d6d55',
                weight: String(feature?.id ?? '') === selectedFeatureId ? 2.4 : 1.4,
                fillColor:
                  String(feature?.id ?? '') === selectedFeatureId ? '#14532d' : '#4f9d7f',
                fillOpacity: String(feature?.id ?? '') === selectedFeatureId ? 0.78 : 0.58,
              }),
              onEachFeature: (feature: any, layer: any) => {
                const label = feature?.properties?.name ?? 'Geometría';
                layer.bindTooltip(String(label), {
                  permanent: false,
                  direction: 'top',
                  sticky: true,
                });
                layer.on('click', () => {
                  const clickedId = String(feature?.id ?? '');
                  if (clickedId) {
                    setSelectedFeatureId(clickedId);
                  }
                });
              },
            },
          ).addTo(map);
          highlightLayerRef.current.bringToFront();
        }

        const focusLayer =
          selectedGroupFeatures.length > 0 ? highlightLayerRef.current : contextLayerRef.current;
        const bounds = focusLayer?.getBounds?.();
        if (bounds?.isValid?.()) {
          map.fitBounds(bounds.pad(0.08), { animate: false });
        }

        window.setTimeout(() => map.invalidateSize(), 0);
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setLeafletError(reason.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [basemap, filteredFeatures, selectedFeatureId, selectedGroupFeatures]);

  return (
    <section className="map-context">
      <header className="map-context__header"><div><h3>{props.title}</h3><p>{props.subtitle}</p></div>
        <StatPill tone={features.length > 0 ? 'good' : 'neutral'}>
          {features.length} geometrías
        </StatPill>
      </header>
      {features.length === 0 ? (
        <MapEmptyState>{props.emptyMessage}</MapEmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          <MapResultsPanel count={groupedProjects.length}>
          <div className="map-results-list">
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={filterLabelStyle}>Departamento</span>
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                style={filterInputStyle}
              >
                <option value="all">Todos</option>
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={filterLabelStyle}>Ejecutora</span>
              <select
                value={executorFilter}
                onChange={(event) => setExecutorFilter(event.target.value)}
                style={filterInputStyle}
              >
                <option value="all">Todas</option>
                {executors.map((executor) => (
                  <option key={executor} value={executor}>
                    {executor}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={filterLabelStyle}>Proyecto operativo</span>
              <select
                value={selectedGroupKey ?? ''}
                onChange={(event) => setSelectedGroupKey(event.target.value || null)}
                style={filterInputStyle}
              >
                <option value="">Selecciona</option>
                {groupedProjects.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.key}
                  </option>
                ))}
              </select>
            </label>
          </div>
          </MapResultsPanel>

          {filteredFeatures.length === 0 ? (
            <MessageBlock>
              No hay geometrías SSP para la combinación de filtros seleccionada.
            </MessageBlock>
          ) : null}

          {filteredFeatures.length > 0 ? (
            <>
          <MapWorkspace
            context="analysis"
            ariaLabel={props.title}
            className={`sigi-inline-map-layout${selectedGroup || selectedFeature || leafletError ? '' : ' map-workspace--no-selection'}`}
            style={{
              display: 'grid',
              gap: 18,
              gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 0.9fr)',
              alignItems: 'start',
            }}
          >
            <div
              className="sigi-inline-map-canvas"
              style={{
                borderRadius: 22,
                overflow: 'hidden',
                border: '1px solid #d7dde5',
                background:
                  'radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 40%), linear-gradient(180deg, #f8fbff 0%, #eef5fb 100%)',
                minHeight: '65vh',
                position: 'relative',
              }}
            >
              <div style={{ position: 'absolute', top: 18, left: 18, zIndex: 500, display: 'grid', gap: 8 }}>
                <div style={mapHeadlineStyle}>
                  <span style={mapHeadlineLabelStyle}>Capa operativa real importada</span>
                  <strong style={mapHeadlineValueStyle}>
                    {selectedGroup
                      ? `${selectedGroup.label} · ${selectedGroup.featureCount} parcelas`
                      : 'Vista agregada de geometrías SSP'}
                  </strong>
                </div>
                <MapToolbar>
                  <MapBasemapSelector value={basemap} onChange={setBasemap} />
                  <MapFullscreenButton />
                </MapToolbar>
              </div>

              <div ref={mapContainerRef} style={{ minHeight: '65vh', width: '100%' }} />

              <div style={mapFooterStyle}>
                {selectedFeature
                  ? `La geometría seleccionada corresponde a ${getFeatureName(selectedFeature)} del proyecto ${getFeatureProjectCode(selectedFeature)}.`
                  : 'La vista resalta la capa operativa importada por shapefile sobre un mapa base seleccionable.'}
              </div>
            </div>

            {selectedGroup || selectedFeature || leafletError ? <aside className="sigi-inline-map-inspector" style={{ display: 'grid', gap: 14 }}>
              {leafletError ? <MapErrorState>{leafletError}</MapErrorState> : null}

              <div style={summaryCardStyle}>
                <strong style={{ fontSize: 20, color: '#10233f' }}>
                  {selectedGroup?.label ?? 'Capa SSP importada'}
                </strong>
                <div style={{ color: '#475569', fontSize: 14 }}>
                  {selectedGroup
                    ? `Proyecto operativo: ${selectedGroup.key}`
                    : `${groupedProjects.length} proyectos operativos detectados en la capa`}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <StatPill tone="good">
                    {selectedGroup ? formatArea(selectedGroup.totalAreaHa) : formatArea(totalAreaHa)}
                  </StatPill>
                  <StatPill tone="neutral">
                    {selectedGroup
                      ? `${selectedGroup.featureCount} geometrías`
                      : `${groupedProjects.length} proyectos`}
                  </StatPill>
                </div>
              </div>

              <DetailList
                items={[
                  {
                    label: 'Mapa base',
                    value:
                      basemapOptions.find((option) => option.key === basemap)?.label ?? 'Claro',
                  },
                  { label: 'Capa GIS', value: 'odoo_project_territories' },
                  {
                    label: 'Proyecto operativo',
                    value: selectedGroup?.key ?? 'Sin selección',
                  },
                  {
                    label: 'Parcelas visibles',
                    value: String(selectedGroup?.featureCount ?? features.length),
                  },
                  {
                    label: 'Cobertura estimada',
                    value: selectedGroup
                      ? formatArea(selectedGroup.totalAreaHa)
                      : formatArea(totalAreaHa),
                  },
                  {
                    label: 'Departamento',
                    value: selectedDepartment,
                  },
                ]}
              />

              {selectedFeature ? (
                <article style={featureDetailStyle}>
                  <strong style={{ color: '#10233f' }}>{getFeatureName(selectedFeature)}</strong>
                  <span style={metaStyle}>
                    Código territorial: {getFeatureCode(selectedFeature)}
                  </span>
                  <span style={metaStyle}>
                    Proyecto fuente: {getFeatureProjectCode(selectedFeature)}
                  </span>
                  <span style={metaStyle}>
                    Departamento: {getStringProperty(selectedFeature, 'DEPTO') ?? 'Sin dato'}
                  </span>
                  <span style={metaStyle}>
                    Ejecutora: {getStringProperty(selectedFeature, 'EJECUTORA') ?? 'Sin dato'}
                  </span>
                  <span style={metaStyle}>
                    Área reportada: {formatArea(getFeatureAreaHa(selectedFeature))}
                  </span>
                </article>
              ) : (
                <MessageBlock>
                  Selecciona un proyecto operativo o una geometría para revisar su detalle.
                </MessageBlock>
              )}
            </aside> : null}
          </MapWorkspace>

          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            }}
          >
            {displayedGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setSelectedGroupKey(group.key)}
                style={{
                  textAlign: 'left',
                  borderRadius: 16,
                  border:
                    group.key === selectedGroupKey
                      ? '1px solid #14532d'
                      : '1px solid #d7dde5',
                  background: group.key === selectedGroupKey ? '#e8f3ec' : '#ffffff',
                  padding: 14,
                  display: 'grid',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <strong style={{ color: '#10233f' }}>{group.key}</strong>
                <span style={metaStyle}>
                  {group.featureCount} geometrías · {formatArea(group.totalAreaHa)}
                </span>
                <span style={metaStyle}>
                  {group.sampleNames.slice(0, 2).join(' · ') || 'Sin muestra visible'}
                </span>
              </button>
            ))}
          </div>

          {groupedProjects.length > displayedGroups.length ? (
            <MessageBlock>
              Mostrando los primeros {displayedGroups.length} proyectos operativos de la capa SSP.
              La capa completa contiene {groupedProjects.length} grupos de proyecto.
            </MessageBlock>
          ) : null}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function buildGroups(features: GeoFeature[]): FeatureGroup[] {
  const groups = new Map<string, FeatureGroup>();

  for (const feature of features) {
    const key = getFeatureProjectCode(feature);
    const current = groups.get(key) ?? {
      key,
      label: getStringProperty(feature, 'projectName') ?? key,
      featureCount: 0,
      totalAreaHa: 0,
      sampleNames: [],
    };

    current.featureCount += 1;
    current.totalAreaHa += getFeatureAreaHa(feature);
    if (current.sampleNames.length < 3) {
      current.sampleNames.push(getFeatureName(feature));
    }

    groups.set(key, current);
  }

  return [...groups.values()].sort((left, right) => right.featureCount - left.featureCount);
}

const summaryCardStyle = {
  borderRadius: 18,
  padding: 18,
  background:
    'linear-gradient(180deg, rgba(20, 83, 45, 0.08) 0%, rgba(255,255,255,0.96) 100%)',
  display: 'grid',
  gap: 8,
};

const featureDetailStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 16,
  padding: 14,
  display: 'grid',
  gap: 6,
  background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(245,247,251,1) 100%)',
};

const metaStyle = {
  color: '#5f6b7a',
  fontSize: 13,
};

const mapHeadlineStyle = {
  borderRadius: 16,
  padding: '12px 14px',
  background: 'rgba(16,35,63,0.82)',
  color: '#f8fbff',
  backdropFilter: 'blur(8px)',
  display: 'grid',
  gap: 4,
  maxWidth: 320,
};

const mapHeadlineLabelStyle = {
  fontSize: 11,
  letterSpacing: 0.8,
  textTransform: 'uppercase' as const,
  color: 'rgba(248, 251, 255, 0.72)',
};

const mapHeadlineValueStyle = {
  fontSize: 15,
  lineHeight: 1.35,
};

const mapFooterStyle = {
  position: 'absolute' as const,
  left: 18,
  right: 18,
  bottom: 18,
  borderRadius: 16,
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.88)',
  backdropFilter: 'blur(8px)',
  color: '#334155',
  fontSize: 13,
  lineHeight: 1.5,
  zIndex: 500,
};

const filterLabelStyle = {
  color: '#10233f',
  fontSize: 13,
  fontWeight: 600,
};

const filterInputStyle = {
  width: '100%',
  borderRadius: 14,
  border: '1px solid #d7dde5',
  background: '#ffffff',
  color: '#10233f',
  padding: '12px 14px',
  fontSize: 14,
  boxSizing: 'border-box' as const,
};

function buildFilterOptions(features: GeoFeature[], key: string) {
  return [...new Set(features.map((feature) => getStringProperty(feature, key) ?? (key === 'DEPTO' ? 'Sin departamento' : 'Sin ejecutora')))].sort(
    (left, right) => left.localeCompare(right, 'es'),
  );
}
