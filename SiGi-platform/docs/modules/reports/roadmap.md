# Roadmap integral — Informes nacionales e internacionales

## Objetivo de producto

Convertir el módulo actual en una capa de inteligencia que tome datos reales del SIGI, evalúe su aptitud para un marco de reporte, aplique reglas y cálculos versionados, identifique brechas, conserve trazabilidad y produzca un paquete de insumos técnicamente utilizable.

El resultado no se considerará funcional solo porque una pantalla cargue o un endpoint responda. Cada marco debe superar una prueba completa desde el dato fuente hasta el artefacto exportado.

## Estado de partida

| Capacidad | Estado actual | Brecha principal |
| --- | --- | --- |
| Marcos y plantillas versionadas | Parcial | Los requerimientos sembrados son mínimos y no representan todavía toda la metodología. |
| Instancias, estados y permisos | Implementado como base | Completar bloqueo, reapertura y firmas de validación por nivel. |
| Calendario, compromisos y aportes institucionales | Implementado como base | Automatizar canales externos y vincular aportes con requisitos concretos. |
| Matriz de cobertura | Parcial | Usa reglas genéricas por tipo de fuente; requiere estados, unidades, elegibilidad y calidad multidimensional. |
| Edición de metadatos y selección de datos | Implementado como base | Falta captura narrativa, valores manuales y evidencia por requisito/sección. |
| Correspondencias de indicadores | Parcial | Hay almacenamiento y consulta, pero no resolución completa ni vigencia metodológica. |
| Reglas metodológicas | Pendiente | Falta motor versionado de reglas y parámetros. |
| Cálculos e indicadores derivados | Pendiente | Falta ejecución SQL/PostGIS reproducible. |
| Detección de superposición | Pendiente | El motor GIS existe, pero no está integrado al módulo de informes. |
| Trazabilidad | Parcial | Resuelve fuente/dataset básico; falta linaje de transformaciones, cálculos y artefactos. |
| Brechas y solicitudes de fuente | Parcial/Pendiente | Se detectan faltantes básicos, pero no existe gestión de acciones e integración completa con Fuentes/Conectores. |
| Calidad del dato | Pendiente | Falta evaluación separada de completitud, validez, actualidad, coherencia, linaje y coberturas. |
| Paquete de insumos | Pendiente | Solo existen JSON del informe y XLSX/ICS del calendario. |
| Acápite Nacional | Parcial | Plantilla y flujo existen; falta composición dinámica con datos reales. |
| Meta 2 | Parcial | Falta análisis geoespacial, elegibilidad, deduplicación y agregaciones. |
| Regional, NDC, BTR y LDN | Parcial estructural | Existen plantillas base, pero no motores específicos completos. |

## Arquitectura objetivo

```mermaid
flowchart LR
  A[Fuentes y conectores existentes] --> B[Datasets, indicadores, proyectos, documentos y capas SIGI]
  B --> C[Validación y calidad]
  C --> D[Mapeos y homologación versionados]
  D --> E[Reglas metodológicas]
  E --> F[Cálculos SQL/PostGIS]
  F --> G[Resultados por requisito]
  G --> H[Linaje y evidencias]
  G --> I[Brechas y solicitudes]
  H --> J[Validación técnica e institucional]
  I --> J
  J --> K[Paquete reproducible de insumos]
```

No se crearán catálogos paralelos de fuentes, archivos, indicadores, proyectos o capas. El módulo de informes guardará referencias hacia los módulos SIGI existentes.

## Reglas de ejecución

1. No usar datos simulados para declarar una capacidad terminada.
2. Toda regla metodológica concreta requiere una fuente oficial registrada. Sin ella, el estado será `PENDING_METHODOLOGY_CONFIGURATION`.
3. Separar cobertura, calidad y autoridad del dato; un valor calculado no equivale a un valor oficialmente reportado.
4. Toda cifra exportada debe conservar período, fecha de corte, versión metodológica, consulta, parámetros, fuentes y responsable de validación.
5. Cada fase tiene una puerta de salida verificable. No avanzar con pantallas desconectadas.

