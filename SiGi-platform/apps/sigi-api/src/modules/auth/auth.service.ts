import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getValidatedEnv } from '../../common/config/env';
import { PostgresService } from '../../common/db/postgres.service';
import { hashOpaqueToken, hashPassword, createOpaqueToken, verifyPassword } from './auth.crypto';
import { AuthPrincipal, AuthRole } from './auth.types';
import { isStrongPassword } from './password-policy';

// Incremento atómico: el bloqueo se activa en el intento N y no se extiende mientras siga vigente.
export const RECORD_FAILED_LOGIN_SQL = `
  UPDATE core.user_credentials
  SET failed_attempts = failed_attempts + 1,
      locked_until = CASE
        WHEN failed_attempts + 1 >= $2 THEN NOW() + make_interval(secs => $3)
        ELSE locked_until
      END,
      updated_at = NOW()
  WHERE user_id = $1::uuid
    AND (locked_until IS NULL OR locked_until <= NOW())
  RETURNING failed_attempts, locked_until
`;

export const RESET_FAILED_LOGIN_SQL = `
  UPDATE core.user_credentials
  SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
  WHERE user_id = $1::uuid AND (failed_attempts <> 0 OR locked_until IS NOT NULL)
`;

export function isLoginLocked(lockedUntil: Date | string | null | undefined, now = new Date()) {
  if (!lockedUntil) {
    return false;
  }
  return new Date(lockedUntil).getTime() > now.getTime();
}

type QueryExecutor = {
  query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
};

@Injectable()
export class AuthService {
  private readonly tokens: Map<string, string>;
  private static readonly supportedRoles: AuthRole[] = [
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_validator',
    'read_consumer',
    'technical_integration',
  ] as const;

  constructor(private readonly postgresService: PostgresService) {
    const env = getValidatedEnv();
    this.tokens = env.allowLegacyAdminTokens
      ? new Map<string, string>(
          [
            [env.sigiSuperadminToken, 'superadmin'],
            [env.sigiNationalAdminToken, 'national_admin'],
            [env.sigiEditorToken, 'institution_editor'],
            [env.sigiValidatorToken, 'technical_validator'],
            [env.sigiReaderToken, 'read_consumer'],
            [env.sigiIntegrationToken, 'technical_integration'],
          ].filter((entry): entry is [string, string] => Boolean(entry[0])),
        )
      : new Map<string, string>();
  }

  getSupportedRoles() {
    return [...AuthService.supportedRoles];
  }

  getRoleGrantPermission(role: string) {
    return `roles.grant.${role}`;
  }

