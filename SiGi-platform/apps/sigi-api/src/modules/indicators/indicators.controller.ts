import { Controller, Get } from '@nestjs/common';
import { IndicatorsService } from './indicators.service';

@Controller('indicators')
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Get()
  async list() {
    return {
      data: {
        indicators: await this.indicatorsService.list(),
      },
    };
  }
}