## Modelo funcional objetivo

### Estados de cobertura

```text
AVAILABLE
CALCULABLE
PARTIAL
MISSING
REQUIRES_MAPPING
REQUIRES_VALIDATION
MANUAL
NOT_APPLICABLE
RESTRICTED
PENDING_METHODOLOGY_CONFIGURATION
```

### Estado de autoridad, separado de la cobertura

```text
SYSTEM_CALCULATED
TECHNICALLY_VALIDATED
INSTITUTIONALLY_APPROVED
OFFICIALLY_REPORTED
```

### Entidades que deben incorporarse o ampliarse

- versión metodológica del marco;
- requerimiento completo con unidad, tipo, periodicidad, dimensiones espacial/temporal y validación mínima;
- binding de requerimiento a dataset, indicador, documento, capa o fuente;
- regla metodológica versionada y parametrizada;
- definición, ejecución y resultado de cálculo;
- evidencia y valor manual por requisito;
- evaluación multidimensional de calidad;
- aristas de linaje entre fuente, transformación, resultado y artefacto;
- brecha, acción correctiva y solicitud de fuente;
- decisión humana y nivel de autoridad;
- paquete generado y sus artefactos/checksums.

## Plan de implementación

### Fase A — Auditoría real de datos existentes

**Objetivo:** saber qué puede producir hoy SIGI sin suposiciones.

- Inventariar tablas, vistas, campos, unidades, períodos, geometrías, instituciones y estados de validación.
- Revisar proyectos, intervenciones, indicadores, datasets, documentos, fuentes y capas geográficas.
- Identificar calidad, volumen, cobertura temporal y espacial de muestras reales.
- Relacionar cada campo potencial con los seis marcos.
- Crear `docs/modules/reports/current-data-coverage.md`.
- Crear consultas de verdad reproducibles para una muestra de cada dato candidato.

**Puerta de salida:** inventario aprobado con `AVAILABLE`, `PARTIAL`, `MISSING`, `RESTRICTED` o `PENDING_METHODOLOGY_CONFIGURATION`; ninguna disponibilidad inferida solo por el nombre de una columna.

### Fase B — Motor completo de requerimientos

**Objetivo:** representar lo que cada informe solicita, no solo sus títulos de sección.

- Versionar marcos y metodologías independientemente de la plantilla visual.
- Ampliar `report_data_requirements` con descripción, unidad, tipo, periodicidad, obligatoriedad, granularidad, dimensiones y validación mínima.
- Crear administrador de requerimientos con borrador, publicación y vigencia.
- Capturar contenido narrativo, valor manual y evidencia por requisito.
- Exponer `GET /admin/reports/:id/requirements`.

**Puerta de salida:** una instancia conserva una copia/versionado inequívoco de todos sus requerimientos y no cambia cuando se publica una metodología nueva.

### Fase C — Motor de mapeos y homologación

**Objetivo:** resolver explícitamente qué dato SIGI puede satisfacer cada requerimiento.

- Mapear datasets, campos, indicadores, documentos, proyectos y capas.
- Configurar unidad origen/destino, transformación, período y vigencia.
- Verificar compatibilidad semántica, temporal, territorial y de unidad.
- Impedir mapeos `DIRECT` sin regla explícita de elegibilidad.
- Marcar incompatibilidades como `REQUIRES_MAPPING` o `NO_HOMOLOGABLE`.

**Puerta de salida:** cada relación usada por un informe tiene versión, responsable, justificación y prueba de compatibilidad.

### Fase D — Motor de validación y calidad

**Objetivo:** determinar si un dato es apto y con qué nivel de confianza.

- Evaluar completitud, validez, actualidad, coherencia, trazabilidad, validación y coberturas espacial/temporal por separado.
- Vincular la evaluación con los estados reales de Validaciones, Fuentes y Datasets.
- Configurar umbrales por requerimiento y versión metodológica.
- Implementar decisiones técnicas e institucionales con comentarios y auditoría.
- Exponer resultados por dimensión, sin fabricar un score único arbitrario.

