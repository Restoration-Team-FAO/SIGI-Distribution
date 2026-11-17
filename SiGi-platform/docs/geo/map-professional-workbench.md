# Mapa SIGI — visor y caja de herramientas espacial

Fecha: 2026-09-30  
Rama: `feature/ux-ui-v2`

## Resultado

El módulo Mapa conserva Leaflet como cliente cartográfico y GeoServer/PostGIS
como infraestructura GIS. La vista incorpora un flujo de trabajo comparable
conceptualmente con un visor SIG de escritorio: selección de insumos, ejecución
de una herramienta, mapa multicapa, métricas y tabla de resultados.

## Cruce de capas

La vista **Mapa → Análisis** permite seleccionar una capa de entrada y otra de
superposición. `POST /geo/analysis/intersection` valida la visibilidad de ambos
insumos y ejecuta en PostGIS:

- filtro espacial indexable mediante bounding boxes;
- `ST_Intersects` para identificar coincidencias;
- `ST_Intersection` para producir la geometría resultante;
- conteo de elementos fuente y objetivo afectados;
- conteo de pares coincidentes;
- área poligonal intersectada en hectáreas.

La respuesta cartográfica está limitada a 200 geometrías para evitar una carga
sin límite en el navegador. La métrica de pares conserva el total real y la UX
indica cuando la muestra fue truncada. La operación es de solo lectura.

## Trabajo con Shapefile

El ingreso se realiza desde **Importar Shapefile ZIP** y reutiliza el pipeline
existente del catálogo geográfico. El ZIP debe incluir un único conjunto
`.shp`, `.shx` y `.dbf`; `.prj` es necesario para una interpretación de CRS
confiable.

SIGI puede:

1. inspeccionar estructura, atributos, geometría, CRS y bounding box;
2. detectar filas inválidas y elementos fuera del ámbito configurado;
3. aplicar el mapeo de campos definido por el usuario;
4. transformar el insumo mediante GIS Service;
5. cargar geometrías y atributos a PostGIS;
6. registrar la capa, sus metadatos y trazabilidad;
7. visualizarla, filtrarla, consultar atributos y exportarla;
8. utilizarla como entrada u objetivo de un cruce espacial;
9. publicarla posteriormente en GeoServer si el perfil tiene permiso.

No se admite FileGDB de forma directa. Debe convertirse a Shapefile ZIP o
GeoJSON antes de ingresar a SIGI.

## Pantalla completa

Los canvas del visor principal y del mapa multicapa usan el viewport completo
cuando su `MapWorkspace` entra en fullscreen. La altura embebida sigue siendo
responsive, pero en fullscreen se fuerza `100vh`, se mueve la barra de
herramientas al borde superior y se solicita a Leaflet recalcular su tamaño.

## Seguridad y límites

- Las dos capas se resuelven a través de la misma regla de visibilidad que el
  catálogo, la tabla y las exportaciones.
- Una capa restringida no puede descubrirse probando su código: responde 404.
- Los códigos son validados y todos los valores llegan a SQL parametrizados.
- La intersección no persiste automáticamente una nueva capa.
- Unión, diferencia, buffer dibujado y edición de vértices continúan fuera de
  este alcance y requieren un flujo explícito de publicación y auditoría.

## Verificación

- contrato y validación del request: pruebas unitarias;
- visibilidad, límite y respuesta GeoJSON: `npm run smoke:geo-api`;
- flujo navegador y fullscreen real: `tests/e2e/geo.spec.js`;
- salud del despliegue: `npm run smoke:post-deploy`.
