import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoFeature, GeoFeatureCollection, Project, ProjectDetail } from '@sigi/domain';
import { DetailList, MessageBlock, StatPill } from './section-kit';
import { MapBasemapSelector, MapEmptyState, MapErrorState, MapFullscreenButton, MapResultsPanel, MapToolbar, MapWorkspace } from './map-system';
import { createBasemapLayer, ensureLeafletReady, MAP_BASEMAPS, type MapBasemapKey, useBasemapPreference, useMapViewportResize } from './map-runtime';

type ProjectCoverageMapProps = {
  featureCollection: GeoFeatureCollection | null;
  projects: Project[];
  detail: ProjectDetail | null;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  title: string;
  subtitle: string;
  emptyMessage: string;
  geoserverOverlay?: {
    label: string;
    wmsUrl: string;
    layerName: string;
    enabled?: boolean;
    opacity?: number;
  } | null;
};

type BasemapKey = MapBasemapKey;
const basemapOptions = MAP_BASEMAPS;

function getFeatureCode(feature: GeoFeature): string {
  const rawCode = feature.properties.code;
  return typeof rawCode === 'string' ? rawCode : '';
}

function getFeatureName(feature: GeoFeature): string {
  const rawName = feature.properties.name;
  return typeof rawName === 'string' ? rawName : 'Lugar sin nombre';
}

function getFeatureAreaHa(feature: GeoFeature): number | null {
  const rawArea = feature.properties.areaHa;
  return typeof rawArea === 'number' ? rawArea : null;
}

function formatArea(areaHa: number | null | undefined): string {
  if (typeof areaHa !== 'number') {
    return 'Sin area declarada';
  }

  return `${areaHa.toLocaleString('es-CR')} ha`;
}

