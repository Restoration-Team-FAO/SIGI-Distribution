# 02 — Arquitectura de frontend único

> Documento histórico de la arquitectura de transición. La decisión vigente elimina el portal web anónimo; ver [18-public-frontend-retirement-result.md](18-public-frontend-retirement-result.md).

## Decisión

SIGI tendrá una sola aplicación autenticada. La administración es un conjunto de capacidades dentro de esa aplicación, no otro producto.

```text
sesión autenticada
  → identidad backend
  → permisos + roles + scope EGI
  → AppShell SIGI
  → navegación, rutas, acciones y datos permitidos
```

El portal público es una superficie anónima especial que comparte build, design system e infraestructura, pero no define la arquitectura del usuario autenticado.

## Contenedores objetivo

```text
frontend-admin (nombre físico transitorio)
├── AdministrationShell       acceso/login
├── AppShell                  toda experiencia autenticada
│   ├── TopBar
│   ├── PermissionDrivenNavigation
│   ├── Breadcrumbs
│   ├── ContextBar (EGI/scope)
│   └── Feature workspace
└── PublicShell               portal anónimo, layout especial
```

No se crearán shells por rol. Director, técnico, GIS, editor, validador, integrador y administrador comparten `AppShell`; cambia su conjunto efectivo de capacidades.

## Capas

| Capa | Responsabilidad |
| --- | --- |
| `app/` | bootstrap, router, providers, catálogo y permisos |
| `layouts/AppShell` | navegación y contexto común autenticado |
| `features/` | flujos por dominio y contenedores de ruta |
| `shared/` / `libs/ui` | presentacionales y estados reutilizables |
| `services/` | `workspaceApi` autenticada y `publicApi` anónima |
| backend | seguridad, scope, contratos y persistencia |

## Invariantes

- El frontend nunca amplía permisos recibidos del backend.
- Navegación y route guard consumen la misma definición declarativa.
- Un permiso funcional no implica scope global de datos.
- No se inventan endpoints o datos para completar una pantalla.
- Rutas actuales se preservan durante la migración mediante aliases/redirects.
- Los chunks administrativos no se cargan en navegación pública anónima.
- La eliminación de Country ocurre en una fase destructiva separada.

## Estado objetivo de datos

```text
workspaceApi
  Authorization: Bearer
  X-SIGI-EGI-ID cuando aplica
  respuestas ya limitadas por backend

publicApi
  sin bearer
  sin EGI
  endpoints/payloads publicables únicamente
```

## Evolución por features

La estructura existente se moverá gradualmente desde `pages/*.tsx` hacia `features/<dominio>`. Se prioriza extraer contenedores y presentacionales cuando una feature sea intervenida; no se hará un traslado masivo sin beneficio funcional.

## Decisiones diferidas

- cambio físico de nombre `frontend-admin` → `frontend-sigi`;
- retiro de `frontend-country`;
- librería de consultas/cache adicional;
- búsqueda global y “Mi trabajo”, ambos dependientes de agregación backend;
- Ask SIGI, pendiente de contrato, seguridad y trazabilidad.
