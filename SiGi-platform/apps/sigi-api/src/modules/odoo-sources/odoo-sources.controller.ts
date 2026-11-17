import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { getValidatedEnv } from '../../common/config/env';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { AuthPrincipal } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { OdooSourcesService } from './odoo-sources.service';
import { assertSafeUpload } from '../../common/http/upload-policy';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };
const uploadInterceptorOptions = {
  limits: {
    fileSize: getValidatedEnv().apiUploadMaxBytes,
  },
};

@UseGuards(BearerAuthGuard)
@Roles(
  'superadmin',
  'national_admin',
  'institution_editor',
  'technical_validator',
  'technical_integration',
)
@Controller('admin/odoo-sources')
export class OdooSourcesController {
  constructor(private readonly odooSourcesService: OdooSourcesService) {}

  @Get()
  @Permissions('sources.read')
  async list() {
    return { data: { sources: await this.odooSourcesService.list() } };
  }

  @Get('mapping-profiles')
  @Permissions('sources.read')
  async mappingProfiles(
    @Query('sourceId') sourceId?: string,
    @Query('institutionId') institutionId?: string,
  ) {
    return {
      data: {
        mappingProfiles: await this.odooSourcesService.listMappingProfiles({
          sourceId,
          institutionId,
        }),
      },
    };
  }

  @Get(':id')
  @Permissions('sources.read')
  async get(@Param('id') id: string) {
    return {
      data: {
        source: await this.odooSourcesService.getBySourceId(id),
      },
    };
  }

  @Post()
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('sources.create')
  async create(
    @Body()
    body: {
      sourceName: string;
      sourceCode?: string;
      institutionId: string;
      baseUrl: string;
      databaseName: string;
      username: string;
      password: string;
      mappingProfileId?: string | null;
      isActive?: boolean;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        source: await this.odooSourcesService.create(
          body,
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Patch(':id')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('sources.update')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      sourceName?: string;
      sourceCode?: string;
      institutionId?: string;
      baseUrl?: string;
      databaseName?: string;
      username?: string;
      password?: string;
      mappingProfileId?: string | null;
      isActive?: boolean;
      status?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        source: await this.odooSourcesService.update(
          id,
          body,
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Post('test-connection')
  @HttpCode(200)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.run')
  async testConnection(
    @Body()
    body: {
      sourceId?: string;
      baseUrl?: string;
      databaseName?: string;
      username?: string;
      password?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        result: await this.odooSourcesService.testConnection(
          body,
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Post(':id/test-connection')
  @HttpCode(200)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.run')
  async testConnectionById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        result: await this.odooSourcesService.testConnection(
          { sourceId: id },
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Post(':id/run')
  @HttpCode(202)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.run')
  async runSync(
    @Param('id') id: string,
    @Body()
    body: {
      institutionLimit?: number;
      institutionCodes?: string[];
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.odooSourcesService.runSync(
        id,
        body,
        request.user?.subject ?? null,
      ),
    };
  }

  @Post(':id/preview')
  @HttpCode(200)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.run')
  async previewSync(
    @Param('id') id: string,
    @Body()
    body: {
      institutionLimit?: number;
      institutionCodes?: string[];
    },
  ) {
    return {
      data: {
        preview: await this.odooSourcesService.previewSync(id, body),
      },
    };
  }

  @Post(':id/shapefile/preview')
  @HttpCode(200)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('imports.upload')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async previewShapefile(
    @Param('id') id: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body()
    body: {
      mappingJson?: string;
      country?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    assertSafeUpload(file, ['zip']);
    return {
      data: {
        preview: await this.odooSourcesService.previewShapefile(
          id,
          {
            fileBuffer: file?.buffer,
            fileName: file?.originalname ?? null,
            mappingJson: body.mappingJson,
            country: body.country,
          },
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Post(':id/shapefile/import')
  @HttpCode(202)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('imports.upload')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async importShapefile(
    @Param('id') id: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body()
    body: {
      mappingJson?: string;
      country?: string;
      createMissingProjects?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    assertSafeUpload(file, ['zip']);
    const createMissingProjects =
      body.createMissingProjects === undefined
        ? undefined
        : !['false', '0', 'no', 'off'].includes(
            String(body.createMissingProjects).trim().toLowerCase(),
          );

    return {
      data: await this.odooSourcesService.importShapefile(
        id,
        {
          fileBuffer: file?.buffer,
          fileName: file?.originalname ?? null,
          mappingJson: body.mappingJson,
          country: body.country,
          createMissingProjects,
        },
        request.user?.subject ?? null,
      ),
    };
  }

  @Get(':id/last-job')
  @Permissions('sources.read')
  async lastJob(@Param('id') id: string) {
    return {
      data: {
        job: await this.odooSourcesService.getLastJob(id),
      },
    };
  }

  @Get(':id/batches')
  @Permissions('imports.read')
  async batches(@Param('id') id: string) {
    return {
      data: {
        batches: await this.odooSourcesService.listBatches(id),
      },
    };
  }

  @Get(':id/errors')
  @Permissions('imports.read')
  async errors(@Param('id') id: string) {
    return {
      data: {
        errors: await this.odooSourcesService.listErrors(id),
      },
    };
  }
}