  async login(emailInput: string, passwordInput: string) {
    const email = emailInput.trim().toLowerCase();
    const password = passwordInput.trim();

    if (!email || !password) {
      throw new UnauthorizedException('Correo y password son requeridos.');
    }

    const userResult = await this.postgresService.query<{
      id: string;
      institution_id: string | null;
      institution_name: string | null;
      email: string;
      display_name: string;
      status: string;
      active_egi_id: string | null;
      password_hash: string | null;
      locked_until: Date | null;
    }>(
      `
        SELECT
          u.id,
          u.institution_id,
          i.name AS institution_name,
          u.email,
          u.display_name,
          u.status,
          up.active_egi_id,
          uc.password_hash,
          uc.locked_until
        FROM core.users u
        LEFT JOIN core.institutions i ON i.id = u.institution_id
        LEFT JOIN core.user_preferences up ON up.user_id = u.id
        LEFT JOIN core.user_credentials uc ON uc.user_id = u.id
        WHERE LOWER(u.email) = $1
        LIMIT 1
      `,
      [email],
    );

    const user = userResult.rows[0];
    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // Cuenta bloqueada: misma respuesta que una contraseña errónea para no revelar el estado.
    if (isLoginLocked(user.locked_until)) {
      await this.recordAuditByUserId(user.id, 'auth.login.failed', 'user', user.id, 'api', 'failed', {
        reason: 'account_locked',
        email,
      });
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const passwordMatches = verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      const env = getValidatedEnv();
      const attempt = await this.postgresService.query<{ failed_attempts: number; locked_until: Date | null }>(
        RECORD_FAILED_LOGIN_SQL,
        [user.id, env.authMaxFailedAttempts, env.authLockoutSeconds],
      );
      const locked = isLoginLocked(attempt.rows[0]?.locked_until);
      await this.recordAuditByUserId(user.id, 'auth.login.failed', 'user', user.id, 'api', 'failed', {
        reason: 'invalid_password',
        email,
        failedAttempts: attempt.rows[0]?.failed_attempts ?? null,
        locked,
      });
      if (locked) {
        await this.recordAuditByUserId(user.id, 'auth.account.locked', 'user', user.id, 'api', 'success', {
          lockedUntil: attempt.rows[0]?.locked_until ?? null,
        });
      }
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    await this.postgresService.query(RESET_FAILED_LOGIN_SQL, [user.id]);

    if (user.status !== 'active') {
      throw new ForbiddenException('La cuenta no está activa para iniciar sesión.');
    }

    const session = await this.createSession(user.id);
    const principal = await this.loadPrincipalForUser(user.id, user.email, user.institution_id, {
      sessionId: session.sessionId,
      authMode: 'session',
    });
    if (!principal) {
      throw new UnauthorizedException('No se pudo resolver el usuario autenticado.');
    }

    await this.recordAuditByUserId(user.id, 'auth.login', 'user', user.id, 'api', 'success', {
      sessionId: session.sessionId,
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      user: await this.getSessionUser(principal),
    };
  }

  async refreshSession(refreshTokenInput: string) {
    const refreshToken = refreshTokenInput.trim();
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token requerido.');
    }

    const env = getValidatedEnv();
    const refreshTokenHash = hashOpaqueToken(refreshToken, env.sigiSecretsKey);
    return this.postgresService.transaction(async (client) => {
      const sessionResult = await client.query<{
        session_id: string;
        user_id: string;
        email: string;
        institution_id: string | null;
        status: string;
        refresh_expires_at: Date;
        revoked_at: Date | null;
      }>(
        `
          SELECT
            s.id AS session_id,
            s.user_id,
            u.email,
            u.institution_id,
            u.status,
            s.refresh_expires_at,
            s.revoked_at
          FROM core.user_sessions s
          INNER JOIN core.users u ON u.id = s.user_id
          WHERE s.refresh_token_hash = $1
          LIMIT 1
          FOR UPDATE OF s
        `,
        [refreshTokenHash],
      );

      const session = sessionResult.rows[0];
      if (
        !session ||
        session.status !== 'active' ||
        session.revoked_at ||
        session.refresh_expires_at.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('La sesión ya no es válida.');
      }

      const nextSession = await this.createSession(session.user_id, client);
      await client.query(
        `UPDATE core.user_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
        [session.session_id],
      );
      const principal = await this.loadPrincipalForUser(
        session.user_id,
        session.email,
        session.institution_id,
        { sessionId: nextSession.sessionId, authMode: 'session' },
        client,
      );
      if (!principal) {
        throw new UnauthorizedException('No se pudo refrescar la sesión.');
      }

      await this.insertAudit(
        session.user_id,
        'auth.refresh',
        'user',
        session.user_id,
        'api',
        'success',
        { previousSessionId: session.session_id, sessionId: nextSession.sessionId },
        client,
      );

      return {
        accessToken: nextSession.accessToken,
        refreshToken: nextSession.refreshToken,
        expiresAt: nextSession.expiresAt,
        refreshExpiresAt: nextSession.refreshExpiresAt,
        user: await this.getSessionUser(principal, client),
      };
    });
  }

  async logout(accessToken: string, actorEmail: string | null) {
    const env = getValidatedEnv();
    const accessTokenHash = hashOpaqueToken(accessToken.trim(), env.sigiSecretsKey);
    const result = await this.postgresService.query<{ id: string; user_id: string }>(
      `
        UPDATE core.user_sessions
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE access_token_hash = $1
          AND revoked_at IS NULL
        RETURNING id, user_id
      `,
      [accessTokenHash],
    );

    const revoked = result.rows[0];
    if (revoked) {
      await this.recordAuditByUserId(
        revoked.user_id,
        'auth.logout',
        'user',
        revoked.user_id,
        'api',
        'success',
        { sessionId: revoked.id, actorEmail },
      );
    }
  }

  async getSessionUser(principal: AuthPrincipal, executor: QueryExecutor = this.postgresService) {
    const result = await executor.query<{
      id: string;
      institution_id: string | null;
      institution_name: string | null;
      email: string;
      display_name: string;
      status: 'active' | 'inactive' | 'pending';
      active_egi_id: string | null;
      has_password: boolean;
    }>(
      `
        SELECT
          u.id,
          u.institution_id,
          i.name AS institution_name,
          u.email,
          u.display_name,
          u.status,
          up.active_egi_id,
          (uc.password_hash IS NOT NULL) AS has_password
        FROM core.users u
        LEFT JOIN core.institutions i ON i.id = u.institution_id
        LEFT JOIN core.user_preferences up ON up.user_id = u.id
        LEFT JOIN core.user_credentials uc ON uc.user_id = u.id
        WHERE u.id = $1::uuid
        LIMIT 1
      `,
      [principal.userId],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return {
      id: user.id,
      institutionId: user.institution_id,
      institutionName: user.institution_name,
      email: user.email,
      displayName: user.display_name,
      status: user.status,
      roles: principal.roles,
      activeEgiId: user.active_egi_id,
      hasPassword: user.has_password,
    };
  }

  async setUserPassword(
    userId: string,
    password: string,
    _actorEmail: string | null,
    client?: PoolClient,
  ) {
    const normalized = password.trim();
    if (!isStrongPassword(normalized)) {
      throw new ForbiddenException(
        'El password debe tener al menos 12 caracteres e incluir letras y números.',
      );
    }

    const passwordHash = hashPassword(normalized);
    const query = `
      INSERT INTO core.user_credentials (
        user_id,
        password_hash,
        password_updated_at,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, $2, NOW(), NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        password_hash = EXCLUDED.password_hash,
        password_updated_at = NOW(),
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
    `;
    if (client) {
      await client.query(query, [userId, passwordHash]);
      await client.query(
        `UPDATE core.user_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND revoked_at IS NULL`,
        [userId],
      );
    } else {
      await this.postgresService.query(query, [userId, passwordHash]);
      await this.postgresService.query(
        `UPDATE core.user_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND revoked_at IS NULL`,
        [userId],
      );
    }
  }

  async validateToken(token: string): Promise<AuthPrincipal | null> {
    const tokenCode = this.tokens.get(token);
    if (tokenCode) {
      const result = await this.postgresService.query<{
        user_id: string;
        institution_id: string | null;
        email: string;
        status: string;
      }>(
        `
          SELECT u.id AS user_id, u.institution_id, u.email, u.status
          FROM core.auth_token_bindings tb
          INNER JOIN core.users u ON u.id = tb.user_id
          WHERE tb.token_code = $1
            AND tb.status = 'active'
          LIMIT 1
        `,
        [tokenCode],
      );

      const user = result.rows[0];
      if (!user || user.status !== 'active') {
        return null;
      }

      return this.loadPrincipalForUser(user.user_id, user.email, user.institution_id, {
        authMode: 'legacy',
      });
    }

    const env = getValidatedEnv();
    const accessTokenHash = hashOpaqueToken(token.trim(), env.sigiSecretsKey);
    const sessionResult = await this.postgresService.query<{
      session_id: string;
      user_id: string;
      institution_id: string | null;
      email: string;
      status: string;
      access_expires_at: Date;
      revoked_at: Date | null;
    }>(
      `
        SELECT
          s.id AS session_id,
          s.user_id,
          u.institution_id,
          u.email,
          u.status,
          s.access_expires_at,
          s.revoked_at
        FROM core.user_sessions s
        INNER JOIN core.users u ON u.id = s.user_id
        WHERE s.access_token_hash = $1
        LIMIT 1
      `,
      [accessTokenHash],
    );

    const session = sessionResult.rows[0];
    if (
      !session ||
      session.status !== 'active' ||
      session.revoked_at ||
      session.access_expires_at.getTime() <= Date.now()
    ) {
      return null;
    }

    await this.postgresService.query(
      `
        UPDATE core.user_sessions
        SET last_seen_at = NOW(), updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [session.session_id],
    );

    return this.loadPrincipalForUser(session.user_id, session.email, session.institution_id, {
      sessionId: session.session_id,
      authMode: 'session',
    });
  }

  private async createSession(userId: string, executor: QueryExecutor = this.postgresService) {
    const env = getValidatedEnv();
    const accessToken = createOpaqueToken('at');
    const refreshToken = createOpaqueToken('rt');
    const accessTokenHash = hashOpaqueToken(accessToken, env.sigiSecretsKey);
    const refreshTokenHash = hashOpaqueToken(refreshToken, env.sigiSecretsKey);
    const expiresAt = new Date(Date.now() + env.authAccessTokenTtlSeconds * 1000);
    const refreshExpiresAt = new Date(Date.now() + env.authRefreshTokenTtlSeconds * 1000);

    const result = await executor.query<{ id: string }>(
      `
        INSERT INTO core.user_sessions (
          user_id,
          access_token_hash,
          refresh_token_hash,
          access_expires_at,
          refresh_expires_at,
          last_seen_at
        )
        VALUES ($1::uuid, $2, $3, $4, $5, NOW())
        RETURNING id
      `,
      [userId, accessTokenHash, refreshTokenHash, expiresAt.toISOString(), refreshExpiresAt.toISOString()],
    );

    return {
      sessionId: result.rows[0].id,
      accessToken,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private async loadPrincipalForUser(
    userId: string,
    email: string,
    institutionId: string | null,
    options?: {
      sessionId?: string | null;
      authMode?: 'legacy' | 'session';
    },
    executor: QueryExecutor = this.postgresService,
  ): Promise<AuthPrincipal | null> {
    const result = await executor.query<{
      roles: string[];
      permissions: string[];
    }>(
      `
        SELECT
          COALESCE(
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.code ORDER BY r.code), NULL),
            ARRAY[]::text[]
          ) AS roles,
          COALESCE(
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.code ORDER BY p.code), NULL),
            ARRAY[]::text[]
          ) AS permissions
        FROM core.users u
        LEFT JOIN core.user_roles ur ON ur.user_id = u.id
        LEFT JOIN core.roles r ON r.id = ur.role_id
        LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
        LEFT JOIN core.permissions p ON p.id = rp.permission_id
        WHERE u.id = $1::uuid
        GROUP BY u.id
      `,
      [userId],
    );

    const user = result.rows[0];
    if (!user) {
      return null;
    }

    const roles = user.roles.filter((role) => role.trim().length > 0);
    const permissions = user.permissions.filter((permission) => permission.trim().length > 0);
    if (roles.length === 0 && permissions.length === 0) {
      return null;
    }

    return {
      userId,
      subject: email,
      institutionId,
      roles,
      permissions,
      sessionId: options?.sessionId ?? null,
      authMode: options?.authMode ?? 'session',
    };
  }

  private async recordAuditByUserId(
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    source: string,
    result: string,
    details: Record<string, unknown>,
  ) {
    await this.insertAudit(actorUserId, action, entityType, entityId, source, result, details);
  }

  private async insertAudit(
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    source: string,
    result: string,
    details: Record<string, unknown>,
    executor: QueryExecutor = this.postgresService,
  ) {
    await executor.query(
      `
        INSERT INTO core.audit_events (
          actor_user_id,
          action,
          entity_type,
          entity_id,
          source,
          result,
          details_json
        )
        VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7::jsonb)
      `,
      [actorUserId, action, entityType, entityId, source, result, JSON.stringify(details)],
    );
  }
}
