# Sprint 2R — Esquema y migraciones

## Alcance y evidencia

- Baseline funcional: `ec40482c34a536db1dc9b53c980f9c848baf6fb5`.
- Fuente de controles RC: `b3cbc6a76b755c048c00bca92f7afd76225cbfd0`.
- Ancestro común: `a0dbadcddefd98ea547e6298a1b6bea31ca0a689`.
- VERIFIED IN CODE mediante `git ls-tree`, `git diff-tree` y lectura de cada SQL.
- VERIFIED BY EXECUTION sobre clones temporales de `sigi_db`; la base original
  no fue modificada y las siete bases `sigi_2r_*` fueron eliminadas al terminar.

## Inventario comparado

| Ref | Archivos PostgreSQL | `init/` | `migrations/` | seeds separados | empty-demo |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 35 | 18 | 14 | 0 | 3 |
| RC | 30 | 14 | 14 | 2 | 0 |

La coincidencia numérica de 14 migraciones no implica equivalencia. La RC
elimina del árbol final las migraciones de documentos, roles, EGI, Geo/BI,
saved views, reportes y geometría mixta. El baseline contiene esas capacidades
y no puede adoptar el árbol RC por reemplazo.

## Prueba de migraciones RC sobre una copia del baseline

| Control RC | Resultado técnico | Compatibilidad funcional | Decisión |
| --- | --- | --- | --- |
| índice GiST territorial | aplica; el índice equivalente ya existe en el baseline | compatible/redundante | ADAPTAR al manifest, sin duplicar |
| integridad de dominios/FK | aplica y crea/valida 20 constraints | los dominios RC de visibilidad excluyen `institutional` y `restricted`, válidos en el baseline | ADAPTAR dominios y conservar scope EGI |
| fecha de observación | aplica; `observed_at` queda nullable y crea 2 índices parciales | elimina el sentinel `1970-01-01`, pero contrato/import/UI deben cambiar juntos | ADAPTAR |
| bootstrap institucional | aplica y crea su registro de bootstrap | no cubre EGI, membresías ni módulos nuevos del baseline | REIMPLEMENTAR bootstrap completo |
| identidad | aplica sobre las tablas existentes | esquema compatible, pero la aplicación RC pierde permisos/EGI del baseline | ADAPTAR sólo cambios incrementales |
| JSON + borrado de proyecto | aplica; añade 14 constraints y 1 trigger | JSON es compatible; prohibir DELETE sin flujo de archivo contradice operaciones existentes | ADAPTAR JSON y REIMPLEMENTAR lifecycle |

Los wrappers de tres migraciones RC usan `\ir /docker-entrypoint-initdb.d/...`.
Al ejecutarlos directamente contra el Compose baseline fallaron porque esos
archivos aún no están montados. El SQL interno sí pasó al suministrarlo de forma
aislada. Esto confirma que el runner y el layout deben portarse juntos.

## Brechas del modelo

| Área | Baseline que debe preservarse | Control RC reutilizable | Riesgo de port directo |
| --- | --- | --- | --- |
| Documentos | schema `documents`, versiones, permisos, enlaces y EGI | constraints JSON y backup | la RC elimina el módulo y sus migraciones |
| EGI | spaces, memberships, preferencias y FK por dominio | aislamiento institucional | reemplazar por guard RC elimina una dimensión de scope |
| GIS | catálogo rico, geometría mixta, metadata y saved views | GiST, límites, estilos y usuario read-only | dominios RC son más estrechos |
| Reportes | 20+ tablas `report_*`, workflow y permisos | integridad JSON/fechas | el manifest RC no conoce el módulo |
| Usuarios/roles | permisos DB-driven y membresías | sesiones, TTL y bootstrap inicial | el seed/roles RC es una versión reducida |
| Demo/producción | seed funcional hoy autoejecutado | separación schema/seed de RC | copiar RC dejaría fuera datos y módulos necesarios |

## Manifest objetivo para Sprint 3R

No se debe copiar `infra/postgres/migrations/manifest.txt` de la RC. Debe
generarse uno nuevo que incluya, en orden, las 14 migraciones baseline y las
adaptaciones RC. El gate deberá probar:

1. checkout/base limpia sin seed;
2. bootstrap institucional idempotente con EGI;
3. carga demo opcional e idempotente;
4. migración desde un dump real del baseline;
5. checksums inmutables y reejecución sin cambios;
6. archivos, reportes, GIS y saved views después de migrar;
7. backup/restore de DB y volúmenes antes de aceptar el manifest.

Conclusión: **no hay migración que deba copiarse sin revisión semántica**. El
mecanismo de manifest/checksum es portable; el contenido debe adaptarse al
esquema funcional completo.
