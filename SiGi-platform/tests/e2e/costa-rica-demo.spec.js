const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL = process.env.SIGI_E2E_ADMIN_EMAIL ?? 'superadmin@sigi.local';
const ADMIN_PASSWORD = process.env.SIGI_E2E_ADMIN_PASSWORD ?? 'superadmin-dev-token';
const DEMO_ENABLED = process.env.SIGI_E2E_COSTA_RICA_DEMO === '1';

async function loginAsAdmin(page) {
  await page.goto('/administration');
  await page.getByLabel('Correo').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('Costa Rica demonstration dataset @admin', () => {
  test.skip(!DEMO_ENABLED, 'Requires the opt-in Costa Rica demonstration seed.');

  test('renders projects and Costa Rica territorial layers in the unified frontend', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/projects?view=portfolio');
    const expectedProjects = [
      'Restauración del paisaje Osa–Golfo Dulce',
      'Corredor Biológico San Juan–La Selva',
      'Paisajes productivos resilientes del Tempisque',
      'Seguridad hídrica en cuencas del Caribe Sur',
    ];
    for (const projectName of expectedProjects) {
      const row = page.getByRole('row').filter({ hasText: projectName });
      await expect(row).toBeVisible();
      await expect(row.getByRole('link', { name: 'Ver proyecto' })).toBeVisible();
    }

    await page.goto('/admin/geobi?view=viewer');
    await expect(page.getByRole('region', { name: 'Visor del mapa' })).toBeVisible();
    await expect(page.getByText('Regiones de planificación — Costa Rica', { exact: true })).toBeVisible();
    await expect(page.getByText('Polígonos de proyectos — Costa Rica', { exact: true })).toBeVisible();
    await expect(page.getByText('Corredor Seco de Costa Rica — Demo', { exact: true })).toBeVisible();
  });

  test('renders the indicator and report review records', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/indicators?view=catalog');
    await expect(page.getByText('Hectáreas bajo restauración', { exact: true })).toBeVisible();

    await page.goto('/admin/reports/history');
    await expect(page.getByText('Informe de avance NDC Costa Rica 2026', { exact: true })).toBeVisible();
  });
});
