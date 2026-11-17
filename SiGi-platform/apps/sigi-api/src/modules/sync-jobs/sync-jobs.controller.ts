import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { SyncJobsService } from './sync-jobs.service';

type CreateSyncJobBody = {
  triggeredBy?: 'user' | 'scheduler';
  mode?: 'incremental' | 'full';
};

@Controller()
@UseGuards(BearerAuthGuard)
export class SyncJobsController {
  constructor(private readonly syncJobsService: SyncJobsService) {}

  @Post('institutions/:institutionId/connectors/:connectorId/sync')
  @HttpCode(202)
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_integration',
  )
  async create(
    @Param('institutionId') institutionId: string,
    @Param('connectorId') connectorId: string,
    @Body() body: CreateSyncJobBody,
  ) {
    const job = await this.syncJobsService.create({
      institutionId,
      connectorId,
      triggeredBy: body?.triggeredBy,
      mode: body?.mode,
    });

    return {
      ...job,
      statusUrl: `/api/sync-jobs/${job.jobId}`,
    };
  }

  @Get('sync-jobs/:jobId')
  @Roles(
    'superadmin',
    'national_admin',
    'institution_editor',
    'technical_validator',
    'technical_integration',
  )
  get(@Param('jobId') jobId: string) {
    return this.syncJobsService.findById(jobId);
  }
}
