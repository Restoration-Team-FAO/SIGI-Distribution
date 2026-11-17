import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { renderMetrics } from '../../common/observability/metrics';
import { InternalServiceGuard } from '../auth/internal-service.guard';

@UseGuards(InternalServiceGuard)
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  metrics(): string {
    return renderMetrics();
  }
}
