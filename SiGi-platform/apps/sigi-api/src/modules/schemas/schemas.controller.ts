import { Controller, Get } from '@nestjs/common';
import { SchemasService } from './schemas.service';

@Controller('schemas')
export class SchemasController {
  constructor(private readonly schemasService: SchemasService) {}

  @Get()
  async list() {
    return {
      data: {
        schemas: await this.schemasService.list(),
      },
    };
  }
}
