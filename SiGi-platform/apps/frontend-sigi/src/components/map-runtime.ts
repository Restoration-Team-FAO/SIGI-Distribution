import { type MutableRefObject, useCallback, useEffect, useState } from 'react';

export type MapBasemapKey = 'none' | 'osm' | 'light' | 'topo' | 'satellite';

export type MapBasemapOption = {
  key: MapBasemapKey;
  label: string;
  url?: string;
  /** Capa de etiquetas superpuesta (topónimos) para fondos sin rótulos. */
  labelsUrl?: string;
  attribution?: string;
  options?: Record<string, unknown>;
};

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

// Solo proveedores que no requieren clave de API. CARTO dejó de servir teselas sin clave
// (marca de agua "API KEY REQUIRED"), por eso el fondo claro usa Esri World Light Gray.
export const MAP_BASEMAPS: MapBasemapOption[] = [
  {
    key: 'light',
    label: 'Claro',
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    options: { maxZoom: 16 },
  },
  {
    key: 'osm',
    label: 'Calles (OpenStreetMap)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    options: { maxZoom: 19 },
  },
  {
    key: 'topo',
    label: 'Topográfico',
    url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, &copy; OpenStreetMap contributors',
    options: { maxZoom: 19 },
  },
  {
    key: 'satellite',
    label: 'Satélite',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
    options: { maxZoom: 19 },
  },
  { key: 'none', label: 'Sin fondo' },
];

// Los proveedores de teselas (OSM en particular) exigen un Referer válido; el sitio usa
// `Referrer-Policy: same-origin`, que lo suprime en peticiones cross-origin y provoca
// "403 Access blocked". Cada capa base declara su propia política: solo envía el origen.
export const TILE_REFERRER_POLICY = 'strict-origin-when-cross-origin';
export const DEFAULT_BASEMAP: MapBasemapKey = 'light';
const BASEMAP_STORAGE_KEY = 'sigi.map.basemap';

export function isBasemapKey(value: unknown): value is MapBasemapKey {
  return MAP_BASEMAPS.some((option) => option.key === value);
}

/** Crea la capa base de Leaflet (o null para "Sin fondo") con la política de referer correcta. */
export function createBasemapLayer(L: any, key: MapBasemapKey) {
  const option = MAP_BASEMAPS.find((item) => item.key === key);
  if (!option?.url) return null;
  const tileOptions = { attribution: option.attribution, referrerPolicy: TILE_REFERRER_POLICY, ...(option.options ?? {}) };
  const base = L.tileLayer(option.url, tileOptions);
  if (!option.labelsUrl) return base;
  const labels = L.tileLayer(option.labelsUrl, { ...tileOptions, attribution: undefined, pane: 'overlayPane', zIndex: 650 });
  return L.layerGroup([base, labels]);
}

function readStoredBasemap(): MapBasemapKey | null {
  try {
    const value = window.localStorage.getItem(BASEMAP_STORAGE_KEY);
    return isBasemapKey(value) ? value : null;
  } catch {
    return null;
  }
}

/** Mapa base compartido por todos los mapas del SIGI y recordado entre pestañas y sesiones. */
export function useBasemapPreference(initial?: MapBasemapKey | null) {
  const [basemap, setBasemapState] = useState<MapBasemapKey>(() => initial ?? readStoredBasemap() ?? DEFAULT_BASEMAP);
  const setBasemap = useCallback((value: MapBasemapKey) => {
    setBasemapState(value);
    try {
      window.localStorage.setItem(BASEMAP_STORAGE_KEY, value);
    } catch {
      // almacenamiento no disponible: la preferencia vive solo en esta vista
    }
  }, []);
  return [basemap, setBasemap] as const;
}

let leafletReadyPromise: Promise<any> | null = null;

export function ensureLeafletReady() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Leaflet no está disponible en este entorno.'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletReadyPromise) return leafletReadyPromise;

  leafletReadyPromise = new Promise<any>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.L) {
        window.clearInterval(timer);
        resolve(window.L);
        return;
      }
      if (Date.now() - startedAt > 8000) {
        window.clearInterval(timer);
        leafletReadyPromise = null;
        reject(new Error('No se pudo cargar Leaflet.'));
      }
    }, 50);
  });

  return leafletReadyPromise;
}

export function useMapViewportResize(mapRef: MutableRefObject<any>) {
  useEffect(() => {
    const resize = () => window.setTimeout(() => mapRef.current?.invalidateSize?.(), 80);
    window.addEventListener('resize', resize);
    window.addEventListener('sigi:map-resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('sigi:map-resize', resize);
    };
  }, [mapRef]);
}

