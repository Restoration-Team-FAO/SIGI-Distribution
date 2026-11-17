import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BearerAuthGuard } from './bearer-auth.guard';
import { BootstrapIdentitiesService } from './bootstrap-identities.service';
import { InternalServiceGuard } from './internal-service.guard';
import { RolesGuard } from './roles.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    BearerAuthGuard,
    BootstrapIdentitiesService,
    InternalServiceGuard,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService, BearerAuthGuard, InternalServiceGuard],
})
export class AuthModule {}
