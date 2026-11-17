import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImportsModule } from '../imports/imports.module';
import { SyncJobsModule } from '../sync-jobs/sync-jobs.module';
import { OdooSourcesController } from './odoo-sources.controller';
import { OdooSourcesService } from './odoo-sources.service';

@Module({
  imports: [AuthModule, SyncJobsModule, ImportsModule],
  controllers: [OdooSourcesController],
  providers: [OdooSourcesService],
})
export class OdooSourcesModule {}
