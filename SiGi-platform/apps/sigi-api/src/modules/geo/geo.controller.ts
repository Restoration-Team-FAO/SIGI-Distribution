import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { GeoService } from './geo.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { principalCanReadNonPublicGeoLayers } from '../../common/geo/geo-visibility';
import {
  resolveOptionalPrincipal,
  RequestWithOptionalPrincipal,
} from '../../common/auth/optional-principal';
import {
  parseBboxParam,
  parseFiltersParam,
  parseFormatParam,
  parseIntersectionQueryInput,
  parseNearbyQueryInput,
  parsePageParam,
  parsePageSizeParam,
  parseSavedViewCreateInput,
  parseSearchTermParam,
  parseSortParam,
  parseStatsFieldParam,
  parseZoomParam,
} from './dto/geo-feature-query.dto';
import { buildCsvExport, buildGeoJsonExport, buildXlsxExport } from './geo-export';

/**
 * Public, optional-auth surface for Mapa SIGI's layer catalog and feature
 * reads — same authorization model as /territories/features (P0-1):
 * anonymous callers get the public/published view; a caller presenting a
 * token authorized to read non-public geo layers gets the rest. Existing
 * routes (/geo-bi, /territories, /admin/geospatial-catalog) are untouched —
 * this is an additive module, not a replacement.
 */
