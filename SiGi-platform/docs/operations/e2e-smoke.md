# SIGI E2E Smoke

## Objetivo

Verificar con un navegador real el frontend autenticado único y sus recorridos críticos por permisos.

## Precondiciones

- Stack levantado.
- `frontend-sigi` accesible en `http://127.0.0.1:5174`.

## Instalación

```bash
npm run test:e2e:install
```

## Ejecución

```bash
npm run test:e2e
```

## Variables opcionales

```bash
SIGI_E2E_URL=http://127.0.0.1:5174
SIGI_E2E_ADMIN_EMAIL=superadmin@sigi.local
SIGI_E2E_ADMIN_PASSWORD=<admin-password>
```

## Cobertura actual

- login real de superadmin;
- acceso a usuarios/roles;
- acceso a fuentes;
- acceso a explorador documental;
- acceso a Geo/BI;
- navegación contextual, filtros, búsqueda y Ask SIGI;
- aislamiento de configuración y rutas según permisos;
- comportamiento responsive del AppShell.

## Siguiente expansión sugerida

- flujos EGI explícitos y validación de vista global;
- prueba de creación/edición de usuario en UI;
- prueba de carga documental o importación controlada;
- validación visual de mensajes de error y estados de interoperabilidad.
