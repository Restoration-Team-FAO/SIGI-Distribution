import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { AdminGeoBiController, GeoBiController } from './geo-bi.controller';
import { GeoBiService } from './geo-bi.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [GeoBiController, AdminGeoBiController],
  providers: [GeoBiService],
})
export class GeoBiModule {}
