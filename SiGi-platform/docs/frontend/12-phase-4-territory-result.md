# 12 — Resultado de Fase 4: Territorio

Fecha: 2026-09-22  
Rama: `feature/ux-ui-v2`

## Resultado

La experiencia autenticada dejó de presentarse como el nombre técnico “SIGI Geo/BI” y pasó a **Territorio SIGI**. La capacidad existente se separó en recorridos operativos con URL estable:

| Vista | URL | Responsabilidad |
| --- | --- | --- |
| Visor | `/admin/geobi?view=viewer` | mapa operativo, capa, escala, filtros y overlays |
| Catálogo | `/admin/geobi?view=catalog` | catálogo multicapa, búsqueda territorial, tabla, perfil, filtros y exportación |
| Análisis | `/admin/geobi?view=analysis` | dashboards por rol, cobertura, calidad, alertas, GeoServer y trazabilidad |
| Publicaciones | `/admin/publications` | salidas publicadas, condicionadas por `publications.read` |
| Configuración | `/admin/geobi/config` | workspaces, estilos, CRS, visibilidad, GeoServer y permisos |

Un valor `view` desconocido cae en `viewer`. Las pestañas preservan `projectId`, por lo que la navegación puede compartirse y recargarse sin perder el contexto.

## Contexto lateral y relaciones

El Catálogo conserva el panel lateral de identificación junto al mapa. La ficha presenta metadatos, atributos, proximidad y acciones contextuales solo cuando el feature tiene una relación real.

Para features con `projectId`:

- abre el resumen del proyecto;
- abre sus indicadores;
- abre sus documentos;
- conserva el identificador real en la URL.

La relación inversa se añadió en Proyectos: la pestaña Territorio abre `Territorio SIGI` con el mismo `projectId`. La cabecera contextual de Territorio resuelve el proyecto mediante API y enlaza de regreso a proyecto, indicadores y documentos. Un proyecto fuera del scope se representa como no disponible; no se inventa información.

## Permisos y configuración

- El acceso mantiene las capacidades backend existentes de GIS/datos.
- El contexto de proyecto se consulta únicamente con `projects.read`.
- Publicaciones solo aparece con `publications.read`.
- Configuración continúa protegida por `gis.configure` o `publications.publish` y roles administrativos.
- El portal público permanece separado y no realiza consultas administrativas.

## Extracción de duplicación

Se extrajeron a `features/territory`:

- parser y constructor de rutas del workspace territorial;
- formato común de fecha, área, distancia y valores ausentes;
- radios de proximidad;
- lectura segura de la relación `projectId/projectTitle`.

Estas primitivas ahora son compartidas por las fichas de identificación pública y autenticada. Los contenedores visuales permanecen separados porque usan kits de presentación y acciones distintas; combinarlos en esta fase habría mezclado las fronteras pública/autenticada.

## Regresión cubierta

- El flujo GIS catálogo → capa → filtros → ficha → tabla → exportación sigue operativo.
- E2E verifica exclusión mutua entre Visor, Catálogo y Análisis.
- E2E verifica deep links, preservación de `projectId` y recarga de la vista.
- El recorrido público del Mapa SIGI no cambia.

## Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `npm run build:admin` | PASS, 111 módulos |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 89 Node + 6 Python |
| `npm run test:e2e` | PASS, 28/28 |
| `npm run smoke:roles` | PASS, 36/36 |
| `npm run smoke:unified-frontend` | PASS, 50/50 |
| Docker `sigi-ux-v2` | frontend y dependencias saludables |

Docker de revisión:

- aplicación unificada: `http://127.0.0.1:5374`;
- referencia Country: `http://127.0.0.1:5373`;
- API: `http://127.0.0.1:3200/api`;
- GeoServer: `http://127.0.0.1:8281`;
- imagen frontend: `sha256:f6e63cf83f5a75053db3726ed965ceafdd307e1a395c359e01b5dd2a1a4d2179`.
