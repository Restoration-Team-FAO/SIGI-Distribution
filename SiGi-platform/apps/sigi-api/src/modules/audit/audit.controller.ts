import { Controller, Get } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list() {
    return {
      data: {
        audit: await this.auditService.list(),
      },
    };
  }
}
