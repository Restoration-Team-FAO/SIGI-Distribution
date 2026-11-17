import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the user-facing GIS entry is Mapa while technical routes remain compatible', () => {
  const routes = read('apps/frontend-sigi/src/app/route-catalog.ts');
  const projects = read('apps/frontend-sigi/src/pages/ProjectsModulePage.tsx');
  const indicators = read('apps/frontend-sigi/src/pages/IndicatorsModulePage.tsx');

  assert.match(routes, /path: '\/admin\/geobi'.*title: 'Mapa'/);
  assert.match(routes, /domain: 'Mapa'/);
  assert.doesNotMatch(routes, /label: 'Territorio SIGI'/);
  assert.match(projects, /label: 'Mapa'.*projectWorkspacePath\('territory'/);
  assert.match(indicators, /label: 'Mapa'.*path\('territory'/);
});

test('the Visor is one map-first workspace: layers panel, multilayer map, identify and table', () => {
  const page = read('apps/frontend-sigi/src/pages/GeoBiModulePage.tsx');
  const map = read('apps/frontend-sigi/src/components/MultiLayerMap.tsx');
  const styles = read('apps/frontend-sigi/src/styles.css');

  // v2.1.0: el Catálogo se integró en el Visor; ?view=catalog sigue abriendo el Visor.
  assert.match(page, /const isMapViewer = territoryView === 'viewer' \|\| territoryView === 'catalog'/);
  assert.doesNotMatch(page, /label: 'Catálogo', to: territoryWorkspacePath/);
  assert.match(page, /className="sigi-map-viewer"/);
  assert.match(page, /<GeoLayerCatalogPanel/);
  assert.match(page, /<MultiLayerMap[\s\S]*focusFeature=\{projectFocusFeature\}/);
  assert.match(page, /onViewChange=\{handleMapViewChange\}/);
  assert.match(page, /className="sigi-map-legend-float"/);
  assert.match(page, /<FeatureIdentificationPanel/);
  assert.match(page, /<GeoLayerAttributeTable/);
  assert.match(page, /DEFAULT_VISIBLE_LAYER_CODES = \['territories', 'project_polygons'\]/);
  assert.doesNotMatch(page, /<GeoBiLayerMap/);
  assert.match(map, /<MapToolbar/);
  assert.match(map, /<MapFullscreenButton/);
  assert.match(map, /L\.control\.scale\(/);
  assert.match(map, /selectFeatureByProperty/);
  assert.match(styles, /\.sigi-map-viewer__body \{ display: grid; grid-template-columns: minmax\(280px, 340px\) minmax\(0, 1fr\)/);
  // La barra de herramientas no puede tapar el control de zoom de Leaflet (arriba a la izquierda).
  assert.match(styles, /\.map-toolbar \{ position: absolute; top: 12px; right: 12px; left: auto;/);
});

test('basemaps need no API key and send a Referer so tile servers do not block them', () => {
  const runtime = read('apps/frontend-sigi/src/components/map-runtime.ts');
  assert.match(runtime, /TILE_REFERRER_POLICY = 'strict-origin-when-cross-origin'/);
  assert.match(runtime, /referrerPolicy: TILE_REFERRER_POLICY/);
  assert.doesNotMatch(runtime, /cartocdn/); // CARTO exige clave: marca de agua "API KEY REQUIRED"
  assert.match(runtime, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  for (const file of ['GeoBiLayerMap', 'MultiLayerMap', 'OperationalLayerMap', 'ProjectCoverageMap']) {
    const source = read(`apps/frontend-sigi/src/components/${file}.tsx`);
    assert.match(source, /createBasemapLayer\(L, /, file);
    assert.doesNotMatch(source, /L\.tileLayer\(selectedBasemap\.url/, file);
  }
});

test('the analysis workspace exposes a real PostGIS layer intersection workflow', () => {
  const page = read('apps/frontend-sigi/src/pages/GeoBiModulePage.tsx');
  const workbench = read('apps/frontend-sigi/src/components/GeoSpatialAnalysisWorkbench.tsx');
  const controller = read('apps/sigi-api/src/modules/geo/geo.controller.ts');
  const service = read('apps/sigi-api/src/modules/geo/geo.service.ts');

  assert.match(page, /<GeoSpatialAnalysisWorkbench/);
  assert.match(workbench, /intersectGeoLayers/);
  assert.match(workbench, /Importar Shapefile ZIP/);
  assert.match(workbench, /<MultiLayerMap/);
  assert.match(controller, /@Post\('analysis\/intersection'\)/);
  assert.match(service, /ST_Intersects/);
  assert.match(service, /ST_Intersection/);
  assert.match(service, /MAX_INTERSECTION_FEATURES/);
});

test('GeoServer browser traffic uses the same-origin proxy and the identify panel floats on the map', () => {
  const page = read('apps/frontend-sigi/src/pages/GeoBiModulePage.tsx');
  const styles = read('apps/frontend-sigi/src/styles.css');

  assert.match(page, /targetUrl\.hostname === 'geoserver'/);
  assert.match(page, /window\.location\.origin/);
  assert.match(page, /className="sigi-map-catalog-inspector"/);
  assert.match(page, /className="sigi-map-viewer__sidebar"/);
  assert.match(styles, /\.sigi-map-catalog-inspector \{ position: absolute; z-index: 710; top: 62px; right: 12px;/);
});

test('project and operational maps use the shared dominant canvas treatment', () => {
  const projectMap = read('apps/frontend-sigi/src/components/ProjectCoverageMap.tsx');
  const operationalMap = read('apps/frontend-sigi/src/components/OperationalLayerMap.tsx');
  const docs = read('docs/frontend/23-map-workspace-refactor.md');

  assert.match(projectMap, /sigi-inline-map-layout/);
  assert.match(projectMap, /minHeight: '65vh'/);
  assert.match(operationalMap, /sigi-inline-map-layout/);
  assert.match(operationalMap, /minHeight: '65vh'/);
  assert.match(docs, /conserva \*\*Leaflet\*\*/);
  assert.match(docs, /No se modificaron endpoints/);
});

test('all maps share one cartographic design system and runtime', () => {
  const system = read('apps/frontend-sigi/src/components/map-system.tsx');
  const runtime = read('apps/frontend-sigi/src/components/map-runtime.ts');
  const files = [
    'apps/frontend-sigi/src/components/GeoBiLayerMap.tsx',
    'apps/frontend-sigi/src/components/MultiLayerMap.tsx',
    'apps/frontend-sigi/src/components/ProjectCoverageMap.tsx',
    'apps/frontend-sigi/src/components/OperationalLayerMap.tsx',
  ].map(read);

  for (const name of ['MapWorkspace', 'MapCanvas', 'MapToolbar', 'MapLayerPanel', 'MapLegend', 'MapFilterPanel', 'MapFeatureDrawer', 'MapResultsPanel', 'MapBasemapSelector', 'MapSearch', 'MapFullscreenButton', 'MapMeasurementTools', 'MapEditTools', 'MapLoadingState', 'MapErrorState', 'MapEmptyState', 'MiniMap']) {
    assert.match(system, new RegExp(`export function ${name}`));
  }
  assert.match(runtime, /export const MAP_BASEMAPS/);
  assert.match(runtime, /let leafletReadyPromise/);
  assert.match(runtime, /useMapViewportResize/);
  for (const source of files) {
    assert.match(source, /from '\.\/map-system'/);
    assert.match(source, /from '\.\/map-runtime'/);
    assert.doesNotMatch(source, /function ensureLeafletReady/);
  }
});

test('the global inventory and refactor report document routes, gaps and performance', () => {
  const inventory = read('docs/frontend/17-map-global-inventory.md');
  const summary = read('docs/frontend/18-map-refactor-summary.md');
  assert.match(inventory, /Mapas renderizados/);
  assert.match(inventory, /Superficies geográficas sin mapa renderizado/);
  assert.match(inventory, /Rendimiento y riesgos/);
  assert.match(summary, /Gaps backend/);
  assert.match(summary, /Componentes eliminados o consolidados/);
});
