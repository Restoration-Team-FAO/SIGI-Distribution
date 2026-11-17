import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeospatialCatalogController } from './geospatial-catalog.controller';
import { GeospatialCatalogService } from './geospatial-catalog.service';

@Module({
  imports: [AuthModule],
  controllers: [GeospatialCatalogController],
  providers: [GeospatialCatalogService],
})
export class GeospatialCatalogModule {}
