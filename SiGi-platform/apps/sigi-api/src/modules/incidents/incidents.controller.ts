import { Controller, Get } from '@nestjs/common';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  async list() {
    return {
      data: {
        incidents: await this.incidentsService.list(),
      },
    };
  }
}