function projectStatusLabel(status: string) {
  return (
    {
      draft: 'Borrador',
      active: 'Activo',
      completed: 'Completado',
      published: 'Publicado',
    }[status] ?? status
  );
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

export function ProjectCoverageMap(props: ProjectCoverageMapProps) {
  const [basemap, setBasemap] = useBasemapPreference();
  const [leafletError, setLeafletError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  useMapViewportResize(mapRef);
  const baseLayerRef = useRef<any>(null);
  const geoserverLayerRef = useRef<any>(null);
  const contextLayerRef = useRef<any>(null);
  const highlightLayerRef = useRef<any>(null);
  const [showGeoserverOverlay, setShowGeoserverOverlay] = useState<boolean>(
    Boolean(props.geoserverOverlay?.enabled),
  );

  const features = props.featureCollection?.features ?? [];
  const selectedTerritoryCodes = useMemo(
    () =>
      new Set(
        props.detail?.territories
          .map((territory) => territory.territoryCode?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value)) ?? [],
      ),
    [props.detail],
  );
  const selectedProject =
    props.projects.find((project) => project.id === props.selectedProjectId) ?? null;
  const selectedFeatures = useMemo(
    () =>
      features.filter((feature) =>
        selectedTerritoryCodes.has(getFeatureCode(feature).trim().toLowerCase()),
      ),
    [features, selectedTerritoryCodes],
  );
  const highlightedArea = selectedFeatures.reduce(
    (sum, feature) => sum + (getFeatureAreaHa(feature) ?? 0),
    0,
  );
  const totalCoverageArea = props.projects.reduce(
    (sum, project) => sum + (project.areaHa ?? 0),
    0,
  );

  useEffect(() => {
    setShowGeoserverOverlay(Boolean(props.geoserverOverlay?.enabled));
  }, [props.geoserverOverlay?.enabled, props.geoserverOverlay?.layerName, props.geoserverOverlay?.wmsUrl]);

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

    if (!mapContainerRef.current || features.length === 0) {
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
        if (geoserverLayerRef.current) {
          map.removeLayer(geoserverLayerRef.current);
          geoserverLayerRef.current = null;
        }

        const selectedBasemap = basemapOptions.find((option) => option.key === basemap);
        if (selectedBasemap?.url) {
          baseLayerRef.current = createBasemapLayer(L, selectedBasemap.key).addTo(map);
        }

        if (
          showGeoserverOverlay &&
          props.geoserverOverlay?.wmsUrl &&
          props.geoserverOverlay?.layerName
        ) {
          geoserverLayerRef.current = L.tileLayer.wms(props.geoserverOverlay.wmsUrl, {
            layers: props.geoserverOverlay.layerName,
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            opacity: props.geoserverOverlay.opacity ?? 0.72,
          }).addTo(map);
        }

        if (contextLayerRef.current) {
          map.removeLayer(contextLayerRef.current);
        }
        if (highlightLayerRef.current) {
          map.removeLayer(highlightLayerRef.current);
        }

        contextLayerRef.current = L.geoJSON(props.featureCollection as any, {
          style: () => ({
            color: '#7088a3',
            weight: showGeoserverOverlay ? 0 : 1.3,
            opacity: showGeoserverOverlay ? 0 : 1,
            fillColor: basemap === 'satellite' ? '#d9e5f1' : '#cad8e6',
            fillOpacity: showGeoserverOverlay ? 0 : basemap === 'none' ? 0.28 : 0.48,
          }),
          onEachFeature: (feature: any, layer: any) => {
            const label = feature?.properties?.name ?? 'Lugar';
            layer.bindTooltip(String(label), {
              permanent: false,
              direction: 'center',
              sticky: true,
            });
          },
        }).addTo(map);

        if (selectedFeatures.length > 0) {
          highlightLayerRef.current = L.geoJSON(
            {
              type: 'FeatureCollection',
              features: selectedFeatures as any,
            },
            {
              style: () => ({
                color: '#0b3b22',
                weight: 3,
                fillColor: '#14532d',
                fillOpacity: 0.72,
              }),
              onEachFeature: (feature: any, layer: any) => {
                const label = feature?.properties?.name ?? 'Lugar';
                layer.bindTooltip(String(label), {
                  permanent: false,
                  direction: 'top',
                  sticky: true,
                });
              },
            },
          ).addTo(map);
          highlightLayerRef.current.bringToFront();
        }

        const focusLayer =
          selectedFeatures.length > 0 ? highlightLayerRef.current : contextLayerRef.current;
        const bounds = focusLayer?.getBounds?.();
        if (bounds?.isValid?.()) {
          map.fitBounds(bounds.pad(0.12), { animate: false });
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
  }, [basemap, features, props.featureCollection, props.geoserverOverlay, selectedFeatures, showGeoserverOverlay]);

  return (
    <section className="map-context">
      <header className="map-context__header"><div><h3>{props.title}</h3><p>{props.subtitle}</p></div>
        <StatPill tone={selectedProject ? 'good' : 'neutral'}>
          {selectedProject ? 'Proyecto priorizado' : 'Vista agregada'}
        </StatPill>
      </header>
      {features.length === 0 ? (
        <MapEmptyState>{props.emptyMessage}</MapEmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          <MapWorkspace
            context="project"
            ariaLabel={props.title}
            className={`sigi-inline-map-layout${selectedProject || leafletError ? '' : ' map-workspace--no-selection'}`}
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
                  'radial-gradient(circle at top left, rgba(20, 83, 45, 0.12), transparent 40%), linear-gradient(180deg, #f8fbff 0%, #eef5fb 100%)',
                minHeight: '65vh',
                position: 'relative',
              }}
            >
              <div style={{ position: 'absolute', top: 18, left: 18, zIndex: 500, display: 'grid', gap: 8 }}>
                <div style={mapHeadlineStyle}>
                  <span style={mapHeadlineLabelStyle}>Cobertura del mapa</span>
                  <strong style={mapHeadlineValueStyle}>
                    {selectedProject
                      ? 'Cobertura del proyecto seleccionado'
                      : 'Cobertura consolidada del portafolio filtrado'}
                  </strong>
                </div>
                <MapToolbar>
                  <MapBasemapSelector value={basemap} onChange={setBasemap} />
                  {props.geoserverOverlay ? (
                    <button
                      type="button"
                      onClick={() => setShowGeoserverOverlay((current) => !current)}
                      style={basemapButtonStyle(showGeoserverOverlay)}
                    >
                      {showGeoserverOverlay ? 'GeoServer ON' : 'GeoServer OFF'}
                    </button>
                  ) : null}
                  <MapFullscreenButton />
                </MapToolbar>
              </div>

              <div ref={mapContainerRef} style={{ minHeight: '65vh', width: '100%' }} />

              <div style={mapFooterStyle}>
                {selectedProject
                  ? `El mapa resalta la cobertura declarada por ${selectedProject.title}.`
                  : 'La vista agrega la cobertura del portafolio filtrado sobre un mapa base seleccionable.'}
              </div>
            </div>

            {selectedProject || leafletError ? <aside className="sigi-inline-map-inspector" style={{ display: 'grid', gap: 14 }}>
              {leafletError ? <MapErrorState>{leafletError}</MapErrorState> : null}

              <div
                style={{
                  borderRadius: 18,
                  padding: 18,
                  background:
                    'linear-gradient(180deg, rgba(20, 83, 45, 0.08) 0%, rgba(255,255,255,0.96) 100%)',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <strong style={{ fontSize: 20, color: '#10233f' }}>
                  {selectedProject?.title ?? 'Cartera filtrada del módulo'}
                </strong>
                <div style={{ color: '#475569', fontSize: 14 }}>
                  {selectedProject
                    ? `Institución líder: ${selectedProject.institutionName ?? 'No visible'}`
                    : `Proyectos visibles en el dashboard: ${props.projects.length}`}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <StatPill tone="good">
                    {selectedProject ? formatArea(selectedProject.areaHa) : formatArea(totalCoverageArea)}
                  </StatPill>
                  <StatPill tone="neutral">
                    {selectedProject
                      ? `${props.detail?.territories.length ?? 0} territorios`
                      : `${features.length} territorios`}
                  </StatPill>
                </div>
              </div>

              <DetailList
                items={[
                  {
                    label: 'Mapa base',
                    value: basemapOptions.find((option) => option.key === basemap)?.label ?? 'Claro',
                  },
                  {
                    label: 'Render cartográfico',
                    value:
                      props.geoserverOverlay && showGeoserverOverlay
                        ? props.geoserverOverlay.label
                        : 'GeoJSON SIGI',
                  },
                  {
                    label: 'Portafolio',
                    value:
                      props.detail?.portfolio?.name ??
                      selectedProject?.portfolioName ??
                      'Vista agregada',
                  },
                  {
                    label: 'Cobertura resaltada',
                    value: formatArea(selectedProject ? highlightedArea : totalCoverageArea),
                  },
                  {
                    label: 'Estado',
                    value:
                      selectedProject?.status
                        ? projectStatusLabel(selectedProject.status)
                        : 'Filtro actual',
                  },
                  {
                    label: 'Avance',
                    value: selectedProject ? `${selectedProject.progressPct ?? 0}%` : 'Mixto',
                  },
                ]}
              />

              <div style={{ display: 'grid', gap: 10 }}>
                {(props.detail?.territories ?? []).length > 0 ? (
                  (props.detail?.territories ?? []).map((territory) => (
                    <article key={territory.id} style={territoryCardStyle}>
                      <strong>{territory.territoryName ?? territory.territoryCode}</strong>
                      <span style={metaStyle}>
                        {territory.level ?? 'custom'} · {territory.country}
                      </span>
                      <span style={metaStyle}>{formatArea(territory.areaHa)}</span>
                    </article>
                  ))
                ) : (
                  <MessageBlock>
                    Selecciona un proyecto para revisar su ubicación y cobertura.
                  </MessageBlock>
                )}
              </div>
            </aside> : null}
          </MapWorkspace>

          <MapResultsPanel count={props.projects.length}>
          <div className="map-results-list">
            {props.projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => props.onSelectProject(project.id)}
                style={{
                  textAlign: 'left',
                  borderRadius: 16,
                  border:
                    project.id === props.selectedProjectId
                      ? '1px solid #14532d'
                      : '1px solid #d7dde5',
                  background: project.id === props.selectedProjectId ? '#e8f3ec' : '#ffffff',
                  padding: 14,
                  display: 'grid',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <strong style={{ color: '#10233f' }}>{project.title}</strong>
                <span style={metaStyle}>
                  {project.institutionName ?? 'Sin institución'} · {projectStatusLabel(project.status)}
                </span>
                <span style={metaStyle}>
                  {formatArea(project.areaHa)} · {project.progressPct ?? 0}% de avance
                </span>
              </button>
            ))}
          </div>
          </MapResultsPanel>
        </div>
      )}
    </section>
  );
}

const territoryCardStyle = {
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
