import { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import { AuthPrincipal } from '../../modules/auth/auth.types';

export type RequestWithOptionalPrincipal = Request & { user?: AuthPrincipal };

/**
 * Resolves the caller's AuthPrincipal from a Bearer token when present,
 * without requiring one. Used by public-with-optional-auth endpoints
 * (territories, geo) where an anonymous caller is valid and simply gets the
 * public-only view. An invalid, expired, or absent token is treated the
 * same way — never an error here; that is what distinguishes these routes
 * from anything behind BearerAuthGuard.
 *
 * Extracted so this resolution logic exists in exactly one place instead of
 * being copied into every public-with-optional-auth controller — see
 * docs/geo/permissions.md for the broader "single contract" rationale this
 * follows.
 */
export async function resolveOptionalPrincipal(
  request: RequestWithOptionalPrincipal,
  authService: AuthService,
): Promise<AuthPrincipal | null> {
  if (request.user) {
    return request.user;
  }

  const authorization = request.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  const principal = await authService.validateToken(token);
  if (principal) {
    request.user = principal;
  }

  return principal;
}
