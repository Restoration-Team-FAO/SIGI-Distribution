# 10 — Resultado de Fase 2: Home 360 y Mi trabajo

Fecha: 2026-09-21  
Rama: `feature/ux-ui-v2`

## Resultado

El inicio autenticado dejó de ser una ruta rápida para superadmin y pasó a ser un Home 360 condicionado por permisos. Presenta atención requerida, KPIs navegables, una bandeja compuesta de trabajo, actividad reciente y el estado de cada fuente consultada.

No se añadieron fixtures ni respuestas falsas. Cuando una fuente no responde, su widget queda `Parcial` sin bloquear los demás. Cuando el perfil no tiene permiso, la consulta no se ejecuta y la fuente se declara `Sin permiso`.

## Matriz de widgets reales

| Widget | Endpoint real | Permiso | Destino | Estado |
| --- | --- | --- | --- | --- |
| resumen del EGI | `GET /admin/egi/:id/summary` | acceso/membresía EGI | módulos autorizados | REAL |
| proyectos | resumen EGI | `projects.read` | `/admin/projects` | REAL |
| fuentes | resumen EGI + `GET /admin/sources` | `sources.read` | `/admin/sources?view=sources` | REAL |
| fuentes desactualizadas | `GET /admin/sources` + umbral UI documentado de 30 días | `sources.read` | `?freshness=stale` | REAL, cálculo cliente |
| documentos | resumen EGI | `files.read` | `/admin/files` | REAL |
| informes en preparación | `GET /admin/reports/dashboard` | `reports.read` | `/admin/reports/history?status=DRAFT` | REAL |
| notificaciones personales | `GET /admin/reports/notifications` | `reports.read` | `/admin/reports` | REAL y personal |
| compromisos próximos/vencidos | `GET /admin/reports/commitments` | `reports.read` | `?commitmentUrgency=due&year=…` | REAL |
| validaciones pendientes | resumen EGI | `validations.read` | `?view=cases&status=pending` | REAL, de ámbito EGI |
| alertas abiertas | `GET /admin/incidents` | `incidents.read` | `/admin/validations?view=alerts` | REAL |
| actividad reciente | `GET /admin/audit` | `audit.read` | Home | REAL |

## Deep links y filtros

- Informes interpreta `year` y `commitmentUrgency`; el valor `due` incluye `OVERDUE` y `DUE_SOON`.
- Validaciones interpreta `status=pending` como resultados `warning` o `failed`.
- Fuentes interpreta `freshness=stale` como fuentes activas sin ingestión o con última ingestión superior a 30 días.
- El historial de informes conserva el filtro `status` existente.

Los filtros permanecen en la URL y pueden compartirse o restaurarse.

## Comportamiento parcial

La carga se divide en dos niveles:

1. el resumen EGI es la dependencia base;
2. informes, notificaciones, compromisos, fuentes, incidentes y auditoría cargan en paralelo mediante resultados independientes.

Un fallo secundario no convierte el Home completo en error. El usuario ve la procedencia y el estado de cada agregado.

## Límite actual de “Mi trabajo”

La bandeja actual es una composición honesta:

- las notificaciones de informes sí son personales;
- compromisos pueden contener aportes asignados y están limitados por el scope backend;
- validaciones, incidentes y fuentes son señales del EGI visibles según permiso, no asignaciones personales universales.

Por eso la interfaz no afirma que exista todavía un inbox transversal persistido.

## Contrato propuesto para el agregador

Endpoint futuro:

```http
GET /api/me/work-items?types=validation,incident,report,source&status=open&cursor=…
Authorization: Bearer …
X-SIGI-EGI-ID: <uuid>
```

Respuesta propuesta:

```json
{
  "data": {
    "scope": { "egiId": "uuid", "userId": "uuid" },
    "generatedAt": "2026-09-21T16:00:00.000Z",
    "completeness": {
      "status": "complete",
      "sources": [
        { "code": "reports", "status": "ready" },
        { "code": "validations", "status": "ready" }
      ]
    },
    "items": [
      {
        "id": "report-notification:uuid",
        "type": "report",
        "title": "Aporte próximo a vencer",
        "summary": "Texto operativo seguro",
        "status": "open",
        "priority": "high",
        "dueAt": "2026-10-01T00:00:00.000Z",
        "assignedToUserId": "uuid",
        "source": { "entityType": "report_commitment", "entityId": "uuid" },
        "destination": {
          "path": "/admin/reports",
          "query": { "commitmentId": "uuid" }
        },
        "requiredPermission": "reports.read"
      }
    ],
    "nextCursor": null
  }
}
```

Reglas obligatorias:

- resolver usuario y EGI exclusivamente desde token/header validados;
- filtrar cada tipo por permiso backend antes de contar o devolver elementos;
- no revelar conteos de módulos prohibidos;
- aplicar scope institucional y EGI en cada consulta;
- usar IDs compuestos estables y destinos permitidos, nunca URLs arbitrarias;
- soportar paginación por cursor y orden estable por prioridad/fecha;
- declarar fuentes parciales o degradadas en `completeness`;
- auditar lecturas sensibles sin registrar contenido privado;
- reutilizar estados del dominio; no crear estados solo para presentación.

## Pendiente

- implementar y revisar el contrato `/me/work-items` en una fase backend explícita;
- mover el umbral de fuentes a configuración institucional si deja de ser una regla UX;
- añadir asignación personal consistente a validaciones e incidentes;
- crear deep link por `commitmentId` cuando el workspace de informes soporte foco de entidad;
- definir SLA y estrategia de caché del agregador.

Hasta que ese contrato exista, el Home mantendrá su agregación de endpoints reales y la etiqueta explícita de alcance.

## Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `npm run typecheck:admin` | PASS |
| `npm run build:admin` | PASS, 108 módulos |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 89 Node + 6 Python |
| `npm run test:e2e` | PASS, 26/26 |
| E2E crítico de Home y deep links | PASS, 11/11 |
| `npm run smoke:roles` | PASS, 36/36 |
| `npm run smoke:unified-frontend` | PASS, 50/50 |

Docker de revisión:

- aplicación: `http://127.0.0.1:5374`;
- referencia Country: `http://127.0.0.1:5373`;
- API: `http://127.0.0.1:3200/api`;
- imagen frontend: `sha256:23a9a9686e34d0a9d454b5238e5f908818ffcb892e06675f8827d72e803b95cd`;
- servicios del proyecto `sigi-ux-v2`: saludables.
