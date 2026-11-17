import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { GeoBiService } from './geo-bi.service';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { PermissionsAny } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from '../admin/admin.service';
import { AuthPrincipal } from '../auth/auth.types';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

function getRequestedEgiId(request: Request) {
  const headerValue = request.header('x-sigi-egi-id');
  return typeof headerValue === 'string' && headerValue.trim().length > 0
    ? headerValue.trim()
    : null;
}

@Controller('geo-bi')
export class GeoBiController {
  constructor(private readonly geoBiService: GeoBiService) {}

  @Get()
  async module() {
    return {
      data: {
        module: await this.geoBiService.getModule(false, null),
      },
    };
  }
}

@UseGuards(BearerAuthGuard)
@Roles(
  'superadmin',
  'national_admin',
  'institution_editor',
  'technical_validator',
  'technical_integration',
)
@PermissionsAny(
  'validations.read',
  'connectors.read',
  'sources.read',
  'imports.read',
  'audit.read',
)
@Controller('admin/geo-bi')
export class AdminGeoBiController {
  constructor(
    private readonly geoBiService: GeoBiService,
    private readonly adminService: AdminService,
  ) {}

  @Get()
  async module(@Req() request: AuthenticatedRequest) {
    // Mismo mecanismo de alcance EGI que el resto de endpoints admin
    // (AdminService.resolveAdminScopeEgiId): un actor sin privilegio global
    // solo ve el EGI activo/solicitado al que pertenece, nunca "todos".
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
    );
    return {
      data: {
        module: await this.geoBiService.getModule(true, egiId),
      },
    };
  }

  @Get('capabilities')
  async capabilities() {
    return {
      data: await this.geoBiService.getGeoServerCapabilities(),
    };
  }
}
