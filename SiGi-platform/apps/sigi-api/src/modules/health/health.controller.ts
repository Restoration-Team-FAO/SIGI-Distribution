import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { getBuildInfo } from '../../common/version';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  async check() {
    const payload = await this.healthService.check();

    if (payload.status !== 'ok') {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }

  @Get('version')
  version() {
    return getBuildInfo();
  }

  @Get('ready')
  async ready() {
    const payload = await this.healthService.ready();

    if (payload.status !== 'ready') {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }
}
