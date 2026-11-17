import { Controller, Get } from '@nestjs/common';
import { InstitutionsService } from './institutions.service';

@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Get()
  async list() {
    return { institutions: await this.institutionsService.listPublic() };
  }
}
