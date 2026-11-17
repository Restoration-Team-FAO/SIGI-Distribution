# Exportación de capas (`/geo/layers/:code/export`, P0-8)

Estado: completado y verificado en ambos frontends (2026-09-02/03). Este es
un extracto de referencia; el diseño completo, el hallazgo de CORS y la
verificación con Playwright están en `MAPA_SIGI_DIAGNOSTICO.md` §9.8. Para la
exportación *distinta* de la consola admin (`/admin/geospatial-catalog/export/:code`,
preexistente), ver `geoserver.md` §4.

## 1. Contrato del endpoint

```
GET /geo/layers/:code/export?format=csv|xlsx|geojson&bbox=&filters=&sort=&order=
```

- **Autenticación**: público con auth opcional, igual que `/features` — un
  llamador anónimo obtiene solo capas públicas; un llamador con
  `connectors.read` obtiene también las no públicas.
- **`format`**: requerido, sin valor por defecto — un endpoint de descarga
  nunca debe producir en silencio un formato que el llamador no pidió.
- **`filters`/`sort`/`order`**: mismo formato y misma validación que
  `/features` (`geo-filter-sql.ts`/`geo-sort-sql.ts`) — el archivo exportado
  siempre refleja exactamente el resultado filtrado/ordenado que el usuario
  está viendo en la tabla de atributos, nunca un conjunto distinto.
- **Sin `page`/`pageSize`/`zoom`**: la exportación no está paginada de cara
  al cliente y nunca simplifica geometría (precisión completa siempre) — la
  simplificación por zoom (P0-3) es un concern de renderizado de mapa, no de
  exportación.
- **Tope**: `MAX_EXPORT_FEATURES = 20000`. Si el resultado real excede el
  tope, se exportan las primeras 20.000 (por el orden efectivo) y la
  respuesta lo declara explícitamente — nunca un truncamiento silencioso.

## 2. Cabeceras de respuesta

| Cabecera | Significado |
|---|---|
| `X-SIGI-Export-Total` | Total de features que cumplen el filtro, sin el tope |
| `X-SIGI-Export-Exported` | Cuántas se exportaron realmente (≤ `MAX_EXPORT_FEATURES`) |
| `X-SIGI-Export-Truncated` | `"true"` si `Total > Exported` |
| `Content-Disposition` | `attachment; filename="sigi-<código-de-capa>-<timestamp>.<ext>"` |

Estas cuatro cabeceras deben estar en `exposedHeaders` de la configuración
CORS de `sigi-api` (`apps/sigi-api/src/main.ts`) — por defecto CORS oculta a
JavaScript del navegador toda cabecera de respuesta salvo un conjunto
"seguro" que no las incluye. Su ausencia fue un defecto real encontrado
durante la verificación de P0-8 (el navegador recibía el archivo pero con
nombre genérico `export.csv`); corregido, ver `MAPA_SIGI_DIAGNOSTICO.md`
§9.8 para el diagnóstico completo. Si se agrega una cabecera de respuesta
nueva en este endpoint en el futuro, debe agregarse aquí también.

## 3. Los tres formatos

Construidos en `apps/sigi-api/src/modules/geo/geo-export.ts` a partir de las
mismas `buildColumns()`/`buildRows()` — una sola definición de "cómo se ve
una fila exportada", no tres que puedan divergir. Columnas: los cinco
builtin (`code`, `name`, `level`, `areaHa`, `updatedAt`) primero, luego el
resto de `properties_json` ordenado alfabéticamente.

| Formato | Implementación | Metadatos de exportación (spec §17) |
|---|---|---|
| CSV | `XLSX.utils.sheet_to_csv` (paquete `xlsx`, ya dependencia de `sigi-api`) | Bloque de comentarios `#` al inicio del archivo (único formato sin lugar nativo para metadata estructurada) |
| XLSX | `XLSX.utils.book_new` + dos hojas | Segunda hoja "Metadata" |
| GeoJSON | `FeatureCollection` estándar | Miembro de nivel superior `metadata` (foreign member, válido per RFC 7946 §6.1) |

Todo formato incluye: capa, fecha de generación, usuario (o "Anónimo"),
filtros aplicados, orden, total disponible, total exportado, y si el
resultado fue truncado.

## 4. Auditoría — reutilizada, no un tercer subsistema

`geospatial-catalog.service.ts` ya tenía su propio `recordAudit` privado
(deuda documentada). En vez de replicarlo una tercera vez, `GeoController`
inyecta el `AuditService` compartido y registra `action: 'geo.layer.export'`
tanto en éxito como en fallo — un fallo al **escribir** la auditoría está
envuelto en su propio `try/catch` para que nunca convierta una exportación
exitosa (archivo ya enviado) en un error 500.

## 5. UI (ambos frontends)

`GeoLayerAttributeTable.tsx` (país y admin): selector de formato + botón
"Exportar" + aviso de truncamiento, reutilizando exactamente los
`filters`/`sort`/`order` que la tabla ya tiene activos (P0-7) — nunca un
estado de exportación independiente que pudiera desincronizarse de lo que la
tabla muestra. La descarga se dispara con el patrón ya establecido en el
proyecto (`URL.createObjectURL` + `<a download>`), no un mecanismo nuevo.

## 6. Cobertura de pruebas

- `scripts/geo-api-smoke.mjs` — 8 verificaciones de exportación (formatos,
  metadata, filtros, formato inválido/ausente, capa restringida
  anónima/autorizada), registradas en `scripts/release-gate.mjs`.
- `tests/e2e/geo.spec.js` — el flujo mínimo activa una capa, filtra, abre la
  ficha y exporta, verificando una descarga real del navegador con el
  nombre de archivo esperado, en ambos frontends.
- `tests/unit/geo-export.test.mjs` — `buildCsvExport`/`buildXlsxExport`/
  `buildGeoJsonExport` en aislamiento (sin servidor ni base de datos).
