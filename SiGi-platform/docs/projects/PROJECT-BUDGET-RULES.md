# Reglas de presupuesto y finanzas de proyectos

## Semántica

La moneda de comparación es `financial_base_currency`. Cada movimiento conserva monto y moneda originales, tipo de cambio y `base_amount`.

En modo `execution`:

```text
Presupuesto inicial = total de la primera versión aprobada
Ajustes netos       = ajustes aprobados con efecto increase - decrease
Presupuesto vigente = presupuesto inicial + ajustes netos
Comprometido        = suma de compromisos aprobados
Ejecutado           = suma de pagos aprobados
Disponible          = presupuesto vigente - comprometido
Saldo por ejecutar  = presupuesto vigente - ejecutado
% comprometido      = comprometido / presupuesto vigente × 100
% ejecución         = ejecutado / presupuesto vigente × 100
Variación           = presupuesto vigente - presupuesto inicial
```

`Comprometido` incluye el valor de compromisos aprobados y no se reduce automáticamente por pagos. `Ejecutado` significa pago/gasto efectivo aprobado; el devengo se conserva como tipo independiente y no se presenta como pago. Esta decisión evita mezclar obligaciones y salida efectiva de fondos.

En `planning`, inicial/vigente/variación pueden calcularse, pero compromiso, ejecución y sus porcentajes son `null`. En `external`, los totales provienen de los campos informados y se acompañan de sistema, fuente, fecha de corte y última actualización. En `none`, todas las métricas financieras son `null`, no cero.

## Reglas de integridad

- Una partida solo puede crearse o modificarse en `planning` o `execution`.
- Un movimiento local solo puede registrarse en `execution`.
- Compromisos, pagos, devengos, ajustes y transferencias deben referenciar una partida del mismo proyecto cuando corresponda.
- Montos transaccionales son no negativos; un ajuste expresa su signo mediante `budget_effect`.
- El tipo de cambio debe ser mayor que cero.
- Un compromiso aprobado no puede superar el presupuesto vigente disponible.
- Un pago aprobado no puede hacer que la ejecución acumulada supere el presupuesto vigente.
- Las versiones no se sobrescriben: se crean con número único por proyecto y pasan por aprobación.
- Cambiar a `none` o `external` con datos locales requiere `acknowledgeExistingData=true`; los datos se preservan como historial.
- `external` requiere sistema fuente, código externo, fuente del dato y fecha de corte para que sus métricas sean trazables.
- La eliminación o modificación de recursos sensibles produce auditoría.

## No comparable y desconocido

| Estado | Representación API |
| --- | --- |
| No gestionado por SIGI | `applicable=false`, montos `null` |
| Gestionado externamente sin dato | `source=external`, monto `null` |
| Presupuesto real igual a cero | `applicable=true`, monto `0` |
| Dato desconocido | `null` |

Los agregados deben informar separadamente proyectos SIGI, externos y sin seguimiento; `none` nunca entra en denominadores financieros.

## Aprobación y separación de funciones

`projects.budget.manage` crea fuentes, partidas y versiones en borrador. `projects.budget.approve` aprueba versiones. `projects.finance.manage` registra movimientos. El frontend adapta acciones, pero el control vinculante está en los guards del backend.

## Límites deliberados

SIGI no implementa contabilidad general. Proveedor, documento, referencia externa, contrato u orden pueden registrarse para trazabilidad, pero el mayor contable y el ciclo completo de compras permanecen en el ERP institucional.
