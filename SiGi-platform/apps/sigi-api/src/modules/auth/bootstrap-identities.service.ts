import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';
import { hashPassword, verifyPassword } from './auth.crypto';
import { isStrongPassword } from './password-policy';

// V2-01: initdb crea 7 identidades *@sigi.local cuyos hashes están versionados en
// infra/postgres/init/009_auth_identity.sql (contraseñas públicas "<rol>-dev-token").
// Al arrancar, toda identidad que conserve su contraseña versionada se rota con la del entorno
// (SIGI_BOOTSTRAP_PASSWORD_<CLAVE>) o, en producción, se deshabilita. Se compara contra el hash
// versionado exacto (público), sin necesidad de conocer la contraseña; una credencial ya cambiada
// por un operador nunca se toca.
export const BOOTSTRAP_IDENTITIES = [
  { email: 'superadmin@sigi.local', envKey: 'SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN', versionedHash: 'scrypt$16384$8$1$uvLq6652BUvBzZzj7RLarg==$6E0mMUbWcUXMqF0mrmS1TdTN2aYckoHlmIecVnCl/eiiI5VBktvvS+9Lqjgj0STlW9eNsSO0uOISOxOGqOagqQ==' },
  { email: 'admin@sigi.local', envKey: 'SIGI_BOOTSTRAP_PASSWORD_ADMIN', versionedHash: 'scrypt$16384$8$1$nfhrm7zfA4rbN0upJ6s5Jg==$iY8XsNRUTO9PcrApP9waDcXVhnNy4BRLT//ylJHzCS2utxXohCNBNrBNEXW9B3/AJg0IzrTDtEOfRY25ZsevRg==' },
  { email: 'national-admin@sigi.local', envKey: 'SIGI_BOOTSTRAP_PASSWORD_NATIONAL_ADMIN', versionedHash: 'scrypt$16384$8$1$mJ6LNjykSpTSm9BlW1+l7w==$kwfaToAHc9+KQc//FAzuvVxEQ1eUDiy5TRhDgVZTFrvRezlEaEmsl8VwtRTK0frZJt+5OU7BLM4Av2WraNbqRw==' },
  { email: 'editor@sigi.local', envKey: 'SIGI_BOOTSTRAP_PASSWORD_EDITOR', versionedHash: 'scrypt$16384$8$1$wui1BMWkKozd7LIXNZ0BWA==$weLFEnh3913TiKp8ZF1ybzFyVYOwohnyMKv3dGKySoTz2Wl5DFgkPjDfianj/ozGbF53RISCILYCohI75bcUAw==' },
  { email: 'validator@sigi.local', envKey: 'SIGI_BOOTSTRAP_PASSWORD_VALIDATOR', versionedHash: 'scrypt$16384$8$1$ICl4lqH1x0X6dj8CMPhaYA==$/lU3fGG9Z7SpHMrradkKGrgpDl4zGuR/qCwqnvTONwZOrqC2OspprS4TKG+MM5uPjInBzAJUNyEjDjjJ1N6Vlw==' },
  { email: 'reader@sigi.local', envKey: 'SIGI_BOOTSTRAP_PASSWORD_READER', versionedHash: 'scrypt$16384$8$1$RtK5uuXO4vZSdQC9Aj0ZrA==$Ws8O9LFwlaRB/+S9zTFScCCR4Dp8SSSSGJ9BXdCtjy67bb96cb4SYtV0xxNitjQaDeE04AhXMk35Jz2nAaQ/4w==' },
  { email: 'integration@sigi.local', envKey: 'SIGI_BOOTSTRAP_PASSWORD_INTEGRATION', versionedHash: 'scrypt$16384$8$1$1DZKkEE1iU3i+di9F+a0YQ==$3+wbxyQdpArb0zA9A8zI4KkOiyjxjI3Cou4M+mX8yp95CewYLyr5/wvLtUFTQV6kllUKfAHHtxL2KC+3jSFtFg==' },
] as const;

export type BootstrapIdentityAction = 'keep' | 'rotate' | 'disable';

export function planBootstrapIdentityAction(input: {
  currentHash: string | null;
  versionedHash: string;
  configuredPassword: string | undefined;
  production: boolean;
}): BootstrapIdentityAction {
  if (!input.currentHash || input.currentHash !== input.versionedHash) {
    return 'keep';
  }
  const configured = input.configuredPassword?.trim();
  if (configured && isStrongPassword(configured) && !verifyPassword(configured, input.versionedHash)) {
    return 'rotate';
  }
  return input.production ? 'disable' : 'keep';
}

export function isProductionLikeRuntime(env: NodeJS.ProcessEnv = process.env) {
  return [env.NODE_ENV, env.APP_ENV].some((value) => value?.trim().toLowerCase() === 'production');
}

@Injectable()
export class BootstrapIdentitiesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapIdentitiesService.name);

  constructor(private readonly postgresService: PostgresService) {}

  async onApplicationBootstrap() {
    await this.secureBootstrapIdentities();
  }

  async secureBootstrapIdentities(env: NodeJS.ProcessEnv = process.env) {
    const production = isProductionLikeRuntime(env);
    const result = await this.postgresService.query<{ user_id: string; email: string; password_hash: string | null }>(
      `
        SELECT c.user_id, lower(u.email) AS email, c.password_hash
        FROM core.user_credentials c
        INNER JOIN core.users u ON u.id = c.user_id
        WHERE lower(u.email) = ANY($1::text[])
      `,
      [BOOTSTRAP_IDENTITIES.map((identity) => identity.email)],
    );
    const actions: Record<string, BootstrapIdentityAction> = {};
    for (const row of result.rows) {
      const identity = BOOTSTRAP_IDENTITIES.find((item) => item.email === row.email);
      if (!identity) continue;
      const action = planBootstrapIdentityAction({
        currentHash: row.password_hash,
        versionedHash: identity.versionedHash,
        configuredPassword: env[identity.envKey],
        production,
      });
      actions[identity.email] = action;
      if (action === 'keep') continue;
      const newHash = action === 'rotate' ? hashPassword(env[identity.envKey]!.trim()) : null;
      await this.postgresService.query(
        'UPDATE core.user_credentials SET password_hash = $2, password_updated_at = NOW() WHERE user_id = $1::uuid',
        [row.user_id, newHash],
      );
      await this.postgresService.query('DELETE FROM core.user_sessions WHERE user_id = $1::uuid', [row.user_id]);
      if (action === 'disable') {
        this.logger.warn(
          `Bootstrap identity ${identity.email} had its versioned default password and was disabled; set ${identity.envKey} to enable it.`,
        );
      }
    }
    const changed = Object.entries(actions).filter(([, action]) => action !== 'keep');
    if (changed.length > 0) {
      this.logger.log(`Bootstrap identities secured: ${changed.map(([email, action]) => `${email}=${action}`).join(', ')}`);
    }
    return actions;
  }
}
