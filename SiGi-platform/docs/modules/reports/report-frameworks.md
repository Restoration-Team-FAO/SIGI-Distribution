# Marcos de informe

- `NATIONAL_CHAPTER`: Acápite Nacional configurable por país, con 17 secciones base.
- `REGIONAL_RESTORATION`: consolidación multipaís, con 20 secciones base.
- `BTR`: organización de insumos de transparencia climática; SIGI no afirma producir automáticamente un BTR oficial.
- `NDC`: seguimiento de metas, indicadores, políticas y evidencias.
- `GBF_TARGET_2`: Meta 2 de biodiversidad con separación entre superficie registrada, degradada, elegible y reportable.
- `LDN`: cobertura, productividad, carbono de suelo y degradación; no simula interoperabilidad PRAIS.
- `CUSTOM`: base para plantillas institucionales.

Las secciones se cargan desde `report_template_sections`. Un país puede crear una plantilla propia y reordenar o reemplazar su estructura sin desplegar React.

## Correspondencias

Tipos: `DIRECT`, `DERIVED`, `AGGREGATED`, `MANUAL` y `NOT_EQUIVALENT`. Los derivados/agregados exigen regla de transformación. `DIRECT` exige elegibilidad expresa y nunca se infiere automáticamente.
