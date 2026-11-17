import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Vista de acceso — recomendaciones de UX (docs/assessments/recomendacion inicio.docx, 2026-10-14).
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const page = read('apps/frontend-sigi/src/pages/AdministrationPage.tsx');
const shell = read('apps/frontend-sigi/src/app/AdministrationShell.tsx');
const app = read('apps/frontend-sigi/src/App.tsx');
const styles = read('apps/frontend-sigi/src/styles.css');

test('one name for the action and Spanish-only copy', () => {
  assert.match(page, /Iniciar sesión en SIGI/);
  assert.match(page, />\s*\{props\.isAuthenticating \? 'Ingresando…' : 'Iniciar sesión'\}/);
  assert.match(page, />Contraseña</);
  for (const source of [page, shell]) {
    assert.doesNotMatch(source, /Abrir consola|Consola SIGI|Acceso al espacio de trabajo|>Password</);
  }
  assert.doesNotMatch(shell, /El acceso se determina por sesión, permisos y EGI/);
});

test('form offers reveal, caps-lock warning, recovery help and a busy state', () => {
  assert.match(page, /aria-label=\{showPassword \? 'Ocultar contraseña' : 'Mostrar contraseña'\}/);
  assert.match(page, /getModifierState\?\.\('CapsLock'\)/);
  assert.match(page, /Bloq Mayús está activado/);
  assert.match(page, /¿Olvidaste tu contraseña\?/);
  assert.match(page, /disabled=\{props\.isAuthenticating\} aria-busy=\{props\.isAuthenticating\}/);
  assert.match(page, /role="alert"/);
});

test('technical login errors are translated before reaching the user', () => {
  assert.match(page, /export function describeLoginError/);
  assert.match(page, /'Correo o contraseña incorrectos\.'/);
  assert.match(page, /No se pudo conectar con el servidor/);
  assert.match(page, /Demasiados intentos en poco tiempo/);
  assert.match(app, /setLoginError\(describeLoginError\(reason\)\)/);
  // Un intento fallido (401) no debe mostrarse como "sesión expirada".
  assert.match(app, /if \(!isAdministrationRoute\) \{\s*setAuthNotice/);
});

test('footer shows support contact and version; styles fix Chrome autofill and button states', () => {
  assert.match(shell, /¿Necesitas ayuda\?/);
  assert.match(shell, /SIGI_VERSION_LABEL/);
  assert.match(styles, /\.sigi-access-shell \.sigi-auth__input:-webkit-autofill/);
  assert.match(styles, /\.sigi-access-shell \.sigi-auth__button:disabled/);
  assert.match(styles, /\.sigi-access-shell \.sigi-auth__button:focus-visible/);
  assert.match(styles, /url\('\/brand\/access-contours\.svg'\)/);
  assert.match(read('docker-compose.prod.yml'), /VITE_SIGI_SUPPORT_EMAIL: \$\{VITE_SIGI_SUPPORT_EMAIL:-\}/);
});
