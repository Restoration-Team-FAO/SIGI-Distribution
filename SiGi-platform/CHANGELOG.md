# Changelog

Todas las versiones del SIGI siguen [SemVer](https://semver.org/lang/es/) según [docs/VERSIONING.md](docs/VERSIONING.md).
La fuente única de la versión es el archivo `VERSION`.

## [2.1.3] — 2026-10-15

Rediseño de la vista de inicio de sesión según `docs/assessments/recomendacion inicio.docx` (14 oct 2026).

### Cambiado
- **Un solo nombre y un solo idioma.** Título "Iniciar sesión en SIGI", botón "Iniciar sesión" y "Contraseña" en lugar de "Password". Se quitaron el enlace redundante del encabezado y el texto interno del pie ("El acceso se determina por sesión, permisos y EGI").
- **Columna izquierda con identidad.** Panel con curvas de nivel ilustrativas y una frase sobre qué hace el SIGI, sin repetir el título.
- **Marca.** La tarjeta muestra el logo oficial horizontal con el nombre completo ("Sistema Integrado de Gestión de la Información").
- **Pie de página.** Muestra el contacto de soporte, la institución y la versión. Se configuran por instancia con `VITE_SIGI_INSTITUTION_NAME`, `VITE_SIGI_SUPPORT_EMAIL` y `VITE_SIGI_SUPPORT_LABEL`.

### Añadido
- Botón para mostrar u ocultar la contraseña.
- Aviso de Bloq Mayús activado.
- "¿Olvidaste tu contraseña?", que indica cómo contactar a soporte.
- Estado de carga "Ingresando…" con el botón deshabilitado.
- Errores claros en español arriba del formulario: credenciales incorrectas, demasiados intentos, cuenta inactiva y sin conexión.

### Corregido
- Un intento fallido ya no se muestra como "sesión expirada".
- Se neutralizó el fondo celeste que pone el autocompletado de Chrome.
- Las etiquetas son más legibles y el botón tiene estados de hover, foco, presionado y deshabilitado.

### Pendiente
- La recuperación de contraseña por autoservicio requiere un servicio de correo en el backend; hoy el enlace remite a soporte.
- "Mantener sesión iniciada" y el inicio de sesión institucional (SSO) quedan sujetos a la política de la institución.

## [2.1.2] — 2026-10-14

### Corregido
- Mapa: con `?projectId` el panel "Contexto de proyecto" empujaba el mapa hacia abajo, que quedaba con la mitad fuera de la pantalla. En el Visor ese contexto es ahora una barra de una línea ("Proyecto enfocado", con enlaces a proyecto, indicadores y documentos), y la altura del mapa se ajustó para que entre completo en la ventana.

## [2.1.1] — 2026-10-14

### Corregido
- Mapa: al abrir el Visor desde un proyecto (`?projectId`), el encuadre se calculaba antes de que el mapa tuviera su tamaño final, y el polígono quedaba demasiado cerca y debajo de la ficha. Ahora el tamaño se recalcula y el encuadre se repite cuando la maquetación se asienta.

## [2.1.0] — 2026-10-14

Mejora del módulo **Mapa**: mapa base operativo, Visor unificado y navegación estable. Incluye todo lo de 2.0.2.

### Corregido
- **Mapa base bloqueado:** OpenStreetMap respondía "403 Access blocked" porque el sitio envía `Referrer-Policy: same-origin` y las teselas salían sin `Referer`. Ahora cada capa base declara `referrerPolicy: strict-origin-when-cross-origin`, que envía solo el origen.
- **Fondo "Claro":** CARTO ya exige clave de API y mostraba la marca de agua "API KEY REQUIRED". Se reemplazó por Esri World Light Gray con etiquetas. Todos los fondos funcionan sin clave.
- La barra de herramientas tapaba el control de zoom de Leaflet y quedaba debajo de la ficha del elemento.
- Al cambiar el mapa base se reconstruían todas las capas y se reencuadraba el mapa, perdiendo la posición del usuario.
- Las pestañas del módulo dejaban de marcarse si la URL tenía parámetros adicionales.

### Cambiado
- **Visor unificado:** la antigua pestaña "Catálogo" se integró en el Visor, con panel de capas, mapa a altura completa, ficha flotante, tabla de atributos, vistas guardadas y capas externas. Los enlaces con `?view=catalog` siguen funcionando y abren el Visor.
- Las regiones y los polígonos de proyectos se muestran por defecto, con colores diferenciados (regiones en gris tenue y proyectos en ámbar).
- Las tarjetas de capa son compactas, las categorías están en español y los filtros y estadísticas quedan en un desplegable.
- **Análisis:** la herramienta de cruce ocupa la página. Los paneles ejecutivos heredados quedan plegados tras "Mostrar panel ejecutivo del módulo".

### Añadido
- `?projectId=…` resalta y encuadra el polígono del proyecto y abre su ficha.
- `?at=lat,lng,zoom` guarda el encuadre del Visor para compartir el enlace.
- Barra de escala, coordenadas del cursor, botones "Extensión" y "Limpiar", y leyenda flotante de las capas activas.
- El mapa base "Topográfico" (Esri). El mapa base elegido se recuerda y se comparte entre todos los mapas.
- Dataset demo institucional autónomo (`infra/postgres/demo/costa-rica-demo.sql`) con un proyecto interno para probar la confidencialidad, y `infra/gcp/load-demo.sh`.

## [2.0.2] — 2026-10-14

Versión de seguridad sobre 2.0.1. Porta y adapta a la línea v2 las correcciones críticas de la re-evaluación SIGI–MIDA ([10-reevaluacion-v2.0.1.md](docs/assessments/sigi-mida/10-reevaluacion-v2.0.1.md), V2-01 a V2-06).

### Seguridad
- **V2-01 · Identidades bootstrap:** las cuentas `*@sigi.local` con contraseña versionada en el repositorio se rotan desde `SIGI_BOOTSTRAP_PASSWORD_<ROL>` al arrancar la API, o se deshabilitan en producción si no se configura su variable. `SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN` es obligatoria en producción.
- **V2-02 · Geometrías de proyectos (H-01):** una geometría ligada a un proyecto no público ya no se publica por WMS/WFS (`gis.v_public_territories`) ni por las lecturas anónimas de `/api/geo` y `gis-service`. Los límites oficiales siguen siendo públicos. `geo_layers.visibility` es *fail-closed* (`internal` por defecto). La UI permite elegir la visibilidad al cargar capas.
- **V2-03 · Credenciales de conectores:** la API nunca serializa secretos de conectores ni de fuentes. El listado de conectores queda acotado a las instituciones de los EGI del usuario.
- **Bloqueo de cuenta:** tras `AUTH_MAX_FAILED_ATTEMPTS` (5) intentos fallidos, la cuenta se bloquea durante `AUTH_LOCKOUT_SECONDS` (900 s). Durante el bloqueo, el error es el mismo que el de una contraseña incorrecta. El bloqueo queda auditado.
- **Reset de base:** queda apagado por defecto (`SIGI_ENABLE_DB_RESET`) y está prohibido en producción. La ruta responde 404 y la passphrase se compara en tiempo constante.
- **V2-05 · Alcance por EGI:** el encabezado `X-SIGI-EGI-ID` se valida contra la membresía del usuario en las escrituras de proyectos (planificación, finanzas y ciclo de vida), importaciones, datasets y archivos.
- **V2-06 · Detalle público de proyecto:** `GET /api/projects/:id` devuelve una proyección por lista blanca, sin presupuesto, movimientos, fuentes de financiamiento, riesgos, actores ni tareas.

### Corregido
- Importaciones: los proyectos se crean en el EGI del lote (N-01). Los perfiles de mapeo usan transacciones reales (N-02). Las fechas inválidas o ausentes son errores de fila, en lugar de guardarse como `1970-01-01`.
- La UI ya no presenta el puente FERM como integración operativa. Solo existe una exportación manual en formato FERM.

### Migraciones
- `20261015_project_geometry_exposure.sql` (y `init/020`).
- `20261016_login_lockout.sql` (y `init/021`).

### Operación
- Nuevas variables: `SIGI_BOOTSTRAP_PASSWORD_*`, `AUTH_MAX_FAILED_ATTEMPTS`, `AUTH_LOCKOUT_SECONDS` y `SIGI_ENABLE_DB_RESET`. `SIGI_DB_RESET_PASSPHRASE` deja de ser obligatoria.

## [2.0.1] — 2026-10-14

Primera versión etiquetada del SIGI. Corresponde a la rama aprobada y revisada `feature/ux-ui-v2` (`df3cc033`), más el control de versiones.

### Incluye (línea ux-ui-v2 sobre la base `ec40482c`)
- **Frontend único `frontend-sigi`**, basado en permisos (reemplaza a `frontend-admin` y `frontend-country`): Inicio 360, proyectos, territorio, indicadores, datos, reportes y administración.
- **Identidad visual oficial SIGI**: paleta azul, logo en shell y login, y navegación global refinada.
- Espacio de trabajo de proyectos con **planificación, presupuesto, riesgos y ciclo de vida completo**.
- **Mapa** con espacio cartográfico unificado, banco de análisis espacial y proxy de GeoServer.
- **BI ejecutivo** con edición, publicación y gráficos estadísticos.
- Búsqueda global y asistente **"Ask SIGI"**, ambos acotados por permisos.
- Rebaseline de producción (sprints 3R–8R): aislamiento de identidad, operaciones, endurecimiento de dominio y cierres de alcance por EGI.
- Despliegue controlado con `deploy-demo.sh` (backup previo, rollback de imágenes, migraciones incrementales y healthchecks).

### Añadido en 2.0.1
- `VERSION` y `scripts/release/bump-version.mjs` (`npm run version:check`): versión única para el producto, la API y el frontend.
- `GET /api/version` y campo `version` en `GET /api/health`.
- Versión visible en el pie de la barra lateral; el commit de build va en el tooltip.
- `SIGI_GIT_SHA` se propaga a la API y al build del frontend.

### Pendiente para 2.0.2
Correcciones de seguridad validadas en `feature/sigi-platform-f0-f1`, que deben portarse a esta línea y revisarse:
- confidencialidad OGC (H-01) y visibilidad *fail-closed*;
- redacción de credenciales de conectores en la API;
- reset destructivo deshabilitado por defecto;
- bloqueo por intentos fallidos;
- migraciones productivas sin datos demo.

Ver `docs/roadmap/sigi-institutional-platform/` en esa rama.
