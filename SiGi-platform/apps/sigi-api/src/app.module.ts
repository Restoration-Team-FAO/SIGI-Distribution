import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { SyncJobsModule } from './modules/sync-jobs/sync-jobs.module';
import { DatabaseModule } from './modules/database/database.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { SchemasModule } from './modules/schemas/schemas.module';
import { DatasetsModule } from './modules/datasets/datasets.module';
import { AuditModule } from './modules/audit/audit.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { IndicatorsModule } from './modules/indicators/indicators.module';
import { TerritoriesModule } from './modules/territories/territories.module';
import { AdminModule } from './modules/admin/admin.module';
import { ExportsModule } from './modules/exports/exports.module';
import { AuthModule } from './modules/auth/auth.module';
import { PublicDashboardModule } from './modules/public-dashboard/public-dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { OdooSourcesModule } from './modules/odoo-sources/odoo-sources.module';
import { GeoBiModule } from './modules/geo-bi/geo-bi.module';
import { GeospatialCatalogModule } from './modules/geospatial-catalog/geospatial-catalog.module';
import { GeoModule } from './modules/geo/geo.module';
import { FilesModule } from './modules/files/files.module';
import { KoboSourcesModule } from './modules/kobo-sources/kobo-sources.module';
import { SearchModule } from './modules/search/search.module';
import { AssistantModule } from './modules/assistant/assistant.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    InstitutionsModule,
    ConnectorsModule,
    MetricsModule,
    SyncJobsModule,
    CatalogsModule,
    SchemasModule,
    DatasetsModule,
    AuditModule,
    ProjectsModule,
    IndicatorsModule,
    TerritoriesModule,
    AdminModule,
    ExportsModule,
    AuthModule,
    PublicDashboardModule,
    ReportsModule,
    IncidentsModule,
    OdooSourcesModule,
    KoboSourcesModule,
    GeoBiModule,
    GeospatialCatalogModule,
    GeoModule,
    FilesModule,
    SearchModule,
    AssistantModule,
  ],
})
export class AppModule {}
