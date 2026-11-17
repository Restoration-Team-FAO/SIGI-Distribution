# Sprint 2R — Resultado y mapa de portabilidad

## Resultado

La auditoría técnica queda completa contra `ec40482c` y `b3cbc6a7`. La RC no
puede integrarse como rama: su árbol final elimina capacidades REAL del Sprint
1R. Sí contiene controles de producción que deben trasladarse selectivamente.

| Dominio | Decisión dominante | Próximo sprint |
| --- | --- | --- |
| higiene Git | PORTAR | añadir gitignore raíz y comprobar que no versiona artifacts |
| migraciones | ADAPTAR | manifest/checksum nuevo para esquema baseline completo |
| seed/bootstrap | REIMPLEMENTAR | schema limpio + seed opcional + institución/EGI idempotentes |
| identidad/scope | REIMPLEMENTAR | conservar roles/EGI y sumar controles RC |
| TLS/redes/GeoServer DB | ADAPTAR | edge-only con volúmenes preservados |
| uploads/SSRF | REIMPLEMENTAR | política común para toda la superficie funcional |
| integridad DB | ADAPTAR | dominios compatibles, fechas reales y JSON |
| GIS/styles | ADAPTAR | SLD + bootstrap + gates multicapas |
| CI/QA | ADAPTAR | workflow raíz que ejecute baseline + controles RC |
| backup/restore | ADAPTAR | unión de cobertura baseline y seguridad RC |

## Backlog de portabilidad ordenado

### P0 — Fundación 3R

1. Crear `integration/sigi-v1-reconciled` desde el baseline/main reconciliado.
2. Portar higiene Git sin eliminar archivos funcionales.
3. Crear manifest de migraciones completo y gate sobre DB limpia + dump baseline.
4. Separar seed demo del schema sin perder EGI, documentos, reportes o GIS.
5. Corregir CI a `.github/workflows` raíz y retirar `.env.production` de artifacts.
6. Mantener suite R1 10/10 como gate obligatorio.

### P0 — Seguridad y operación posteriores

7. Cerrar `/api/audit` público.
8. Añadir CORS/trusted proxy configurables y tokens legacy fail-closed.
9. Diseñar scope unificado institución + EGI antes de portar guards RC.
10. Aplicar SSRF a Kobo, Odoo y conectores genéricos.
11. Aplicar validación de uploads a datasets, GIS, archivos y reportes.
12. Construir edge TLS, redes internas y rol GeoServer read-only conservando
    `postgres_data`, `geoserver_data` y `sigi_files_data`.

### P1

13. Adaptar constraints de dominio, JSON y fecha de observación.
14. Definir archivo de proyectos antes de activar prohibición de DELETE.
15. Versionar SLD y verificar WMS/WFS.
16. Unificar backup completo con política externa/retención y restore automático.
17. Reemplazar fixtures runtime sólo cuando el endpoint real conserve el
    comportamiento validado en Sprint 1R.

## Gates de 3R

- cero rutas o funciones Sprint 1R desaparecidas;
- 10/10 Playwright rebaseline;
- schema limpio sin seed y seed opcional idempotente;
- migración de una copia baseline sin pérdida de conteos/relaciones;
- ningún secret o `.env.production` en artifacts;
- build reproducible sin `node_modules`, `dist`, `bin`, `obj` o bytecode Git;
- controles portados con prueba negativa y positiva;
- ningún commit RC integrado completo salvo `95c3df91`.

## Definition of Done 2R

| Entregable | Estado |
| --- | --- |
| comparación esquema/migraciones | DONE — `20-schema-migration-portability.md` |
| autenticación/autorización/scope | DONE — `21-auth-authorization-scope-portability.md` |
| Docker/TLS/redes/volúmenes | DONE — `22-infrastructure-operations-portability.md` |
| GIS/GeoServer/uploads | DONE — `23-gis-uploads-connectors-portability.md` |
| CI/pruebas/backup/observabilidad | DONE — `24-ci-qa-backup-observability-portability.md` |
| matriz de 45 commits | DONE — `25-rc-commit-portability-matrix.md` |
| prueba SQL sobre copia aislada | DONE; temporales eliminados |

## Decisión

**Sprint 3R puede comenzar.** Debe partir del baseline reconciliado actual y
aplicar el backlog anterior en unidades pequeñas. No debe crearse mediante merge
de `release/sigi-v1-rc` ni sustituir directorios completos por los de la RC.
