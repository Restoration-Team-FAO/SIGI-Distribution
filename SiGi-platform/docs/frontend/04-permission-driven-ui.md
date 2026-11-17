# 04 — Permission Driven UI

## Fuente de autoridad

El backend continúa siendo la autoridad. El frontend usa `currentUser.permissions`, roles y contexto EGI únicamente para adaptar la experiencia y bloquear navegación tempranamente.

```text
backend: BearerAuthGuard + Roles/Permissions + scope de datos
frontend: catálogo + PermissionGate + acciones condicionadas
```

## Modelo de capacidad

```typescript
type UiCapability = {
  permissions?: string[];
  permissionMatch?: 'all' | 'any';
  roles?: string[];
  requireEgi?: boolean;
  configuration?: boolean;
};
```

Reglas:

- sin reglas explícitas: disponible para cualquier sesión válida;
- `all`: requiere todos los permisos;
- `any`: requiere al menos uno;
- roles se usan solo como equivalencia transitoria/administrativa;
- `superadmin` conserva bypass UI consistente con el comportamiento actual;
- `requireEgi` comprueba contexto, no autorización de datos.

## Permisos backend comprobados

| Dominio | Permisos existentes relevantes |
| --- | --- |
| Proyectos | `projects.read`, `projects.create`, `projects.update`, `projects.polygon.update` |
| Fuentes/imports | `sources.*`, `imports.read`, `imports.upload` |
| Conectores | `connectors.*` |
| Validación | `validations.read`, `validations.assign` |
| Publicación | `publications.read`, `publications.publish` |
| Archivos | `files.read/create/update/delete/download/share` |
| Reportes | `reports.read/create/edit/generate/review/approve/publish/export`, plantillas, mapeos, compromisos y contribuciones |
| Gobierno | `institutions.*`, `users.*`, `roles.*`, `permissions.read`, `audit.read`, `egi.memberships.manage` |

## Permisos UI no canónicos

Estos códigos aparecen en rutas de configuración pero no se encontraron como decoradores backend:

- `projects.configure`;
- `gis.configure`;
- `data.configure`;
- `monitoring.configure`;
- `reports.config.manage`.

Tratamiento: documentarlos como alias de UX, no asumir que conceden seguridad. Hasta que backend los formalice, las rutas deben aceptar únicamente roles administrativos explícitos o permisos backend equivalentes y cada operación seguirá protegida por su endpoint.

## Componentes de Fundación

- `canAccessCapability`: evaluación única para menú, rutas y controles.
- `PermissionGate`: renderiza contenido, fallback o estado “Sin permiso”.
- route guard: combina autenticación, EGI y capacidad.
- catálogo declarativo: metadata, navegación y reglas en una fuente.

Ejemplo:

```tsx
<PermissionGate capability={{ permissions: ['projects.update'] }}>
  <Button>Editar</Button>
</PermissionGate>
```

## Scope de datos

`projects.read` permite abrir el módulo; no implica leer todos los proyectos. El backend limita por EGI/institución/alcance y el frontend muestra el contexto efectivo. La vista global solo puede seleccionarse cuando `currentUser.canUseGlobalView` es verdadera.

## Respuesta UX

| Caso | Respuesta |
| --- | --- |
| sin sesión | redirección a login con `returnTo` seguro |
| sin EGI requerido | estado explicado + acción “Ir a mis espacios” |
| sin permiso | estado accesible “Sin permiso”; no renderizar página |
| endpoint devuelve 403 | conservar mensaje gobernado, no esconderlo como vacío |
| dato fuera de scope | backend filtra/niega; UI no intenta reconstruirlo |

## Pruebas mínimas

- menú oculto sin capacidad;
- URL directa muestra estado prohibido;
- read no muestra mutaciones;
- update muestra edición;
- administración aparece únicamente con capacidades adecuadas;
- backend continúa devolviendo 403 aunque se manipule la UI.
