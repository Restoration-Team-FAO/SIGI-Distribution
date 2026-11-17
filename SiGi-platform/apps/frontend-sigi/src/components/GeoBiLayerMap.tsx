import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoFeature, GeoFeatureCollection } from '@sigi/domain';
import { MessageBlock } from './section-kit';
import { MapBasemapSelector, MapEmptyState, MapErrorState, MapFullscreenButton, MapToolbar } from './map-system';
import { createBasemapLayer, ensureLeafletReady, MAP_BASEMAPS, type MapBasemapKey, useBasemapPreference, useMapViewportResize } from './map-runtime';

type GeoBiLayerMapProps = {
  featureCollection: GeoFeatureCollection | null;
  selectedFeatureCode: string | null;
  onSelectFeatureCode: (code: string) => void;
  title: string;
  subtitle: string;
  layerLabel: string;
  insight: string;
  emptyMessage: string;
  colorByLabel?: string | null;
  legendItems?: Array<{ label: string; color: string }>;
  primaryGeoserverLayer?: {
    label: string;
    wmsUrl: string;
    wfsUrl?: string;
    layerName: string;
    enabled?: boolean;
    opacity?: number;
  } | null;
  geoserverOverlays?: Array<{
    label: string;
    wmsUrl: string;
    wfsUrl?: string;
    layerName: string;
    enabled?: boolean;
    opacity?: number;
  }> | null;
  compactControls?: boolean;
};

type BasemapKey = MapBasemapKey;
const basemapOptions = MAP_BASEMAPS;

function getFeatureCode(feature: GeoFeature): string {
  const rawCode = feature.properties.code;
  if (typeof rawCode === 'string' && rawCode.trim().length > 0) {
    return rawCode;
  }

  if (typeof feature.id === 'string' && feature.id.trim().length > 0) {
    return feature.id;
  }

  return '';
}

function getFeatureName(feature: GeoFeature): string {
  const rawName = feature.properties.name;
  return typeof rawName === 'string' && rawName.trim().length > 0
    ? rawName
    : 'Elemento geoespacial';
}

function getFeatureAreaHa(feature: GeoFeature): number | null {
  const rawArea = feature.properties.areaHa;
  return typeof rawArea === 'number' ? rawArea : null;
}

function getFeatureLevel(feature: GeoFeature): string {
  const rawLevel = feature.properties.level;
  return typeof rawLevel === 'string' && rawLevel.trim().length > 0
    ? rawLevel
    : 'sin nivel';
}

function getPropertyCoordinate(feature: GeoFeature, key: 'longitude' | 'latitude') {
  const value = feature?.properties?.[key];
  return typeof value === 'number' ? value : Number(value);
}

function normalizeFeatureGeometry(feature: GeoFeature): GeoFeature {
  const longitude = getPropertyCoordinate(feature, 'longitude');
  const latitude = getPropertyCoordinate(feature, 'latitude');

  if (isValidLongitudeLatitude(longitude, latitude)) {
    return {
      ...feature,
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
    };
  }

  return feature;
}

function getFeatureColor(feature: GeoFeature, basemap: BasemapKey) {
  const customColor =
    typeof feature.properties.__fillColor === 'string' && feature.properties.__fillColor.trim().length > 0
      ? feature.properties.__fillColor
      : null;
  return {
    stroke: basemap === 'satellite' ? '#f8fafc' : customColor ?? '#334155',
    fill: customColor ?? (basemap === 'satellite' ? '#94a3b8' : '#64748b'),
  };
}

function getPolygonStyle(feature: GeoFeature, basemap: BasemapKey, zoom: number, isHighlighted: boolean) {
  const colors = getFeatureColor(feature, basemap);
  const normalizedZoom = Number.isFinite(zoom) ? zoom : 8;

  if (isHighlighted) {
    return {
      color: '#0b3b22',
      weight: normalizedZoom >= 11 ? 2.4 : 2,
      fillColor: '#14532d',
      fillOpacity: normalizedZoom <= 8 ? 0.52 : 0.72,
    };
  }

  if (normalizedZoom <= 8) {
    return {
      color: colors.stroke,
      weight: 0,
      opacity: 0,
      fillColor: colors.fill,
      fillOpacity: basemap === 'none' ? 0.2 : 0.34,
    };
  }

  if (normalizedZoom <= 11) {
    return {
      color: colors.stroke,
      weight: 0.8,
      fillColor: colors.fill,
      fillOpacity: basemap === 'none' ? 0.24 : 0.42,
    };
  }

  return {
    color: colors.stroke,
    weight: 1.2,
    fillColor: colors.fill,
    fillOpacity: basemap === 'none' ? 0.28 : 0.5,
  };
}

