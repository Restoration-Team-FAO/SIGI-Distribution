# Casos de Uso por Perfil

## Objetivo

Este documento resume los principales casos de uso de SIGI organizados por perfil de usuario, con base en los roles sembrados en el entorno demo, la consola administrativa y la arquitectura funcional del proyecto.

## Perfiles considerados

Los perfiles identificados en el repositorio son:

- `superadmin`
- `national_admin`
- `institution_editor`
- `technical_validator`
- `technical_integration`
- `read_consumer`
- `usuario_publico`

## 1. Superadministrador SIGI (`superadmin`)

Perfil con alcance total sobre la plataforma, la configuración global y la gobernanza operativa.

### Casos de uso

- Administrar usuarios del sistema.
- Crear, editar y eliminar roles.
- Consultar permisos disponibles y asignarlos a roles.
- Revisar la bitácora de auditoría.
- Consultar el estado del módulo Geo/BI.
- Revisar publicaciones disponibles.
- Ejecutar acciones de publicación.
- Supervisar instituciones, conectores, datasets y flujos operativos.
- Gestionar la configuración administrativa global del SIGI.

## 2. Administrador Nacional (`national_admin`)

Perfil responsable de la operación nacional de la plataforma y de la coordinación entre instituciones.

### Casos de uso

- Consultar y administrar usuarios.
- Consultar y administrar roles según la política vigente.
- Supervisar instituciones y fuentes de datos a nivel país.
- Revisar el estado de módulos críticos del sistema.
- Consultar exportaciones disponibles.
- Ejecutar publicaciones de información validada.
- Coordinar la operación general del dashboard, catálogos y módulos administrativos.

## 3. Editor Institucional (`institution_editor`)

Perfil orientado a la operación de datos de una institución o entidad participante.

### Casos de uso

- Consultar proyectos asociados a su institución.
- Consultar fuentes Kobo y fuentes operativas habilitadas.
- Consultar el catálogo geoespacial disponible.
- Cargar o preparar datos institucionales para integración.
- Mantener información operativa asociada a proyectos, indicadores o territorios según permisos.
- Dar seguimiento a la información de su institución dentro del flujo SIGI.

### Restricciones esperadas

- No administra usuarios.
- No administra roles.
- No ejecuta publicaciones globales.

## 4. Validador Técnico (`technical_validator`)

Perfil responsable del control de calidad, revisión técnica y seguimiento de validaciones.

### Casos de uso

- Consultar la consola de validaciones.
- Revisar casos, hallazgos y estados de validación.
- Dar seguimiento a incidencias de calidad de datos.
- Consultar información de apoyo en módulos técnicos, incluyendo Geo/BI cuando aplique.
- Verificar consistencia de datasets antes de su publicación.
- Aportar criterio técnico para reaperturas, correcciones o revalidaciones.

### Restricciones esperadas

- No administra usuarios.
- No administra roles.
- No opera conectores de carga institucional como función principal.
- No ejecuta exportaciones o publicaciones finales.

## 5. Integración Técnica (`technical_integration`)

Perfil especializado en conectores, sincronización y operación del pipeline de integración.

### Casos de uso

- Consultar el módulo de conectores.
- Revisar el estado de sincronizaciones y procesos técnicos.
- Monitorear la operación del flujo de integración.
- Consultar capacidades Geo/BI relacionadas con la integración de datos.
- Dar soporte a fuentes como Odoo, Kobo, API, Excel o PostGIS.
- Ejecutar o acompañar corridas de sincronización institucional.
- Revisar errores técnicos de ingestión, transformación o staging.

### Restricciones esperadas

- No publica información al portal.
- No ejecuta exportaciones de salida como usuario final.
- No administra usuarios ni gobierno de accesos.

## 6. Consumidor de Lectura (`read_consumer`)

Perfil de consulta operativa, orientado a usuarios que necesitan revisar información sin modificar configuraciones críticas.

### Casos de uso

- Consultar publicaciones disponibles.
- Consultar incidentes y alertas visibles en la consola administrativa.
- Revisar información ya procesada o publicada.
- Dar seguimiento de lectura a la operación del sistema.
- Consultar reportes o salidas informativas según permisos habilitados.

### Restricciones esperadas

- No administra usuarios.
- No administra roles.
- No opera conectores.
- No accede a módulos técnicos restringidos como Geo/BI administrativo.
- No ejecuta exportaciones ni publicaciones.

## 7. Usuario Público (`usuario_publico`)

Perfil no autenticado o de consulta pública, enfocado en la visualización de información publicada por SIGI.

### Casos de uso

- Consultar el dashboard público.
- Visualizar indicadores nacionales.
- Consultar proyectos publicados.
- Explorar resúmenes territoriales.
- Consultar mapas, capas y vistas públicas Geo/BI.
- Revisar calidad y trazabilidad pública cuando esté expuesta.
- Consultar reportes públicos e información consolidada por país.

## Resumen por alcance

| Perfil | Enfoque principal | Tipo de interacción |
| --- | --- | --- |
| `superadmin` | Gobierno total de la plataforma | Administración, control y publicación |
| `national_admin` | Operación nacional | Coordinación, supervisión y publicación |
| `institution_editor` | Gestión institucional | Edición y operación funcional |
| `technical_validator` | Calidad y validación | Revisión técnica y control |
| `technical_integration` | Integración de datos | Sincronización y soporte técnico |
| `read_consumer` | Consulta operativa | Lectura y seguimiento |
| `usuario_publico` | Transparencia y acceso público | Visualización de información publicada |

## Observaciones

- Los perfiles anteriores están alineados con los roles protegidos definidos en la consola de usuarios.
- Algunos casos de uso ya tienen soporte funcional en módulos existentes.
- Otros casos de uso reflejan la dirección arquitectónica del SIGI y pueden estar implementados de forma parcial o planificada.
- El modelo separa claramente la operación administrativa, la integración técnica, la validación y la consulta pública.

## Referencias internas

- `apps/frontend-sigi/src/pages/UsersPage.tsx`
- `scripts/role-smoke.mjs`
- `infra/postgres/init/900_phase5_demo_seed.sql`
- `docs/alineamiento-sigi-pantallas-endpoints.md`
- `docs/architecture/domain-model.md`
