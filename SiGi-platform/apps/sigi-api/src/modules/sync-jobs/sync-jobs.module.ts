import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { SyncJobsController } from './sync-jobs.controller';
import { SyncJobsService } from './sync-jobs.service';

@Module({
  imports: [AuthModule, InstitutionsModule, ConnectorsModule],
  controllers: [SyncJobsController],
  providers: [SyncJobsService],
  exports: [SyncJobsService],
})
export class SyncJobsModule {}
