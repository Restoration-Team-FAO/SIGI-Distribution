const { test, expect } = require('@playwright/test');

async function expectInsideViewport(page, locator, fullyVisible = true) {
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  if (fullyVisible) {
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  return box;
}

test('admin login remains usable at the release viewport @admin', async ({
  page,
}) => {
  await page.goto('/administration');

  const heading = page.getByRole('heading', { name: 'Iniciar sesión en SIGI' });
  const email = page.getByLabel('Correo');
  const password = page.getByLabel('Contraseña', { exact: true });
  const submit = page.getByRole('button', { name: 'Iniciar sesión', exact: true });

  const headingBox = await expectInsideViewport(page, heading);
  const emailBox = await expectInsideViewport(page, email);
  const passwordBox = await expectInsideViewport(page, password);
  const submitBox = await expectInsideViewport(page, submit);
  expect(headingBox.y).toBeLessThan(emailBox.y);
  expect(emailBox.y + emailBox.height).toBeLessThanOrEqual(passwordBox.y);
  expect(passwordBox.y + passwordBox.height).toBeLessThanOrEqual(submitBox.y);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
