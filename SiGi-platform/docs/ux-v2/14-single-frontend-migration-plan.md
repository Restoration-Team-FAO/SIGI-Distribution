# Plan de migración hacia un frontend único

## Objetivo

Consolidar las rutas públicas y administrativas en una sola aplicación sin perder funciones, permisos, aislamiento EGI, URLs, endpoints ni capacidad de rollback.

## Estado inicial

| Elemento | Estado actual | Acción prevista |
| --- | --- | --- |
| `apps/frontend-country` | SPA pública independiente | Mantener durante migración; retirar al final |
| `apps/frontend-admin` | SPA autenticada y anfitrión UX V2 | Convertir en anfitrión único |
| `libs/ui` | Tokens y primitivas compartidas | Mantener como base visual |
| API pública | Contratos separados de Admin | Conservar |
| API Admin | Auth, permisos y EGI | Conservar |
| URLs públicas | 13 rutas | Montar sin cambios en anfitrión único |
| URLs Admin | rutas `/admin/*` | Conservar sin cambios |
| Docker Country/Admin | dos imágenes | Mantener hasta cutover; luego una imagen |

## Inventario de convergencia

| Dominio | Implementación pública actual | Implementación operativa actual | Fuente objetivo |
| --- | --- | --- | --- |
| Dashboard | `DashboardPage` | `AdminHomePage` | Contenedores distintos; KPIs/cards compartidos |
| Territorio | `TerritoryPage` | GIS, BI y proyectos | Componente territorial compartido; datos según audiencia |
| Proyectos | `ProjectsPage` | `ProjectsModulePage` | Workspace único con modo público/operativo |
| GIS | `GeoBiPage` | `GeoBiModulePage` | Componentes de mapa/catálogo compartidos; acciones por capacidad |
| Indicadores | `IndicatorsPage` | BI/proyectos | Visualizaciones compartidas, consultas separadas |
| Calidad | `QualityPage` | `ValidationsPage` | Resumen público separado de bandeja operativa |
| Integraciones | `IntegrationsPage` | Sources/Kobo/Odoo/Connectors | Público informativo; operación protegida |
| Incidentes | `IncidentsPage` | Validaciones/módulos | Listas compartidas, campos filtrados por API |
| Reportes | `ReportsPage` | `ReportsModulePage` | Catálogo público + workflow protegido |
| Documentos | `DocumentsPage` | `FilesExplorerPage` | Visor público + explorador protegido |
| Administración | `AdministrationInfoPage` | EGI/usuarios/instituciones/audit | Landing pública + rutas protegidas |

## Estructura objetivo de código

Durante la migración se conserva `apps/frontend-admin` como anfitrión:

```text
apps/frontend-admin/src/
├── app/
│   ├── route-catalog.ts
│   ├── PublicShell.tsx
│   ├── WorkspaceShell.tsx
│   └── AppRouter.tsx
├── features/
│   ├── dashboard/
│   ├── projects/
│   ├── territory/
│   ├── gis/
│   ├── monitoring/
│   ├── data/
│   ├── reports/
│   └── documents/
├── public-pages/
├── admin-pages/
├── contexts/
└── services/
```

No se moverán todos los archivos de una vez. Cada dominio se extraerá detrás de exports estables y se verificará antes de eliminar su implementación anterior.

## Olas de implementación

### SF-0 — Preparación documental

Entregables:

- ADR de frontend único;
- matriz de permisos;
- inventario de convergencia;
- estrategia de rutas, pruebas y rollback.

Gate: solo documentación; baseline y runtime sin cambios.

### SF-1 — Catálogo único de rutas y capacidades

1. Crear metadata única para rutas públicas y privadas.
2. Derivar navegación, breadcrumbs y búsqueda desde el catálogo.
3. Mantener los mismos componentes de página.
4. Agregar ruta 404 real.
5. Probar visibilidad por rol.

Gate:

- todas las rutas actuales abren;
- navegación no presenta destinos no autorizados;
- deep links sobreviven login y refresh;
- cero cambios en contratos API.

Rollback: revertir el commit del catálogo; routers actuales permanecen disponibles.

### SF-2 — Shell público dentro del anfitrión único

1. Incorporar `PublicShell` en `frontend-admin`.
2. Montar `/dashboard` y `/territory` con sus APIs públicas.
3. Resolver `/` según sesión sin redirecciones inesperadas.
4. Mantener Country ejecutándose como comparación.

Gate:

- dashboard y territorio tienen paridad visual/funcional;
- usuario anónimo no dispara endpoints Admin;
- Lighthouse/accesibilidad sin regresión material;
- URLs públicas funcionan en refresh directo.

Rollback: el host Country sigue activo y conserva tráfico público.

