const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL = process.env.SIGI_E2E_ADMIN_EMAIL ?? 'superadmin@sigi.local';
const ADMIN_PASSWORD = process.env.SIGI_E2E_ADMIN_PASSWORD ?? 'superadmin-dev-token';

async function login(page) {
  await page.goto('/administration');
  await page.getByLabel('Correo').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('Sidebar responsive y persistente @admin', () => {
  test('desktop alterna estados, mantiene el activo y persiste la preferencia', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await login(page);

    const sidebar = page.locator('.sigi-sidebar');
    await expect(page.getByRole('button', { name: 'Colapsar menú lateral' })).toBeVisible();
    await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Proyectos', exact: true })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: 'Colapsar menú lateral' }).click();
    await expect(page.getByRole('button', { name: 'Expandir menú lateral' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Proyectos', exact: true })).toHaveAttribute('title', 'Proyectos');
    await expect(sidebar).toHaveCSS('max-height', '960px');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Expandir menú lateral' })).toBeVisible();
    await page.getByRole('button', { name: 'Expandir menú lateral' }).click();
    await expect(page.getByRole('button', { name: 'Colapsar menú lateral' })).toBeVisible();
  });

  test('tablet inicia compacto y puede expandirse', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await login(page);
    await expect(page.getByRole('button', { name: 'Expandir menú lateral' })).toBeVisible();
    await page.getByRole('button', { name: 'Expandir menú lateral' }).click();
    await expect(page.getByRole('button', { name: 'Colapsar menú lateral' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Indicadores', exact: true })).toBeVisible();
  });

  test('mobile usa drawer con apertura y cierre independientes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);

    const sidebar = page.locator('.sigi-sidebar');
    await expect(sidebar).not.toBeInViewport();
    await page.getByRole('button', { name: 'Abrir menú lateral' }).click();
    await expect(sidebar).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Cerrar menú lateral' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar menú lateral' }).click();
    await expect(sidebar).not.toBeInViewport();
  });
});
