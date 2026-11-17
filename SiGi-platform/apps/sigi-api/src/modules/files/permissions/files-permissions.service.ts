import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthPrincipal } from '../../auth/auth.types';
import { FilesRepository } from '../files.repository';

type FileScope = {
  id: string;
  egi_id?: string | null;
  folder_id?: string | null;
  institution_id: string | null;
  project_id: string | null;
  created_by: string | null;
  is_public?: boolean;
  confidentiality_level?: string;
};

@Injectable()
export class FilesPermissionsService {
  constructor(private readonly filesRepository: FilesRepository) {}

  async resolveUserContext(principal: AuthPrincipal | undefined | null) {
    if (!principal?.subject) {
      throw new UnauthorizedException('Missing authenticated principal');
    }

    const context = await this.filesRepository.resolveUserContext(principal.subject);
    if (!context) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return context;
  }

  async assertEgiAccess(principal: AuthPrincipal | undefined | null, egiId: string) {
    const context = await this.resolveUserContext(principal);
    if (context.roleCodes.includes('superadmin') || context.roleCodes.includes('national_admin')) {
      return context;
    }
    if (!(await this.filesRepository.hasEgiAccess(context.userId, context.institutionId, egiId))) {
      throw new ForbiddenException('No tienes acceso al EGI solicitado.');
    }
    return context;
  }

  async assertFolderAccess(
    principal: AuthPrincipal | undefined | null,
    folderId: string,
    permission: string,
    egiId: string,
  ) {
    const context = await this.resolveUserContext(principal);
    const scope = await this.filesRepository.getFolderScope(folderId);
    if (!scope) {
      throw new ForbiddenException('Folder not accessible');
    }
    if (scope.egi_id !== egiId) {
      throw new ForbiddenException('Folder not accessible in the active EGI');
    }

    const allowed = await this.canAccessScope(context, scope, permission);
    if (!allowed) {
      throw new ForbiddenException('Insufficient folder permission');
    }

    return context;
  }

  async assertFileAccess(
    principal: AuthPrincipal | undefined | null,
    fileId: string,
    permission: string,
    egiId: string,
  ) {
    const context = await this.resolveUserContext(principal);
    const scope = await this.filesRepository.getFileScope(fileId);
    if (!scope) {
      throw new ForbiddenException('File not accessible');
    }
    if (scope.egi_id !== egiId) {
      throw new ForbiddenException('File not accessible in the active EGI');
    }

    const allowed = await this.canAccessScope(context, scope, permission);
    if (!allowed) {
      throw new ForbiddenException('Insufficient file permission');
    }

    return context;
  }

  async canReadPublicFile(fileId: string) {
    const scope = await this.filesRepository.getFileScope(fileId);
    return Boolean(scope?.is_public);
  }

  private async canAccessScope(
    context: Awaited<ReturnType<FilesPermissionsService['resolveUserContext']>>,
    scope: FileScope,
    permission: string,
  ) {
    if (
      context.roleCodes.includes('superadmin') ||
      context.roleCodes.includes('national_admin')
    ) {
      return true;
    }

    const explicitPermissionCount = await this.filesRepository.countExplicitPermissions(
      'is_public' in scope ? scope.id : null,
      'is_public' in scope ? scope.folder_id ?? null : scope.id,
    );

    if (explicitPermissionCount > 0) {
      return this.filesRepository.hasExplicitPermission({
        fileId: 'is_public' in scope ? scope.id : null,
        folderId: 'is_public' in scope ? scope.folder_id ?? null : scope.id,
        userId: context.userId,
        institutionId: context.institutionId,
        roleIds: context.roleIds,
        projectId: scope.project_id ?? null,
        permission,
      });
    }

    if (scope.created_by && scope.created_by === context.userId) {
      return true;
    }

    if (scope.institution_id && context.institutionId && scope.institution_id === context.institutionId) {
      return true;
    }

    if ('is_public' in scope && scope.is_public && (permission === 'read' || permission === 'download')) {
      return true;
    }

    return false;
  }
}