### SF-3 — Proyectos y GIS

1. Extraer componentes presentacionales comunes.
2. Montar proyectos públicos y operativos en el mismo dominio de features.
3. Montar GIS público y operativo con fuentes de datos separadas.
4. Agregar `Vista pública` desde proyecto/capa cuando corresponda.

Gate:

- crear/editar proyecto continúa funcionando;
- deep link público `projectId` funciona;
- catálogo → búsqueda → selección → ficha → export pasa en ambos modos;
- capa interna nunca aparece como anónima;
- screenshots comparativos aprobados.

### SF-4 — Monitoreo, datos, reportes y documentos

Migrar por dominio, en commits independientes:

1. indicadores/calidad/incidentes;
2. integraciones públicas y operación de fuentes;
3. reportes publicados y workflow administrativo;
4. documentos públicos y explorador protegido.

Gate por dominio: paridad de lectura, acciones, permisos, estados y resultados.

### SF-5 — Navegación unificada y cutover controlado

1. Activar el artefacto único en el host público de validación.
2. Configurar redirects/proxy del host Country.
3. Ejecutar E2E contra ambos hosts.
4. Observar logs, errores JS, 401/403/5xx y rendimiento.
5. Mantener rollback inmediato a la imagen Country anterior.

Gate:

- suite completa verde;
- smoke de roles verde;
- validación manual de usuarios clave;
- aprobación explícita del cutover.

### SF-6 — Retiro de `frontend-country`

Solo después del gate SF-5:

1. etiquetar la última imagen Country;
2. documentar rollback y fecha de retención;
3. eliminar el servicio del compose en un commit aislado;
4. retirar código duplicado no importado;
5. actualizar CI, Docker y documentación;
6. no borrar historial Git.

## Estrategia de componentes

Separar siempre:

```text
contenedor de datos público ─┐
                            ├─ componente presentacional compartido
contenedor autenticado ─────┘
```

No introducir condicionales de permisos dentro de cada átomo visual. Las capacidades se resuelven en route/page containers y se pasan como acciones explícitas.

Ejemplo conceptual:

```tsx
<ProjectWorkspace
  project={project}
  capabilities={{
    edit: hasPermission(user, 'projects.update'),
    publish: hasPermission(user, 'publications.publish'),
    viewAudit: hasPermission(user, 'audit.read'),
  }}
/>
```

## Preparación de servicios

Crear una fachada que mantenga dos clientes explícitos:

- `publicApi`: nunca adjunta bearer token ni EGI y solo llama endpoints públicos;
- `workspaceApi`: adjunta sesión, `X-SIGI-EGI-ID` y maneja refresh/401.

No seleccionar el cliente mediante un booleano genérico dentro de una función. El import debe dejar clara la superficie utilizada.

## Plan de pruebas

### Automatizadas

- rutas públicas anónimas;
- rutas protegidas por cada perfil de referencia;
- navegación derivada del catálogo;
- login, refresh y logout;
- cambio y aislamiento de EGI;
- `403` de endpoints mutables;
- visibilidad pública de proyectos, capas, reportes y archivos;
- deep links y refresh directo;
- responsive y landmarks accesibles;
- bundles públicos sin secretos ni configuración sensible.

### Comparación obligatoria

```text
frontend-country actual
vs
ruta pública en frontend único
```

Comparar datos, acciones, estados, screenshots y requests de red.

### Métricas de cutover

- tasa de errores JavaScript;
- respuestas 401/403 inesperadas;
- respuestas 5xx;
- tiempo de carga de rutas públicas;
- tamaño de chunks públicos;
- éxito de login y selección EGI;
- errores de GeoServer/mapas;
- descargas y exportaciones.

## Checklist previo a cualquier cambio funcional

- [ ] Confirmar baseline y commit de la rama UX.
- [ ] Working trees limpios.
- [ ] Exportar inventario actualizado de rutas.
- [ ] Congelar lista de E2E y smokes obligatorios.
- [ ] Definir host único de validación y puertos temporales.
- [ ] Confirmar política de `/` con y sin sesión.
- [ ] Confirmar política de logout.
- [ ] Confirmar retención del host Country durante migración.
- [ ] Registrar owners de aprobación funcional por dominio.
- [ ] No modificar backend salvo brecha de seguridad demostrada.

## Definition of Done

- un artefacto sirve vistas públicas y autenticadas;
- navegación depende de capacidades reales;
- rutas existentes continúan funcionando;
- no hay duplicación funcional activa entre aplicaciones;
- endpoints públicos y Admin permanecen separados;
- EGI y permisos mantienen aislamiento;
- todas las pruebas y gates están verdes;
- rollback está probado;
- retiro de Country fue aprobado explícitamente.