**Puerta de salida:** la API explica por qué un dato pasa, falla o requiere revisión y quién tomó cada decisión humana.

### Fase E — Motor de reglas y cálculo

**Objetivo:** producir valores derivados reproducibles en backend.

- Operadores: `SUM`, `COUNT`, `DISTINCT_COUNT`, `AVG`, `MIN`, `MAX`, `RATIO`, `PERCENTAGE`, `AREA` y agregaciones agrupadas/temporales.
- Reglas declarativas versionadas con parámetros y fuente metodológica.
- Plan de ejecución SQL/PostGIS con límites y registro de consultas/parametrización.
- Manejo explícito de unidad, nulos, denominadores cero, línea base, meta y sentido del indicador.
- Endpoints `POST /admin/reports/:id/recalculate`, `GET /indicators` y `GET /data` del informe.

**Puerta de salida:** ejecutar dos veces la misma versión, corte y fuentes produce el mismo resultado y checksum.

### Fase F — Linaje y análisis geoespacial

**Objetivo:** explicar cada valor y controlar superposiciones.

- Construir linaje desde resultado hasta dataset, lote/importación, fuente e institución.
- Integrar Geo/PostGIS existente para área, intersección, unión, diferencia y distribución territorial.
- Detectar geometrías solapadas, reportar área registrada, superpuesta y consolidada preliminar.
- Configurar estrategias de deduplicación; nunca descontar silenciosamente.
- Implementar **Ver origen del dato** y `GET /traceability`/`GET /maps` completos.

**Puerta de salida:** una muestra demuestra `UI = API = cálculo = filas/geometrías fuente`, incluyendo parámetros y fecha de corte.

### Fase G — Brechas y solicitudes de información

**Objetivo:** transformar faltantes en trabajo gestionable.

- Generar matriz de brechas por marco, sección, institución y criticidad.
- Indicar fuente esperada, institución sugerida, acción, responsable y fecha.
- Crear solicitudes dentro de Fuentes/Conectores o Documentos existentes.
- Vincular la respuesta recibida al requerimiento original.
- Exponer `GET /gaps` y acciones de seguimiento.

**Puerta de salida:** cada faltante obligatorio tiene causa y siguiente acción; cerrar una solicitud recalcula la cobertura.

### Fase H — Acápite Nacional funcional (primer vertical completo)

- Resolver bloques dinámicos de proyectos, instituciones, restauración, distribución territorial y fecha de corte.
- Permitir narrativa editable sin convertir cifras dinámicas en texto desconectado.
- Generar tablas, indicadores, mapas disponibles, metodología, brechas y linaje.
- Producir el primer paquete de insumos XLSX/JSON/GeoJSON con datos reales.

**Puerta de salida:** flujo completo demostrado y documentado con al menos una cifra y un mapa trazados hasta su fuente.

### Fase I — Meta 2 funcional

- Configurar metodología oficial o mantener el bloqueo metodológico explícito.
- Identificar áreas potencialmente elegibles, ecosistema, intervención, proyecto, institución, estado, fecha, evidencia y geometría.
- Ejecutar agregaciones por país, región, ecosistema, intervención, institución, proyecto y año.
- Detectar/dimensionar solapamientos y requerir validación para la cifra consolidada.
- Agregar hojas `10_ECOSISTEMAS` y `11_INTERVENCIONES` cuando existan datos.

**Puerta de salida:** se genera “área potencialmente elegible”; solo una aprobación institucional puede promoverla a cifra nacional aprobada.

### Fase J — Informe Regional funcional

- Ingestar resultados nacionales ya validados.
- Homologar definiciones, unidades, períodos y metodologías antes de agregar.
- Mantener resultados no comparables como `NO_HOMOLOGABLE`.
- Conservar linaje país → resultado nacional → fuentes.

**Puerta de salida:** ninguna suma regional incluye países incompatibles sin una decisión metodológica auditada.

### Fase K — NDC funcional