function isPointGeometry(feature: GeoFeature | null | undefined) {
  const geometryType = feature?.geometry?.type;
  return geometryType === 'Point' || geometryType === 'MultiPoint';
}

function isValidLongitudeLatitude(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return false;
  }

  if (Math.abs(longitude) < 0.000001 || Math.abs(latitude) < 0.000001) {
    return false;
  }

  return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function extractRepresentativeCoordinate(coordinates: unknown): [number, number] | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const [first, second] = coordinates;
  if (typeof first === 'number' && typeof second === 'number') {
    return [first, second];
  }

  for (const coordinate of coordinates) {
    const extracted = extractRepresentativeCoordinate(coordinate);
    if (extracted) {
      return extracted;
    }
  }

  return null;
}

function hasValidFeatureCoordinates(feature: GeoFeature) {
  const geometry = feature.geometry;
  if (!geometry) {
    return false;
  }

  const representativeCoordinate = extractRepresentativeCoordinate(geometry.coordinates);
  if (!representativeCoordinate) {
    return false;
  }

  const [longitude, latitude] = representativeCoordinate;
  return isValidLongitudeLatitude(Number(longitude), Number(latitude));
}

function getPointMarkerRadius(zoom: number, isHighlighted: boolean) {
  const normalizedZoom = Number.isFinite(zoom) ? zoom : 8;
  const baseRadius = Math.max(4, Math.min(18, 3 + normalizedZoom * 0.45));
  return isHighlighted ? baseRadius + 3 : baseRadius;
}

function applyPointLayerStyles(layerGroup: any, map: any, isHighlighted: boolean) {
  if (!layerGroup?.eachLayer || !map?.getZoom) {
    return;
  }

  const radius = getPointMarkerRadius(map.getZoom(), isHighlighted);
  layerGroup.eachLayer((layer: any) => {
    if (typeof layer.setRadius === 'function') {
      layer.setRadius(radius);
    }
  });
}

function applyFeatureLayerStyles(layerGroup: any, map: any, basemap: BasemapKey, isHighlighted: boolean) {
  if (!layerGroup?.eachLayer || !map?.getZoom) {
    return;
  }

  const zoom = map.getZoom();
  layerGroup.eachLayer((layer: any) => {
    const feature = layer?.feature as GeoFeature | undefined;
    if (!feature) {
      return;
    }

    if (typeof layer.setRadius === 'function') {
      layer.setRadius(getPointMarkerRadius(zoom, isHighlighted));
      return;
    }

    if (typeof layer.setStyle === 'function') {
      layer.setStyle(getPolygonStyle(feature, basemap, zoom, isHighlighted));
    }
  });
}

function getFitMaxZoom(hasSelection: boolean, featuresCount: number) {
  if (hasSelection) {
    return 13;
  }

  if (featuresCount > 100) {
    return 9;
  }

  if (featuresCount > 25) {
    return 10;
  }

  return 11;
}

