import { Controller, Get } from '@nestjs/common';
import { PublicDashboardService } from './public-dashboard.service';

@Controller('public/dashboard')
export class PublicDashboardController {
  constructor(private readonly publicDashboardService: PublicDashboardService) {}

  @Get('summary')
  async summary() {
    return {
      data: await this.publicDashboardService.summary(),
    };
  }
}
