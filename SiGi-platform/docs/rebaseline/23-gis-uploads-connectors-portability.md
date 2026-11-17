# Sprint 2R — GIS, GeoServer, uploads y conectores

## Superficie funcional protegida

El baseline incluye catálogo multicapas, tabla/filtros, identificación,
estadísticas, nearby, saved views, export CSV/XLSX/GeoJSON, geometría mixta,
imports Shapefile/Kobo, WMS/WFS, explorador de archivos y asociación con
proyectos/reportes. La RC final elimina `modules/geo`, `modules/files`,
`modules/kobo-sources` y sus pantallas/migraciones. VERIFIED IN CODE mediante
`git cat-file`: presentes en `ec40482c`, ausentes en `b3cbc6a7`.

Por tanto, ningún reemplazo de árbol GIS/uploads es admisible.

## Controles RC evaluados

| Control | Evidencia RC | Estado baseline | Decisión |
| --- | --- | --- | --- |
| límite máximo de features GIS | `dabd11b8`, `GIS_FEATURE_MAX_LIMIT` | DTO/paginación ricos, cap no centralizado por env | ADAPTAR |
| índice GiST | `4674573b`/`3e3ef246` | ya existe en geo intelligence | registrar en manifest y probar plan |
| estilos SLD versionados | `496d19b7` | estilos no versionados en el árbol baseline | ADAPTAR tres SLD y bootstrap |
| DB read-only GeoServer | `b63be468` | usa credenciales de app | ADAPTAR |
| firma XLS/XLSX/CSV | `b82a1492` | valida extensión/tamaño, no firma común | REIMPLEMENTAR en todas las superficies |
| defensa ZIP bomb | `b82a1492` | valida ZIP y componentes básicos | ADAPTAR límites de entradas, expansión, ratio y cifrado |
| SSRF conectores | `4674573b`, `outbound_url.py` | Kobo/Odoo validan forma URL, no redes privadas/redirects | REIMPLEMENTAR cliente compartido |
| test de estilos/paginación/SSRF | workflow RC | cobertura actual parcial | ADAPTAR al baseline completo |

## Uploads que deben cubrirse

La utilidad RC `assertTabularUpload` sólo se conecta a datasets e imports.
El baseline requiere una política común para:

- Excel/XLS/CSV de datasets e imports;
- Shapefile ZIP desde catálogo geoespacial y Odoo;
- archivos del explorador documental, incluidas nuevas versiones;
- cargas Kobo/promoción GIS;
- documentos vinculados a contribuciones/reportes;
- GeoJSON/JSON y cualquier import indirecto.

Cada ruta debe imponer tamaño antes de parsear, extensión permitida, firma o
parseo seguro, nombre normalizado, límite descomprimido y auditoría. Los límites
deben ser coherentes entre Multer, API, servicio Python y proxy.

## SSRF

El helper RC acepta sólo HTTP(S), prohíbe credenciales embebidas, resuelve DNS,
bloquea IP no global y vuelve a validar redirects. Es un buen control base,
pero la allowlist explícita puede autorizar hosts internos; deberá:

- separar allowlists por conector/EGI;
- registrar host/resultado sin secretos;
- validar cada redirect y mitigar DNS rebinding;
- mantener timeouts, límite de respuesta y TLS verification;
- cubrir Kobo, Odoo y conectores genéricos, no sólo un cliente;
- incluir pruebas IPv4, IPv6, localhost, metadata cloud y redirect privado.

## GIS y estilos

Los SLD RC para territorios, centroides y polígonos son portables como assets,
pero `bootstrap.sh` debe adaptarse al catálogo y nombres reales del baseline.
El gate debe comprobar GetCapabilities, GetMap con estilo, WFS, usuario DB sin
acceso a `core.users`, imposibilidad de escritura y las funciones multicapas
protegidas por Sprint 1R.

Conclusión: los controles GIS/archivo son valiosos, pero el commit de uploads se
clasifica REIMPLEMENTAR porque la RC desconoce gran parte de la superficie que
debe proteger.
