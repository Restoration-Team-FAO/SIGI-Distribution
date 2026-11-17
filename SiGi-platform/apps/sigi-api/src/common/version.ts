import { readFileSync } from 'fs';
import { resolve } from 'path';

// Versión del producto (SemVer, fuente: SiGi-platform/VERSION → package.json) y commit de build.
// src/common y dist/common están a dos niveles de apps/sigi-api/package.json.
let cached: { version: string; commit: string | null } | undefined;

export function getBuildInfo() {
  if (!cached) {
    let version = process.env.SIGI_VERSION?.trim() || 'unknown';
    try {
      const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string };
      if (!process.env.SIGI_VERSION?.trim() && pkg.version) version = pkg.version;
    } catch {
      // Sin package.json legible: se mantiene SIGI_VERSION o 'unknown'.
    }
    cached = { version, commit: process.env.SIGI_GIT_SHA?.trim() || null };
  }
  return cached;
}
