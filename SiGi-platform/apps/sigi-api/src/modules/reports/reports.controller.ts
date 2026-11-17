import {
  Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req,
  StreamableFile, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { AuthPrincipal } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { ReportsService } from './reports.service';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  async list() {
    return {
      data: {
        reports: await this.reportsService.list(),
      },
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const report = await this.reportsService.findOne(id);
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return {
      data: {
        report,
      },
    };
  }
}

@UseGuards(BearerAuthGuard)
@Roles(
  'superadmin', 'national_admin', 'institution_editor',
  'technical_validator', 'technical_integration', 'read_consumer',
)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Permissions('reports.read')
  dashboard(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.dashboard(context(request)));
  }

  @Get('frameworks')
  @Permissions('reports.templates.read')
  frameworks(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.listFrameworks(context(request)), 'frameworks');
  }

  @Get('calendar')
  @Permissions('reports.read')
  calendar(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.referenceCalendar(context(request)));
  }

  @Get('commitments')
  @Permissions('reports.read')
  commitments(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.listCommitments(context(request)), 'commitments');
  }

  @Get('commitments/evidence')
  @Permissions('reports.contributions.submit')
  contributionEvidence(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.contributionEvidenceCatalog(context(request)));
  }

  @Get('commitments/participants')
  @Permissions('reports.commitments.manage')
  contributionParticipants(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.contributionParticipants(context(request)), 'institutions');
  }

  @Patch('commitments/:id/assignments')
  @Permissions('reports.commitments.manage')
  updateAssignments(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.updateContributionAssignments(id, body, context(request)), 'commitment');
  }

  @Patch('commitments/:id/reminders')
  @Permissions('reports.commitments.manage')
  updateReminders(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.updateReminderRule(id, body, context(request)), 'reminderRule');
  }

  @Post('commitments/reminders/process')
  @Permissions('reports.commitments.manage')
  processReminders(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.processReminders(context(request)));
  }

  @Post('notifications/refresh')
  @Permissions('reports.read')
  refreshMyReminders(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.processReminders(context(request), true));
  }

  @Get('notifications')
  @Permissions('reports.read')
  notifications(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.listNotifications(context(request)), 'notifications');
  }

  @Patch('notifications/:id/read')
  @Permissions('reports.read')
  readNotification(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.markNotificationRead(id, context(request)), 'notification');
  }

  @Get('commitments/export/:format')
  @Permissions('reports.export')
  async exportCommitments(@Param('format') format: string, @Query() query: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    if (!['xlsx','ics'].includes(format)) throw new NotFoundException('Formato de calendario no encontrado.');
    const file = await this.reportsService.exportCommitmentCalendar(format as 'xlsx'|'ics', query, context(request));
    return new StreamableFile(file.body, { type: file.contentType, disposition: `attachment; filename="${file.filename}"`, length: file.body.length });
  }

  @Post('commitments')
  @Permissions('reports.commitments.manage')
  createCommitment(@Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.createCommitment(body, context(request)), 'commitment');
  }

  @Patch('commitments/:id')
  @Permissions('reports.commitments.manage')
  updateCommitment(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.updateCommitment(id, body, context(request)), 'commitment');
  }

  @Post('commitments/:id/contributions/submit')
  @Permissions('reports.contributions.submit')
  submitContribution(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.submitContribution(id, body, context(request)));
  }

  @Post('commitments/:id/contributions/:contributionId/review')
  @Permissions('reports.contributions.review')
  reviewContribution(@Param('id') id: string, @Param('contributionId') contributionId: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.reviewContribution(id, contributionId, body, context(request)), 'commitment');
  }

  @Post('commitments/:id/consolidate')
  @Permissions('reports.commitments.manage', 'reports.create')
  consolidateCommitment(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.createConsolidatedReport(id, body, context(request)));
  }

  @Get('templates')
  @Permissions('reports.templates.read')
  templates(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.listTemplates(context(request)), 'templates');
  }

  @Post('templates')
  @Permissions('reports.templates.manage')
  createTemplate(@Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.createTemplate(body, context(request)), 'template');
  }

  @Get('mappings')
  @Permissions('reports.mappings.read')
  mappings(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.listMappings(context(request)), 'mappings');
  }

  @Post('mappings')
  @Permissions('reports.mappings.manage')
  createMapping(@Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.createMapping(body, context(request)), 'mapping');
  }

  @Get()
  @Permissions('reports.read')
  list(@Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.listAdmin(context(request)), 'reports');
  }

  @Post()
  @Permissions('reports.create')
  create(@Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.create(body, context(request)), 'report');
  }

  @Get(':id')
  @Permissions('reports.read')
  find(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.getAdmin(id, context(request)), 'report');
  }

  @Patch(':id')
  @Permissions('reports.edit')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.update(id, body, context(request)), 'report');
  }

  @Get(':id/coverage')
  @Permissions('reports.read')
  coverage(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.coverage(id, context(request)));
  }

  @Get(':id/traceability')
  @Permissions('reports.read')
  traceability(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.traceability(id, context(request)));
  }

  @Get(':id/versions')
  @Permissions('reports.read')
  versions(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.listVersions(id, context(request)), 'versions');
  }

  @Post(':id/validate')
  @Permissions('reports.generate')
  validate(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.validate(id, context(request)));
  }

  @Post(':id/generate')
  @Permissions('reports.generate')
  generate(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.generate(id, context(request)), 'version');
  }

  @Post(':id/submit-review')
  @Permissions('reports.edit')
  submitReview(@Param('id') id: string, @Body('comment') comment: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.submitReview(id, comment, context(request)), 'report');
  }

  @Post(':id/review')
  @Permissions('reports.review')
  startReview(@Param('id') id: string, @Body('comment') comment: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.startReview(id, comment, context(request)), 'report');
  }

  @Post(':id/request-changes')
  @Permissions('reports.review')
  requestChanges(@Param('id') id: string, @Body('comment') comment: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.requestChanges(id, comment, context(request)), 'report');
  }

  @Post(':id/approve')
  @Permissions('reports.approve')
  approve(@Param('id') id: string, @Body('comment') comment: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.approve(id, comment, context(request)), 'report');
  }

  @Post(':id/publish')
  @Permissions('reports.publish')
  publish(@Param('id') id: string, @Body('comment') comment: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.envelope(this.reportsService.publish(id, comment, context(request)), 'report');
  }

  @Get(':id/export/json')
  @Permissions('reports.export')
  async exportJson(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const body = await this.reportsService.exportJson(id, context(request));
    return new StreamableFile(body, {
      type: 'application/json; charset=utf-8',
      disposition: `attachment; filename="sigi-report-${id}.json"`,
    });
  }

  private async envelope(value: Promise<unknown>, key?: string) {
    const resolved = await value;
    return { data: key ? { [key]: resolved } : resolved };
  }
}

function context(request: AuthenticatedRequest) {
  if (!request.user) throw new NotFoundException('Sesión no encontrada.');
  const header = request.header('x-sigi-egi-id');
  return {
    principal: request.user,
    requestedEgiId: typeof header === 'string' && header.trim() ? header.trim() : null,
  };
}
