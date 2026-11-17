import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the application requires a session outside the login route', async () => {
  const app = await read('apps/frontend-sigi/src/App.tsx');
  assert.match(app, /!sessionToken && !isAdministrationRoute/);
  assert.doesNotMatch(app, /<PublicShell/);
  assert.doesNotMatch(app, /<PublicRouter/);
  assert.match(app, /'\/dashboard': '\/admin'/);
  assert.match(app, /value === '\/projects'/);
  assert.doesNotMatch(app, /'\/projects': '\/admin\/projects'/);
});

test('production deploys one frontend and redirects the legacy domain', async () => {
  const compose = await read('docker-compose.prod.yml');
  const localCompose = await read('docker-compose.yml');
  const demoCompose = await read('demo/docker-compose.demo.yml');
  const caddy = await read('infra/caddy/Caddyfile');
  assert.doesNotMatch(compose, /^  frontend-country:/m);
  assert.doesNotMatch(localCompose, /^  frontend-country:/m);
  assert.doesNotMatch(demoCompose, /^  frontend-country:/m);
  assert.match(compose, /^  frontend-sigi:/m);
  assert.doesNotMatch(caddy, /reverse_proxy frontend-country/);
  assert.match(caddy, /redir https:\/\/\{\$SIGI_ADMIN_DOMAIN\}\{uri\} permanent/);
});

test('retired anonymous frontend sources are absent', async () => {
  const retiredPaths = [
    'apps/frontend-country/package.json',
    'apps/frontend-sigi/src/app/PublicShell.tsx',
    'apps/frontend-sigi/src/app/PublicRouter.tsx',
    'apps/frontend-sigi/src/features/public/services/public-api.ts',
  ];

  for (const path of retiredPaths) {
    await assert.rejects(access(new URL(`../../${path}`, import.meta.url)));
  }
});

test('sidebar preference is persistent and mobile keeps a drawer boundary', async () => {
  const shell = await read('apps/frontend-sigi/src/app/AppShell.tsx');
  const preference = await read('apps/frontend-sigi/src/app/sidebar-preference.ts');
  const styles = await read('apps/frontend-sigi/src/styles.css');
  assert.match(shell, /readSidebarPreference/);
  assert.match(shell, /writeSidebarPreference\(collapsed\)/);
  assert.match(preference, /localStorage\.setItem/);
  assert.match(preference, /max-width: 720px/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /sigi-sidebar--mobile-open/);
});
