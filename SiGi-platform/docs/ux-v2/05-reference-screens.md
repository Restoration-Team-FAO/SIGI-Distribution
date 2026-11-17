# UX/UI V2 — Pantallas de referencia

Estas cuatro pantallas fijan el lenguaje visual. No se migrarán otras vistas
antes de su revisión visual y funcional.

## 1. Dashboard

Estructura:

```text
PageHeader + corte/fuente
Atención requerida (prioridad)
Situación actual (KPIs con contexto)
Territorio / tendencias
Cambios recientes
Accesos recomendados
```

Aceptación: responde qué pasa, dónde, qué requiere atención, qué cambió y dónde
actuar; conserva las llamadas API y el tratamiento explícito de datos faltantes.

## 2. Projects list

Estructura:

```text
PageHeader                         [Nuevo proyecto]
Search | Estado | Institución | Tema | Limpiar
Resumen de resultados
Tabla: Proyecto | Estado | Institución | Territorio | Avance | Actualización
Paginación
```

Aceptación: preserva selección, filtros, creación, permisos y deep link
`projectId`; vacío y sin resultados son distinguibles.

## 3. Project workspace

Estructura:

```text
Breadcrumb
Código + nombre + estado + institución + avance       [Editar]
Resumen | Territorio | Indicadores | Actores | Hitos | Documentos | Actividad
Contenido de pestaña
```

Aceptación: todos los formularios y acciones actuales siguen disponibles; las
pestañas no inventan endpoints ni destruyen estado; guardar conserva pestaña y
proyecto; acciones se ocultan/deshabilitan con permisos actuales.

## 4. GIS workspace

Estructura desktop:

```text
Toolbar: buscar | vista | exportar | acciones autorizadas
Catálogo  |                  Mapa                  | Detalle
capas     |                                        | ficha
filtros   |                                        | atributos
leyenda   |                                        | metadata
```

Tablet: catálogo y detalle son drawers mutuamente excluyentes. Móvil: consulta
del mapa y ficha; edición/carga compleja puede recomendar desktop.

Aceptación: conserva catálogo, búsqueda territorial, visibilidad, filtros,
selección, tabla, metadata, perfil, exportación, fuentes externas, vistas
guardadas, importación y publicación según permisos.

## Matriz de no regresión

| Pantalla | Contratos protegidos | Prueba mínima |
| --- | --- | --- |
| Dashboard | métricas, proyectos, territorio, fecha/fuente | render + navegación + estado vacío/error |
| Projects list | listar, filtrar, seleccionar, crear | request/resultado + permiso negativo |
| Project workspace | editar y subrecursos actuales | deep link + guardar/restaurar + tabs |
| GIS | catálogo, features, schema, filtros, export | flujo mapa/tabla/ficha/export en ambos frontends |

Cada referencia se revisará a 1440×900, 1280×800, 1024×768 y 390×844, con
teclado y contraste, comparando contra el baseline `5d18aace`.
