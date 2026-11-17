import { Injectable } from '@nestjs/common';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';
import { getValidatedEnv } from '../../common/config/env';
import { PostgresService } from '../../common/db/postgres.service';
import { getBuildInfo } from '../../common/version';

type DependencyStatus = 'ok' | 'error';

@Injectable()
export class HealthService {
  constructor(private readonly postgresService: PostgresService) {}

  async check() {
    const database = await this.checkDatabase();

    return {
      status: database === 'ok' ? 'ok' : 'error',
      component: 'sigi-api',
      ...getBuildInfo(),
      dependencies: {
        database,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const env = getValidatedEnv();
    const [database, integrationService, gisService] = await Promise.all([
      this.checkDatabase(),
      this.checkHttpDependency(new URL('/health/', env.integrationServiceUrl)),
      this.checkHttpDependency(new URL('/health/', env.gisServiceUrl)),
    ]);

    const dependencies = {
      database,
      integrationService,
      gisService,
    };

    const overallStatus = Object.values(dependencies).every(
      (status) => status === 'ok',
    )
      ? 'ready'
      : 'not_ready';

    return {
      status: overallStatus,
      dependencies,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.postgresService.query('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkHttpDependency(url: URL): Promise<DependencyStatus> {
    const env = getValidatedEnv();

    return new Promise<DependencyStatus>((resolve) => {
      const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = transport(
        url,
        {
          method: 'GET',
          timeout: env.httpClientTimeoutMs,
        },
        (res) => {
          resolve((res.statusCode ?? 500) < 400 ? 'ok' : 'error');
        },
      );

      req.on('timeout', () => {
        req.destroy();
        resolve('error');
      });
      req.on('error', () => resolve('error'));
      req.end();
    });
  }
}
