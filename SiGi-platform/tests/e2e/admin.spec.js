const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL = process.env.SIGI_E2E_ADMIN_EMAIL ?? 'superadmin@sigi.local';
const ADMIN_PASSWORD = process.env.SIGI_E2E_ADMIN_PASSWORD ?? 'superadmin-dev-token';
async function loginAsAdmin(page) {
  await page.goto('/administration');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión en SIGI' })).toBeVisible();
  await page.getByLabel('Correo').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('.sigi-nav__link[aria-current="page"]')).toHaveAttribute('aria-label', 'Inicio');
}

async function expandReportsNavigation(page) {
  await expect(page.getByRole('button', { name: 'Informes', exact: true })).toBeVisible();
}

test.describe('SIGI admin critical flow @admin', () => {
  test('legacy portal routes require authentication and resolve inside the unified workspace', async ({ page }) => {
    const privateRequests = [];
    page.on('request', (request) => {
      if (/\/api\/admin(\/|\?|$)/.test(request.url())) privateRequests.push(request.url());
    });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/administration\?returnTo=%2Fadmin$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión en SIGI' })).toBeVisible();
    expect(privateRequests).toEqual([]);

    await page.getByLabel('Correo').fill(ADMIN_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole('heading', { name: 'Proyectos', exact: true, level: 1 })).toBeVisible();
  });

  test('the access screen keeps the authenticated workspace private until login', async ({ page }) => {
    const workspaceRequests = [];
    const privateApiRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('WorkspaceApp')) workspaceRequests.push(request.url());
      if (/\/api\/(admin|auth\/me|egi)(\/|\?|$)/.test(request.url())) privateApiRequests.push(request.url());
    });

    await page.goto('/');
    await expect(page).toHaveURL(/\/administration\?returnTo=%2F$/);
    await expect(page.getByRole('heading', { name: 'Acceso al SIGI', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión en SIGI' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al portal público' })).toHaveCount(0);
    expect(workspaceRequests).toEqual([]);
    expect(privateApiRequests).toEqual([]);
  });

  test('login restores a protected deep link and logout returns to the access shell', async ({ page }) => {
    await page.goto('/admin/projects');
    await expect(page).toHaveURL(/\/administration\?returnTo=%2Fadmin%2Fprojects$/);
    await page.getByLabel('Correo').fill(ADMIN_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/projects$/);
    await expect(page.getByRole('heading', { name: 'Proyectos', exact: true, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();

    await expect(page).toHaveURL(/\/administration$/);
    await expect(page.getByRole('heading', { name: 'Acceso al SIGI', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  });

  test('project workspace tabs preserve the selected project as a reloadable deep link', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/projects');
    const projectId = await page.getByRole('region', { name: 'Filtros globales' })
      .getByLabel('Proyecto').locator('option').nth(1).getAttribute('value');
    expect(projectId).toBeTruthy();
    await page.goto(`/admin/projects?view=summary&projectId=${projectId}`);
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));

    const indicatorsLink = page.getByRole('tab', { name: 'Indicadores', exact: true });
    await expect(indicatorsLink).toHaveAttribute('href', `/projects/${projectId}/indicators`);
    await indicatorsLink.click();

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/indicators$`));
    await expect(page.getByRole('heading', { name: 'Indicadores', exact: true })).toBeVisible();
    const deepLink = page.url();

    await page.reload();
    await expect(page).toHaveURL(deepLink);
    await expect(page.getByRole('heading', { name: 'Indicadores', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Migas de pan' }).getByRole('link', { name: 'Proyectos' })).toHaveAttribute('href', '/projects');
  });

  test('project summary uses the responsive executive grid @admin', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/projects');
    await page.getByText('Ver proyecto →').first().click();

    const summaryLayout = page.locator('.project-summary-layout');
    const summaryFacts = page.locator('.project-summary-facts');
    const sectionGrid = page.locator('.project-section-grid');
    await expect(summaryLayout).toBeVisible();
    expect((await summaryLayout.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(2);
    expect((await summaryFacts.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(2);
    expect((await sectionGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(2);

    await page.setViewportSize({ width: 1024, height: 900 });
    expect((await summaryLayout.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(1);
    expect((await sectionGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(2);

    await page.setViewportSize({ width: 500, height: 900 });
    expect((await summaryFacts.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(1);
    expect((await sectionGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ').length).toBe(1);
  });

  test('project editing, actors and milestones use contextual drawers @admin', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsAdmin(page);
    await page.goto('/projects');
    await page.getByText('Ver proyecto →').first().click();

    const projectTitle = await page.locator('.project-header h1').innerText();
    await page.getByRole('button', { name: 'Editar proyecto' }).click();
    const projectDrawer = page.getByRole('dialog', { name: 'Editar proyecto' });
    await expect(projectDrawer).toBeVisible();
    await projectDrawer.getByLabel('Nombre').fill(projectTitle);
    await projectDrawer.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(projectDrawer).toBeHidden();

    await page.getByRole('tab', { name: 'Actores' }).click();
    const staleActor = page.getByText('Actor temporal E2E editado', { exact: true });
    if (await staleActor.count()) {
      const staleActorCard = staleActor.locator('xpath=ancestor::article');
      await staleActorCard.locator('summary').click();
      page.once('dialog', (dialog) => dialog.accept());
      await staleActorCard.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await expect(staleActor).toBeHidden();
    }
    await page.getByRole('button', { name: 'Agregar actor' }).click();
    const actorDrawer = page.getByRole('dialog', { name: 'Agregar actor' });
    await actorDrawer.getByLabel('Nombre visible').fill('Actor temporal E2E');
    await actorDrawer.getByLabel('Rol').fill('Validación UX');
    await actorDrawer.getByRole('button', { name: 'Agregar actor' }).click();
    await expect(page.getByText('Actor temporal E2E', { exact: true })).toBeVisible();

    const actorCard = page.getByText('Actor temporal E2E', { exact: true }).locator('xpath=ancestor::article');
    await actorCard.locator('summary').click();
    await actorCard.getByRole('button', { name: 'Editar', exact: true }).click();
    const actorEditDrawer = page.getByRole('dialog', { name: 'Editar actor' });
    await actorEditDrawer.getByLabel('Nombre visible').fill('Actor temporal E2E editado');
    await actorEditDrawer.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Actor temporal E2E editado', { exact: true })).toBeVisible();
    const editedActorCard = page.getByText('Actor temporal E2E editado', { exact: true }).locator('xpath=ancestor::article');
    const editedActorMenu = editedActorCard.locator('details');
    if (!(await editedActorMenu.evaluate((element) => element.hasAttribute('open')))) {
      await editedActorMenu.locator('summary').click();
    }
    page.once('dialog', (dialog) => dialog.accept());
    await editedActorCard.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page.getByText('Actor temporal E2E editado', { exact: true })).toBeHidden();

    await page.getByRole('tab', { name: 'Hitos' }).click();
    await page.getByRole('button', { name: 'Nuevo hito' }).click();
    const milestoneDrawer = page.getByRole('dialog', { name: 'Nuevo hito' });
    await milestoneDrawer.getByLabel('Título').fill('Hito temporal E2E');
    await milestoneDrawer.getByLabel('Avance %').fill('25');
    await milestoneDrawer.getByRole('button', { name: 'Crear hito' }).click();
    await expect(page.getByText('Hito temporal E2E', { exact: true })).toBeVisible();
    const milestoneCard = page.getByText('Hito temporal E2E', { exact: true }).locator('xpath=ancestor::article');
    await milestoneCard.locator('summary').click();
    page.once('dialog', (dialog) => dialog.accept());
    await milestoneCard.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page.getByText('Hito temporal E2E', { exact: true })).toBeHidden();
  });

  test('global project context is shareable and follows compatible modules', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/projects');

    const filters = page.getByRole('region', { name: 'Filtros globales' });
    const projectFilter = filters.getByLabel('Proyecto');
    await expect(projectFilter).toBeEnabled();
    const projectId = await projectFilter.locator('option').nth(1).getAttribute('value');
    expect(projectId).toBeTruthy();

    await projectFilter.selectOption(projectId);
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/geobi\\?projectId=${projectId}`));

    await page.reload();
    await expect(page.getByRole('region', { name: 'Filtros globales' }).getByLabel('Proyecto')).toHaveValue(projectId);
    await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));

    await page.getByRole('button', { name: 'Limpiar filtro' }).click();
    await expect(page).toHaveURL(/\/projects$/);

    await page.goto('/admin/reports/history');
    const reportProjectFilter = page.getByRole('region', { name: 'Filtros globales' }).getByLabel('Proyecto');
    await reportProjectFilter.selectOption(projectId);
    await expect(page).toHaveURL(new RegExp(`/admin/reports/history\\?projectId=${projectId}`));
    await page.reload();
    await expect(page.getByRole('region', { name: 'Filtros globales' }).getByLabel('Proyecto')).toHaveValue(projectId);
  });

  test('global search returns scoped entities and opens a real deep link', async ({ page }) => {
    await loginAsAdmin(page);

    const search = page.getByLabel('Buscar en SIGI');
    await search.fill('Restauración');
    const results = page.getByRole('listbox', { name: 'Resultados de búsqueda' });
    await expect(results.getByRole('region', { name: 'Proyectos' })).toBeVisible();
    await results.getByRole('option', { name: /Restauración del paisaje Osa/ }).click();

    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(page.getByRole('tab', { name: 'Resumen', exact: true })).toBeVisible();

    await page.getByLabel('Buscar en SIGI').fill('Hectáreas bajo restauración');
    const indicatorResults = page.getByRole('listbox', { name: 'Resultados de búsqueda' });
    await indicatorResults.getByRole('option', { name: /Hectáreas bajo restauración/ }).click();
    await expect(page).toHaveURL(/\/admin\/indicators\?view=detail&indicator=/);
    await expect(page.getByRole('heading', { name: 'Hectáreas bajo restauración', exact: true })).toBeVisible();

    await page.getByLabel('Buscar en SIGI').fill('Informe de avance NDC');
    const reportResults = page.getByRole('listbox', { name: 'Resultados de búsqueda' });
    await expect(reportResults.getByRole('region', { name: 'Informes' })).toBeVisible();
    await expect(reportResults.getByRole('option', { name: /Informe de avance NDC Costa Rica 2026/ })).toBeVisible();
    await page.getByLabel('Buscar en SIGI').press('Escape');

    await page.getByRole('button', { name: 'Vista global', exact: true }).click();
    await page.getByLabel('Buscar en SIGI').fill('Informe de avance');
    const globalResults = page.getByRole('listbox', { name: 'Resultados de búsqueda' });
    await expect(globalResults.getByText('Informes y documentos requieren volver al alcance «EGI activo».')).toBeVisible();
    await expect(globalResults.getByRole('region', { name: 'Informes' })).toHaveCount(0);
  });

  test('Ask SIGI returns governed evidence with reloadable authenticated sources', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/ask');

    await expect(page.getByRole('heading', { name: 'Ask SIGI', exact: true })).toBeVisible();
    await expect(page.getByText('Recuperación de evidencia · sin IA generativa externa')).toBeVisible();
    await page.getByRole('textbox', { name: 'Pregunta', exact: true }).fill('¿Qué información existe sobre restauración?');

    const responsePromise = page.waitForResponse((response) => response.url().includes('/api/admin/assistant/ask'));
    await page.getByRole('button', { name: 'Consultar SIGI' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.mode).toBe('evidence_retrieval');
    expect(body.data.evidenceStatus).toBe('supported');
    expect(body.data.citations.length).toBeGreaterThan(0);
    expect(body.data.citations.every((citation) => citation.path.startsWith('/admin/'))).toBe(true);

    await expect(page.getByRole('heading', { name: 'Información encontrada' })).toBeVisible();
    const firstSource = page.getByRole('region', { name: 'Fuentes citadas' }).getByRole('link').first();
    await expect(firstSource).toBeVisible();
    await firstSource.click();
    await expect(page).toHaveURL(/\/admin\//);
    await expect(page).not.toHaveURL(/\/admin\/ask$/);
  });

  test('superadmin can log in and reach critical modules', async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByRole('heading', { name: 'Mi trabajo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Disponibilidad de datos' })).toBeVisible();
    await expect(page.getByLabel('Indicadores navegables del EGI activo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'EGI activo' })).toBeVisible();

    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Roles' }).click();
    await expect(page).toHaveURL(/\/admin\/users\?view=roles$/);
    await expect(page.getByText('Catalogo de roles')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Catalogo de roles')).toBeVisible();

    await page.goto('/admin/sources');
    await expect(page.getByRole('heading', { name: 'Datos', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Caso operativo MAG / INTA' })).toBeVisible();

    await page.goto('/admin/files');
    await expect(page.getByRole('heading', { name: 'Datos', exact: true, level: 1 })).toBeVisible();

    await page.goto('/admin/geobi');
    await expect(page.getByRole('heading', { name: 'Mapa', exact: true }).first()).toBeVisible();
  });

  test('administration separates institutional governance from technical operation', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/administration');
    await expect(page.getByRole('heading', { name: 'Administración', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administración institucional' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administración técnica' })).toBeVisible();
    await expect(page.locator('.sigi-nav__link[aria-label="Administración"]')).toHaveCount(1);
    await expect(page.locator('.sigi-nav__link[aria-label="Instituciones"]')).toHaveCount(0);
    await expect(page.locator('.sigi-nav__link[aria-label="Usuarios"]')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Instituciones', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/institutions$/);
    await expect(page.getByRole('heading', { name: 'Administración', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Instituciones', exact: true })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: 'Auditoría', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(page.getByRole('heading', { name: 'Actividad reciente' })).toBeVisible();
  });

  test('data workspace preserves permission-driven tabs and deep links', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/data');
    await expect(page.getByRole('heading', { name: 'Datos', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acciones' })).toBeVisible();

    await page.getByRole('tab', { name: 'Importar', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/sources\?view=imports$/);
    await expect(page.getByRole('heading', { name: 'Carga de importación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Caso operativo MAG / INTA' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Pendientes', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/sources\?view=pending$/);
    await expect(page.getByRole('heading', { name: 'Filtros de lotes' })).toBeVisible();
    await page.getByLabel('Entidad').selectOption('projects');
    await page.getByLabel('Búsqueda').fill('batch');
    await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    await expect(page).toHaveURL(/view=history&entity=projects&q=batch/);
    await expect(page.getByLabel('Entidad')).toHaveValue('projects');
    await expect(page.getByLabel('Búsqueda')).toHaveValue('batch');
    const pendingDeepLink = page.url();
    await page.reload();
    await expect(page).toHaveURL(pendingDeepLink);
    await expect(page.getByRole('tab', { name: 'Historial', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Entidad')).toHaveValue('projects');
    await expect(page.getByLabel('Búsqueda')).toHaveValue('batch');
  });

  test('map workspace: unified viewer, legacy catalog links and analysis deep links', async ({ page }) => {
    await loginAsAdmin(page);
    const projectId = '00000000-0000-4000-8000-000000000003';
    await page.goto(`/admin/geobi?view=viewer&projectId=${projectId}`);

    // v2.1.0: el Catálogo se integró en el Visor; ya no hay pestaña propia.
    await expect(page.getByRole('region', { name: 'Visor del mapa' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'Catálogo', exact: true })).toHaveCount(0);
    await page.goto(`/admin/geobi?view=catalog&projectId=${projectId}`);
    await expect(page.getByRole('region', { name: 'Visor del mapa' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/geobi\\?view=analysis&projectId=${projectId}`));
    await expect(page.getByRole('heading', { name: 'Cruce de capas y estadísticas' })).toBeVisible();
    // Los paneles ejecutivos heredados quedan plegados tras un botón.
    await expect(page.getByRole('heading', { name: 'Análisis geoespacial' })).toHaveCount(0);
    await page.getByRole('button', { name: /Mostrar panel ejecutivo del módulo/ }).click();
    await expect(page.getByRole('heading', { name: 'Análisis geoespacial' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Análisis', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('indicator workspace preserves catalog, detail and map deep links', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/indicators?view=catalog');
    await expect(page.getByRole('heading', { name: 'Indicadores', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Catálogo de indicadores' })).toBeVisible();

    const firstDetail = page.getByRole('link', { name: 'Abrir ficha' }).first();
    if (await firstDetail.count()) {
      await firstDetail.click();
      await expect(page).toHaveURL(/\/admin\/indicators\?view=detail&indicator=/);
      const deepLink = page.url();
      await page.getByRole('tab', { name: 'Mapa', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Cobertura en mapa' })).toBeVisible();
      await page.goto(deepLink);
      await page.reload();
      await expect(page.getByRole('tab', { name: 'Ficha', exact: true })).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('superadmin can edit the active EGI information from Mis espacios', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/egi');

    await page.getByRole('button', { name: 'Editar información del EGI activo' }).click();
    await expect(page.getByText('Editar información del EGI', { exact: true })).toBeVisible();

    const responsible = page.getByLabel('Responsable del EGI');
    const originalValue = await responsible.inputValue();
    const updatedValue = `Responsable E2E ${Date.now()}`;
    await responsible.fill(updatedValue);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/se actualizó correctamente/)).toBeVisible();

    await page.getByRole('button', { name: 'Editar información del EGI activo' }).click();
    await expect(responsible).toHaveValue(updatedValue);
    await responsible.fill(originalValue);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/se actualizó correctamente/)).toBeVisible();
  });

  test('report template menu opens the selected workspace and wizard', async ({ page }) => {
    await loginAsAdmin(page);
    await expandReportsNavigation(page);

    await page.getByRole('button', { name: 'Informes', exact: true }).click();
    const nationalCard = page.locator('.reports-template-card').filter({ hasText: 'Acápite Nacional' });
    await nationalCard.getByRole('link', { name: 'Ver categoría' }).click();
    await expect(page).toHaveURL(/\/admin\/reports\/national$/);
    await expect(page.getByRole('heading', { name: 'Acápite Nacional', exact: true }).last()).toBeVisible();
    await expect(page.locator('.reports-template-card')).toHaveCount(1);
    await expect(page.locator('.reports-template-card')).toContainText('Acápite Nacional');
    await page.locator('.reports-template-card').getByRole('link', { name: 'Generar' }).click();
    await expect(page).toHaveURL(/\/admin\/reports\/new\?templateId=/);
    await expect(page.getByText('Generar informe · paso 1 de 8')).toBeVisible();
    await expect(page.getByLabel('Plantilla').locator('option:checked')).toHaveText('Acápite Nacional');
    await page.getByRole('button', { name: '×' }).click();

    const btrCard = page.locator('.reports-template-card').filter({ hasText: 'BTR' });
    await btrCard.getByRole('link', { name: 'Ver categoría' }).click();
    await expect(page).toHaveURL(/\/admin\/reports\/btr$/);
    await expect(page.getByRole('heading', { name: 'BTR', exact: true }).last()).toBeVisible();
    await expect(page.locator('.reports-template-card')).toHaveCount(1);
    await expect(page.locator('.reports-template-card')).toContainText('BTR');
  });

  test('empty scoped report history offers a governed creation path', async ({ page }) => {
    await loginAsAdmin(page);
    await expandReportsNavigation(page);
    await page.getByRole('button', { name: 'Informes', exact: true }).click();
    await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    await expect(page.getByText('0 resultado(s)')).toBeVisible();
    await expect(page.getByText('No hay informes que coincidan con esta vista.')).toBeVisible();
    await page.getByRole('link', { name: 'Generar informe' }).click();
    await expect(page.getByText('Generar informe · paso 1 de 8')).toBeVisible();
  });

  test('history menu opens a dedicated filterable report history', async ({ page }) => {
    await loginAsAdmin(page);
    await expandReportsNavigation(page);
    await page.getByRole('button', { name: 'Informes', exact: true }).click();
    await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/reports\/history$/);
    await expect(page.getByRole('heading', { name: 'Historial y versiones', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historial e instancias' })).toBeVisible();
    await expect(page.getByPlaceholder('Nombre, marco o versión')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plantillas de informes' })).toHaveCount(0);
    await page.getByPlaceholder('Nombre, marco o versión').fill('inexistente-r6');
    await expect(page.getByText('0 resultado(s)')).toBeVisible();
    await expect(page.getByText('No hay informes que coincidan con esta vista.')).toBeVisible();
  });

  test('reports workspace separates catalog, commitments and persistent history filters', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/reports');

    await expect(page.getByRole('heading', { name: 'Catálogo de informes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compromisos del país' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Compromisos', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/reports\/commitments$/);
    await expect(page.getByRole('heading', { name: 'Compromisos del país' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Catálogo de informes' })).toHaveCount(0);
    await page.getByLabel('Vista').selectOption('year');
    await page.getByLabel('Estado').selectOption('OPEN');
    await expect(page).toHaveURL(/calendarView=year&commitmentStatus=OPEN/);
    const commitmentDeepLink = page.url();
    await page.reload();
    await expect(page).toHaveURL(commitmentDeepLink);
    await expect(page.getByLabel('Vista')).toHaveValue('year');
    await expect(page.getByLabel('Estado')).toHaveValue('OPEN');

    await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    await page.getByPlaceholder('Nombre, marco o versión').fill('búsqueda persistente');
    await expect(page).toHaveURL(/q=b%/);
    const historyDeepLink = page.url();
    await page.reload();
    await expect(page).toHaveURL(historyDeepLink);
    await expect(page.getByPlaceholder('Nombre, marco o versión')).toHaveValue('búsqueda persistente');
  });

  test('Home 360 deep links preserve operational filters', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole('link', { name: /Compromisos próximos o vencidos/ }).click();
    await expect(page).toHaveURL(/\/admin\/reports\/commitments\?/);
    await expect(page).toHaveURL(/commitmentUrgency=due/);
    await expect(page.getByLabel('Urgencia')).toHaveValue('due');

    await page.goto('/admin');
    await page.getByRole('link', { name: /Fuentes desactualizadas/ }).click();
    await expect(page).toHaveURL(/freshness=stale/);
    await expect(page.getByRole('heading', { name: 'Inventario de fuentes' })).toBeVisible();
  });

  test('route catalog drives navigation, aliases, metadata and the 404 boundary', async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByRole('button', { name: 'Resumen regional' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Datos', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/data$/);
    await expect(page.getByRole('heading', { name: 'Datos', exact: true, level: 1 })).toBeVisible();
    await page.goto('/admin/modules');
    await expect(page.getByText('Modulos activos', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('navigation', { name: 'Migas de pan' })).toContainText('Estado de módulos');
    await page.getByRole('navigation', { name: 'Migas de pan' }).getByRole('button', { name: 'Inicio' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/admin/ayuda');
    await expect(page.getByRole('heading', { name: 'Inicio del centro', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Migas de pan' })).toContainText('Centro de Ayuda');

    await page.goto('/admin/ruta-inexistente');
    await expect(page.getByRole('heading', { name: 'Página no encontrada', exact: true }).last()).toBeVisible();
    await expect(page.getByText('Error 404')).toBeVisible();
  });

  test('operational users do not see or open project configuration', async ({ page }) => {
    await page.goto('/administration');
    await page.getByLabel('Correo').fill('reader@sigi.local');
    await page.getByLabel('Contraseña', { exact: true }).fill('reader-dev-token');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.locator('.sigi-nav__link[aria-current="page"]')).toHaveAttribute('aria-label', 'Inicio');

    await page.goto('/admin/projects');
    await expect(page.getByRole('heading', { name: 'Proyectos', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vista pública' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Configuración/ })).toHaveCount(0);

    await page.goto('/admin/projects/config');
    await expect(page.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();

    await page.goto('/admin/administration');
    await expect(page.getByRole('heading', { name: 'Administración', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Instituciones', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Usuarios y roles', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Publicaciones', exact: true })).toBeVisible();

    await page.goto('/admin/institutions');
    await expect(page.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();
  });

  test('data operation remains available without exposing technical configuration', async ({ page }) => {
    await page.goto('/administration');
    await page.getByLabel('Correo').fill('validator@sigi.local');
    await page.getByLabel('Contraseña', { exact: true }).fill('validator-dev-token');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.locator('.sigi-nav__link[aria-current="page"]')).toHaveAttribute('aria-label', 'Inicio');

    await page.goto('/admin/data');
    await expect(page.getByRole('heading', { name: 'Datos', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Calidad', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Configuración/ })).toHaveCount(0);

    await page.goto('/admin/data/config');
    await expect(page.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();

    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: 'Informes', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Configuración/ })).toHaveCount(0);
    await page.goto('/admin/reports/config');
    await expect(page.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();
  });
});
