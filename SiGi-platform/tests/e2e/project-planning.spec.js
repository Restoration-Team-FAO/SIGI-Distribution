const { test, expect } = require('@playwright/test');

const PROJECT_ID = '30000000-0000-4000-8000-000000000001';

async function login(page) {
  await page.goto('/administration');
  await page.getByLabel('Correo').fill('superadmin@sigi.local');
  await page.getByLabel('Contraseña', { exact: true }).fill('superadmin-dev-token');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('Workspace de planificación de proyectos @admin', () => {
  test('navega planificación, cronograma, presupuesto y riesgos con datos demo', async ({ page }) => {
    await login(page);

    await page.goto(`/projects/${PROJECT_ID}/planning`);
    await expect(page.getByRole('tab', { name: 'Planificación' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Estructura de trabajo' })).toBeVisible();
    await expect(page.getByText('Restauración en campo')).toBeVisible();

    await page.getByRole('tab', { name: 'Cronograma' }).click();
    await expect(page.getByText('Vista temporal de fases, actividades, tareas y su avance.')).toBeVisible();
    await expect(page.locator('.project-gantt__row')).toHaveCount(6);

    await page.getByRole('tab', { name: 'Finanzas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Presupuesto del proyecto' })).toBeVisible();
    await expect(page.getByText('Insumos y establecimiento de parcelas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Movimientos financieros' })).toBeVisible();

    await page.getByRole('tab', { name: 'Riesgos y cambios' }).click();
    await expect(page.getByRole('heading', { name: 'Matriz de riesgos' })).toBeVisible();
    await expect(page.getByText('Eventos extremos afectan parcelas')).toBeVisible();
  });

  test('diferencia correctamente las cuatro modalidades financieras', async ({ page }) => {
    await login(page);

    await page.goto('/projects/30000000-0000-4000-8000-000000000002/summary');
    await expect(page.getByText('Sin gestión financiera', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Finanzas|Presupuesto/ })).toHaveCount(0);

    await page.goto('/projects/30000000-0000-4000-8000-000000000003/budget');
    await expect(page.getByRole('tab', { name: 'Presupuesto', exact: true })).toBeVisible();
    await expect(page.getByText('Solo planificación', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar movimiento' })).toHaveCount(0);

    await page.goto('/projects/30000000-0000-4000-8000-000000000004/budget');
    await expect(page.getByRole('tab', { name: 'Finanzas externas' })).toBeVisible();
    await expect(page.getByText('Odoo Institucional')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar movimiento' })).toHaveCount(0);
  });

  test('crea y elimina una tarea desde el workspace', async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${PROJECT_ID}/planning`);
    await page.getByRole('button', { name: 'Nueva actividad' }).click();

    const dialog = page.getByRole('dialog', { name: 'Nuevo elemento del plan' });
    await dialog.getByLabel('Tipo').selectOption('task');
    await dialog.getByLabel('Código').fill('UAT-UI-01');
    await dialog.getByLabel('Título').fill('Tarea temporal desde interfaz');
    await dialog.getByLabel('Inicio').fill('2026-10-01');
    await dialog.getByLabel('Fin').fill('2026-10-15');
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    const row = page.getByRole('row').filter({ hasText: 'Tarea temporal desde interfaz' });
    await expect(row).toBeVisible();
    page.once('dialog', (confirmation) => confirmation.accept());
    await row.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Tarea temporal desde interfaz')).toHaveCount(0);
  });
});
