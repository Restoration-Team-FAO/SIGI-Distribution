import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { AuthPrincipal } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { ProjectsService } from './projects.service';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

type ProjectWriteBody = {
  code?: string;
  title?: string;
  objective?: string;
  summary?: string;
  description?: string;
  theme?: string;
  priority?: string;
  visibility?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  progressPct?: number;
  featured?: boolean;
  areaHa?: number;
  institutionId?: string;
  portfolioId?: string | null;
  datasetId?: string | null;
};

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('portfolio/summary')
  async portfolioSummary() {
    return {
      data: await this.projectsService.listPortfolioSummary(false),
    };
  }

  @Get()
  async list(
    @Query('status') status: string | undefined,
    @Query('institutionId') institutionId: string | undefined,
    @Query('portfolioId') portfolioId: string | undefined,
    @Query('featured') featured: string | undefined,
  ) {
    return {
      data: {
        projects: await this.projectsService.list({
          statuses: splitCsv(status),
          institutionId,
          portfolioId,
          featured: parseOptionalBoolean(featured),
          includeInternal: false,
        }),
      },
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const detail = await this.projectsService.findPublicOne(id);
    if (!detail) {
      throw new NotFoundException('Project not found');
    }

    return { data: detail };
  }

  @Get(':id/indicators')
  async indicators(@Param('id') id: string) {
    const detail = await this.requirePublicProjectDetail(id);
    return {
      data: {
        indicators: detail.indicators,
      },
    };
  }

  @Get(':id/territories')
  async territories(@Param('id') id: string) {
    const detail = await this.requirePublicProjectDetail(id);
    return {
      data: {
        territories: detail.territories,
      },
    };
  }

  @Get(':id/deliverables')
  async deliverables(@Param('id') id: string) {
    const detail = await this.requirePublicProjectDetail(id);
    return {
      data: {
        deliverables: detail.deliverables.filter(
          (deliverable) => deliverable.status === 'published',
        ),
      },
    };
  }

  @Get(':id/incidents')
  async incidents(@Param('id') id: string) {
    const detail = await this.requirePublicProjectDetail(id);
    return {
      data: {
        incidents: detail.incidents,
      },
    };
  }

  @Get(':id/audit')
  async audit(@Param('id') id: string) {
    await this.requirePublicProjectDetail(id);
    return {
      data: {
        audit: [],
      },
    };
  }

  @UseGuards(BearerAuthGuard)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.create')
  @Post()
  async create(
    @Body() body: ProjectWriteBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.projectsService.create(body, request.user?.subject ?? null),
    };
  }

  @UseGuards(BearerAuthGuard)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: ProjectWriteBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.projectsService.update(id, body, request.user?.subject ?? null),
    };
  }

  private async requirePublicProjectDetail(id: string) {
    const detail = await this.projectsService.findPublicOne(id);
    if (!detail) {
      throw new NotFoundException('Project not found');
    }
    return detail;
  }
}

function splitCsv(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : undefined;
}

function parseOptionalBoolean(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return undefined;
}
