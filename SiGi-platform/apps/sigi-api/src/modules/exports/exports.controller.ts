import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { AuthPrincipal } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { ExportsService } from './exports.service';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get()
  @UseGuards(BearerAuthGuard)
  @Roles('superadmin', 'national_admin', 'technical_integration')
  @Permissions('audit.read')
  async listTargets(
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: string,
  ) {
    return {
      data: {
        targets: await this.exportsService.listTargets({
          actorEmail: request.user?.subject ?? null,
          requestedEgiId: getRequestedEgiId(request),
          scope: scope === 'global' ? 'global' : 'active',
        }),
      },
    };
  }

  @Get(':target')
  @UseGuards(BearerAuthGuard)
  @Roles('superadmin', 'national_admin', 'technical_integration')
  @Permissions('audit.read')
  async getTarget(
    @Param('target') target: string,
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: string,
  ) {
    return {
      data: await this.exportsService.getTarget(target, {
        actorEmail: request.user?.subject ?? null,
        requestedEgiId: getRequestedEgiId(request),
        scope: scope === 'global' ? 'global' : 'active',
      }),
    };
  }

  @Get(':target/artifact')
  @UseGuards(BearerAuthGuard)
  @Roles('superadmin', 'national_admin', 'technical_integration')
  @Permissions('audit.read')
  async downloadArtifact(
    @Param('target') target: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Query('scope') scope?: string,
  ) {
    const artifact = await this.exportsService.getArtifact(target, {
      actorEmail: request.user?.subject ?? null,
      requestedEgiId: getRequestedEgiId(request),
      scope: scope === 'global' ? 'global' : 'active',
    });
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(artifact.fileName)}"`,
    );
    response.send(JSON.stringify(artifact.payload, null, 2));
  }

  @Post(':target/run')
  @UseGuards(BearerAuthGuard)
  @Roles('superadmin', 'national_admin', 'technical_integration')
  @Permissions('publications.publish')
  async run(
    @Param('target') target: string,
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: string,
  ) {
    return {
      data: await this.exportsService.run(target, {
        requestedByUserId: request.user?.userId ?? null,
        actorEmail: request.user?.subject ?? null,
        requestedEgiId: getRequestedEgiId(request),
        scope: scope === 'global' ? 'global' : 'active',
      }),
    };
  }
}

function getRequestedEgiId(request: Request) {
  const headerValue = request.header('x-sigi-egi-id');
  return typeof headerValue === 'string' && headerValue.trim().length > 0
    ? headerValue.trim()
    : null;
}
