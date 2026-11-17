import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { GeospatialCatalogService } from './geospatial-catalog.service';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { AuthPrincipal } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { getValidatedEnv } from '../../common/config/env';
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
@Controller('admin/geospatial-catalog')
export class GeospatialCatalogController {
  constructor(
    private readonly geospatialCatalogService: GeospatialCatalogService,
  ) {}

  @Get()
  @Permissions('connectors.read')
  async catalog() {
    return {
      data: await this.geospatialCatalogService.getCatalog(),
    };
  }

  @Post('publish')
  @Roles('superadmin', 'national_admin', 'technical_integration')
  @Permissions('publications.publish')
  async publish(
    @Body() body: { code?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.geospatialCatalogService.publishLayer(
        body.code ?? '',
        request.user?.subject ?? null,
      ),
    };
  }

  @Get('export/:code')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.read')
  async exportLayer(@Param('code') code: string) {
    return {
      data: await this.geospatialCatalogService.exportLayerAsGeoJson(code),
    };
  }

  @Post('import')
  @HttpCode(202)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('imports.upload')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async importLayer(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body()
    body: {
      code?: string;
      name?: string;
      layerType?: string;
      visibility?: string;
      status?: string;
      territoryLevel?: string;
      country?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    assertSafeUpload(file, ['geojson', 'json']);
    return {
      data: await this.geospatialCatalogService.importGeoJsonLayer(
        {
          fileBuffer: file?.buffer,
          fileName: file?.originalname ?? null,
          ...body,
        },
        request.user?.subject ?? null,
      ),
    };
  }

  @Post('projects/publish')
  @Roles('superadmin', 'national_admin', 'technical_integration')
  @Permissions('publications.publish')
  async publishProject(
    @Body() body: { projectId?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.geospatialCatalogService.publishProjectLayer(
        body.projectId ?? '',
        request.user?.subject ?? null,
      ),
    };
  }

  @Post('shapefile/preview')
  @HttpCode(200)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('imports.upload')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async previewShapefile(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body()
    body: {
      mappingJson?: string;
      country?: string;
      importMode?: string;
    },
  ) {
    assertSafeUpload(file, ['zip']);
    return {
      data: await this.geospatialCatalogService.previewShapefileImport({
        fileBuffer: file?.buffer,
        fileName: file?.originalname ?? null,
        mappingJson: body.mappingJson,
        country: body.country,
        importMode: body.importMode,
      }),
    };
  }

  @Post('shapefile/import')
  @HttpCode(202)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('imports.upload')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async importShapefile(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body()
    body: {
      code?: string;
      name?: string;
      layerType?: string;
      visibility?: string;
      status?: string;
      mappingJson?: string;
      country?: string;
      importMode?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    assertSafeUpload(file, ['zip']);
    return {
      data: await this.geospatialCatalogService.importShapefileLayer(
        {
          fileBuffer: file?.buffer,
          fileName: file?.originalname ?? null,
          ...body,
        },
        request.user?.subject ?? null,
      ),
    };
  }

  @Post('kobo/promote')
  @HttpCode(202)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.run')
  async promoteKobo(
    @Body()
    body: {
      sourceId?: string;
      code?: string;
      name?: string;
      visibility?: string;
      status?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.geospatialCatalogService.promoteLatestKoboSyncToLayer(
        {
          sourceId: body.sourceId,
          code: body.code,
          name: body.name,
          visibility: body.visibility,
          status: body.status,
        },
        request.user?.subject ?? null,
      ),
    };
  }

  @Post('kobo/build-analysis')
  @HttpCode(202)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.run')
  async buildKoboAnalysis(
    @Body()
    body: {
      sourceLayerCode?: string;
      pasturesLayerCode?: string;
      protectedAreasLayerCode?: string;
      territoriesLayerCode?: string;
      code?: string;
      name?: string;
      visibility?: string;
      status?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.geospatialCatalogService.buildKoboDemoAnalysisLayer(
        {
          sourceLayerCode: body.sourceLayerCode,
          pasturesLayerCode: body.pasturesLayerCode,
          protectedAreasLayerCode: body.protectedAreasLayerCode,
          territoriesLayerCode: body.territoriesLayerCode,
          code: body.code,
          name: body.name,
          visibility: body.visibility,
          status: body.status,
        },
        request.user?.subject ?? null,
      ),
    };
  }

  @Post('kobo/build-demo-analysis')
  @HttpCode(202)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.run')
  async buildLegacyKoboDemoAnalysis(
    @Body()
    body: {
      sourceLayerCode?: string;
      pasturesLayerCode?: string;
      protectedAreasLayerCode?: string;
      territoriesLayerCode?: string;
      code?: string;
      name?: string;
      visibility?: string;
      status?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.geospatialCatalogService.buildKoboDemoAnalysisLayer(
        {
          sourceLayerCode: body.sourceLayerCode,
          pasturesLayerCode: body.pasturesLayerCode,
          protectedAreasLayerCode: body.protectedAreasLayerCode,
          territoriesLayerCode: body.territoriesLayerCode,
          code: body.code,
          name: body.name,
          visibility: body.visibility,
          status: body.status,
        },
        request.user?.subject ?? null,
        { allowLegacyDemoRoute: true },
      ),
    };
  }

  @Delete(':code')
  @Roles('superadmin', 'national_admin', 'technical_integration')
  @Permissions('publications.publish')
  async deleteLayer(
    @Param('code') code: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.geospatialCatalogService.deleteLayer(
        code,
        request.user?.subject ?? null,
      ),
    };
  }
}
