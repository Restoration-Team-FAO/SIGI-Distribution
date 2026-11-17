# Sprint 2R — Matriz de portabilidad por commit RC

Rango examinado: los 45 commits alcanzables desde `b3cbc6a7` y no alcanzables
desde `ec40482c`; merge-base `a0dbadc`. `git apply --check` se ejecutó contra el
baseline para 19 commits representativos: todos fallaron. Sólo `95c3df91` pasó
limpio. Esto confirma que `PORTAR` significa copia/cherry-pick directo y debe ser
excepcional.

| # | Commit | Descripción | Clasificación | Razón verificable |
| ---: | --- | --- | --- | --- |
| 1 | `190fb58a` | actualización monolítica | DESCARTAR | 16,588 archivos platform, incluidos dependencias/build; ancestro funcional obsoleto |
| 2 | `b159f29c` | actualización general de app | DESCARTAR | versión anterior y menor de front/API; sustituiría baseline |
| 3 | `54aca3da` | datasets | DESCARTAR | cambio histórico ya superado por implementación baseline |
| 4 | `fd9a7fd5` | actualización funcional amplia | DESCARTAR | pre-RC divergente; no es control aislable |
| 5 | `95c3df91` | gitignore raíz | PORTAR | `git apply --check` PASS; excluye dependencias, build, secrets y artifacts |
| 6 | `810d4892` | documentos baseline RC | DESCARTAR | alcance RC reemplazado por rebaseline 0R–2R |
| 7 | `4674573b` | P0-A seguridad/config/GiST | ADAPTAR | audit público, secrets, SSRF y GiST valiosos; patch no aplica y toca contratos divergentes |
| 8 | `3e3ef246` | Docker API lockfile | ADAPTAR | `npm ci` es correcto; depende de archivo GiST RC ausente |
| 9 | `ac8200a2` | evidencia P0-A | DESCARTAR | evidencia de otra arquitectura |
| 10 | `dabd11b8` | P0-A restante/paginación | ADAPTAR | caps GIS, GeoServer y smokes útiles; APIs baseline son más amplias |
| 11 | `3fcddc63` | evidencia Sprint 2 | DESCARTAR | sólo evidencia RC |
| 12 | `b63be468` | topología production | ADAPTAR | Caddy/redes/DB read-only útiles; debe preservar EGI, archivos y volúmenes |
| 13 | `43c770dc` | evidencia/fix restore | ADAPTAR | incluye corrección operativa de restore junto con documentación |
| 14 | `4755cebd` | separación schema/seed | REIMPLEMENTAR | objetivo requerido; sus SQL eliminan módulos baseline y no cubren EGI |
| 15 | `962b81bb` | evidencia bootstrap | DESCARTAR | resultado ligado al esquema reducido RC |
| 16 | `97917804` | identidad/scope tenant | REIMPLEMENTAR | baseline ya tiene identidad más rica; guard RC ignora EGI y eleva integración a global |
| 17 | `f2d884e4` | evidencia auth | DESCARTAR | evidencia RC, no aceptación baseline |
| 18 | `7100735a` | gate P0 Playwright | REIMPLEMENTAR | patrón útil, pero suite cubre producto reducido y no rutas Sprint 1R |
| 19 | `e6d5b6e1` | evidencia gate P0 | DESCARTAR | no prueba módulos ausentes |
| 20 | `3c799015` | quoting restore CI | ADAPTAR | fix depende del workflow RC a reconciliar |
| 21 | `48ab10b7` | audit con sesión individual | ADAPTAR | caso negativo/positivo válido para controller baseline |
| 22 | `6f51fd51` | espera bootstrap CI | ADAPTAR | robustez útil dentro del nuevo job DB |
| 23 | `82e0469d` | poll readiness CI | ADAPTAR | útil, requiere Compose reconciliado |
| 24 | `f5936fa8` | evidencia remota P0 | DESCARTAR | evidencia histórica no portable |
| 25 | `adc3e760` | dashboards live | REIMPLEMENTAR | intención correcta; patch reduce pantallas y no cubre todos los fixtures R1 |
| 26 | `9ab574a5` | evidencia dashboards | DESCARTAR | no sustituye validación funcional del usuario |
| 27 | `d97539a0` | integridad dominios/FK | ADAPTAR | SQL aplica, pero dominios de visibilidad contradicen baseline |
| 28 | `bfd8d31d` | evidencia integridad | DESCARTAR | evidencia RC |
| 29 | `17123fe2` | fechas de indicadores | ADAPTAR | elimina sentinel; requiere contrato UI/API/import baseline coordinado |
| 30 | `5da1aee9` | evidencia fechas | DESCARTAR | evidencia RC |
| 31 | `e1445444` | JSON/lifecycle proyecto | ADAPTAR | JSON aplica; guard DELETE requiere workflow de archivo previo |
| 32 | `061ce538` | evidencia lifecycle | DESCARTAR | documentación ligada a implementación RC |
| 33 | `81df11b0` | CORS/proxy | ADAPTAR | control P0; conservar headers EGI/export y edge baseline |
| 34 | `3ea3264a` | evidencia CORS/proxy | DESCARTAR | evidencia RC |
| 35 | `b82a1492` | hardening uploads | REIMPLEMENTAR | útil, pero sólo protege parte de las cargas existentes en baseline |
| 36 | `6018c4ca` | evidencia uploads | DESCARTAR | evidencia RC |
| 37 | `496d19b7` | estilos GeoServer | ADAPTAR | SLD portables; bootstrap/catálogo deben reconciliarse |
| 38 | `180b9337` | evidencia estilos | DESCARTAR | evidencia RC |
| 39 | `448a18a1` | migraciones/logs | ADAPTAR | manifest/checksum útiles; lista RC incompleta para baseline |
| 40 | `8a71bf1b` | evidencia operaciones | DESCARTAR | evidencia RC |
| 41 | `f50d7dec` | backend/post-deploy gates | ADAPTAR | añadir a la suite completa, no reemplazarla |
| 42 | `b1a34e76` | runner backend portable | ADAPTAR | depende del gate anterior y debe resolver workspaces baseline |
| 43 | `4428fdcb` | evidencia QA | DESCARTAR | no demuestra equivalencia funcional |
| 44 | `d1c6d5d7` | candidata institucional | ADAPTAR | runbooks/template útiles; scope/release verifier deben rehacerse |
| 45 | `b3cbc6a7` | evidencia P6 | DESCARTAR | no es candidata válida contra el baseline aceptado |

## Totales

| Clasificación | Commits |
| --- | ---: |
| PORTAR | 1 |
| ADAPTAR | 18 |
| REIMPLEMENTAR | 5 |
| DESCARTAR | 21 |
| **Total** | **45** |

No se recomienda merge ni cherry-pick masivo. La unidad de integración para 3R
será el control técnico y su prueba, no el commit RC completo.
