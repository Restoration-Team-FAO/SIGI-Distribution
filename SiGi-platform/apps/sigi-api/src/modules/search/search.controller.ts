import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import type { AuthPrincipal } from '../auth/auth.types';
import { SearchService } from './search.service';

type AuthenticatedRequest = Request & { user: AuthPrincipal };

@UseGuards(BearerAuthGuard)
@Controller('admin/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query('q') query: string | undefined,
    @Query('scope') requestedScope: string | undefined,
    @Query('limit') requestedLimit: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const limit = Math.max(1, Math.min(10, Number.parseInt(requestedLimit ?? '5', 10) || 5));
    const scope = requestedScope === 'global' ? 'global' as const : 'active' as const;
    return {
      data: await this.searchService.search({
        query: query ?? '',
        scope,
        limit,
        requestedEgiId: request.header('x-sigi-egi-id')?.trim() || null,
        principal: request.user,
      }),
    };
  }
}
