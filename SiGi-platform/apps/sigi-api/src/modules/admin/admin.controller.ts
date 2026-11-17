import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { assertSafeUpload } from '../../common/http/upload-policy';
import { Request } from 'express';
import { getValidatedEnv } from '../../common/config/env';
import { AdminService } from './admin.service';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthPrincipal } from '../auth/auth.types';
import { ImportsService } from '../imports/imports.service';
import { ProjectsService } from '../projects/projects.service';
import { IndicatorsService } from '../indicators/indicators.service';

type CreateSourceBody = {
  institutionId: string;
  connectorId?: string;
  code: string;
  name: string;
  sourceType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  assetUid?: string;
  description?: string;
  userName?: string;
  country?: string | null;
  allowedCountries?: string[] | null;
  territorialScope?: string | null;
  status?: 'active' | 'inactive';
};

type CreateConnectorBody = {
  institutionId: string;
  connectorType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  displayName: string;
  description?: string;
  endpointUrl?: string;
  userName?: string;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  authScheme?: 'none' | 'basic' | 'bearer' | 'api_key';
  resourcePath?: string;
  timeoutMs?: number;
  credentialSecret?: string;
  status?: 'active' | 'inactive';
};

type UpdateConnectorBody = {
  institutionId?: string;
  connectorType?: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  displayName?: string;
  description?: string | null;
  endpointUrl?: string | null;
  userName?: string | null;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | null;
  authScheme?: 'none' | 'basic' | 'bearer' | 'api_key' | null;
  resourcePath?: string | null;
  timeoutMs?: number | null;
  credentialSecret?: string | null;
  status?: 'active' | 'inactive';
};

type UpdateSourceBody = {
  institutionId?: string;
  connectorId?: string | null;
  code?: string;
  name?: string;
  sourceType?: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  assetUid?: string | null;
  description?: string | null;
  userName?: string | null;
  country?: string | null;
  allowedCountries?: string[] | null;
  territorialScope?: string | null;
  status?: 'active' | 'inactive';
};

type CreateInstitutionBody = {
  code: string;
  name: string;
  status?: 'active' | 'inactive';
};

type CreateEgiBody = {
  institutionId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  responsible?: string | null;
  territorialScope?: string | null;
  thematicScope?: string | null;
  visibility?: 'public' | 'institutional' | 'internal';
  status?: 'draft' | 'active' | 'inactive';
};

type UpdateEgiBody = {
  institutionId?: string | null;
  code?: string;
  name?: string;
  description?: string | null;
  responsible?: string | null;
  territorialScope?: string | null;
  thematicScope?: string | null;
  visibility?: 'public' | 'institutional' | 'internal';
  status?: 'draft' | 'active' | 'inactive';
};

type UpsertEgiMembershipBody = {
  userEmail: string;
  roleCode: 'egi_owner' | 'egi_admin' | 'egi_editor' | 'egi_validator' | 'egi_viewer';
  membershipStatus?: 'active' | 'inactive';
};

type UpdateInstitutionBody = {
  code?: string;
  name?: string;
  status?: 'active' | 'inactive';
};

type CreateUserBody = {
  institutionId?: string | null;
  email: string;
  displayName: string;
  password?: string;
  status?: 'active' | 'inactive' | 'pending';
  roles?: string[];
};

type UpdateUserBody = {
  institutionId?: string | null;
  email?: string;
  displayName?: string;
  password?: string;
  status?: 'active' | 'inactive' | 'pending';
  roles?: string[];
};

type CreateRoleBody = {
  code: string;
  name: string;
  permissions?: string[];
};

type UpdateRoleBody = {
  code?: string;
  name?: string;
  permissions?: string[];
};

type AuthenticatedRequest = Request & { user?: AuthPrincipal };
const uploadInterceptorOptions = {
  limits: {
    fileSize: getValidatedEnv().apiUploadMaxBytes,
  },
};

