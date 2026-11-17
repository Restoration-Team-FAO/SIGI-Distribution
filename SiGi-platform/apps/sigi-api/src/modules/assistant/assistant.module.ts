import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { SearchModule } from '../search/search.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [AdminModule, AuditModule, AuthModule, SearchModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
