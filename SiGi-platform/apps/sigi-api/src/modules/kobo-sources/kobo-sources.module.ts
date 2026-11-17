import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SyncJobsModule } from '../sync-jobs/sync-jobs.module';
import { KoboSourcesController } from './kobo-sources.controller';
import { KoboSourcesService } from './kobo-sources.service';

@Module({
  imports: [AuthModule, SyncJobsModule],
  controllers: [KoboSourcesController],
  providers: [KoboSourcesService],
})
export class KoboSourcesModule {}