- Modelo meta → indicador → línea base → objetivo → valor actual → progreso → evidencia.
- Fórmulas configurables según unidad y sentido del indicador.
- Enlace con medidas, proyectos, programas, intervenciones, sectores y territorios existentes.
- Hojas `10_METAS_NDC` y `11_PROGRESO`.

**Puerta de salida:** el porcentaje de progreso solo se calcula cuando línea base, meta, unidad y dirección son compatibles.

### Fase L — BTR funcional como paquete de insumos

- Clasificar información en disponible directamente, calculable, requiere revisión, fuente externa o no disponible.
- Reutilizar resultados NDC aprobados y datos de medidas, restauración, uso del suelo, proyectos y territorio.
- Capturar inventarios GEI externos con responsable, evidencia y nivel de validación.
- Evitar declarar que SIGI produce el BTR completo.

**Puerta de salida:** paquete estructurado y trazable para el equipo BTR, con límites y brechas explícitas.

### Fase M — LDN funcional

- Configurar cobertura/cambio de cobertura, productividad, carbono orgánico, áreas degradadas/mejoradas/estables y restauración.
- Conectar datasets, GIS, archivos o APIs externas mediante los módulos existentes.
- No calcular una clasificación LDN sin metodología y líneas base configuradas.
- Hojas `10_LAND_COVER`, `11_PRODUCTIVITY` y `12_SOC` cuando haya información.

**Puerta de salida:** cada subindicador LDN muestra dato, metodología, fuente, período, calidad y brecha; lo no disponible se mantiene como `FUENTE_REQUERIDA`.

### Cierre transversal — Paquetes, API y operación

Esta línea se construye incrementalmente desde la fase H y se cierra después de la M.

- `POST /admin/reports/:id/generate-package` crea un trabajo reproducible.
- Excel de alta prioridad con hojas `00_RESUMEN` a `09_TRAZABILIDAD` y hojas específicas del marco.
- CSV, JSON, GeoJSON y mapas solo cuando existan resultados reales.
- PDF/DOCX únicamente cuando exista un generador real; nunca archivos simulados.
- Manifiesto con versión, corte, artefactos, checksums, advertencias y estado de autoridad.
- Almacenamiento mediante el Explorador documental existente.
- Observabilidad, límites, reintentos, auditoría, permisos y pruebas de carga.

## Secuencia de incrementos recomendada

| Incremento | Alcance | Dependencia | Resultado demostrable |
| --- | --- | --- | --- |
| 1 | Auditoría de datos y consultas de verdad | — | `current-data-coverage.md` con evidencia real. |
| 2 | Esquema de requerimientos/metodología v2 | 1 | Marco versionado completo y API de requisitos. |
| 3 | Captura manual y evidencia por requisito | 2 | Resolver correctamente casos como inventario GEI externo. |
| 4 | Bindings y mapeos con unidades/vigencia | 2 | Correspondencia verificable SIGI → requisito. |
| 5 | Calidad multidimensional y validación humana | 4 | Aptitud explicable y niveles de autoridad separados. |
| 6 | Cálculos escalares y agrupados | 4–5 | Indicadores reproducibles no espaciales. |
| 7 | Linaje profundo y test de verdad | 6 | Navegación desde UI hasta dato fuente. |
| 8 | Cálculo espacial y superposiciones | 4–7 | Área preliminar sin doble conteo silencioso. |
| 9 | Brechas y solicitudes de fuente | 2–5 | Faltantes convertidos en tareas institucionales. |
| 10 | Acápite Nacional vertical completo | 1–9 | Primer marco `FUNCTIONAL`. |
| 11 | Meta 2 vertical completo | 8–10 | Segundo marco `FUNCTIONAL`. |
| 12 | Consolidación Regional | 10–11 | Homologación multipaís verificable. |
| 13 | NDC | 6–10 | Metas y progreso con fórmula válida. |
| 14 | BTR | 3, 9, 13 | Paquete de insumos BTR. |
| 15 | LDN | 3, 8–10 | Subindicadores LDN trazables. |
| 16 | Paquetes completos y endurecimiento | 10–15 | Exportaciones y APIs listas para operación. |

