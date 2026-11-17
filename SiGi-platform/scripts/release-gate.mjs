import { spawn } from 'node:child_process';

const gates = [
  {
    key: 'roles',
    label: 'Roles y permisos',
    command: ['node', 'scripts/role-smoke.mjs'],
  },
  {
    key: 'identity',
    label: 'Sesiones individuales, rotación y cierre de auditoría pública',
    command: ['node', 'scripts/identity-session-smoke.mjs'],
  },
  {
    key: 'operational',
    label: 'Aislamiento operativo EGI',
    command: ['node', 'scripts/operational-smoke.mjs'],
  },
  {
    key: 'mutations',
    label: 'CRUD transaccional',
    command: ['node', 'scripts/mutation-smoke.mjs'],
  },
  {
    key: 'uat',
    label: 'UAT multi-EGI y multi-institución',
    command: ['node', 'scripts/uat-multi-egi.mjs'],
  },
  {
    key: 'exports',
    label: 'Aislamiento de exportaciones por EGI',
    command: ['node', 'scripts/export-scope-smoke.mjs'],
  },
  {
    key: 'publications',
    label: 'Aislamiento de publicaciones por EGI',
    command: ['node', 'scripts/publication-scope-smoke.mjs'],
  },
  {
    key: 'incidents',
    label: 'Aislamiento de incidentes por EGI',
    command: ['node', 'scripts/incident-scope-smoke.mjs'],
  },
  {
    key: 'geo-visibility',
    label: 'Visibilidad de capas geoespaciales',
    command: ['node', 'scripts/geo-visibility-smoke.mjs'],
  },
  {
    key: 'geo-api',
    label: 'API /geo/* (catálogo, metadata, schema, features)',
    command: ['node', 'scripts/geo-api-smoke.mjs'],
  },
  {
    key: 'audit',
    label: 'Auditoría y requestId',
    command: ['node', 'scripts/audit-smoke.mjs'],
  },
  {
    key: 'metrics',
    label: 'Observabilidad y métricas internas',
    command: ['node', 'scripts/metrics-smoke.mjs'],
  },
  {
    key: 'step2',
    label: 'Datasets, validación, proyectos e indicadores',
    command: ['node', 'scripts/step2-smoke.mjs'],
  },
];
const RETRY_DELAY_MS = 15000;
const MAX_ATTEMPTS = 2;
const COOLDOWN_MS = Number(process.env.SIGI_RELEASE_GATE_COOLDOWN_MS ?? 61000);

async function main() {
  const startedAt = Date.now();
  const results = [];

  for (const gate of gates) {
    const result = await runGate(gate);
    results.push(result);

    if (gate !== gates[gates.length - 1]) {
      await delay(COOLDOWN_MS);
    }
  }

  const finishedAt = Date.now();
  const passed = results.every((result) => result.ok);

  console.log(
    JSON.stringify(
      {
        gate: 'sigi.release',
        ok: passed,
        durationMs: finishedAt - startedAt,
        results,
      },
      null,
      2,
    ),
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

async function runGate(gate) {
  const startedAt = Date.now();
  let lastResult = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    lastResult = await executeGate(gate);

    if (lastResult.exitCode === 0) {
      break;
    }

    if (attempt < MAX_ATTEMPTS && isRateLimitedFailure(lastResult.stderr)) {
      await delay(RETRY_DELAY_MS);
      continue;
    }

    break;
  }

  return {
    key: gate.key,
    label: gate.label,
    ok: lastResult?.exitCode === 0,
    exitCode: lastResult?.exitCode ?? 1,
    durationMs: Date.now() - startedAt,
    attempts,
    passedChecks: lastResult?.parsed?.passedChecks ?? null,
    totalChecks: lastResult?.parsed?.totalChecks ?? null,
    summary:
      lastResult?.parsed?.passedChecks !== undefined &&
      lastResult?.parsed?.totalChecks !== undefined
        ? `${lastResult.parsed.passedChecks}/${lastResult.parsed.totalChecks}`
        : null,
    stderr: lastResult?.stderr?.trim() || null,
  };
}

async function executeGate(gate) {
  const [command, ...args] = gate.command;
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  return {
    exitCode,
    stdout,
    stderr,
    parsed: parseLastJson(stdout),
  };
}

function isRateLimitedFailure(stderr) {
  const text = (stderr ?? '').toLowerCase();
  return text.includes('too many requests') || text.includes('429') || text.includes('request.rate_limited');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLastJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim().startsWith('{'));
  if (startIndex === -1) {
    return null;
  }

  const candidate = lines.slice(startIndex).join('\n');
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

await main();
