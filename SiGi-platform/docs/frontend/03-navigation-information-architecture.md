# 03 — Arquitectura de información y navegación

## Navegación autenticada objetivo

| Dominio | Contenido real disponible | Visibilidad |
| --- | --- | --- |
| Inicio | resumen del EGI, atención y accesos | toda sesión válida |
| Proyectos | cartera y workspace del proyecto | `projects.read` |
| Territorio | visor, capas, catálogo y BI | permisos GIS/datos equivalentes |
| Indicadores | lectura y trazabilidad de indicadores | gap: no existe módulo autenticado independiente |
| Datos | fuentes, importación, calidad, documentos y publicaciones | permisos por capacidad |
| Informes | catálogo, generación, workflow y exportación | permisos `reports.*` |
| Ask SIGI | asistencia contextual | gap; no mostrar hasta contar con servicio gobernado |
| Administración | EGI, instituciones, usuarios, conectores, auditoría y configuración | solo capacidades administrativas/técnicas |

No se muestran entradas vacías para Indicadores o Ask SIGI. Se incorporarán cuando existan capacidad real y contrato backend.

## Principios

1. Un solo árbol de navegación, filtrado por capacidades.
2. Agrupación por trabajo del usuario, no por tecnología.
3. Configuración avanzada dentro de Administración o acciones contextuales autorizadas.
4. URLs heredadas continúan funcionando durante la transición.
5. Un objeto relacionado se abre con deep link y conserva contexto.

## Breadcrumbs

Fase 1 garantiza al menos:

```text
Inicio > Dominio > Pantalla
```

`Inicio` es navegable; el último elemento usa `aria-current=page`. Fases por dominio añadirán entidad y subrecurso:

```text
Inicio > Proyectos > Proyecto X > Indicadores > Indicador Y
```

## Contexto persistente

Ya existen EGI activo y alcance activo/global. El contexto futuro añadirá territorio, periodo, proyecto, institución y estado. Debe residir en un provider independiente, serializable en URL cuando sea útil y nunca ampliar el scope retornado por backend.

## Navegación contextual prioritaria

| Origen | Destino | Estado |
| --- | --- | --- |
| Proyecto | territorio/mapa | parcial: mapa y territorio existen; falta deep link estándar |
| Proyecto | indicadores | parcial dentro de ficha; falta detalle independiente |
| Proyecto | documentos | real dentro de proyecto y explorador; falta enlace consistente |
| Indicador | territorio | gap |
| Reporte | proyecto/evidencia | datos reales parciales; requiere enlaces contextuales |
| Mapa | entidad identificada | real para ficha geográfica; ampliar a proyecto/documento |
| KPI | lista filtrada | parcial; se completará con Home 360 |

## Lenguaje

La navegación operativa usa “Datos”, “Importar información”, “Calidad”, “Documentos” e “Informes”. Conectores, sincronizaciones, mapeos, staging y logs se reservan para usuarios técnicos dentro de Administración.