@UseGuards(BearerAuthGuard)
@Roles(
  'superadmin',
  'national_admin',
  'institution_editor',
  'technical_validator',
  'technical_integration',
  'read_consumer',
)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly importsService: ImportsService,
    private readonly projectsService: ProjectsService,
    private readonly indicatorsService: IndicatorsService,
  ) {}

  // V2-05: el encabezado X-SIGI-EGI-ID es solo una preferencia del cliente. Antes de escribir en un
  // proyecto se valida que el actor pertenezca al EGI (o tenga alcance global); sin encabezado se usa
  // su EGI activo, de modo que las consultas filtran siempre por un EGI autorizado.
  private async scopedEgiId(request: AuthenticatedRequest) {
    return this.adminService.resolveAdminScopeEgiId(request.user?.subject ?? null, getRequestedEgiId(request));
  }

  @Get('indicators')
  @Permissions('indicators.read')
  async indicators(
    @Query('scope') scope: 'active' | 'global' | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return { data: { indicators: await this.indicatorsService.listWorkspace(egiId) } };
  }

  @Get('indicators/:code')
  @Permissions('indicators.read')
  async indicatorDetail(
    @Param('code') code: string,
    @Query('scope') scope: 'active' | 'global' | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    const detail = await this.indicatorsService.findWorkspaceOne(code, egiId);
    if (!detail) throw new NotFoundException('Indicator not found');
    return { data: detail };
  }

  @Get('egi')
  async egiWorkspace(@Req() request: AuthenticatedRequest) {
    return {
      data: await this.adminService.listEgiWorkspace(request.user?.subject ?? null),
    };
  }

  @Get('egi/:id/summary')
  async egiSummary(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.getEgiSummary(id, request.user?.subject ?? null),
    };
  }

  @Post('egi')
  @Roles('superadmin', 'national_admin', 'institution_editor')
  async createEgi(
    @Body() body: CreateEgiBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        egi: await this.adminService.createEgi(body, request.user?.subject ?? null),
      },
    };
  }

  @Patch('egi/:id')
  @Roles('superadmin', 'national_admin', 'institution_editor')
  async updateEgi(
    @Param('id') id: string,
    @Body() body: UpdateEgiBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        egi: await this.adminService.updateEgi(id, body, request.user?.subject ?? null),
      },
    };
  }

  @Post('egi/:id/memberships')
  @Roles('superadmin', 'national_admin', 'institution_editor')
  @Permissions('egi.memberships.manage')
  async upsertEgiMembership(
    @Param('id') id: string,
    @Body() body: UpsertEgiMembershipBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        membership: await this.adminService.upsertEgiMembership(
          id,
          body,
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Post('egi/active')
  async selectActiveEgi(
    @Body() body: { egiId?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.selectActiveEgi(
        body.egiId ?? '',
        request.user?.subject ?? null,
      ),
    };
  }

  @Get('sources')
  @Permissions('sources.read')
  async sources(@Req() request: AuthenticatedRequest, @Query('scope') scope?: 'active' | 'global') {
    return {
      data: {
        sources: await this.adminService.listSources(
          request.user?.subject ?? null,
          getRequestedEgiId(request),
          scope,
        ),
      },
    };
  }

  @Post('sources')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('sources.create')
  async createSource(
    @Body() body: CreateSourceBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        source: await this.adminService.createSource(
          body,
          request.user?.subject ?? null,
          getRequestedEgiId(request),
        ),
      },
    };
  }

  @Patch('sources/:id')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('sources.update')
  async updateSource(
    @Param('id') id: string,
    @Body() body: UpdateSourceBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        source: await this.adminService.updateSource(
          id,
          body,
          request.user?.subject ?? null,
          getRequestedEgiId(request),
        ),
      },
    };
  }

  @Delete('sources/:id')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('sources.delete')
  async deleteSource(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.deleteSource(
        id,
        request.user?.subject ?? null,
        getRequestedEgiId(request),
      ),
    };
  }

  @Get('institutions')
  @Permissions('institutions.read')
  async institutions() {
    return { data: { institutions: await this.adminService.listInstitutions() } };
  }

  @Post('institutions')
  @Roles('superadmin', 'national_admin')
  @Permissions('institutions.create')
  async createInstitution(
    @Body() body: CreateInstitutionBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        institution: await this.adminService.createInstitution(
          body,
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Patch('institutions/:id')
  @Roles('superadmin', 'national_admin')
  @Permissions('institutions.update')
  async updateInstitution(
    @Param('id') id: string,
    @Body() body: UpdateInstitutionBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        institution: await this.adminService.updateInstitution(
          id,
          body,
          request.user?.subject ?? null,
        ),
      },
    };
  }

  @Delete('institutions/:id')
  @Roles('superadmin', 'national_admin')
  @Permissions('institutions.delete')
  async deleteInstitution(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.deleteInstitution(id, request.user?.subject ?? null),
    };
  }

  @Get('connectors')
  @Permissions('connectors.read')
  async connectors(@Req() request: AuthenticatedRequest) {
    return { data: { connectors: await this.adminService.listConnectors(request.user?.subject ?? null) } };
  }

  @Post('connectors')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.create')
  async createConnector(
    @Body() body: CreateConnectorBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        connector: await this.adminService.createConnector(body, request.user?.subject ?? null),
      },
    };
  }

  @Patch('connectors/:id')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.update')
  async updateConnector(
    @Param('id') id: string,
    @Body() body: UpdateConnectorBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        connector: await this.adminService.updateConnector(id, body, request.user?.subject ?? null),
      },
    };
  }

  @Delete('connectors/:id')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('connectors.delete')
  async deleteConnector(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.deleteConnector(id, request.user?.subject ?? null),
    };
  }

  @Get('projects')
  @Permissions('projects.read')
  async projects(
    @Query('status') status: string | undefined,
    @Query('institutionId') institutionId: string | undefined,
    @Query('portfolioId') portfolioId: string | undefined,
    @Query('featured') featured: string | undefined,
    @Query('visibility') visibility: string | undefined,
    @Query('scope') scope: 'active' | 'global' | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return {
      data: {
        projects: await this.projectsService.list({
          statuses: status
            ? status
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            : undefined,
          institutionId,
          portfolioId,
          visibility,
          featured:
            featured === undefined
              ? undefined
              : String(featured).trim().toLowerCase() === 'true',
          includeInternal: true,
          egiId,
        }),
      },
    };
  }

  @Get('projects/portfolio/summary')
  @Permissions('projects.read')
  async projectPortfolioSummary(
    @Query('scope') scope: 'active' | 'global' | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return {
      data: await this.projectsService.listPortfolioSummary(true, egiId),
    };
  }

  @Get('projects/:id')
  @Permissions('projects.read')
  async projectDetail(
    @Param('id') id: string,
    @Query('scope') scope: 'active' | 'global' | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    const detail = await this.projectsService.findOne(id, true, egiId);
    if (!detail) {
      throw new NotFoundException('Project not found');
    }
    const canReadBudget = request.user?.permissions.some((permission) => ['projects.budget.read','projects.budget.manage','projects.budget.approve','projects.finance.read','projects.finance.manage'].includes(permission)) ?? false;
    return {
      data: canReadBudget ? detail : {
        ...detail,
        fundingSources: [],
        budgetVersions: [],
        financialMovements: [],
        financialSummary: {
          applicable: false,
          source: 'none',
          currency: null,
          initialBudget: null,
          currentBudget: null,
          committed: null,
          executed: null,
          available: null,
          executionPct: null,
          commitmentPct: null,
          variance: null,
          cutoffDate: null,
        },
      },
    };
  }

  @Get('projects/:id/polygon')
  @Permissions('projects.read')
  async projectPolygon(
    @Param('id') id: string,
    @Query('scope') scope: 'active' | 'global' | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return {
      data: {
        polygon: await this.projectsService.getEditablePolygon(id, egiId),
      },
    };
  }

  @Post('projects')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.create')
  async createProject(
    @Body()
    body: {
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
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.projectsService.create(
        body,
        request.user?.subject ?? null,
        await this.scopedEgiId(request),
      ),
    };
  }

  @Patch('projects/:id')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async updateProject(
    @Param('id') id: string,
    @Body()
    body: {
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
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.projectsService.update(
        id,
        body,
        request.user?.subject ?? null,
        await this.scopedEgiId(request),
      ),
    };
  }

  @Patch('projects/:id/polygon')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.polygon.update')
  async updateProjectPolygon(
    @Param('id') id: string,
    @Body()
    body: {
      territoryName?: string;
      country?: string;
      geojson?: Record<string, unknown> | null;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        polygon: await this.projectsService.upsertEditablePolygon(
          id,
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Post('projects/:id/actors')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async createProjectActor(
    @Param('id') id: string,
    @Body()
    body: {
      actorType?: string;
      institutionId?: string | null;
      displayName?: string;
      roleLabel?: string | null;
      status?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        actor: await this.projectsService.createActor(
          id,
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Patch('projects/:id/actors/:actorId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async updateProjectActor(
    @Param('id') id: string,
    @Param('actorId') actorId: string,
    @Body()
    body: {
      actorType?: string;
      institutionId?: string | null;
      displayName?: string;
      roleLabel?: string | null;
      status?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        actor: await this.projectsService.updateActor(
          id,
          actorId,
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Delete('projects/:id/actors/:actorId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async deleteProjectActor(
    @Param('id') id: string,
    @Param('actorId') actorId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.projectsService.deleteActor(
        id,
        actorId,
        request.user?.subject ?? null,
        await this.scopedEgiId(request),
      ),
    };
  }

  @Post('projects/:id/milestones')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async createProjectMilestone(
    @Param('id') id: string,
    @Body()
    body: {
      activityCode?: string | null;
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      completedAt?: string | null;
      status?: string;
      progressPct?: number | null;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        milestone: await this.projectsService.createMilestone(
          id,
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Patch('projects/:id/milestones/:milestoneId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async updateProjectMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body()
    body: {
      activityCode?: string | null;
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      completedAt?: string | null;
      status?: string;
      progressPct?: number | null;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        milestone: await this.projectsService.updateMilestone(
          id,
          milestoneId,
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Delete('projects/:id/milestones/:milestoneId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async deleteProjectMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.projectsService.deleteMilestone(
        id,
        milestoneId,
        request.user?.subject ?? null,
        await this.scopedEgiId(request),
      ),
    };
  }

  @Post('projects/:id/deliverables')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async createProjectDeliverable(
    @Param('id') id: string,
    @Body()
    body: {
      code?: string | null;
      title?: string;
      deliverableType?: string | null;
      description?: string | null;
      status?: string;
      dueDate?: string | null;
      publishedAt?: string | null;
      outputUrl?: string | null;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        deliverable: await this.projectsService.createDeliverable(
          id,
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Patch('projects/:id/deliverables/:deliverableId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async updateProjectDeliverable(
    @Param('id') id: string,
    @Param('deliverableId') deliverableId: string,
    @Body()
    body: {
      code?: string | null;
      title?: string;
      deliverableType?: string | null;
      description?: string | null;
      status?: string;
      dueDate?: string | null;
      publishedAt?: string | null;
      outputUrl?: string | null;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        deliverable: await this.projectsService.updateDeliverable(
          id,
          deliverableId,
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Delete('projects/:id/deliverables/:deliverableId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async deleteProjectDeliverable(
    @Param('id') id: string,
    @Param('deliverableId') deliverableId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.projectsService.deleteDeliverable(
        id,
        deliverableId,
        request.user?.subject ?? null,
        await this.scopedEgiId(request),
      ),
    };
  }

  @Post('projects/:id/tasks')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.planning.manage')
  async createProjectTask(@Param('id') id: string, @Body() body: { parentTaskId?: string | null; ownerActorId?: string | null; taskType?: string; code?: string; title?: string; description?: string | null; startDate?: string | null; endDate?: string | null; status?: string; progressPct?: number | null; weight?: number | null; sortOrder?: number | null; predecessorIds?: string[] }, @Req() request: AuthenticatedRequest) {
    return { data: { task: await this.projectsService.createTask(id, body, request.user?.subject ?? null, await this.scopedEgiId(request)) } };
  }

  @Patch('projects/:id/tasks/:taskId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.planning.manage')
  async updateProjectTask(@Param('id') id: string, @Param('taskId') taskId: string, @Body() body: { parentTaskId?: string | null; ownerActorId?: string | null; taskType?: string; code?: string; title?: string; description?: string | null; startDate?: string | null; endDate?: string | null; status?: string; progressPct?: number | null; weight?: number | null; sortOrder?: number | null; predecessorIds?: string[] }, @Req() request: AuthenticatedRequest) {
    return { data: { task: await this.projectsService.updateTask(id, taskId, body, request.user?.subject ?? null, await this.scopedEgiId(request)) } };
  }

  @Delete('projects/:id/tasks/:taskId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.planning.manage')
  async deleteProjectTask(@Param('id') id: string, @Param('taskId') taskId: string, @Req() request: AuthenticatedRequest) {
    return { data: await this.projectsService.deleteTask(id, taskId, request.user?.subject ?? null, await this.scopedEgiId(request)) };
  }

  @Post('projects/:id/budget-items')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.budget.manage')
  async createProjectBudgetItem(@Param('id') id: string, @Body() body: { taskId?: string | null; code?: string; category?: string; name?: string; fundingSource?: string | null; currency?: string; plannedAmount?: number | null; committedAmount?: number | null; actualAmount?: number | null; notes?: string | null }, @Req() request: AuthenticatedRequest) {
    return { data: { budgetItem: await this.projectsService.createBudgetItem(id, body, request.user?.subject ?? null, await this.scopedEgiId(request)) } };
  }

  @Patch('projects/:id/budget-items/:itemId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.budget.manage')
  async updateProjectBudgetItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: { taskId?: string | null; code?: string; category?: string; name?: string; fundingSource?: string | null; currency?: string; plannedAmount?: number | null; committedAmount?: number | null; actualAmount?: number | null; notes?: string | null }, @Req() request: AuthenticatedRequest) {
    return { data: { budgetItem: await this.projectsService.updateBudgetItem(id, itemId, body, request.user?.subject ?? null, await this.scopedEgiId(request)) } };
  }

  @Delete('projects/:id/budget-items/:itemId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.budget.manage')
  async deleteProjectBudgetItem(@Param('id') id: string, @Param('itemId') itemId: string, @Req() request: AuthenticatedRequest) {
    return { data: await this.projectsService.deleteBudgetItem(id, itemId, request.user?.subject ?? null, await this.scopedEgiId(request)) };
  }

  @Post('projects/:id/risks')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.risks.manage')
  async createProjectRisk(@Param('id') id: string, @Body() body: { ownerActorId?: string | null; code?: string; title?: string; description?: string | null; category?: string | null; probability?: number | null; impact?: number | null; status?: string; responseStrategy?: string; mitigation?: string | null; reviewDate?: string | null }, @Req() request: AuthenticatedRequest) {
    return { data: { risk: await this.projectsService.createRisk(id, body, request.user?.subject ?? null, await this.scopedEgiId(request)) } };
  }

  @Patch('projects/:id/risks/:riskId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.risks.manage')
  async updateProjectRisk(@Param('id') id: string, @Param('riskId') riskId: string, @Body() body: { ownerActorId?: string | null; code?: string; title?: string; description?: string | null; category?: string | null; probability?: number | null; impact?: number | null; status?: string; responseStrategy?: string; mitigation?: string | null; reviewDate?: string | null }, @Req() request: AuthenticatedRequest) {
    return { data: { risk: await this.projectsService.updateRisk(id, riskId, body, request.user?.subject ?? null, await this.scopedEgiId(request)) } };
  }

  @Delete('projects/:id/risks/:riskId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.risks.manage')
  async deleteProjectRisk(@Param('id') id: string, @Param('riskId') riskId: string, @Req() request: AuthenticatedRequest) {
    return { data: await this.projectsService.deleteRisk(id, riskId, request.user?.subject ?? null, await this.scopedEgiId(request)) };
  }

  @Patch('projects/:id/financial-settings')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.budget.manage')
  async updateProjectFinancialSettings(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() request:AuthenticatedRequest){return{data:{financialSettings:await this.projectsService.updateFinancialSettings(id,body,request.user?.subject??null,await this.scopedEgiId(request))}};}

  @Post('projects/:id/funding-sources')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.budget.manage')
  async createProjectFundingSource(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() request:AuthenticatedRequest){return{data:{fundingSource:await this.projectsService.createFundingSource(id,body,request.user?.subject??null,await this.scopedEgiId(request))}};}

  @Delete('projects/:id/funding-sources/:resourceId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.budget.manage')
  async deleteProjectFundingSource(@Param('id') id:string,@Param('resourceId') resourceId:string,@Req() request:AuthenticatedRequest){return{data:await this.projectsService.deleteLifecycleResource(id,'funding-source',resourceId,request.user?.subject??null,await this.scopedEgiId(request))};}

  @Post('projects/:id/budget-versions')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.budget.manage')
  async createProjectBudgetVersion(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() request:AuthenticatedRequest){return{data:{budgetVersion:await this.projectsService.createBudgetVersion(id,{...body,status:'draft'},request.user?.subject??null,await this.scopedEgiId(request))}};}

  @Post('projects/:id/budget-versions/:resourceId/approve')
  @Roles('superadmin', 'national_admin')
  @Permissions('projects.budget.approve')
  async approveProjectBudgetVersion(@Param('id') id:string,@Param('resourceId') resourceId:string,@Req() request:AuthenticatedRequest){return{data:{budgetVersion:await this.projectsService.approveBudgetVersion(id,resourceId,request.user?.subject??null,await this.scopedEgiId(request))}};}

  @Delete('projects/:id/budget-versions/:resourceId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.budget.manage')
  async deleteProjectBudgetVersion(@Param('id') id:string,@Param('resourceId') resourceId:string,@Req() request:AuthenticatedRequest){return{data:await this.projectsService.deleteLifecycleResource(id,'budget-version',resourceId,request.user?.subject??null,await this.scopedEgiId(request))};}

  @Post('projects/:id/financial-movements')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.finance.manage')
  async createProjectFinancialMovement(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() request:AuthenticatedRequest){return{data:{financialMovement:await this.projectsService.createFinancialMovement(id,body,request.user?.subject??null,await this.scopedEgiId(request))}};}

  @Delete('projects/:id/financial-movements/:resourceId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.finance.manage')
  async deleteProjectFinancialMovement(@Param('id') id:string,@Param('resourceId') resourceId:string,@Req() request:AuthenticatedRequest){return{data:await this.projectsService.deleteLifecycleResource(id,'financial-movement',resourceId,request.user?.subject??null,await this.scopedEgiId(request))};}

  @Post('projects/:id/management-records')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.risks.manage')
  async createProjectManagementRecord(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() request:AuthenticatedRequest){return{data:{managementRecord:await this.projectsService.createManagementRecord(id,body,request.user?.subject??null,await this.scopedEgiId(request))}};}

  @Delete('projects/:id/management-records/:resourceId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.risks.manage')
  async deleteProjectManagementRecord(@Param('id') id:string,@Param('resourceId') resourceId:string,@Req() request:AuthenticatedRequest){return{data:await this.projectsService.deleteLifecycleResource(id,'management-record',resourceId,request.user?.subject??null,await this.scopedEgiId(request))};}

  @Post('projects/:id/status-updates')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async createProjectStatusUpdate(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() request:AuthenticatedRequest){return{data:{statusUpdate:await this.projectsService.createStatusUpdate(id,body,request.user?.subject??null,await this.scopedEgiId(request))}};}

  @Delete('projects/:id/status-updates/:resourceId')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('projects.update')
  async deleteProjectStatusUpdate(@Param('id') id:string,@Param('resourceId') resourceId:string,@Req() request:AuthenticatedRequest){return{data:await this.projectsService.deleteLifecycleResource(id,'status-update',resourceId,request.user?.subject??null,await this.scopedEgiId(request))};}

  @Post('projects/:id/close')
  @Roles('superadmin', 'national_admin')
  @Permissions('projects.close')
  async closeProject(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() request:AuthenticatedRequest){return{data:await this.projectsService.closeProject(id,body,request.user?.subject??null,await this.scopedEgiId(request))};}

  @Post('connectors/:id/run')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @HttpCode(202)
  @Permissions('connectors.run')
  async runConnector(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.runConnector(id, request.user?.subject ?? null),
    };
  }

  @Get('validations')
  @Permissions('validations.read')
  async validations(
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: 'active' | 'global',
  ) {
    return {
      data: {
        validations: await this.adminService.listValidations(
          request.user?.subject ?? null,
          getRequestedEgiId(request),
          scope,
        ),
      },
    };
  }

  @Post('validations/:id/assign')
  @Roles('superadmin', 'national_admin', 'technical_validator')
  @Permissions('validations.assign')
  async assignValidation(
    @Param('id') id: string,
    @Body() body: { userId?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.assignValidation(
        id,
        body.userId ?? null,
        request.user?.subject ?? null,
        getRequestedEgiId(request),
      ),
    };
  }

  @Get('publications')
  @Permissions('publications.read')
  async publications(
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: string,
  ) {
    return {
      data: {
        publications: await this.adminService.listPublications(
          request.user?.subject ?? null,
          getRequestedEgiId(request),
          scope === 'global' ? 'global' : 'active',
        ),
      },
    };
  }

  @Post('publications/:id/publish')
  @Roles('superadmin', 'national_admin')
  @Permissions('publications.publish')
  async publish(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: string,
  ) {
    return {
      data: await this.adminService.publish(
        id,
        request.user?.subject ?? null,
        getRequestedEgiId(request),
        scope === 'global' ? 'global' : 'active',
      ),
    };
  }

  @Get('incidents')
  @Permissions('incidents.read')
  async incidents(
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: string,
  ) {
    return {
      data: {
        incidents: await this.adminService.listIncidents(
          request.user?.subject ?? null,
          getRequestedEgiId(request),
          scope === 'global' ? 'global' : 'active',
        ),
      },
    };
  }

  @Get('users')
  @Roles('superadmin', 'national_admin')
  @Permissions('users.read')
  async users() {
    return { data: { users: await this.adminService.listUsers() } };
  }

  @Post('users')
  @Roles('superadmin', 'national_admin')
  @Permissions('users.create')
  async createUser(
    @Body() body: CreateUserBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        user: await this.adminService.createUser(body, request.user?.subject ?? null),
      },
    };
  }

  @Patch('users/:id')
  @Roles('superadmin', 'national_admin')
  @Permissions('users.update')
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        user: await this.adminService.updateUser(id, body, request.user?.subject ?? null),
      },
    };
  }

  @Delete('users/:id')
  @Roles('superadmin', 'national_admin')
  @Permissions('users.delete')
  async deleteUser(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.deleteUser(id, request.user?.subject ?? null),
    };
  }

  @Get('roles')
  @Roles('superadmin', 'national_admin')
  @Permissions('roles.read')
  async roles() {
    return { data: { roles: await this.adminService.listRoles() } };
  }

  @Get('permissions')
  @Roles('superadmin', 'national_admin')
  @Permissions('permissions.read')
  async permissions() {
    return { data: { permissions: await this.adminService.listPermissions() } };
  }

  @Post('roles')
  @Roles('superadmin', 'national_admin')
  @Permissions('roles.create')
  async createRole(
    @Body() body: CreateRoleBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        role: await this.adminService.createRole(body, request.user?.subject ?? null),
      },
    };
  }

  @Patch('roles/:id')
  @Roles('superadmin', 'national_admin')
  @Permissions('roles.update')
  async updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        role: await this.adminService.updateRole(id, body, request.user?.subject ?? null),
      },
    };
  }

  @Delete('roles/:id')
  @Roles('superadmin', 'national_admin')
  @Permissions('roles.delete')
  async deleteRole(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.deleteRole(id, request.user?.subject ?? null),
    };
  }

  @Get('audit')
  @Permissions('audit.read')
  async audit() {
    return { data: { audit: await this.adminService.listAudit() } };
  }

  @Post('imports/upload')
  @HttpCode(202)
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('imports.upload')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async uploadImport(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body()
    body: {
      entityType?: 'institutions' | 'projects' | 'project_indicators' | 'project_territories';
      sheetName?: string;
      sourceId?: string;
      mappingProfileId?: string;
      columnMapping?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    assertSafeUpload(file, ['xls', 'xlsx', 'csv']);
    return {
      data: await this.importsService.processUpload(
        {
          fileBuffer: file?.buffer,
          fileName: file?.originalname ?? null,
          entityType: body.entityType,
          sheetName: body.sheetName,
          sourceId: body.sourceId ?? null,
          mappingProfileId: body.mappingProfileId ?? null,
          columnMapping: body.columnMapping,
          egiId: await this.scopedEgiId(request),
        },
        request.user?.subject ?? null,
      ),
    };
  }

  @Get('imports/batches')
  @Permissions('imports.read')
  async importBatches(
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: 'active' | 'global',
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return {
      data: {
        batches: await this.importsService.listBatches(egiId, scope === 'global'),
      },
    };
  }

  @Get('imports/batches/:id')
  @Permissions('imports.read')
  async importBatch(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: 'active' | 'global',
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return {
      data: { batch: await this.importsService.getBatch(id, egiId, scope === 'global') },
    };
  }

  @Get('imports/batches/:id/errors')
  @Permissions('imports.read')
  async importBatchErrors(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: 'active' | 'global',
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return {
      data: { errors: await this.importsService.listBatchErrors(id, egiId, scope === 'global') },
    };
  }

  @Get('imports/batches/:id/rules')
  @Permissions('imports.read')
  async importBatchRules(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: 'active' | 'global',
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return {
      data: {
        rules: await this.importsService.listBatchRuleResults(id, egiId, scope === 'global'),
      },
    };
  }

  @Get('imports/mapping-profiles')
  @Permissions('imports.read')
  async importMappingProfiles(
    @Req() request: AuthenticatedRequest,
    @Query('sourceId') sourceId?: string,
    @Query('entityType')
    entityType?: 'institutions' | 'projects' | 'project_indicators' | 'project_territories',
    @Query('scope') scope?: 'active' | 'global',
  ) {
    const egiId = await this.adminService.resolveAdminScopeEgiId(
      request.user?.subject ?? null,
      getRequestedEgiId(request),
      scope,
    );
    return {
      data: {
        mappingProfiles: await this.importsService.listMappingProfiles(
          {
            sourceId: sourceId ?? null,
            entityType: entityType ?? null,
          },
          egiId,
          scope === 'global',
        ),
      },
    };
  }

  @Post('imports/mapping-profiles')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('imports.upload')
  async createImportMappingProfile(
    @Body()
    body: {
      sourceId: string;
      entityType: 'institutions' | 'projects' | 'project_indicators' | 'project_territories';
      profileName: string;
      mappingJson: Record<string, string> | string;
      isDefault?: boolean;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        mappingProfile: await this.importsService.createMappingProfile(
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Patch('imports/mapping-profiles/:id')
  @Roles('superadmin', 'national_admin', 'institution_editor', 'technical_integration')
  @Permissions('imports.upload')
  async updateImportMappingProfile(
    @Param('id') id: string,
    @Body()
    body: {
      profileName?: string;
      mappingJson?: Record<string, string> | string;
      isDefault?: boolean;
      status?: 'active' | 'inactive';
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        mappingProfile: await this.importsService.updateMappingProfile(
          id,
          body,
          request.user?.subject ?? null,
          await this.scopedEgiId(request),
        ),
      },
    };
  }

  @Post('system/reset-database')
  @Roles('superadmin')
  @HttpCode(200)
  @Permissions('system.reset_database')
  async resetDatabase(
    @Body()
    body: {
      confirmationText: string;
      passphrase: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.adminService.resetDatabase(
        body,
        request.user?.subject ?? null,
      ),
    };
  }
}

function getRequestedEgiId(request: Request) {
  const headerValue = request.header('x-sigi-egi-id');
  return typeof headerValue === 'string' && headerValue.trim().length > 0
    ? headerValue.trim()
    : null;
}
