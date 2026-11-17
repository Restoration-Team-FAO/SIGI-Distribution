import { createContext, type CSSProperties, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { MAP_BASEMAPS, type MapBasemapKey } from './map-runtime';

type MapContext = 'global' | 'project' | 'indicator' | 'edit' | 'analysis' | 'preview';

const FullscreenContext = createContext<{ active: boolean; toggle: () => void } | null>(null);

export function MapWorkspace(props: { context: MapContext; children: ReactNode; className?: string; ariaLabel?: string; style?: CSSProperties }) {
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => {
      setActive(document.fullscreenElement === rootRef.current);
      window.dispatchEvent(new Event('sigi:map-resize'));
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void rootRef.current?.requestFullscreen();
    }
  };

  return (
    <FullscreenContext.Provider value={{ active, toggle }}>
      <section ref={rootRef} className={`map-workspace map-workspace--${props.context}${props.className ? ` ${props.className}` : ''}`} aria-label={props.ariaLabel} style={props.style}>
        {props.children}
      </section>
    </FullscreenContext.Provider>
  );
}

export function MapCanvas(props: { children: ReactNode; className?: string }) {
  return <div className={`map-canvas${props.className ? ` ${props.className}` : ''}`}>{props.children}</div>;
}

export function MapToolbar(props: { children: ReactNode; ariaLabel?: string }) {
  return <div className="map-toolbar" role="toolbar" aria-label={props.ariaLabel ?? 'Herramientas del mapa'}>{props.children}</div>;
}

export function MapLayerPanel(props: { children: ReactNode; count?: number; defaultOpen?: boolean }) {
  return <details className="map-panel map-layer-panel" open={props.defaultOpen}><summary>Capas{props.count === undefined ? '' : ` (${props.count})`}</summary>{props.children}</details>;
}

export function MapLegend(props: { children: ReactNode }) {
  return <section className="map-overlay-panel map-legend" aria-label="Leyenda"><strong>Leyenda</strong>{props.children}</section>;
}

export function MapFilterPanel(props: { children: ReactNode; activeCount?: number }) {
  return <details className="map-panel map-filter-panel"><summary>Filtros{props.activeCount ? ` (${props.activeCount})` : ''}</summary>{props.children}</details>;
}

export function MapFeatureDrawer(props: { open: boolean; title?: ReactNode; children: ReactNode; onClose: () => void }) {
  if (!props.open) return null;
  return <aside className="map-feature-drawer" aria-label="Detalle del elemento"><header><strong>{props.title ?? 'Detalle'}</strong><button type="button" onClick={props.onClose} aria-label="Cerrar detalle">×</button></header>{props.children}</aside>;
}

export function MapResultsPanel(props: { count: number; children: ReactNode }) {
  return <details className="map-panel map-results-panel"><summary>Resultados ({props.count})</summary>{props.children}</details>;
}

export function MapBasemapSelector(props: { value: MapBasemapKey; onChange: (value: MapBasemapKey) => void }) {
  return <label className="map-basemap-selector"><span>Mapa base</span><select value={props.value} onChange={(event) => props.onChange(event.target.value as MapBasemapKey)}>{MAP_BASEMAPS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>;
}

export function MapSearch(props: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="map-search"><span className="sr-only">Buscar en el mapa</span><input type="search" value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder ?? 'Buscar en el mapa…'} /></label>;
}

export function MapFullscreenButton() {
  const fullscreen = useContext(FullscreenContext);
  if (!fullscreen || !document.fullscreenEnabled) return null;
  return <button type="button" onClick={fullscreen.toggle} aria-label={fullscreen.active ? 'Salir de pantalla completa' : 'Abrir mapa en pantalla completa'}>{fullscreen.active ? 'Salir de pantalla completa' : '⛶ Pantalla completa'}</button>;
}

export function MapMeasurementTools(props: { onStart: () => void; active?: boolean }) {
  return <button type="button" onClick={props.onStart} aria-pressed={props.active}>Medir</button>;
}

export function MapEditTools(props: { onDraw?: () => void; onEdit?: () => void; onDelete?: () => void }) {
  return <div className="map-edit-tools">{props.onDraw ? <button type="button" onClick={props.onDraw}>Dibujar</button> : null}{props.onEdit ? <button type="button" onClick={props.onEdit}>Editar vértices</button> : null}{props.onDelete ? <button type="button" onClick={props.onDelete}>Eliminar geometría</button> : null}</div>;
}

export function MapLoadingState(props: { label?: string }) { return <div className="map-state" role="status">{props.label ?? 'Cargando mapa…'}</div>; }
export function MapErrorState(props: { children?: ReactNode }) { return <div className="map-state map-state--error" role="alert">{props.children ?? 'No se pudo cargar el mapa.'}</div>; }
export function MapEmptyState(props: { children?: ReactNode }) { return <div className="map-state">{props.children ?? 'Sin geometría disponible.'}</div>; }

export function MiniMap(props: { children: ReactNode; openHref?: string; label?: string }) {
  return <section className="mini-map" aria-label={props.label ?? 'Vista previa del mapa'}><div className="mini-map__canvas">{props.children}</div>{props.openHref ? <a href={props.openHref}>Ver en mapa</a> : null}</section>;
}
