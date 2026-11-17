import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import type { AuthPrincipal } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { AssistantService } from './assistant.service';

type AuthenticatedRequest = Request & { user: AuthPrincipal };

@UseGuards(BearerAuthGuard)
@Controller('admin/assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('ask')
  @Permissions('assistant.use')
  async ask(
    @Body() body: { question?: string; scope?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.assistantService.ask({
        question: body.question ?? '',
        scope: body.scope === 'global' ? 'global' : 'active',
        requestedEgiId: request.header('x-sigi-egi-id')?.trim() || null,
        principal: request.user,
      }),
    };
  }
}
