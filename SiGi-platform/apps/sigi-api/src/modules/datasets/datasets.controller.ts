import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { getValidatedEnv } from '../../common/config/env';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { DatasetsService } from './datasets.service';
import { AdminService } from '../admin/admin.service';
import { AuthPrincipal } from '../auth/auth.types';
import { assertSafeUpload } from '../../common/http/upload-policy';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };
const uploadInterceptorOptions = {
  limits: {
    fileSize: getValidatedEnv().apiUploadMaxBytes,
  },
};

@Controller('datasets')
export class DatasetsController {
  constructor(
    private readonly datasetsService: DatasetsService,
    private readonly adminService: AdminService,
  ) {}

  // V2-05: el encabezado X-SIGI-EGI-ID solo se acepta si el actor tiene acceso a ese EGI.
  private async scopedEgiId(request: AuthenticatedRequest) {
    return this.adminService.resolveAdminScopeEgiId(request.user?.subject ?? null, getRequestedEgiId(request));
  }

  @Get()
  @UseGuards(BearerAuthGuard)
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_validator',
    'technical_integration',
    'read_consumer',
  )
  async list(@Req() request: AuthenticatedRequest) {
    return {
      data: {
        datasets: await this.datasetsService.list(await this.scopedEgiId(request)),
      },
    };
  }

  @Post('import/excel')
  @HttpCode(202)
  @UseGuards(BearerAuthGuard)
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_integration',
  )
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async importExcel(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body()
    payload: {
      institutionId: string;
      sourceId: string;
      schemaCode?: string;
      datasetTitle?: string;
      sheetName?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    assertSafeUpload(file, ['xls', 'xlsx', 'csv']);
    return {
      data: await this.datasetsService.importExcel(
        {
          fileBuffer: file?.buffer,
          fileName: file?.originalname ?? null,
          institutionId: payload.institutionId,
          sourceId: payload.sourceId,
          schemaCode: payload.schemaCode,
          datasetTitle: payload.datasetTitle,
          sheetName: payload.sheetName,
      },
        request.user?.subject ?? null,
        await this.scopedEgiId(request),
      ),
    };
  }

  @Post()
  @HttpCode(202)
  @UseGuards(BearerAuthGuard)
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_integration',
  )
  async submit(
    @Body() payload: CreateDatasetDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.datasetsService.submit(
        payload,
        request.user?.subject ?? null,
        await this.scopedEgiId(request),
      ),
    };
  }

  @Get(':id')
  @UseGuards(BearerAuthGuard)
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_validator',
    'technical_integration',
    'read_consumer',
  )
  async findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const dataset = await this.datasetsService.findOne(id, await this.scopedEgiId(request));
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }

    return { data: { dataset } };
  }

  @Get(':id/validation')
  @UseGuards(BearerAuthGuard)
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_validator',
    'technical_integration',
    'read_consumer',
  )
  async validation(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return {
      data: await this.datasetsService.getValidation(id, await this.scopedEgiId(request)),
    };
  }

  @Get(':id/import-stats')
  @UseGuards(BearerAuthGuard)
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_validator',
    'technical_integration',
    'read_consumer',
  )
  async importStats(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const stats = await this.datasetsService.getImportStats(id, await this.scopedEgiId(request));
    if (!stats) {
      throw new NotFoundException('Import stats not found for dataset');
    }

    return { data: stats };
  }

  @Delete(':id')
  @UseGuards(BearerAuthGuard)
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_integration',
  )
  async delete(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.datasetsService.deleteDataset(
        id,
        request.user?.subject ?? null,
        await this.scopedEgiId(request),
      ),
    };
  }
}

function getRequestedEgiId(request: Request) {
  const headerValue = request.header('x-sigi-egi-id');
  return typeof headerValue === 'string' && headerValue.trim().length > 0
    ? headerValue.trim()
    : null;
}
