import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { GeoFeature, GeoFeatureCollection } from '@sigi/domain';
import { MapBasemapSelector, MapErrorState, MapFullscreenButton, MapToolbar, MapWorkspace } from './map-system';
import { createBasemapLayer, ensureLeafletReady, type MapBasemapKey, useBasemapPreference, useMapViewportResize } from './map-runtime';

/**
 * Mapa multicapa autenticado del SIGI (Visor, Catálogo y Análisis).
 *
 * Mantiene un `Map<code, LeafletLayerGroup>` para activar varias capas a la vez. Desde v2.1.0 los
 * efectos están separados para que la navegación sea estable:
 *  - el mapa base se cambia sin reconstruir las capas ni reencuadrar;
 *  - una capa solo se reconstruye cuando cambian sus datos; color/opacidad se aplican con setStyle;
 *  - el encuadre automático ocurre una vez (o cuando cambia `fitKey`), nunca al hacer zoom/pan.
 */

export type MultiLayerMapEntry = {
  code: string;
  name: string;
  color: string;
  opacity: number;
  featureCollection: GeoFeatureCollection | null;
};

/** Capa WMS externa añadida por el usuario (solo visual, sin identificación). */
export type MultiLayerMapWmsEntry = {
  id: string;
  url: string;
  wmsLayerName: string;
  opacity: number;
};

export type MultiLayerMapView = { lat: number; lng: number; zoom: number };

export type MultiLayerMapHandle = {
  zoomToLayer: (code: string) => void;
  zoomToAll: () => void;
  /** Tabla de atributos / búsqueda → mapa (zoom + resaltado + dispara onFeatureClick). */
  selectFeature: (layerCode: string, featureCode: string) => void;
  /** Selecciona el primer elemento cuya propiedad `key` valga `value` (p. ej. projectId). */
  selectFeatureByProperty: (layerCode: string, key: string, value: string) => void;
  clearSelection: () => void;
};

type MultiLayerMapProps = {
  layers: MultiLayerMapEntry[];
  emptyMessage: string;
  onFeatureClick?: (event: { layerCode: string; feature: GeoFeature }) => void;
  onSelectionCleared?: () => void;
  wmsLayers?: MultiLayerMapWmsEntry[];
  /** Vista inicial (p. ej. desde la URL); si existe, no se hace encuadre automático inicial. */
  initialView?: MultiLayerMapView | null;
  onViewChange?: (view: MultiLayerMapView) => void;
  /** Elemento a resaltar y encuadrar en cuanto su capa esté dibujada (p. ej. ?projectId=…). */
  focusFeature?: { layerCode: string; property: string; value: string } | null;
  /** Cambiar este valor fuerza un nuevo encuadre a todas las capas activas. */
  fitKey?: string | number;
  /** Botones adicionales para la barra de herramientas del mapa. */
  toolbarExtra?: ReactNode;
  /** Contenido flotante sobre el mapa (ficha del elemento, leyenda…). */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
};

const SELECT_FEATURE_MAX_RETRIES = 20;
const SELECT_FEATURE_RETRY_DELAY_MS = 150;
const DEFAULT_CENTER: [number, number] = [9.9, -84.1];
const HIGHLIGHT_COLOR = '#f59e0b';

function fitToGroups(map: any, groups: Map<string, any>) {
  let combinedBounds: any = null;
  for (const group of groups.values()) {
    const bounds = group?.getBounds?.();
    if (bounds?.isValid?.()) {
      combinedBounds = combinedBounds ? combinedBounds.extend(bounds) : bounds;
    }
  }
  if (combinedBounds) {
    map.fitBounds(combinedBounds.pad(0.06), { animate: true, maxZoom: 12 });
  }
}

function featureCodeOf(feature: any) {
  const code = typeof feature?.properties?.code === 'string' ? feature.properties.code : feature?.id;
  return String(code ?? '');
}

function featureLabelOf(feature: any, fallback: string) {
  const props = feature?.properties ?? {};
  return String(props.projectTitle ?? props.name ?? props.title ?? props.territoryName ?? props.code ?? fallback);
}

function styleFor(entry: MultiLayerMapEntry, highlighted: boolean) {
  return highlighted
    ? { color: HIGHLIGHT_COLOR, weight: 3.5, opacity: 1, fillColor: entry.color, fillOpacity: Math.min(entry.opacity + 0.2, 0.9) }
    : { color: entry.color, weight: 1.4, opacity: 0.95, fillColor: entry.color, fillOpacity: entry.opacity };
}

