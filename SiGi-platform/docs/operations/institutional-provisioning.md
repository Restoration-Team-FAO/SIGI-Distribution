# Provisión institucional

La configuración inicial de instituciones, espacios EGI y membresías se carga
por API. El proceso es idempotente: reutiliza instituciones y EGI por código y
actualiza las membresías declaradas.

1. Copie `templates/institutional-config.example.json` fuera del checkout y
   sustituya códigos, nombres, alcances y correos por los institucionales.
2. Mantenga la contraseña fuera del JSON y del repositorio.
3. Ejecute contra la API ya saludable:

```powershell
$env:SIGI_PROVISION_API_URL='https://admin.example.org/api'
$env:SIGI_PROVISION_ADMIN_EMAIL='superadmin@example.org'
$env:SIGI_PROVISION_ADMIN_PASSWORD='<secret>'
npm run ops:provision -- --config=C:\secure\institutional-config.json
```

La salida debe indicar `"ok": true` y listar todos los códigos en
`verifiedEgiCodes`. Una segunda ejecución no debe crear instituciones ni EGI.
El endpoint de membresías exige `egi.memberships.manage`, valida el ámbito
institucional y registra `egi.membership.upserted` en auditoría.

No use `tests/fixtures/institutional-config.uat.json` en producción: contiene
nombres y ámbitos exclusivos de la validación R8.
