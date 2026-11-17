import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { InstitutionsService } from '../institutions/institutions.service';
import { ConnectorsService } from './connectors.service';

@Controller()
export class ConnectorsController {
  constructor(
    private readonly institutionsService: InstitutionsService,
    private readonly connectorsService: ConnectorsService,
  ) {}

  @Get('connectors')
  async list() {
    return { connectors: await this.connectorsService.listPublic() };
  }

  @Get('institutions/:institutionId/connectors')
  async listByInstitution(@Param('institutionId') institutionId: string) {
    const institution = await this.institutionsService.findPublicById(institutionId);
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    return {
      institution,
      connectors: await this.connectorsService.listPublicByInstitutionId(institutionId),
    };
  }
}