## Contratos API objetivo

```text
GET  /admin/reports/:id/requirements
GET  /admin/reports/:id/coverage
GET  /admin/reports/:id/indicators
GET  /admin/reports/:id/data
GET  /admin/reports/:id/gaps
GET  /admin/reports/:id/methodology
GET  /admin/reports/:id/traceability
GET  /admin/reports/:id/maps
POST /admin/reports/:id/recalculate
POST /admin/reports/:id/validate
POST /admin/reports/:id/generate-package
GET  /admin/reports/:id/packages/:packageId
```

Todos requieren autenticación, permiso, EGI activo, alcance institucional y auditoría. Los endpoints de lectura deben exponer la versión metodológica y fecha de corte usadas.

## Estrategia de pruebas

- **Contrato:** migraciones idempotentes, permisos, estados y OpenAPI.
- **Unidad:** reglas, unidades, fórmulas, clasificación de cobertura y deduplicación.
- **Integración:** PostgreSQL/PostGIS con fixtures derivados de datos permitidos, nunca resultados hardcodeados en producción.
- **E2E:** selección del marco, cálculo, validación, mapa, brechas y paquete.
- **Test de verdad:** por marco, al menos una cifra prueba `UI = API = backend = fuente`.
- **Regresión histórica:** una nueva metodología no modifica snapshots previos.
- **Seguridad:** aislamiento EGI/institución, restricciones de evidencia y permisos por acción.
- **Exportación:** abrir y validar cada XLSX/ZIP/GeoJSON/PDF/DOCX real generado.

## Definición de terminado por marco

Un marco solo puede marcarse `FUNCTIONAL` si cumple todos estos puntos:

- requerimientos suficientes y versionados;
- fuente metodológica registrada;
- datos reales o brechas explícitas;
- mapeos y unidades verificadas;
- cálculos reproducibles;
- control de calidad;
- linaje hasta origen;
- validación humana separada de cálculo;
- tratamiento espacial cuando corresponda;
- paquete de insumos utilizable;
- prueba de verdad y E2E aprobadas;
- documentación operativa y limitaciones.

Si falta cualquiera de ellos, el estado será `PARTIAL` con el pendiente concreto.

## Primer bloque de trabajo

El siguiente incremento debe ser la **Fase A**, no otra pantalla. Entregables inmediatos:

1. inventario SQL y geográfico de datos reales;
2. `current-data-coverage.md`;
3. diccionario campo → posible requerimiento, sin afirmar equivalencia metodológica;
4. consultas de verdad para Acápite Nacional y Meta 2;
5. lista de documentos metodológicos faltantes;
6. decisión de esquema para requerimientos y versiones de la Fase B.

## Estado real al aprobar este roadmap

```text
ACAPITE_NACIONAL       PARTIAL
REGIONAL_RESTORATION   PARTIAL
GBF_TARGET_2           PARTIAL
NDC                    PARTIAL
BTR                    PARTIAL
LDN                    PARTIAL
```

`PARTIAL` significa que existe estructura navegable y persistencia base, pero todavía no se ha demostrado el flujo completo con datos reales, metodología suficiente, cálculo, mapa, linaje, brechas y paquete de insumos. El estado se promoverá marco por marco, comenzando con Acápite Nacional y Meta 2.

## Capacidad mínima del equipo y horizonte indicativo

Para ejecutar fases consecutivas sin crear nuevas pantallas desconectadas se recomienda, como mínimo, responsabilidad explícita de metodología/reporte, ingeniería de datos, backend/PostGIS, frontend y QA. Una misma persona puede cubrir más de un rol, pero metodología y aprobación institucional no deben sustituirse por decisiones técnicas.

Los 16 incrementos están pensados como entregas de una a dos semanas. El horizonte real depende de disponibilidad de datos, documentos oficiales y responsables institucionales; cualquier fase bloqueada por metodología debe entregar arquitectura operativa y el estado explícito, no una regla inventada.
