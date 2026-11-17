const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL = process.env.SIGI_E2E_ADMIN_EMAIL ?? 'superadmin@sigi.local';
const ADMIN_PASSWORD = process.env.SIGI_E2E_ADMIN_PASSWORD ?? 'superadmin-dev-token';
const ADMIN_BASE_URL = process.env.SIGI_E2E_URL ?? process.env.SIGI_E2E_ADMIN_URL ?? 'http://127.0.0.1:5174';

function watchCriticalErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function login(page) {
  await page.goto('/administration');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión en SIGI' })).toBeVisible();
  await page.getByLabel('Correo').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function expectHealthyPage(page, errors, expectedText) {
  const appMain = page.locator('main.sigi-main');
  await expect(appMain).toContainText(expectedText);
  await expect(appMain).not.toBeEmpty();
  expect(errors).toEqual([]);
}

test.describe.serial('Sprint 1R admin protection @admin', () => {
  let context;
  let page;
  let errors;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: ADMIN_BASE_URL });
    page = await context.newPage();
    errors = watchCriticalErrors(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('R1-02 carga la consola admin', async () => {
    await page.goto('/administration');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión en SIGI' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('R1-03 inicia sesión', async () => {
    await login(page);
    await expectHealthyPage(page, errors, 'Mi trabajo');
  });

  test('R1-04 navega a proyectos', async () => {
    await page.goto('/admin/projects');
    await expectHealthyPage(page, errors, 'Proyectos');
  });

  test('R1-05 abre la ficha de proyecto', async () => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Cartera de proyectos' })).toBeVisible();
    await page.getByText('Ver proyecto →').first().click();
    await expect(page.getByRole('tab', { name: 'Resumen' })).toBeVisible();
    await expectHealthyPage(page, errors, 'Resumen');
  });

  test('R1-06 abre GIS y mapa', async () => {
    await page.goto('/admin/geobi');
    await expectHealthyPage(page, errors, 'Mapa');
  });

  test('R1-07 abre archivos', async () => {
    await page.goto('/admin/files');
    await expectHealthyPage(page, errors, 'Documentos');
  });

  test('R1-08 abre reportes', async () => {
    await page.goto('/admin/reports');
    await expectHealthyPage(page, errors, 'Catálogo de informes');
  });

  test('R1-09 abre Kobo', async () => {
    await page.goto('/admin/sources/kobo');
    await expectHealthyPage(page, errors, 'Fuente Kobo seleccionada');
  });

  test('R1-10 abre administración de usuarios', async () => {
    await page.goto('/admin/users');
    await expectHealthyPage(page, errors, 'Usuarios');
  });
});