function formatCoordinate(value: number) {
  return value.toFixed(5);
}

export const MultiLayerMap = forwardRef<MultiLayerMapHandle, MultiLayerMapProps>(function MultiLayerMap(props, ref) {
  const [basemap, setBasemap] = useBasemapPreference();
  const [leafletError, setLeafletError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  useMapViewportResize(mapRef);
  const baseLayerRef = useRef<any>(null);
  /** code → { group, data } para reconstruir solo cuando cambian los datos. */
  const layerGroupsRef = useRef<Map<string, { group: any; data: GeoFeatureCollection }>>(new Map());
  const wmsLayerGroupsRef = useRef<Map<string, any>>(new Map());
  const hasAutoFitRef = useRef(Boolean(props.initialView));
  const highlightRef = useRef<{ layer: any; layerCode: string } | null>(null);
  const appliedFocusRef = useRef<string | null>(null);
  const latestLayersRef = useRef(props.layers);
  const onFeatureClickRef = useRef(props.onFeatureClick);
  const onViewChangeRef = useRef(props.onViewChange);
  const onSelectionClearedRef = useRef(props.onSelectionCleared);
  latestLayersRef.current = props.layers;
  onFeatureClickRef.current = props.onFeatureClick;
  onViewChangeRef.current = props.onViewChange;
  onSelectionClearedRef.current = props.onSelectionCleared;

  const groupsMap = () => new Map([...layerGroupsRef.current.entries()].map(([code, value]) => [code, value.group]));

  function entryFor(layerCode: string) {
    return latestLayersRef.current.find((item) => item.code === layerCode) ?? null;
  }

  function resetHighlight() {
    const current = highlightRef.current;
    if (!current) return;
    const entry = entryFor(current.layerCode);
    if (entry && typeof current.layer.setStyle === 'function') current.layer.setStyle(styleFor(entry, false));
    if (typeof current.layer.setRadius === 'function') current.layer.setRadius(6);
    highlightRef.current = null;
    setHasSelection(false);
  }

  function highlight(layer: any, layerCode: string, focus: boolean) {
    const map = mapRef.current;
    const entry = entryFor(layerCode);
    if (!map || !entry) return;
    resetHighlight();
    if (typeof layer.setStyle === 'function') {
      layer.setStyle(styleFor(entry, true));
      layer.bringToFront?.();
    }
    if (typeof layer.setRadius === 'function') layer.setRadius(10);
    highlightRef.current = { layer, layerCode };
    setHasSelection(true);
    if (focus) {
      if (typeof layer.getBounds === 'function' && layer.getBounds().isValid()) {
        const fitFocused = (animate: boolean) => {
          if (!mapRef.current || highlightRef.current?.layer !== layer) return;
          // El contenedor puede no tener aún su tamaño final (carga inicial con ?projectId):
          // se recalcula antes de encuadrar y se repite cuando la maquetación se asienta.
          map.invalidateSize({ pan: false });
          const wide = map.getSize().x > 900; // margen derecho para la ficha flotante
          map.fitBounds(layer.getBounds(), {
            animate,
            maxZoom: 13,
            paddingTopLeft: [50, 70],
            paddingBottomRight: [wide ? 400 : 40, 50],
          });
        };
        fitFocused(true);
        window.setTimeout(() => fitFocused(false), 450);
      } else if (typeof layer.getLatLng === 'function') {
        map.setView(layer.getLatLng(), Math.max(map.getZoom(), 13), { animate: true });
      }
    }
    onFeatureClickRef.current?.({ layerCode, feature: layer.feature });
  }

  function selectWithRetry(layerCode: string, matches: (feature: any) => boolean, retriesLeft: number) {
    const record = layerGroupsRef.current.get(layerCode);
    if (!mapRef.current || !record) {
      if (retriesLeft > 0) {
        window.setTimeout(() => selectWithRetry(layerCode, matches, retriesLeft - 1), SELECT_FEATURE_RETRY_DELAY_MS);
      }
      return;
    }
    let target: any = null;
    record.group.eachLayer((layer: any) => {
      if (!target && matches(layer?.feature)) target = layer;
    });
    if (target) highlight(target, layerCode, true);
  }

  useImperativeHandle(
    ref,
    () => ({
      zoomToLayer(code: string) {
        const bounds = layerGroupsRef.current.get(code)?.group?.getBounds?.();
        if (mapRef.current && bounds?.isValid?.()) mapRef.current.fitBounds(bounds.pad(0.12), { animate: true, maxZoom: 14 });
      },
      zoomToAll() {
        if (mapRef.current) fitToGroups(mapRef.current, groupsMap());
      },
      selectFeature(layerCode: string, featureCode: string) {
        selectWithRetry(layerCode, (feature) => featureCodeOf(feature) === featureCode, SELECT_FEATURE_MAX_RETRIES);
      },
      selectFeatureByProperty(layerCode: string, key: string, value: string) {
        selectWithRetry(layerCode, (feature) => String(feature?.properties?.[key] ?? '') === value, SELECT_FEATURE_MAX_RETRIES);
      },
      clearSelection() {
        resetHighlight();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 1) Crear el mapa una sola vez.
  useEffect(() => {
    let cancelled = false;
    void ensureLeafletReady()
      .then((L) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) return;
        leafletRef.current = L;
        const initial = props.initialView;
        const map = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: true }).setView(
          initial ? [initial.lat, initial.lng] : DEFAULT_CENTER,
          initial ? initial.zoom : 7,
        );
        L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
        map.on('mousemove', (event: any) => event?.latlng && setCursor({ lat: event.latlng.lat, lng: event.latlng.lng }));
        map.on('mouseout', () => setCursor(null));
        map.on('click', () => {
          if (!highlightRef.current) return;
          resetHighlight();
          onSelectionClearedRef.current?.();
        });
        map.on('moveend', () => {
          const center = map.getCenter();
          onViewChangeRef.current?.({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
        });
        mapRef.current = map;
        setLeafletError(null);
        setMapReady(true);
        window.setTimeout(() => map.invalidateSize(), 0);
      })
      .catch((reason: Error) => {
        if (!cancelled) setLeafletError(reason.message);
      });
    return () => {
      cancelled = true;
      onViewChangeRef.current = undefined;
      if (mapRef.current) {
        mapRef.current.off();
        mapRef.current.stop?.();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Mapa base: solo se intercambia la capa de fondo.
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    baseLayerRef.current = createBasemapLayer(L, basemap as MapBasemapKey);
    if (baseLayerRef.current) {
      baseLayerRef.current.addTo(map);
      baseLayerRef.current.bringToBack?.();
    }
  }, [basemap, mapReady]);

  // 3) Capas vectoriales: reconstruir solo las que cambiaron de datos; estilo en caliente.
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    const activeCodes = new Set(props.layers.map((entry) => entry.code));
    for (const [code, record] of layerGroupsRef.current.entries()) {
      if (!activeCodes.has(code)) {
        if (highlightRef.current?.layerCode === code) resetHighlight();
        map.removeLayer(record.group);
        layerGroupsRef.current.delete(code);
      }
    }

    props.layers.forEach((entry, index) => {
      if (!entry.featureCollection) return;
      const existing = layerGroupsRef.current.get(entry.code);
      if (existing && existing.data === entry.featureCollection) {
        existing.group.eachLayer((layer: any) => {
          const isHighlighted = highlightRef.current?.layer === layer;
          if (typeof layer.setStyle === 'function') layer.setStyle(styleFor(entry, isHighlighted));
        });
        existing.group.setZIndex?.(400 + index);
        return;
      }
      if (existing) {
        if (highlightRef.current?.layerCode === entry.code) resetHighlight();
        map.removeLayer(existing.group);
        // Si la capa enfocada se redibuja (nuevos datos/filtros), el foco se vuelve a aplicar.
        if (props.focusFeature?.layerCode === entry.code) appliedFocusRef.current = null;
      }
      const group = L.geoJSON(entry.featureCollection as any, {
        style: () => styleFor(entry, false),
        pointToLayer: (_feature: any, latlng: any) =>
          L.circleMarker(latlng, { radius: 6, color: '#ffffff', weight: 1.5, fillColor: entry.color, fillOpacity: Math.max(entry.opacity, 0.75) }),
        onEachFeature: (feature: any, layer: any) => {
          layer.bindTooltip(featureLabelOf(feature, entry.name), { direction: 'top', sticky: true, opacity: 0.95 });
          layer.on('click', (event: any) => {
            L.DomEvent.stopPropagation(event);
            highlight(layer, entry.code, false);
          });
        },
      }).addTo(map);
      layerGroupsRef.current.set(entry.code, { group, data: entry.featureCollection });
    });

    // Las capas añadidas después quedan encima; el resaltado siempre al frente.
    highlightRef.current?.layer?.bringToFront?.();

    const focus = props.focusFeature;
    const focusKey = focus ? `${focus.layerCode}:${focus.property}=${focus.value}` : null;
    if (focus && focusKey !== appliedFocusRef.current && layerGroupsRef.current.has(focus.layerCode)) {
      appliedFocusRef.current = focusKey;
      hasAutoFitRef.current = true; // el encuadre lo decide el elemento enfocado
      let target: any = null;
      layerGroupsRef.current.get(focus.layerCode)!.group.eachLayer((layer: any) => {
        if (!target && String(layer?.feature?.properties?.[focus.property] ?? '') === focus.value) target = layer;
      });
      if (target) {
        highlight(target, focus.layerCode, true);
        return;
      }
    }

    if (layerGroupsRef.current.size === 0) {
      hasAutoFitRef.current = Boolean(props.initialView);
    } else if (!hasAutoFitRef.current) {
      hasAutoFitRef.current = true;
      fitToGroups(map, groupsMap());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, props.layers, props.focusFeature?.layerCode, props.focusFeature?.property, props.focusFeature?.value]);

  // 4) Reencuadre explícito pedido por la página.
  useEffect(() => {
    if (props.fitKey === undefined || !mapReady || !mapRef.current) return;
    fitToGroups(mapRef.current, groupsMap());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey]);

  // 5) Capas WMS externas.
  const wmsSignature = useMemo(
    () => (props.wmsLayers ?? []).map((entry) => `${entry.id}:${entry.url}:${entry.wmsLayerName}:${entry.opacity}`).join('|'),
    [props.wmsLayers],
  );
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;
    const entries = props.wmsLayers ?? [];
    const ids = new Set(entries.map((entry) => entry.id));
    for (const [id, tileLayer] of wmsLayerGroupsRef.current.entries()) {
      if (!ids.has(id)) {
        map.removeLayer(tileLayer);
        wmsLayerGroupsRef.current.delete(id);
      }
    }
    for (const entry of entries) {
      const existing = wmsLayerGroupsRef.current.get(entry.id);
      if (existing) {
        existing.setOpacity(entry.opacity);
        continue;
      }
      wmsLayerGroupsRef.current.set(
        entry.id,
        L.tileLayer.wms(entry.url, { layers: entry.wmsLayerName, format: 'image/png', transparent: true, opacity: entry.opacity }).addTo(map),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, wmsSignature]);

  const hasLayers = props.layers.length > 0 || (props.wmsLayers?.length ?? 0) > 0;

  return (
    <MapWorkspace context="analysis" className={`sigi-multilayer-map${props.className ? ` ${props.className}` : ''}`} ariaLabel={props.ariaLabel ?? 'Mapa multicapa'}>
      <MapToolbar>
        <button type="button" onClick={() => mapRef.current && fitToGroups(mapRef.current, groupsMap())} disabled={!hasLayers} title="Encuadrar todas las capas activas">
          ⤢ Extensión
        </button>
        {hasSelection ? (
          <button
            type="button"
            onClick={() => {
              resetHighlight();
              onSelectionClearedRef.current?.();
            }}
          >
            ✕ Limpiar
          </button>
        ) : null}
        {props.toolbarExtra}
        <MapBasemapSelector value={basemap} onChange={setBasemap} />
        <MapFullscreenButton />
      </MapToolbar>

      <div ref={mapContainerRef} className="sigi-multilayer-map__canvas" />

      {props.children}

      <div className="sigi-map-coordinates" aria-live="off">
        {cursor ? `Lat ${formatCoordinate(cursor.lat)} · Lon ${formatCoordinate(cursor.lng)}` : 'WGS 84 (EPSG:4326)'}
      </div>

      {leafletError ? (
        <div className="sigi-map-floating-error">
          <MapErrorState>{leafletError}</MapErrorState>
        </div>
      ) : null}

      {!hasLayers ? (
        <div className="sigi-map-empty-overlay">
          <div>{props.emptyMessage}</div>
        </div>
      ) : null}
    </MapWorkspace>
  );
});
