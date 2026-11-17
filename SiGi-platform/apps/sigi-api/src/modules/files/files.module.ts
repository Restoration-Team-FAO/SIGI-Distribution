import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesAuditService } from './audit/files-audit.service';
import { FilesController, PublicFilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';
import { FilesPermissionsService } from './permissions/files-permissions.service';
import { FilesStorageService } from './storage/files-storage.service';

@Module({
  imports: [AuthModule],
  controllers: [FilesController, PublicFilesController],
  providers: [
    FilesService,
    FilesRepository,
    FilesStorageService,
    FilesPermissionsService,
    FilesAuditService,
  ],
})
export class FilesModule {}
