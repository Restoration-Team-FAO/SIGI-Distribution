import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import { TerritoriesService } from './territories.service';
import { AuthService } from '../auth/auth.service';
import { principalCanReadNonPublicGeoLayers } from '../../common/geo/geo-visibility';
import {
  resolveOptionalPrincipal,
  RequestWithOptionalPrincipal,
} from '../../common/auth/optional-principal';

@Controller('territories')
export class TerritoriesController {
  constructor(
    private readonly territoriesService: TerritoriesService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async list(@Query('page') rawPage?: string, @Query('pageSize') rawPageSize?: string) {
    const page = parsePositiveInteger(rawPage, 1, 'page');
    const pageSize = Math.min(parsePositiveInteger(rawPageSize, 250, 'pageSize'), 500);
    const result = await this.territoriesService.list(page, pageSize);
    return {
      data: {
        territories: result.items,
        pagination: result.pagination,
      },
    };
  }

  /**
   * Public endpoint with optional authentication.
   *
   * Anonymous callers — the country portal is entirely anonymous — receive only
   * public, published layers. A caller presenting a valid token authorized to
   * read non-public geo layers (see ../../common/geo/geo-visibility) receives
   * the rest. An invalid or insufficient token is not an error here; it simply
   * yields the public view.
   */
  @Get('features')
  async features(
    @Req() request: RequestWithOptionalPrincipal,
    @Query('level') level?: string,
    @Query('layer') layer?: string,
  ) {
    const principal = await resolveOptionalPrincipal(request, this.authService);
    const includeInternal = principalCanReadNonPublicGeoLayers(principal);

    return {
      data: await this.territoriesService.features(level, layer, includeInternal),
    };
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number, field: string) {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${field} debe ser un entero positivo.`);
  }
  return parsed;
}
