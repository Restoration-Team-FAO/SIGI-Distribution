# Runbook — Cutover y rollback del frontend único

## Alcance

Este runbook prepara SF-11 sin ejecutarlo. La candidata única es `frontend-admin`; `frontend-country` permanece desplegado como referencia y rollback hasta que SF-12 sea autorizado por separado.

## Artefactos y topología de revisión

| Componente | Dirección | Uso |
| --- | --- | --- |
| Frontend único candidato | `http://127.0.0.1:5374` | rutas públicas y workspace autenticado |
| Country legado | `http://127.0.0.1:5373` | referencia y rollback |
| API | `http://127.0.0.1:3200/api` | backend compartido de validación |
| GeoServer | `http://127.0.0.1:8281/geoserver` | servicios geoespaciales |

Imagen candidata validada el 2026-09-18:

```text
sigi-ux-v2-frontend-admin:latest
sha256:9e4e9b8779b48c0e7b2183b133a53e02799a799b7f0e5579645358765f1457d1
```

## Gate previo obligatorio

- [ ] aprobación funcional de Proyectos;
- [ ] aprobación funcional de GIS;
- [ ] aprobación funcional de Monitoreo;
- [ ] aprobación funcional de Reportes y Documentos;
- [ ] aprobación funcional de Integraciones;
- [ ] auditoría de payloads públicos;
- [ ] CI/release gate verde sobre el commit candidato;
- [ ] backup y tag inmutable de ambas imágenes;
- [ ] ventana de cambio y responsables confirmados;
- [ ] autorización explícita para SF-11.

## Verificación pre-cutover

```powershell
$env:SIGI_UNIFIED_FRONTEND_URL='http://127.0.0.1:5374'
$env:SIGI_COUNTRY_REFERENCE_URL='http://127.0.0.1:5373'
npm run smoke:unified-frontend

$env:SIGI_E2E_ADMIN_URL='http://127.0.0.1:5374'
$env:SIGI_E2E_COUNTRY_URL='http://127.0.0.1:5373'
npm run test:e2e
```

Además deben aprobar `npm run typecheck`, `npm run build`, `npm run test:unit`, `npm run smoke:roles`, `npm run smoke:geo-visibility` y `npm run smoke:geo-api` con la URL de API del entorno.

## Secuencia de cutover SF-11

1. Etiquetar por digest la imagen candidata y la imagen Country vigente.
2. Desplegar la candidata sin detener Country.
3. Ejecutar el smoke de rutas/cabeceras y las pruebas de autenticación, rol y EGI.
4. Cambiar únicamente el upstream público del proxy hacia la imagen única.
5. Verificar `/`, `/dashboard`, `/projects`, `/geo-bi`, `/reports`, `/documents` y `/administration` desde el dominio real.
6. Verificar login, retorno a deep link, cambio de EGI y logout.
7. Observar durante la ventana acordada tasas HTTP 4xx/5xx, errores JS, latencia de API, salud de contenedores y logs de autenticación.
8. Cerrar SF-11 solo tras la aceptación post-deploy.

No se elimina código, servicio, volumen ni imagen Country durante SF-11.

## Umbrales de rollback

Revertir el upstream a Country si ocurre cualquiera de estos eventos atribuible a la candidata:

- una ruta pública crítica devuelve error o queda vacía;
- se observa una llamada `/api/admin/*` desde una sesión anónima;
- falla login, refresh, cambio de EGI o autorización backend;
- aparece información restringida en una respuesta pública;
- GIS no puede cargar capas públicas o seleccionar/exportar elementos;
- la tasa de errores supera el umbral operativo acordado.

## Rollback

1. Restaurar el upstream público al digest Country etiquetado.
2. No tocar API, base de datos ni GeoServer: la consolidación no cambia sus contratos.
3. Invalidar solo el documento HTML del proxy/CDN; conservar assets versionados.
4. Ejecutar smoke público en Country y confirmar salud.
5. Conservar logs, digest y commit de la candidata para diagnóstico.
6. Registrar causa, impacto, hora de inicio/fin y decisión de reintento.

## Retiro SF-12

SF-12 comienza únicamente después del periodo de observación aprobado. Requiere una autorización destructiva nueva para retirar el servicio Compose, jobs, código duplicado e imagen activa. El tag y el historial Git deben permanecer recuperables.
