const { test, expect } = require('@playwright/test');

async function login(page, email, password) {
  await page.goto('/administration');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('UAT-1 — Proyectos y Mapa @admin', () => {
  test('editor opera la ficha del proyecto y el lector conserva una vista de solo lectura', async ({ browser }) => {
    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();
    await login(editorPage, 'editor@sigi.local', 'editor-dev-token');
    await editorPage.goto('/projects');
    await editorPage.getByRole('link', { name: 'Ver proyecto' }).first().click();
    await expect(editorPage.getByRole('button', { name: 'Editar proyecto' })).toBeVisible();
    await expect(editorPage.getByRole('tab', { name: 'Mapa', exact: true })).toBeVisible();
    await editorContext.close();

    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await login(readerPage, 'reader@sigi.local', 'reader-dev-token');
    await readerPage.goto('/projects');
    await expect(readerPage.getByRole('button', { name: 'Nuevo proyecto' })).toHaveCount(0);
    await readerPage.getByRole('link', { name: 'Ver proyecto' }).first().click();
    await expect(readerPage.getByRole('button', { name: 'Editar proyecto' })).toHaveCount(0);
    await expect(readerPage.getByRole('tab', { name: 'Resumen', exact: true })).toBeVisible();
    await readerContext.close();
  });

  test('validador consulta el catálogo responsive y el lector no puede abrir GIS', async ({ browser }) => {
    const validatorContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const validatorPage = await validatorContext.newPage();
    await login(validatorPage, 'validator@sigi.local', 'validator-dev-token');
    await validatorPage.goto('/admin/geobi?view=viewer');
    await expect(validatorPage.getByRole('region', { name: 'Visor del mapa' })).toBeVisible();
    await expect(validatorPage.getByRole('link', { name: /Configuración/ })).toHaveCount(0);

    const catalogGrid = validatorPage.locator('.sigi-map-viewer__body');
    await expect(catalogGrid).toBeVisible();
    expect((await catalogGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(2);
    await validatorPage.setViewportSize({ width: 760, height: 900 });
    expect((await catalogGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(1);
    await validatorContext.close();

    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await login(readerPage, 'reader@sigi.local', 'reader-dev-token');
    await readerPage.goto('/admin/geobi?view=viewer');
    await expect(readerPage.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();
    await readerContext.close();
  });
});
