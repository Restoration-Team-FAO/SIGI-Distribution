import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const DEFAULT_API_URL = process.env.SIGI_IMPORT_API_URL ?? 'http://localhost:3000/api';
const DEFAULT_TOKEN = process.env.SIGI_IMPORT_ADMIN_TOKEN ?? 'superadmin-dev-token';

const ENTITY_ORDER = [
  'institutions',
  'projects',
  'project_indicators',
  'project_territories',
];

const DEFAULT_FILES = {
  institutions:
    process.env.SIGI_IMPORT_INSTITUTIONS_FILE ??
    'templates/institutions_template.csv',
  projects: process.env.SIGI_IMPORT_PROJECTS_FILE ?? 'templates/projects_template.csv',
  project_indicators:
    process.env.SIGI_IMPORT_INDICATORS_FILE ??
    'templates/project_indicators_template.csv',
  project_territories:
    process.env.SIGI_IMPORT_TERRITORIES_FILE ??
    'templates/territories_template.csv',
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entity = args.entity ?? 'all';
  const apiUrl = args.apiUrl ?? DEFAULT_API_URL;
  const token = args.token ?? DEFAULT_TOKEN;

  if (args.help) {
    printHelp();
    return;
  }

  if (entity === 'all') {
    for (const entityType of ENTITY_ORDER) {
      const filePath = args.file ?? DEFAULT_FILES[entityType];
      await runSingleImport({
        entityType,
        filePath,
        apiUrl,
        token,
        sheetName: args.sheet,
        sourceId: args.sourceId,
      });
    }
    return;
  }

  if (!ENTITY_ORDER.includes(entity)) {
    throw new Error(
      `Entidad no soportada: ${entity}. Usa ${ENTITY_ORDER.join(', ')} o all.`,
    );
  }

  const filePath = args.file ?? DEFAULT_FILES[entity];
  await runSingleImport({
    entityType: entity,
    filePath,
    apiUrl,
    token,
    sheetName: args.sheet,
    sourceId: args.sourceId,
  });
}

async function runSingleImport(input) {
  const { entityType, filePath, apiUrl, token, sheetName, sourceId } = input;
  const absolutePath = resolve(filePath);
  const buffer = await readFile(absolutePath);
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), basename(absolutePath));
  formData.append('entityType', entityType);
  if (sheetName) {
    formData.append('sheetName', sheetName);
  }
  if (sourceId) {
    formData.append('sourceId', sourceId);
  }

  const endpoint = `${stripTrailingSlash(apiUrl)}/admin/imports/upload`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(
      `Import falló para ${entityType} (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  const batch = payload?.data?.batch;
  const errors = Number(payload?.data?.errors ?? 0);
  console.log(
    [
      `✔ Import ${entityType}`,
      `batch=${batch?.id ?? 'n/a'}`,
      `status=${batch?.status ?? 'n/a'}`,
      `rows=${batch?.totalRows ?? 0}`,
      `valid=${batch?.validRows ?? 0}`,
      `invalid=${batch?.invalidRows ?? 0}`,
      `promoted=${batch?.promotedRows ?? 0}`,
      `errors=${errors}`,
    ].join(' | '),
  );

  if (batch?.id && errors > 0) {
    const errorsEndpoint = `${stripTrailingSlash(apiUrl)}/admin/imports/batches/${batch.id}/errors`;
    const errorsResponse = await fetch(errorsEndpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (errorsResponse.ok) {
      const errorsPayload = await errorsResponse.json();
      const previewErrors = errorsPayload?.data?.errors?.slice(0, 5) ?? [];
      for (const error of previewErrors) {
        console.log(
          `  - row ${error.rowNumber}: ${error.errorCode} -> ${error.errorMessage}`,
        );
      }
    }
  }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      result.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      result[key] = true;
      continue;
    }
    result[key] = value;
    i += 1;
  }

  return {
    help: Boolean(result.help),
    entity: typeof result.entity === 'string' ? result.entity : undefined,
    file: typeof result.file === 'string' ? result.file : undefined,
    apiUrl: typeof result['api-url'] === 'string' ? result['api-url'] : undefined,
    token: typeof result.token === 'string' ? result.token : undefined,
    sheet: typeof result.sheet === 'string' ? result.sheet : undefined,
    sourceId:
      typeof result['source-id'] === 'string' ? result['source-id'] : undefined,
  };
}

function stripTrailingSlash(input) {
  return input.endsWith('/') ? input.slice(0, -1) : input;
}

function printHelp() {
  console.log(`Uso:
  node scripts/import-batch.mjs --entity institutions --file templates/institutions_template.csv
  node scripts/import-batch.mjs --entity projects --file templates/projects_template.csv
  node scripts/import-batch.mjs --entity project_indicators --file templates/project_indicators_template.csv
  node scripts/import-batch.mjs --entity project_territories --file templates/territories_template.csv
  node scripts/import-batch.mjs --entity all

Opciones:
  --entity         institutions|projects|project_indicators|project_territories|all
  --file           ruta del archivo (csv o xlsx)
  --api-url        base API (default: ${DEFAULT_API_URL})
  --token          bearer token admin (default: env SIGI_IMPORT_ADMIN_TOKEN o superadmin-dev-token)
  --sheet          nombre de hoja (xlsx opcional)
  --source-id      source id opcional para actualizar last_ingested_at
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
