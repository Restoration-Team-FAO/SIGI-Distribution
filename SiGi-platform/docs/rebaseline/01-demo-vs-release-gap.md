# Divergencia inicial: baseline aceptado vs release RC

## Historia

Las dos líneas parten de `a0dbadcd` y ninguna es ancestro de la otra:

```text
a0dbadcd
├── demo-deploy-tested ec40482c
└── release/sigi-v1-rc b3cbc6a7
```

La RC nunca incorporó los commits que prepararon la versión revisada. Por esa
razón, que la RC tenga una fecha posterior no significa que sea un superset
funcional.

## Magnitud de la divergencia funcional

Comparando RC hacia demo:

| Área fuente | Archivos | Inserciones en demo | Eliminaciones en demo |
| --- | ---: | ---: | ---: |
| frontend-admin + frontend-country | 62 | 24.491 | 1.926 |
| API + servicios Python | 117 | 14.116 | 1.488 |

La comparación completa queda distorsionada por artefactos generados presentes
en la RC: aproximadamente 16.485 archivos bajo `apps/sigi-api/node_modules` y 27
archivos `__pycache__` están versionados en `b3cbc6a7`, mientras que el baseline
demo no los versiona.

## Capacidades visibles presentes en demo y ausentes o reducidas en RC

- espacios y contexto EGI;
- centro de ayuda y recursos asociados;
- explorador y almacenamiento de archivos;
- conector y administración Kobo;
- módulo ampliado de reportes;
- documentos del portal país;
- catálogo, filtros, tablas y mapas multicapas;
- gestión ampliada de proyectos, usuarios, fuentes y permisos;
- API de archivos, Geo y Kobo;
- lógica ampliada de proyectos, importaciones y reportes.

## Controles valiosos presentes en RC

- build y gates de release posteriores;
- autenticación individual y aislamiento institucional;
- separación de bootstrap y demo seed;
- secretos obligatorios y validación de entorno;
- TLS/proxy, redes y reducción de exposición de puertos;
- mitigaciones de SSRF y validación de uploads;
- límites y paginación GIS;
- índices, constraints y validaciones de datos;
- migraciones, backup/restore y observabilidad;
- CI, pruebas backend y smoke post-deploy.

## Estrategia inicial

| Área | Fuente preferida | Estrategia |
| --- | --- | --- |
| UX, navegación y módulos funcionales | baseline aceptado | conservar como referencia |
| API Files/Geo/Kobo/Reports/Projects | baseline aceptado | conservar y endurecer |
| higiene del repositorio | baseline + reglas RC | no portar generados de RC |
| autenticación y tenant scope | RC | reimplementar sobre API demo |
| migraciones e integridad | RC | adaptar tras comparar esquemas |
| Docker producción y TLS | RC | portar sin cambiar aplicación |
| secretos y configuración | RC | adaptar y validar desde cero |
| GIS hardening | RC | adaptar contra Geo API demo |
| CI y release gates | RC | portar después del inventario |
| dashboards reales | ambas | reconciliar contrato y UX |

## Prohibiciones para la integración

- No hacer merge completo de RC sobre el baseline aceptado.
- No cherry-pickear commits de seguridad sin revisar sus cambios funcionales.
- No aceptar una reducción de rutas o pantallas como resolución de conflicto.
- No versionar `node_modules`, `dist`, caches, secretos ni dumps.
- No declarar una función validada solo porque la ruta devuelve HTTP 200.
- No cambiar un comportamiento revisado sin evidencia y aceptación explícita.
