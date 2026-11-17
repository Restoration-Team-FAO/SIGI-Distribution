import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { AuthPrincipal } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { KoboSourcesService } from './kobo-sources.service';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

@UseGuards(BearerAuthGuard)
@Roles(
  'superadmin',
  'national_admin',
  'institution_editor',
  'technical_validator',
  'technical_integration',
)
@Controller('admin/kobo-sources')
export class KoboSourcesController {
  constructor(private readonly koboSourcesService: KoboSourcesService) {}

  @Get()
  @Permissions('sources.read')
  async list() {
    return { data: { sources: await this.koboSourcesService.list() } };
  }

  @Get(':id')
  @Permissions('sources.read')
  async get(@Param('id') id: string) {
    return { data: { source: await this.koboSourcesService.getBySourceId(id) } };
  }

  @Post('test-connection')
  @HttpCode(200)
  @Permissions('connectors.run')
  async testConnection(
    @Body()
    body: {
      sourceId?: string;
      baseUrl?: string;
      token?: string;
      assetUid?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        result: await this.koboSourcesService.testConnection(
          body,
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Post(':id/test-connection')
  @HttpCode(200)
  @Permissions('connectors.run')
  async testConnectionById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        result: await this.koboSourcesService.testConnection(
          { sourceId: id },
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Post(':id/preview')
  @HttpCode(200)
  @Permissions('connectors.run')
  async preview(@Param('id') id: string) {
    return {
      data: {
        preview: await this.koboSourcesService.previewSync(id),
      },
    };
  }

  @Post(':id/run')
  @HttpCode(202)
  @Permissions('connectors.run')
  async runSync(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.koboSourcesService.runSync(id, request.user?.subject ?? null),
    };
  }

  @Get(':id/last-job')
  @Permissions('sources.read')
  async lastJob(@Param('id') id: string) {
    return {
      data: {
        job: await this.koboSourcesService.getLastJob(id),
      },
    };
  }
}
