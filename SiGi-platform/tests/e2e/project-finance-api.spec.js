const { test, expect } = require('@playwright/test');

const API = process.env.SIGI_E2E_API_URL ?? 'http://127.0.0.1:3200/api';
const IDS = {
  execution: '30000000-0000-4000-8000-000000000001',
  none: '30000000-0000-4000-8000-000000000002',
  planning: '30000000-0000-4000-8000-000000000003',
  external: '30000000-0000-4000-8000-000000000004',
};

async function login(request, email = 'superadmin@sigi.local', password = 'superadmin-dev-token') {
  const response = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.accessToken;
}

function headers(token) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('Reglas financieras de proyectos @admin', () => {
  test('none conserva null y rechaza partidas; planning y external rechazan movimientos', async ({ request }) => {
    const token = await login(request);
    const noneDetail = await request.get(`${API}/admin/projects/${IDS.none}`, { headers: headers(token) });
    expect(noneDetail.ok()).toBeTruthy();
    const none = (await noneDetail.json()).data;
    expect(none.financialSettings.mode).toBe('none');
    expect(none.financialSummary.currentBudget).toBeNull();
    expect(none.financialSummary.executed).toBeNull();

    const line = { code: 'REJECT-NONE', category: 'Prueba', name: 'No debe persistir', currency: 'USD', plannedAmount: 1 };
    expect((await request.post(`${API}/admin/projects/${IDS.none}/budget-items`, { headers: headers(token), data: line })).status()).toBe(400);
    const movement = { movementType: 'payment', movementDate: '2026-10-01', amount: 1, currency: 'USD', exchangeRate: 1, concept: 'No permitido', status: 'approved' };
    expect((await request.post(`${API}/admin/projects/${IDS.planning}/financial-movements`, { headers: headers(token), data: movement })).status()).toBe(400);
    expect((await request.post(`${API}/admin/projects/${IDS.external}/financial-movements`, { headers: headers(token), data: movement })).status()).toBe(400);
  });

  test('execution rechaza sobrecompromiso y cambio de modo sin confirmación', async ({ request }) => {
    const token = await login(request);
    const detailResponse = await request.get(`${API}/admin/projects/${IDS.execution}`, { headers: headers(token) });
    const detail = (await detailResponse.json()).data;
    const movement = {
      budgetItemId: detail.budgetItems[0].id,
      movementType: 'commitment',
      budgetEffect: 'neutral',
      movementDate: '2026-10-01',
      amount: 999999999,
      currency: 'USD',
      exchangeRate: 1,
      concept: 'Sobrecompromiso de prueba',
      status: 'approved',
    };
    expect((await request.post(`${API}/admin/projects/${IDS.execution}/financial-movements`, { headers: headers(token), data: movement })).status()).toBe(400);
    const constrainedLine = detail.budgetItems.find((item) => item.code === 'OSA-P02');
    expect(constrainedLine).toBeTruthy();
    expect((await request.post(`${API}/admin/projects/${IDS.execution}/financial-movements`, {
      headers: headers(token),
      data: { ...movement, budgetItemId: constrainedLine.id, amount: 100000, concept: 'Sobrecompromiso de partida' },
    })).status()).toBe(400);
    expect((await request.patch(`${API}/admin/projects/${IDS.execution}/financial-settings`, { headers: headers(token), data: { mode: 'none', acknowledgeExistingData: false } })).status()).toBe(400);
  });

  test('backend niega escrituras financieras sin permiso y el cierre exige advertencias', async ({ request }) => {
    const reader = await login(request, 'reader@sigi.local', 'reader-dev-token');
    expect((await request.post(`${API}/admin/projects/${IDS.planning}/budget-items`, { headers: headers(reader), data: { code: 'NO-PERM', category: 'Prueba', name: 'No permitido', currency: 'USD', plannedAmount: 1 } })).status()).toBe(403);

    const admin = await login(request);
    const close = await request.post(`${API}/admin/projects/${IDS.execution}/close`, {
      headers: headers(admin),
      data: { actualEndDate: '2026-10-01', closureSummary: 'Cierre de prueba', lessonsLearned: 'Prueba', acknowledgePending: false },
    });
    expect(close.status()).toBe(400);
  });
});
