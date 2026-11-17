import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from './permissions.decorator';
import { ROLES_KEY } from './roles.decorator';
import { AuthPrincipal, AuthRole } from './auth.types';
import { AuthService } from './auth.service';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AuthRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAnyPermissions = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!requiredAnyPermissions || requiredAnyPermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.user ?? (await this.resolvePrincipal(request));

    if (!principal) {
      throw new UnauthorizedException('Missing authenticated principal');
    }

    if (requiredRoles?.length) {
      const roleMatched = principal.roles.some((role) => requiredRoles.includes(role as AuthRole));
      const grantMatched = requiredRoles.some((role) =>
        principal.permissions.includes(this.authService.getRoleGrantPermission(role)),
      );
      if (!roleMatched && !grantMatched) {
        throw new ForbiddenException('Insufficient role');
      }
    }

    if (
      requiredPermissions?.length &&
      !requiredPermissions.every((permission) => principal.permissions.includes(permission))
    ) {
      throw new ForbiddenException('Insufficient role');
    }

    if (
      requiredAnyPermissions?.length &&
      !requiredAnyPermissions.some((permission) => principal.permissions.includes(permission))
    ) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }

  private async resolvePrincipal(request: AuthenticatedRequest): Promise<AuthPrincipal | null> {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }

    const token = authorization.slice('Bearer '.length).trim();
    const principal = await this.authService.validateToken(token);
    if (principal) {
      request.user = principal;
    }

    return principal;
  }
}
