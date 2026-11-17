const { test, expect } = require('@playwright/test');

// P0-10 — E2E coverage of the Mapa SIGI / Geo-BI minimal flow (spec's
// "flujo mínimo": catálogo -> identificar -> filtrar -> tabla -> exportar),
// in the authenticated frontend. Row selection (not a raw map click) drives the
// identification ficha here — P0-7 already wires table-row click -> map
// highlight -> ficha open, and a DOM row is a stable Playwright target,
// unlike a canvas coordinate that shifts with viewport/zoom (see D-notes in
// docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.2 on the P0-4 click-coordinate
// lesson). Backend behavior (permissions, filter/sort SQL, export formats)
// is covered by scripts/geo-{visibility,api}-smoke.mjs and
// tests/unit/geo-*.test.mjs — this spec only proves the pieces render and
// wire together in a real browser.
//
// P1-1 — extended with territorial search (spec §18). That extension is
// what caught a real race condition (see verifyTerritorialSearch below) —
// keep it running on every future change to MultiLayerMap.selectFeature.

const ADMIN_EMAIL = process.env.SIGI_E2E_ADMIN_EMAIL ?? 'superadmin@sigi.local';
const ADMIN_PASSWORD = process.env.SIGI_E2E_ADMIN_PASSWORD ?? 'superadmin-dev-token';
const TERRITORY_NAME = process.env.SIGI_E2E_TERRITORY_NAME ?? 'Región Central';
const TERRITORY_CODE = process.env.SIGI_E2E_TERRITORY_CODE ?? 'cr-central';

async function activateFirstLayerAndOpenTable(page) {
  // v2.1.0: el Catálogo vive dentro del Visor (región "Visor del mapa"); regiones y proyectos ya vienen activos.
  await expect(page.getByRole('region', { name: 'Visor del mapa' })).toBeVisible({ timeout: 20000 });
  const firstLayer = page.locator('.sigi-map-viewer__sidebar input[type="checkbox"]').first();
  await firstLayer.check();
  await page.getByText('Filtros y estadísticas').first().click();

  // P1-2 — cached per-layer profile (spec §11) renders once the layer activates.
  const profileState = page
    .getByText(/elementos · \d+% con geometría válida/)
    .or(page.getByText('Sin estadísticas de capa disponibles todavía.'));
  await expect(profileState.first()).toBeVisible({ timeout: 15000 });

  await expect(page.getByRole('button', { name: 'Tabla', exact: true }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Tabla', exact: true }).first().click();
  await expect(page.getByText('Tabla de atributos —')).toBeVisible({ timeout: 15000 });
}

// P1-1 — territorial search (spec §18): finds a territory across every
// visible layer and, unlike the catalog-name search (P0-9), auto-activates
// its layer and opens the ficha. Exercised on a fresh page, before any
// layer is active — this is the exact "fresh activation" path that exposed
// a real race condition during manual verification: MultiLayerMap builds
// its Leaflet layer group inside a `.then()` microtask, so calling
// selectFeature in the same tick the layer's data finishes loading could
// run before that group existed. Fixed with a bounded retry inside
// MultiLayerMap.selectFeature (see the component for the full rationale) —
// this test is what would catch a regression of that fix.
async function verifyTerritorialSearch(page) {
  const searchBox = page.getByLabel('Buscar territorio en el mapa');
  await searchBox.fill(TERRITORY_NAME);
  const result = page.getByText(TERRITORY_NAME, { exact: true }).first();
  await expect(result).toBeVisible({ timeout: 10000 });
  await result.click();

  // The authenticated workspace opens the feature ficha after selection.
  const selectionState = page
    .getByText(new RegExp(`Foco(?::| sobre) ${escapeRegex(TERRITORY_NAME)}`))
    .or(page.getByText('Ficha del elemento'));
  await expect(selectionState).toBeVisible({ timeout: 15000 });

  const selectedTerritory = page
    .getByRole('button', { name: new RegExp(`${escapeRegex(TERRITORY_NAME)}.*${escapeRegex(TERRITORY_CODE)}`) })
    .or(page.getByText(TERRITORY_CODE, { exact: true }));
  await expect(selectedTerritory.first()).toBeVisible();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function verifyGeoFlow(page) {
  await verifyTerritorialSearch(page);
  await activateFirstLayerAndOpenTable(page);

  // Table: server-side rows rendered, not just a loading state.
  const firstRow = page.locator('table tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 15000 });

  // Filters (P0-6): the per-field filter panel is present for the active layer.
  await expect(page.getByText(/Filtros \(\d+ activos\)/).first()).toBeVisible();

  // Row -> map -> ficha sync (P0-5/P0-7): clicking a table row opens the identification ficha.
  await firstRow.click();
  await expect(page.getByText('Ficha del elemento')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Fuente y metadatos de la capa')).toBeVisible();

  // Export (P0-8): triggers a real browser download with a real file name, not a stub.
  const exportButton = page.getByRole('button', { name: /^exportar$/i });
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(/^sigi-.+\.csv$/);
}

test.describe('Mapa SIGI / Geo-BI minimal flow — admin @admin', () => {
  test('authenticated admin can activate a layer, filter, open the ficha, and export', async ({ page }) => {
    await page.goto('/administration');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión en SIGI' })).toBeVisible();
    await page.getByLabel('Correo').fill(ADMIN_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/admin/geobi?view=viewer');
    await verifyGeoFlow(page);

    const fullscreenButton = page.getByRole('button', { name: 'Abrir mapa en pantalla completa' });
    await expect(fullscreenButton).toBeVisible();
    await fullscreenButton.click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    const fullscreenSize = await page.evaluate(() => {
      const fullscreen = document.fullscreenElement;
      const canvas = fullscreen?.querySelector('.sigi-multilayer-map__canvas, .sigi-map-native-canvas');
      const rect = canvas?.getBoundingClientRect();
      return rect ? { width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight } : null;
    });
    expect(fullscreenSize).not.toBeNull();
    expect(fullscreenSize.height).toBeGreaterThanOrEqual(fullscreenSize.viewportHeight * 0.9);
    expect(fullscreenSize.width).toBeGreaterThanOrEqual(fullscreenSize.viewportWidth * 0.7);
    await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  });

  test('executes a real layer intersection and renders the analysis workbench', async ({ page }) => {
    await page.goto('/administration');
    await page.getByLabel('Correo').fill(ADMIN_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/geobi?view=analysis');

    await expect(page.getByRole('heading', { name: 'Cruce de capas y estadísticas' })).toBeVisible();
    const runButton = page.getByRole('button', { name: 'Ejecutar cruce espacial' });
    await expect(runButton).toBeEnabled({ timeout: 15000 });
    await runButton.click();
    await expect(page.getByText('Coincidencias', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Tabla de resultados')).toBeVisible();
    await expect(page.locator('.gis-analysis__map-shell .leaflet-container')).toBeVisible();
  });
});