function formatArea(areaHa: number | null) {
  if (areaHa === null) {
    return 'Área no declarada';
  }

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

function getOverlayColor(index: number) {
  const palette = ['#14532d', '#0f766e', '#0c4a6e', '#b45309', '#7c3aed', '#be123c'];
  return palette[index % palette.length];
}

export function GeoBiLayerMap(props: GeoBiLayerMapProps) {
  const [basemap, setBasemap] = useBasemapPreference();
  const [leafletError, setLeafletError] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(0);
  const [primaryGeoServerFeatureCount, setPrimaryGeoServerFeatureCount] = useState<number | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  useMapViewportResize(mapRef);
  const baseLayerRef = useRef<any>(null);
  const geoserverLayerRefs = useRef<any[]>([]);
  const contextLayerRef = useRef<any>(null);
  const highlightLayerRef = useRef<any>(null);
  const [activeGeoserverLayerNames, setActiveGeoserverLayerNames] = useState<string[]>(
    () =>
      (props.geoserverOverlays ?? [])
        .filter((overlay) => overlay.enabled !== false)
        .map((overlay) => overlay.layerName),
  );
  const activeGeoServerLayerNamesSet = useMemo(
    () => new Set(activeGeoserverLayerNames),
    [activeGeoserverLayerNames],
  );
  const visibleGeoserverOverlays = useMemo(
    () =>
      (props.geoserverOverlays ?? []).filter((overlay) =>
        activeGeoServerLayerNamesSet.has(overlay.layerName),
      ),
    [activeGeoServerLayerNamesSet, props.geoserverOverlays],
  );
  const hasVisibleGeoserverOverlays = visibleGeoserverOverlays.length > 0;
  const hasPrimaryGeoserverLayer = Boolean(
    props.primaryGeoserverLayer?.enabled !== false &&
      props.primaryGeoserverLayer?.wfsUrl &&
      props.primaryGeoserverLayer?.layerName,
  );
  const normalizedSelectedFeatureCode =
    typeof props.selectedFeatureCode === 'string' && props.selectedFeatureCode.trim().length > 0
      ? props.selectedFeatureCode.trim().toLowerCase()
      : null;
  const validFeatureCollection = useMemo<GeoFeatureCollection | null>(() => {
    if (!props.featureCollection) {
      return null;
    }

    return {
      ...props.featureCollection,
      features: props.featureCollection.features
        .map((feature) => normalizeFeatureGeometry(feature))
        .filter((feature) => hasValidFeatureCoordinates(feature)),
    };
  }, [props.featureCollection]);
  const features = validFeatureCollection?.features ?? [];
  const skippedPointCount = (props.featureCollection?.features.length ?? 0) - features.length;
  const selectedFeature = useMemo(
    () =>
      !normalizedSelectedFeatureCode
        ? null
        : features.find(
            (feature) => getFeatureCode(feature).trim().toLowerCase() === normalizedSelectedFeatureCode,
          ) ?? null,
    [features, normalizedSelectedFeatureCode],
  );

  useEffect(() => {
    setActiveGeoserverLayerNames(
      (props.geoserverOverlays ?? [])
        .filter((overlay) => overlay.enabled !== false)
        .map((overlay) => overlay.layerName),
    );
  }, [props.geoserverOverlays]);

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
    const overlayAbortControllers: AbortController[] = [];
    let primaryAbortController: AbortController | null = null;

    if (
      !mapContainerRef.current ||
      (features.length === 0 && !hasPrimaryGeoserverLayer && !hasVisibleGeoserverOverlays)
    ) {
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
          setMapZoom(mapRef.current.getZoom?.() ?? 0);
        }

        const map = mapRef.current;

        if (baseLayerRef.current) {
          map.removeLayer(baseLayerRef.current);
          baseLayerRef.current = null;
        }
        for (const layer of geoserverLayerRefs.current) {
          map.removeLayer(layer);
        }
        geoserverLayerRefs.current = [];

        const selectedBasemap = basemapOptions.find((option) => option.key === basemap);
        if (selectedBasemap?.url) {
          baseLayerRef.current = createBasemapLayer(L, selectedBasemap.key).addTo(map);
        }

        for (const [overlayIndex, overlay] of visibleGeoserverOverlays.entries()) {
          if (!overlay.layerName) {
            continue;
          }
          if (overlay.wfsUrl) {
            const controller = new AbortController();
            overlayAbortControllers.push(controller);
            const overlayUrl = new URL(overlay.wfsUrl);
            overlayUrl.searchParams.set('service', 'WFS');
            overlayUrl.searchParams.set('version', '1.0.0');
            overlayUrl.searchParams.set('request', 'GetFeature');
            overlayUrl.searchParams.set('typeName', overlay.layerName);
            overlayUrl.searchParams.set('outputFormat', 'application/json');
            overlayUrl.searchParams.set('srsName', 'EPSG:4326');
            overlayUrl.searchParams.set('maxFeatures', '5000');
            const overlayColor = getOverlayColor(overlayIndex);
            void window
              .fetch(overlayUrl.toString(), { signal: controller.signal })
              .then(async (response) => {
                if (!response.ok) {
                  throw new Error(`No se pudo cargar ${overlay.label} desde GeoServer.`);
                }
                return response.json();
              })
              .then((payload) => {
                if (cancelled || !mapRef.current) {
                  return;
                }
                const nextOverlayLayer = L.geoJSON(payload, {
                  style: () => ({
                    color: overlayColor,
                    weight: 1.6,
                    opacity: 0.95,
                    fillColor: overlayColor,
                    fillOpacity: Math.max(0.08, Math.min(0.55, overlay.opacity ?? 0.3)),
                  }),
                  pointToLayer: (_feature: any, latlng: any) =>
                    L.circleMarker(latlng, {
                      radius: 6,
                      color: overlayColor,
                      weight: 1.4,
                      fillColor: overlayColor,
                      fillOpacity: Math.max(0.25, Math.min(0.95, overlay.opacity ?? 0.7)),
                    }),
                  onEachFeature: (feature: any, layer: any) => {
                    const label =
                      feature?.properties?.name ??
                      feature?.properties?.title ??
                      feature?.properties?.code ??
                      overlay.label;
                    layer.bindTooltip(String(label), { sticky: true });
                  },
                }).addTo(map);
                geoserverLayerRefs.current.push(nextOverlayLayer);
                if (highlightLayerRef.current) {
                  highlightLayerRef.current.bringToFront();
                }
              })
              .catch((reason) => {
                if (reason?.name === 'AbortError' || cancelled) {
                  return;
                }
                setLeafletError(reason instanceof Error ? reason.message : 'No se pudo cargar una capa GeoServer.');
              });
            continue;
          }
          if (!overlay.wmsUrl) {
            continue;
          }
          const nextOverlayLayer = L.tileLayer.wms(overlay.wmsUrl, {
            layers: overlay.layerName,
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            srs: 'EPSG:3857',
            crs: L.CRS.EPSG3857,
            opacity: overlay.opacity ?? 0.7,
          }).addTo(map);
          geoserverLayerRefs.current.push(nextOverlayLayer);
        }

        if (contextLayerRef.current) {
          map.removeLayer(contextLayerRef.current);
        }
        if (highlightLayerRef.current) {
          map.removeLayer(highlightLayerRef.current);
        }

        if (props.primaryGeoserverLayer?.wfsUrl && props.primaryGeoserverLayer?.layerName) {
          setPrimaryGeoServerFeatureCount(null);
          primaryAbortController = new AbortController();
          const primaryUrl = new URL(props.primaryGeoserverLayer.wfsUrl);
          primaryUrl.searchParams.set('service', 'WFS');
          primaryUrl.searchParams.set('version', '1.0.0');
          primaryUrl.searchParams.set('request', 'GetFeature');
          primaryUrl.searchParams.set('typeName', props.primaryGeoserverLayer.layerName);
          primaryUrl.searchParams.set('outputFormat', 'application/json');
          primaryUrl.searchParams.set('srsName', 'EPSG:4326');
          primaryUrl.searchParams.set('maxFeatures', '5000');
          void window
            .fetch(primaryUrl.toString(), { signal: primaryAbortController.signal })
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(
                  `No se pudo cargar ${props.primaryGeoserverLayer?.label ?? 'la capa principal'} desde GeoServer.`,
                );
              }
              return response.json();
            })
            .then((payload) => {
              if (cancelled || !mapRef.current) {
                return;
              }
              setPrimaryGeoServerFeatureCount(
                Array.isArray(payload?.features) ? payload.features.length : 0,
              );
              contextLayerRef.current = L.geoJSON(payload, {
                style: () => ({
                  color: basemap === 'satellite' ? '#f8fafc' : '#0f172a',
                  weight: map.getZoom() >= 10 ? 2.2 : 1.6,
                  opacity: 0.95,
                  fillColor: basemap === 'satellite' ? '#dbe7f3' : '#cfdbe8',
                  fillOpacity: hasVisibleGeoserverOverlays
                    ? basemap === 'none'
                      ? 0.08
                      : 0.04
                    : basemap === 'none'
                      ? 0.2
                      : 0.28,
                }),
                pointToLayer: (_feature: any, latlng: any) =>
                  L.circleMarker(latlng, {
                    radius: getPointMarkerRadius(map.getZoom(), false),
                    color: basemap === 'satellite' ? '#f8fafc' : '#0f172a',
                    weight: 1.8,
                    fillColor: '#94a3b8',
                    fillOpacity: 0.85,
                  }),
                onEachFeature: (feature: any, layer: any) => {
                  const label =
                    feature?.properties?.name ??
                    feature?.properties?.title ??
                    feature?.properties?.code ??
                    props.primaryGeoserverLayer?.label ??
                    'Elemento';
                  layer.bindTooltip(String(label), { direction: 'center', sticky: true });
                },
              }).addTo(map);
              if (hasVisibleGeoserverOverlays && contextLayerRef.current?.bringToFront) {
                contextLayerRef.current.bringToFront();
              }
              if (highlightLayerRef.current?.bringToFront) {
                highlightLayerRef.current.bringToFront();
              }
            })
            .catch((reason) => {
              if (reason?.name === 'AbortError' || cancelled) {
                return;
              }
              setLeafletError(
                reason instanceof Error
                  ? reason.message
                  : 'No se pudo cargar la capa principal desde GeoServer.',
              );
              setPrimaryGeoServerFeatureCount(0);
            });
        } else {
          setPrimaryGeoServerFeatureCount(null);
          contextLayerRef.current = L.geoJSON(validFeatureCollection as any, {
            style: (feature: any) => {
              const nextStyle = getPolygonStyle(feature as GeoFeature, basemap, map.getZoom(), false);
              if (hasVisibleGeoserverOverlays) {
                return {
                  ...nextStyle,
                  color: basemap === 'satellite' ? '#f8fafc' : '#0f172a',
                  weight: map.getZoom() >= 10 ? 2.2 : 1.6,
                  opacity: 0.95,
                  fillOpacity: basemap === 'none' ? 0.08 : 0.04,
                };
              }
              return nextStyle;
            },
          pointToLayer: (feature: any, latlng: any) => {
            const colors = getFeatureColor(feature as GeoFeature, basemap);
            return L.circleMarker(latlng, {
              radius: getPointMarkerRadius(map.getZoom(), false),
              color: colors.stroke,
              weight: basemap === 'satellite' ? 2.2 : 1.8,
              fillColor: colors.fill,
              fillOpacity: basemap === 'satellite' ? 0.98 : 0.94,
            });
          },
            onEachFeature: (feature: any, layer: any) => {
              const label = feature?.properties?.name ?? 'Elemento';
              layer.bindTooltip(String(label), { direction: 'center', sticky: true });
            },
          }).addTo(map);
        }
        if (hasVisibleGeoserverOverlays && contextLayerRef.current?.bringToFront) {
          contextLayerRef.current.bringToFront();
        }

        if (selectedFeature) {
          highlightLayerRef.current = L.geoJSON(
            {
              type: 'FeatureCollection',
              features: [selectedFeature] as any,
            },
            {
              style: (feature: any) =>
                getPolygonStyle(feature as GeoFeature, basemap, map.getZoom(), true),
              pointToLayer: (_feature: any, latlng: any) =>
                L.circleMarker(latlng, {
                  radius: getPointMarkerRadius(map.getZoom(), true),
                  color: '#f8fafc',
                  weight: 2.6,
                  fillColor: '#14532d',
                  fillOpacity: 1,
                }),
            },
          ).addTo(map);
          highlightLayerRef.current.bringToFront();
        }

        const handleZoomEnd = () => {
          setMapZoom(map.getZoom());
          applyFeatureLayerStyles(contextLayerRef.current, map, basemap, false);
          applyFeatureLayerStyles(highlightLayerRef.current, map, basemap, true);
        };
        const handleMouseMove = (event: { latlng?: { lat: number; lng: number } }) => {
          if (!event?.latlng) {
            return;
          }
          setCursorPosition({
            lat: event.latlng.lat,
            lng: event.latlng.lng,
          });
        };
        map.off('zoomend', handleZoomEnd);
        map.off('mousemove', handleMouseMove);
        map.on('zoomend', handleZoomEnd);
        map.on('mousemove', handleMouseMove);
        handleZoomEnd();

        const focusLayer =
          selectedFeature && highlightLayerRef.current
            ? highlightLayerRef.current
            : contextLayerRef.current;
        const bounds = focusLayer?.getBounds?.();
        if (bounds?.isValid?.()) {
          map.fitBounds(bounds.pad(0.12), {
            animate: false,
            maxZoom: getFitMaxZoom(Boolean(selectedFeature), features.length),
          });
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
      primaryAbortController?.abort();
      for (const controller of overlayAbortControllers) {
        controller.abort();
      }
      if (mapRef.current) {
        mapRef.current.off('zoomend');
        mapRef.current.off('mousemove');
      }
    };
  }, [basemap, features, hasPrimaryGeoserverLayer, hasVisibleGeoserverOverlays, props.featureCollection, props.primaryGeoserverLayer, selectedFeature, visibleGeoserverOverlays]);

  function handleShowEntireLayer() {
    props.onSelectFeatureCode('');
    const map = mapRef.current;
    const contextLayer = contextLayerRef.current;
    const bounds = contextLayer?.getBounds?.();
    if (map && bounds?.isValid?.()) {
      map.fitBounds(bounds.pad(0.12), {
        animate: false,
        maxZoom: getFitMaxZoom(false, features.length),
      });
    }
  }

  function toggleGeoserverOverlay(layerName: string) {
    setActiveGeoserverLayerNames((current) =>
      current.includes(layerName)
        ? current.filter((item) => item !== layerName)
        : [...current, layerName],
    );
  }

  const basemapLabel =
    basemapOptions.find((option) => option.key === basemap)?.label ?? 'OpenStreetMap';
  const visibleOverlayLabel =
    visibleGeoserverOverlays.length > 0
      ? visibleGeoserverOverlays.map((overlay) => overlay.label).join(', ')
      : hasPrimaryGeoserverLayer
        ? props.primaryGeoserverLayer?.label ?? 'GeoServer'
        : 'GeoJSON SIGI';
  const visibleFeatureCount = hasPrimaryGeoserverLayer
    ? primaryGeoServerFeatureCount ?? 0
    : features.length;
  const selectedSummary = selectedFeature
    ? `${getFeatureName(selectedFeature)} · ${isPointGeometry(selectedFeature) ? 'Punto' : getFeatureLevel(selectedFeature)}`
    : `${visibleFeatureCount} entidades en la vista`;
  return (
    <section className="sigi-map-workspace" aria-label={props.title}>
      <header className="sigi-map-workspace__header">
        <div>
          <span>Visor cartográfico</span>
          <h2>{props.title}</h2>
          <p>{props.subtitle}</p>
        </div>
        <strong>{props.layerLabel}</strong>
      </header>
      {features.length === 0 && !hasPrimaryGeoserverLayer && !hasVisibleGeoserverOverlays ? (
        <MapEmptyState>{props.emptyMessage}</MapEmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="sigi-map-workspace__body" style={{ ...gisWorkbenchStyle, gridTemplateColumns: props.compactControls ? 'minmax(0, 1fr)' : gisWorkbenchStyle.gridTemplateColumns }}>
            {!props.compactControls ? <aside style={gisSidebarStyle}>
              <div style={gisPanelStyle}>
                <div style={gisPanelHeaderStyle}>
                  <span style={gisPanelEyebrowStyle}>Proyecto</span>
                  <strong style={gisPanelTitleStyle}>{props.layerLabel}</strong>
                </div>
                <div style={gisPanelSummaryStyle}>{selectedSummary}</div>
                <div style={gisToolbarGridStyle}>
                  <button
                    type="button"
                    onClick={handleShowEntireLayer}
                    style={gisToolButtonStyle}
                  >
                    Extensión completa
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onSelectFeatureCode('')}
                    style={gisToolButtonStyle}
                  >
                    Limpiar selección
                  </button>
                </div>
              </div>

              <div style={gisPanelStyle}>
                <div style={gisPanelHeaderStyle}>
                  <span style={gisPanelEyebrowStyle}>Mapa base</span>
                  <strong style={gisPanelTitleStyle}>{basemapLabel}</strong>
                </div>
                <div style={gisOptionListStyle}>
                  {basemapOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setBasemap(option.key)}
                      style={gisListToggleStyle(option.key === basemap)}
                    >
                      <span>{option.label}</span>
                      <span>{option.key === basemap ? 'Activo' : 'Disponible'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={gisPanelStyle}>
                <div style={gisPanelHeaderStyle}>
                  <span style={gisPanelEyebrowStyle}>Capas</span>
                  <strong style={gisPanelTitleStyle}>Gestor operativo</strong>
                </div>
                <div style={gisOptionListStyle}>
                  <div style={gisListToggleStyle(true)}>
                    <span>{props.layerLabel}</span>
                    <span>Principal</span>
                  </div>
                  {props.geoserverOverlays?.map((overlay) => {
                    const isActive = activeGeoServerLayerNamesSet.has(overlay.layerName);
                    return (
                      <button
                        key={overlay.layerName}
                        type="button"
                        onClick={() => toggleGeoserverOverlay(overlay.layerName)}
                        style={gisListToggleStyle(isActive)}
                      >
                        <span>{overlay.label}</span>
                        <span>{isActive ? 'Visible' : 'Oculta'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside> : null}

            <div style={gisMapFrameStyle}>
              <div style={gisMapHeaderStyle}>
                <div style={{ display: 'grid', gap: 2 }}>
                  <span style={gisPanelEyebrowStyle}>Visor GIS</span>
                  <strong style={{ color: '#f8fafc', fontSize: 18 }}>
                    {selectedFeature ? `Foco: ${getFeatureName(selectedFeature)}` : 'Vista cartográfica integrada'}
                  </strong>
                </div>
                <div style={gisChipWrapStyle}>
                  <span style={gisChipStyle}>EPSG:4326</span>
                  <span style={gisChipStyle}>Zoom {mapZoom}</span>
                  <span style={gisChipStyle}>{visibleOverlayLabel}</span>
                </div>
              </div>

              {props.compactControls ? (
                <MapToolbar ariaLabel="Herramientas del mapa">
                  <button type="button" onClick={handleShowEntireLayer}>Extensión</button>
                  <button type="button" onClick={() => props.onSelectFeatureCode('')}>Limpiar</button>
                  <MapBasemapSelector value={basemap} onChange={setBasemap} />
                  <MapFullscreenButton />
                </MapToolbar>
              ) : null}

              <div ref={mapContainerRef} className="sigi-map-native-canvas" />

              <aside style={gisInspectorStyle}>
                <div style={gisInspectorSectionStyle}>
                  <span style={gisPanelEyebrowStyle}>Leyenda</span>
                  {props.legendItems && props.legendItems.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {props.legendItems.map((item) => (
                        <div
                          key={`${item.label}-${item.color}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              background: item.color,
                              border: '1px solid rgba(148, 163, 184, 0.4)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={gisInspectorMetaStyle}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={gisInspectorMetaStyle}>Simbología única para la capa activa.</div>
                  )}
                </div>

                <div style={gisInspectorSectionStyle}>
                  <span style={gisPanelEyebrowStyle}>Selección</span>
                  <strong style={{ color: '#e2e8f0', fontSize: 15 }}>
                    {selectedFeature ? getFeatureName(selectedFeature) : 'Sin entidad activa'}
                  </strong>
                  <div style={gisInspectorMetaStyle}>
                    {selectedFeature
                      ? `${getFeatureCode(selectedFeature) || 'Sin código'} · ${formatArea(getFeatureAreaHa(selectedFeature))}`
                      : 'Usa la lista o haz zoom sobre el subconjunto visible.'}
                  </div>
                </div>

                <div style={gisInspectorSectionStyle}>
                  <span style={gisPanelEyebrowStyle}>Estado</span>
                  <div style={gisInspectorMetaStyle}>Features visibles: {visibleFeatureCount}</div>
                  <div style={gisInspectorMetaStyle}>Render: {visibleOverlayLabel}</div>
                  <div style={gisInspectorMetaStyle}>Color: {props.colorByLabel ?? 'Único'}</div>
                </div>
              </aside>

              <div style={gisStatusBarStyle}>
                <span>{props.insight}</span>
                <span>
                  {cursorPosition
                    ? `Lon ${formatCoordinate(cursorPosition.lng)} · Lat ${formatCoordinate(cursorPosition.lat)}`
                    : 'Mueve el cursor para ver coordenadas'}
                </span>
              </div>
            </div>
          </div>

          {leafletError ? <MapErrorState>{leafletError}</MapErrorState> : null}
          {!leafletError && skippedPointCount > 0 ? (
            <MessageBlock tone="danger">
              Se omitieron {skippedPointCount} punto(s) con coordenadas inválidas para mantener la
              escala cartográfica estable.
            </MessageBlock>
          ) : null}
        </div>
      )}
    </section>
  );
}

const metaStyle = {
  color: '#5f6b7a',
  fontSize: 13,
};

function formatCoordinate(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

const gisWorkbenchStyle = {
  display: 'grid',
  gap: 0,
  gridTemplateColumns: '280px minmax(0, 1fr)',
  borderRadius: 24,
  overflow: 'hidden',
  border: '1px solid #cbd5e1',
  background: '#0f172a',
};

const gisSidebarStyle = {
  display: 'grid',
  gap: 1,
  background: '#0b1220',
  borderRight: '1px solid rgba(148, 163, 184, 0.16)',
};

const gisPanelStyle = {
  display: 'grid',
  gap: 14,
  padding: 18,
  background: 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(17,24,39,0.98) 100%)',
};

const gisPanelHeaderStyle = {
  display: 'grid',
  gap: 4,
};

const gisPanelEyebrowStyle = {
  fontSize: 11,
  letterSpacing: 1,
  textTransform: 'uppercase' as const,
  color: '#94a3b8',
};

const gisPanelTitleStyle = {
  color: '#f8fafc',
  fontSize: 16,
  lineHeight: 1.3,
};

const gisPanelSummaryStyle = {
  color: '#cbd5e1',
  fontSize: 13,
  lineHeight: 1.5,
};

const gisToolbarGridStyle = {
  display: 'grid',
  gap: 8,
};

const gisToolButtonStyle = {
  border: '1px solid rgba(71, 85, 105, 0.8)',
  borderRadius: 12,
  padding: '10px 12px',
  background: '#162235',
  color: '#e2e8f0',
  fontSize: 13,
  fontWeight: 700,
  textAlign: 'left' as const,
  cursor: 'pointer',
};

const gisOptionListStyle = {
  display: 'grid',
  gap: 8,
};

function gisListToggleStyle(isActive: boolean) {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    border: isActive ? '1px solid #38bdf8' : '1px solid rgba(71, 85, 105, 0.8)',
    borderRadius: 12,
    padding: '10px 12px',
    background: isActive ? 'rgba(14, 165, 233, 0.14)' : '#101b2d',
    color: isActive ? '#e0f2fe' : '#cbd5e1',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left' as const,
  };
}

const gisMapFrameStyle = {
  position: 'relative' as const,
  minHeight: 700,
  background:
    'radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 28%), linear-gradient(180deg, #dbeafe 0%, #eff6ff 100%)',
};

const gisMapHeaderStyle = {
  position: 'absolute' as const,
  top: 18,
  left: 18,
  right: 18,
  zIndex: 500,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  padding: '14px 16px',
  borderRadius: 16,
  background: 'rgba(15, 23, 42, 0.86)',
  backdropFilter: 'blur(10px)',
};

const gisChipWrapStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap' as const,
  justifyContent: 'flex-end',
};

const gisChipStyle = {
  borderRadius: 999,
  padding: '6px 10px',
  background: 'rgba(30, 41, 59, 0.95)',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 700,
};

const gisInspectorStyle = {
  position: 'absolute' as const,
  top: 94,
  right: 18,
  zIndex: 500,
  width: 268,
  display: 'grid',
  gap: 10,
};

const gisInspectorSectionStyle = {
  display: 'grid',
  gap: 8,
  padding: 14,
  borderRadius: 14,
  background: 'rgba(15, 23, 42, 0.84)',
  backdropFilter: 'blur(10px)',
};

const gisInspectorMetaStyle = {
  color: '#cbd5e1',
  fontSize: 12,
  lineHeight: 1.5,
};

const gisStatusBarStyle = {
  position: 'absolute' as const,
  left: 18,
  right: 18,
  bottom: 18,
  zIndex: 500,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 14px',
  borderRadius: 14,
  background: 'rgba(2, 6, 23, 0.82)',
  color: '#cbd5e1',
  fontSize: 12,
  lineHeight: 1.5,
  backdropFilter: 'blur(10px)',
};

const headlineStyle = {
  borderRadius: 16,
  padding: '12px 14px',
  background: 'rgba(16,35,63,0.82)',
  color: '#f8fbff',
  backdropFilter: 'blur(8px)',
  display: 'grid',
  gap: 4,
};

const headlineLabelStyle = {
  fontSize: 11,
  letterSpacing: 0.8,
  textTransform: 'uppercase' as const,
  color: 'rgba(248, 251, 255, 0.72)',
};

const headlineValueStyle = {
  fontSize: 15,
  lineHeight: 1.35,
};

const basemapWrapStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap' as const,
  maxWidth: 360,
  borderRadius: 16,
  padding: 10,
  background: 'rgba(255,255,255,0.88)',
  backdropFilter: 'blur(8px)',
};

const footerStyle = {
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

const legendWrapStyle = {
  position: 'absolute' as const,
  top: 18,
  right: 18,
  zIndex: 500,
  maxWidth: 240,
  borderRadius: 16,
  padding: 12,
  background: 'rgba(255,255,255,0.9)',
  backdropFilter: 'blur(8px)',
  display: 'grid',
  gap: 8,
};
