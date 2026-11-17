import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BearerAuthGuard } from './bearer-auth.guard';
import { AuthPrincipal } from './auth.types';
import { AuthService } from './auth.service';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body()
    body: {
      email?: string;
      password?: string;
    },
  ) {
    return {
      data: await this.authService.login(body.email ?? '', body.password ?? ''),
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body()
    body: {
      refreshToken?: string;
    },
  ) {
    return {
      data: await this.authService.refreshSession(body.refreshToken ?? ''),
    };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(BearerAuthGuard)
  async logout(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const token = readBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    await this.authService.logout(token, request.user?.subject ?? null);
  }

  @Get('me')
  @UseGuards(BearerAuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    if (!request.user) {
      throw new UnauthorizedException('Missing authenticated principal');
    }

    return {
      data: {
        user: await this.authService.getSessionUser(request.user),
      },
    };
  }
}

function readBearerToken(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim() || null;
}
