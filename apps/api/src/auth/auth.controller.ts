import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type Accepted,
  acceptedSchema,
  forgotPasswordRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type Me,
  meSchema,
  type RegisterRequest,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from '@rampe/shared';
import type { Response } from 'express';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import {
  CurrentUser,
  Public,
  type RampeRequest,
  type SessionUser,
} from '../security/request-context.js';
import { RateLimit } from '../security/rate-limit.js';
import { SESSION_COOKIE, Sessions } from '../security/sessions.js';
import { AuthService } from './auth.service.js';

/** Sign-in endpoints are the target of password guessing: few attempts per minute and per address. */
const STRICT = { limit: 10, windowMs: 60_000, blockMs: 5 * 60_000 };
const ACCEPTED: Accepted = { status: 'accepted' };

@ApiTags('Authentification')
@ApiTooManyRequestsResponse({ description: 'Trop de tentatives : réessayez plus tard.' })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: Sessions,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @RateLimit(STRICT)
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Créer un compte et son organisation ; un lien de confirmation est envoyé par e-mail',
  })
  @ApiAcceptedResponse({ standardSchema: acceptedSchema })
  @ApiBadRequestResponse({ description: 'Données invalides.' })
  async register(
    @Body({ schema: registerRequestSchema }) body: RegisterRequest,
  ): Promise<Accepted> {
    await this.auth.register(body);
    return ACCEPTED;
  }

  @Public()
  @RateLimit(STRICT)
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirmer l’adresse e-mail avec le jeton reçu' })
  @ApiNoContentResponse({ description: 'Adresse confirmée.' })
  @ApiBadRequestResponse({ description: 'Lien invalide ou expiré.' })
  async verifyEmail(
    @Body({ schema: verifyEmailRequestSchema }) body: { token: string },
  ): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @Public()
  @RateLimit(STRICT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Se connecter ; la session est portée par un cookie HttpOnly' })
  @ApiOkResponse({ standardSchema: meSchema })
  @ApiUnauthorizedResponse({ description: 'Adresse ou mot de passe incorrect.' })
  @ApiForbiddenResponse({ description: 'Adresse e-mail non confirmée.' })
  async login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const session = await this.auth.login(body);
    response.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
    return this.auth.me(session.userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Se déconnecter' })
  @ApiNoContentResponse({ description: 'Session fermée.' })
  async logout(
    @Req() request: RampeRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (request.sessionTokenHash !== undefined) {
      await this.sessions.close(request.sessionTokenHash);
    }
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @ApiOperation({ summary: 'L’utilisateur connecté et ses organisations' })
  @ApiOkResponse({ standardSchema: meSchema })
  @ApiUnauthorizedResponse({ description: 'Non connecté.' })
  me(@CurrentUser() user: SessionUser): Promise<Me> {
    return this.auth.me(user.id);
  }

  @Public()
  @RateLimit(STRICT)
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Recevoir un lien de réinitialisation, si le compte existe' })
  @ApiAcceptedResponse({ standardSchema: acceptedSchema })
  async forgotPassword(
    @Body({ schema: forgotPasswordRequestSchema }) body: { email: string },
  ): Promise<Accepted> {
    await this.auth.forgotPassword(body.email);
    return ACCEPTED;
  }

  @Public()
  @RateLimit(STRICT)
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Choisir un nouveau mot de passe ; toutes les sessions sont fermées' })
  @ApiNoContentResponse({ description: 'Mot de passe changé.' })
  @ApiBadRequestResponse({ description: 'Lien invalide ou expiré, ou mot de passe trop court.' })
  async resetPassword(
    @Body({ schema: resetPasswordRequestSchema }) body: { token: string; password: string },
  ): Promise<void> {
    await this.auth.resetPassword(body.token, body.password);
  }
}
