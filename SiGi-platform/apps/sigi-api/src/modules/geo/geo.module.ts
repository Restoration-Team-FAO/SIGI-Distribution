import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [GeoController],
  providers: [GeoService],
})
export class GeoModule {}
