import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ImportsModule } from '../imports/imports.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { ProjectsModule } from '../projects/projects.module';
import { IndicatorsModule } from '../indicators/indicators.module';
import { SyncJobsModule } from '../sync-jobs/sync-jobs.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    AuthModule,
    InstitutionsModule,
    ConnectorsModule,
    SyncJobsModule,
    ImportsModule,
    ProjectsModule,
    IndicatorsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
