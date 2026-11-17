param(
  [string]$Container = 'sigi-ux-v2-postgres-1'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$seedPath = Join-Path $repoRoot 'infra/postgres/demo/costa-rica-demo.sql'

if (-not (Test-Path -LiteralPath $seedPath)) {
  throw "No se encontró el seed: $seedPath"
}

$running = docker inspect --format '{{.State.Running}}' $Container 2>$null
if ($LASTEXITCODE -ne 0 -or $running -ne 'true') {
  throw "El contenedor PostgreSQL '$Container' no está disponible."
}

Write-Host "Aplicando seed Costa Rica en $Container..."
Get-Content -LiteralPath $seedPath -Raw |
  docker exec -i $Container sh -lc 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

if ($LASTEXITCODE -ne 0) {
  throw 'La carga del seed Costa Rica falló.'
}

Write-Host 'Seed Costa Rica aplicado correctamente.'
