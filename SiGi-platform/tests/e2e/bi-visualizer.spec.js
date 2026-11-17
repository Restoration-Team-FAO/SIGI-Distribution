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

test.describe('Visualizador BI @admin', () => {
  test('prioriza el tablero ejecutivo y permite navegar y construir páginas', async ({ page }) => {
    await login(page);
    await page.goto('/admin/bi-visualizer');

    await expect(page.getByRole('heading', { name: 'Visualizador BI' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vista previa' })).toHaveClass(/is-active/);
    await expect(page.getByRole('navigation', { name: 'Páginas del tablero' })).toBeVisible();
    await expect(page.getByText('Espacio de composición analítica institucional')).toHaveCount(0);
    await expect(page.getByText('Pulso del portafolio')).toHaveCount(0);
    await expect(page.getByText('Detalle de proyectos', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Operativa/i }).click();
    await expect(page.getByRole('heading', { name: 'Operativa', exact: true })).toBeVisible();
    await expect(page.locator('.bi-detail-table tbody tr').first()).toBeVisible();

    await page.getByRole('button', { name: 'Editar tablero' }).click();
    await expect(page.getByText('Constructor del tablero', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '＋ Agregar visual' }).click();
    await expect(page.getByText('Agregar al tablero', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Agregar Distribución de área' }).click();
    await expect(page.getByRole('tab', { name: 'Datos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Diseño' })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Título del visual').fill('Distribución estadística UAT');
    await page.getByRole('radio', { name: /Caja y bigotes/ }).click();
    await page.getByRole('button', { name: 'Vista previa' }).click();
    await expect(page.getByRole('heading', { name: 'Distribución estadística UAT' })).toBeVisible();
    await expect(page.locator('.bi-boxplot')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Distribución estadística UAT' })).toBeVisible();
    await expect(page.locator('.bi-boxplot')).toBeVisible();
  });

  test('exporta únicamente el tablero en modo informe', async ({ page }) => {
    await login(page);
    await page.goto('/admin/bi-visualizer');
    await page.evaluate(() => {
      window.print = () => {
        document.body.dataset.printCalled = 'true';
      };
    });

    await page.getByRole('button', { name: 'Exportar PDF' }).click();
    await expect(page.locator('body')).toHaveClass(/bi-print-dashboard/);
    await expect(page.locator('body')).toHaveAttribute('data-print-called', 'true');

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.bi-dashboard-surface')).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.bi-command-bar')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('.bi-page-tabs')).toHaveCSS('visibility', 'hidden');

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('body')).not.toHaveClass(/bi-print-dashboard/);
  });
});
