# 05 — Mapa de migración de rutas

> Mapa histórico de transición. Las rutas públicas listadas aquí ahora redirigen al frontend autenticado según [18-public-frontend-retirement-result.md](18-public-frontend-retirement-result.md).

## Estrategia

Las URLs actuales se conservan en la primera consolidación. La arquitectura de información cambia primero; las URLs amigables nuevas se introducirán como aliases y solo reemplazarán las antiguas después de medir enlaces y bookmarks.

## Acceso y portal público

| Ruta actual | Tratamiento |
| --- | --- |
| `/` | home autenticado; anónimo → `/administration` |
| `/administration` | login/acceso institucional |
| `/dashboard` | portal público explícito |
| `/territory`, `/projects`, `/geo-bi` | conservar como públicas |
| `/indicators`, `/incidents`, `/quality`, `/restoration` | conservar como públicas |
| `/reports`, `/documents`, `/integrations` | conservar como públicas |

## Aplicación autenticada

| Ruta actual | Dominio objetivo | Ruta futura opcional | Acción actual |
| --- | --- | --- | --- |
| `/admin` | Inicio | `/inicio` | conservar |
| `/admin/projects` | Proyectos | `/proyectos` | conservar y etiquetar por dominio |
| `/admin/geobi` | Territorio | `/territorio` | conservar |
| `/admin/geospatial-catalog` | Territorio/Admin | `/territorio/capas` | conservar |
| `/admin/bi-visualizer` | Territorio | `/territorio/analisis` | conservar |
| `/admin/sources` | Datos | `/datos/fuentes` | conservar |
| `/admin/validations` | Datos | `/datos/calidad` | conservar |
| `/admin/files` | Datos/Documentos | `/datos/documentos` | conservar |
| `/admin/publications` | Datos | `/datos/publicaciones` | conservar |
| `/admin/reports/*` | Informes | `/informes/*` | conservar |
| `/admin/egi` | Contexto/Administración | `/administracion/espacios` | conservar |
| `/admin/institutions` | Administración | `/administracion/instituciones` | conservar |
| `/admin/users*` | Administración | `/administracion/usuarios*` | conservar |
| `/admin/connectors` | Administración | `/administracion/integraciones` | conservar |
| `/admin/audit` | Administración | `/administracion/auditoria` | conservar |
| `/admin/api` | Administración técnica | `/administracion/sistema` | conservar |

## Configuración

Las rutas `/admin/*/config` permanecen accesibles únicamente con capacidad equivalente. No serán tabs operativos ni elementos globales para usuarios sin autorización.

## Gaps sin ruta nueva

No se crean aún rutas para:

- `/indicadores` autenticado;
- `/mi-trabajo`;
- `/buscar` global;
- `/ask-sigi`;
- detalle autónomo de intervención/evidencia.

Requieren contrato y datos reales antes de incorporar navegación.

## Redirecciones y compatibilidad

Cada alias futuro debe probar:

- deep link con sesión;
- retorno tras login;
- query params de entidad/filtros;
- permisos y EGI;
- canonical URL acordada;
- 404 explícito para rutas no registradas.