@Controller('geo')
export class GeoController {
  constructor(
    private readonly geoService: GeoService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  @Get('layers')
  async listLayers(@Req() request: RequestWithOptionalPrincipal) {
    const includeInternal = await this.resolveIncludeInternal(request);
    return {
      data: { layers: await this.geoService.listLayers(includeInternal) },
    };
  }

  /**
   * P1-1 — cross-layer territorial search (spec §18). `q` is required and
   * matched against territory name/code across every layer the caller can
   * see, not just the ones currently active on the map. Same visibility
   * rule as every other /geo/* route.
   */
  @Get('search')
  async searchTerritories(
    @Req() request: RequestWithOptionalPrincipal,
    @Query('q') qParam?: string,
  ) {
    const includeInternal = await this.resolveIncludeInternal(request);
    const term = parseSearchTermParam(qParam);
    return {
      data: { results: await this.geoService.searchTerritories(term, includeInternal) },
    };
  }

  @Get('layers/:code')
  async getLayer(@Param('code') code: string, @Req() request: RequestWithOptionalPrincipal) {
    const includeInternal = await this.resolveIncludeInternal(request);
    return {
      data: { layer: await this.geoService.getLayer(code, includeInternal) },
    };
  }

  @Get('layers/:code/metadata')
  async getLayerMetadata(
    @Param('code') code: string,
    @Req() request: RequestWithOptionalPrincipal,
  ) {
    const includeInternal = await this.resolveIncludeInternal(request);
    return { data: await this.geoService.getLayerMetadata(code, includeInternal) };
  }

  @Get('layers/:code/schema')
  async getLayerSchema(@Param('code') code: string, @Req() request: RequestWithOptionalPrincipal) {
    const includeInternal = await this.resolveIncludeInternal(request);
    return { data: await this.geoService.getLayerSchema(code, includeInternal) };
  }

  /**
   * P1-2 — cached per-layer profile (spec §11: "estadísticas dinámicas").
   * `profile: null` (not an error) when the layer has never been profiled —
   * see docs/geo/postgis.md §2. Same visibility rule as every other /geo/*
   * route.
   */
  @Get('layers/:code/profile')
  async getLayerProfile(@Param('code') code: string, @Req() request: RequestWithOptionalPrincipal) {
    const includeInternal = await this.resolveIncludeInternal(request);
    return {
      data: { profile: await this.geoService.getLayerProfile(code, includeInternal) },
    };
  }

  /**
   * P1-5 — distribution of the current filtered result set for one field
   * (spec §12, "Mapa + BI"). Same `filters` format and visibility rule as
   * `/features`; deliberately no bbox/page/pageSize — a chart always
   * summarizes the whole filtered set, not one map viewport or table page.
   */
  @Get('layers/:code/stats')
  async getLayerStats(
    @Param('code') code: string,
    @Req() request: RequestWithOptionalPrincipal,
    @Query('field') fieldParam?: string,
    @Query('filters') filtersParam?: string,
  ) {
    const includeInternal = await this.resolveIncludeInternal(request);
    const field = parseStatsFieldParam(fieldParam);
    const filters = parseFiltersParam(filtersParam) ?? [];
    return {
      data: { stats: await this.geoService.getLayerStats(code, field, filters, includeInternal) },
    };
  }

  /**
   * P1-6 — proximity search (spec §10, "consultas espaciales"): every
   * feature in `code` within `radiusMeters` of the given geometry. Public
   * with optional auth like every other read here — computing distance to
   * an already-visible geometry needs no extra permission beyond the
   * target layer's own visibility.
   */
  @Post('layers/:code/nearby')
  async findNearbyTerritories(
    @Param('code') code: string,
    @Req() request: RequestWithOptionalPrincipal,
    @Body() body: unknown,
  ) {
    const includeInternal = await this.resolveIncludeInternal(request);
    const input = parseNearbyQueryInput(body);
    return {
      data: {
        results: await this.geoService.findNearbyTerritories(
          code,
          input.geometry,
          input.radiusMeters,
          includeInternal,
        ),
      },
    };
  }

  /**
   * Bounded PostGIS overlay between two visible layers. The response carries
   * aggregate metrics plus a display-ready GeoJSON sample; it never creates
   * or mutates a layer implicitly.
   */
  @Post('analysis/intersection')
  async intersectLayers(
    @Req() request: RequestWithOptionalPrincipal,
    @Body() body: unknown,
  ) {
    const includeInternal = await this.resolveIncludeInternal(request);
    const input = parseIntersectionQueryInput(body);
    return {
      data: {
        result: await this.geoService.intersectLayers(
          input.sourceLayerCode,
          input.targetLayerCode,
          includeInternal,
        ),
      },
    };
  }

  /**
   * P1-4 — saved views (spec §19). Unlike every other route in this
   * controller, these genuinely require a real signed-in user — a saved
   * view is owned data, not a visibility tier. Anonymous callers get a real
   * 401, not a silently-empty list — see docs/geo/MAPA_SIGI_DIAGNOSTICO.md §9.14.
   */
  @Get('saved-views')
  async listSavedViews(@Req() request: RequestWithOptionalPrincipal) {
    const principal = await this.requireAuthenticatedPrincipal(request);
    return { data: { views: await this.geoService.listSavedViews(principal.userId) } };
  }

  @Post('saved-views')
  async createSavedView(@Req() request: RequestWithOptionalPrincipal, @Body() body: unknown) {
    const principal = await this.requireAuthenticatedPrincipal(request);
    const input = parseSavedViewCreateInput(body);
    return { data: { view: await this.geoService.createSavedView(principal.userId, input) } };
  }

  @Delete('saved-views/:id')
  async deleteSavedView(@Param('id') id: string, @Req() request: RequestWithOptionalPrincipal) {
    const principal = await this.requireAuthenticatedPrincipal(request);
    await this.geoService.deleteSavedView(principal.userId, id);
    return { data: { id, deleted: true } };
  }

  /**
   * bbox: "minLon,minLat,maxLon,maxLat" (OGC API - Features convention).
   * filters: a JSON-encoded GeoFeatureQueryFilter[], URL-encoded — e.g.
   *   filters=%5B%7B%22field%22%3A%22level%22%2C%22operator%22%3A%22eq%22%2C%22value%22%3A%22region%22%7D%5D
   *   decodes to [{"field":"level","operator":"eq","value":"region"}]
   * sort/order: e.g. sort=areaHa&order=desc (P0-7 attribute table).
   * Always paginated server-side — see docs/geo/postgis.md §4.
   */
  @Get('layers/:code/features')
  async getFeatures(
    @Param('code') code: string,
    @Req() request: RequestWithOptionalPrincipal,
    @Query('bbox') bboxParam?: string,
    @Query('zoom') zoomParam?: string,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('sort') sortParam?: string,
    @Query('order') orderParam?: string,
  ) {
    const includeInternal = await this.resolveIncludeInternal(request);

    const query = {
      bbox: parseBboxParam(bboxParam),
      zoom: parseZoomParam(zoomParam),
      page: parsePageParam(pageParam),
      pageSize: parsePageSizeParam(pageSizeParam),
      filters: parseFiltersParam(filtersParam),
      sort: parseSortParam(sortParam, orderParam),
    };

    return { data: await this.geoService.queryFeatures(code, query, includeInternal) };
  }

  /**
   * P0-8 — CSV/Excel/GeoJSON export of the current filtered/sorted result
   * set (spec §17). Same visibility, filter and sort semantics as
   * /features; no page/pageSize/zoom — export is unpaginated (up to
   * GeoService's MAX_EXPORT_FEATURES cap) and always full-precision
   * geometry. Every call is audited via the shared AuditService — spec §14,
   * "no crear otro subsistema de auditoría" — success or failure, with the
   * dataset, filters, sort, and row counts recorded so audit reads never
   * need to guess what an export actually contained.
   */
  @Get('layers/:code/export')
  async exportFeatures(
    @Param('code') code: string,
    @Req() request: RequestWithOptionalPrincipal,
    @Res() response: Response,
    @Query('format') formatParam?: string,
    @Query('bbox') bboxParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('sort') sortParam?: string,
    @Query('order') orderParam?: string,
  ) {
    const principal = await resolveOptionalPrincipal(request, this.authService);
    const includeInternal = principalCanReadNonPublicGeoLayers(principal);
    const actorLabel = principal?.subject ?? 'Anónimo';

    const format = parseFormatParam(formatParam);
    const query = {
      bbox: parseBboxParam(bboxParam),
      filters: parseFiltersParam(filtersParam),
      sort: parseSortParam(sortParam, orderParam),
    };

    let result;
    try {
      result = await this.geoService.exportFeatures(code, query, includeInternal);
    } catch (error) {
      await this.recordExportAudit({
        principal,
        code,
        format,
        query,
        result: 'failed',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }

    const meta = {
      layer: result.layer,
      generatedAt: new Date().toISOString(),
      actorLabel,
      filters: query.filters ?? [],
      sort: query.sort ?? null,
      totalFeatures: result.totalFeatures,
      exportedCount: result.exportedCount,
      truncated: result.truncated,
    };

    const fileBaseName = `sigi-${result.layer.code}-${Date.now()}`;
    response.setHeader('X-SIGI-Export-Total', String(result.totalFeatures));
    response.setHeader('X-SIGI-Export-Exported', String(result.exportedCount));
    response.setHeader('X-SIGI-Export-Truncated', String(result.truncated));

    if (format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${fileBaseName}.csv"`);
      response.send(buildCsvExport(result.features, meta));
    } else if (format === 'xlsx') {
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader('Content-Disposition', `attachment; filename="${fileBaseName}.xlsx"`);
      response.send(buildXlsxExport(result.features, meta));
    } else {
      response.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${fileBaseName}.geojson"`);
      response.send(JSON.stringify(buildGeoJsonExport(result.features, meta), null, 2));
    }

    await this.recordExportAudit({
      principal,
      code: result.layer.code,
      format,
      query,
      result: 'success',
      details: {
        layerName: result.layer.name,
        totalFeatures: result.totalFeatures,
        exportedCount: result.exportedCount,
        truncated: result.truncated,
      },
    });
  }

  /**
   * Audit failures are logged, never thrown — an audit-write problem must
   * not turn into a 500 for a request whose actual response (the file, or
   * the original error) has already been sent.
   */
  private async recordExportAudit(input: {
    principal: Awaited<ReturnType<typeof resolveOptionalPrincipal>>;
    code: string;
    format: string;
    query: { filters?: unknown; sort?: unknown };
    result: 'success' | 'failed';
    details: Record<string, unknown>;
  }) {
    try {
      await this.auditService.recordAccessEvent({
        actorUserId: input.principal?.userId ?? null,
        action: 'geo.layer.export',
        result: input.result,
        details: {
          layerCode: input.code,
          format: input.format,
          filters: input.query.filters ?? [],
          sort: input.query.sort ?? null,
          ...input.details,
        },
      });
    } catch (auditError) {
      // eslint-disable-next-line no-console
      console.error('No se pudo registrar el evento de auditoría de exportación geoespacial', auditError);
    }
  }

  private async resolveIncludeInternal(request: RequestWithOptionalPrincipal) {
    const principal = await resolveOptionalPrincipal(request, this.authService);
    return principalCanReadNonPublicGeoLayers(principal);
  }

  /** P1-4 — the only routes in this controller that reject anonymous callers outright. */
  private async requireAuthenticatedPrincipal(request: RequestWithOptionalPrincipal) {
    const principal = await resolveOptionalPrincipal(request, this.authService);
    if (!principal) {
      throw new UnauthorizedException('Esta acción requiere una sesión iniciada.');
    }
    return principal;
  }
}
