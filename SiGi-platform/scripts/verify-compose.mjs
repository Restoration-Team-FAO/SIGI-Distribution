import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const tempEnvPath = path.join(cwd, '.env.production');
const exampleEnvPath = path.join(cwd, '.env.production.example');
const resolvedOutputPath = path.join(cwd, '.run', 'compose.prod.resolved.yml');
const hadRealEnvFile = fs.existsSync(tempEnvPath);

try {
  if (!hadRealEnvFile) {
    fs.copyFileSync(exampleEnvPath, tempEnvPath);
  }

  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
const result = spawnSync(
    'docker',
    ['compose', '--env-file', tempEnvPath, '-f', 'docker-compose.prod.yml', 'config'],
    {
      cwd,
      encoding: 'utf8',
      shell: false,
    },
  );

  if (result.stdout) {
    fs.writeFileSync(resolvedOutputPath, result.stdout, 'utf8');
  }

  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (!hadRealEnvFile && fs.existsSync(tempEnvPath)) {
    fs.unlinkSync(tempEnvPath);
  }
}
