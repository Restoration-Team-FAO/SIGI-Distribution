# 20 — Resultado de búsqueda global

Fecha: 2026-09-23  
Rama: `feature/ux-ui-v2`

## Resultado

El `AppShell` incorpora una búsqueda multi-entidad autenticada. El control consulta un endpoint agregado real y dirige cada resultado a una ruta profunda del frontend único.

No se indexan ni presentan datos anónimos. El backend resuelve el EGI y decide qué familias consultar según los permisos efectivos del principal.

## Contrato

`GET /api/admin/search?q=<texto>&scope=<active|global>&limit=<1..10>`

Reglas:

- requiere sesión bearer válida;
- mínimo 2 y máximo 120 caracteres;
- límite por categoría entre 1 y 10;
- consultas SQL parametrizadas;
- `scope=global` exige `scope.global.read` mediante la política EGI existente;
- cada familia requiere su permiso de lectura;
- nunca amplía el alcance indicado por `x-sigi-egi-id`.

## Entidades y destinos

| Entidad | Permiso | Alcance | Destino |
| --- | --- | --- | --- |
| Proyecto | `projects.read` | EGI activo o global autorizado | ficha de proyecto |
| Indicador | `indicators.read` | EGI activo o global autorizado | ficha de indicador |
| Informe | `reports.read` | solo EGI activo | detalle de informe |
| Documento | `files.read` | solo EGI activo | explorador con búsqueda y archivo seleccionado |

Informes y documentos se omiten expresamente en vista global porque sus módulos todavía no ofrecen una consolidación global segura. La interfaz informa esta limitación en lugar de mezclar alcances.

## UX

- búsqueda en el encabezado persistente;
- retardo de 250 ms para evitar solicitudes por cada pulsación;
- resultados agrupados por entidad;
- estados de carga, vacío y error;
- cierre con `Escape` o pérdida de foco;
- control visible únicamente si existe al menos un permiso compatible;
- diseño adaptable a móvil;
- navegación exclusivamente hacia rutas autenticadas.

## Seguridad

La ocultación del control no constituye la seguridad. El endpoint vuelve a validar sesión, permisos por familia, EGI solicitado, autorización de vista global y restricción institucional de informes.

Los documentos utilizan la misma frontera `files.read` y el EGI activo que el explorador documental. Los resultados no incluyen contenido del archivo, únicamente metadatos navegables.

## Verificación

| Verificación | Resultado |
| --- | --- |
| typecheck y build completo | aprobado |
| pruebas Node | 117/117 aprobadas |
| pruebas Python | 6/6 aprobadas |
| E2E completo | 34 aprobadas, 2 demos opt-in omitidas |
| E2E de búsqueda y vista global | aprobado |
| smoke de roles | 42/42 comprobaciones aprobadas |
| smoke del frontend único | 39/39 comprobaciones aprobadas |
| acceso sin autenticación a `/api/admin/search` | `401` |
| Docker `sigi-ux-v2` | frontend, API, PostgreSQL, GIS y GeoServer saludables |

La revisión está disponible en `http://127.0.0.1:5374`, con API en `http://127.0.0.1:3200/api`.

- imagen frontend: `sha256:7bb2d0645f5e5d4816c866a658c58d708ccfe71c0645c38a5c1c46786a1744fc`;
- imagen API: `sha256:0d701464f1f29d413d7a2340d3c7b914078fe9029b13f7b6ae15c49596792a07`.
