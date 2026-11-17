# Matriz de pantallas y capacidades por permiso

## Leyenda

| Código | Significado |
| --- | --- |
| `P` | Vista pública con datos publicados |
| `R` | Lectura autenticada dentro del alcance autorizado |
| `O` | Operación o mutación autorizada |
| `C` | Configuración del módulo |
| `A` | Administración transversal |
| `—` | No visible o acceso denegado |

Los valores describen la experiencia objetivo. Cada operación sigue condicionada por el permiso concreto del backend; pertenecer a una categoría de usuario no sustituye ese permiso.

## Perfiles de referencia

| Perfil | Roles representativos | Alcance habitual |
| --- | --- | --- |
| Anónimo | ninguno | Solo información pública |
| Lector | `read_consumer`, `egi_viewer` | Lectura del EGI accesible |
| Validador | `technical_validator`, `egi_validator` | Calidad, revisión y reportes |
| Editor institucional | `institution_editor`, `egi_editor` | Proyectos, datos, archivos y reportes del EGI |
| Integración técnica | `technical_integration` | Fuentes, conectores, imports y GIS |
| Administrador nacional | `national_admin`, `egi_admin` | Operación amplia y configuración autorizada |
| Superadmin | `superadmin`, `egi_owner` cuando aplica | Gobierno global y configuración completa |

## Visibilidad por pantalla

| Dominio/pantalla | Anónimo | Lector | Validador | Editor | Integración | Admin nacional | Superadmin | Regla principal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Dashboard público | P | P | P | P | P | P | P | endpoints públicos |
| Inicio operativo | — | R | R | R | R | R | R | sesión válida + EGI cuando corresponda |
| Territorio público | P | P | P | P | P | P | P | geometría publicable |
| Proyectos publicados | P | P | P | P | P | P | P | endpoint público de proyectos |
| Proyectos del EGI | — | R | R si tiene grant | O | O | O | O | `projects.read/create/update` |
| GIS público | P | P | P | P | P | P | P | capas públicas |
| GIS operativo | — | — o R | R | R | O | O | O | permisos Geo/BI + acciones específicas |
| Catálogo/configuración GIS | — | — | — | — | O según grant | C | C | `imports.upload`, `publications.publish`, `gis.configure` |
| Indicadores públicos | P | P | P | P | P | P | P | endpoint público de indicadores |
| Monitoreo/validaciones | — | — | O | R según grant | R según grant | O/C | O/C | `validations.read/assign` |
| Calidad pública | P | P | P | P | P | P | P | solo señal publicable |
| Fuentes e importaciones | — | — | R si tiene grant | O | O | O | O | `sources.*`, `imports.*` |
| Configuración de Datos | — | — | — | según grant | C | C | C | `sources.update`, `connectors.update/run` |
| Kobo/Odoo técnico | — | — | — | según grant | O/C | O/C | O/C | permisos de fuentes, imports y conectores |
| Reportes publicados | P | P | P | P | P | P | P | endpoint público de reportes |
| Reportes del EGI | — | R | O revisión | O edición | R/generación según grant | O | O | permisos de workflow de reportes |
| Plantillas/mapeos/programación | — | — | — | — | según grant | C según grant | C | permisos `*.manage` |
| Documentos públicos | P | P | P | P | P | P | P | archivos autorizados como públicos |
| Explorador documental | — | R | R | O | O según grant | O | O | permisos `files.*` |
| Publicaciones | — | R | R | R | O según grant | O | O | `publications.read/publish` |
| EGI y membresías | — | R propio | R propio | R propio | R propio | A | A | permisos EGI y membresía |
| Instituciones | — | — | — | R según grant | R según grant | A | A | `institutions.*` |
| Usuarios y roles | — | — | — | — | — | A según grant | A | `users.*`, `roles.*` |
| Auditoría | — | — | R según grant | R según grant | R según grant | A | A | `audit.read` |
| Configuración global | — | — | — | — | — | según permiso | A | permisos explícitos |

## Capacidades transversales

| Capacidad | Condición frontend | Condición backend |
| --- | --- | --- |
| Ver navegación | Sesión/permiso compatible | No aplica como frontera de seguridad |
| Abrir ruta protegida | Route gate | Bearer token y autorización del endpoint |
| Seleccionar EGI | Espacios accesibles | Membresía o rol global válido |
| Vista global | Control visible para rol global | Política `resolveOperationalEgi` |
| Crear/editar | Botón visible con permiso | `@Permissions` y validación de alcance |
| Configurar | `⚙ Configuración` solo autorizado | permiso `configure/manage` o equivalente |
| Publicar | Acción visible en estado válido | `publications.publish` o `reports.publish` |
| Vista previa pública | Acción desde entidad publicable | serialización/endpoint público |
| Descargar/exportar | Acción visible por permiso | permiso de exportación/descarga |

## Navegación resultante

La navegación se construirá a partir de un catálogo único de rutas con metadatos:

```ts
type RouteCapability = {
  path: string;
  audience: 'public' | 'authenticated';
  requiredPermissions?: string[];
  requiredRoles?: string[];
  requireEgi?: boolean;
  navigationDomain: string;
  configuration?: boolean;
};
```

El catálogo alimentará router, sidebar, breadcrumbs y búsqueda. No se mantendrán listas independientes con reglas divergentes.

## Casos obligatorios de prueba

1. Anónimo ve únicamente rutas y payloads públicos.
2. Lector puede abrir lectura autorizada y no ve acciones mutables.
3. Editor opera su EGI y no accede a configuración sin grant.
4. Validador accede a casos y acciones de revisión, no a administración.
5. Integración opera conectores/imports autorizados sin administrar usuarios.
6. Admin ve configuración permitida, pero los límites del backend siguen aplicando.
7. Superadmin mantiene cobertura completa.
8. URL directa no autorizada produce estado restringido en UI y `403` en API.
9. Cambiar EGI no mezcla datos ni conserva selecciones inválidas.
10. Logout elimina capacidades privadas sin recargar información sensible.
