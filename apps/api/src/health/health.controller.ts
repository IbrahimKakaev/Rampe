import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type HealthResponse, healthResponseSchema } from '@rampe/shared';

import { HealthService } from './health.service.js';

@ApiTags('Technique')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'État du service et de ses dépendances' })
  @ApiOkResponse({
    description: 'Toutes les dépendances répondent.',
    standardSchema: healthResponseSchema,
  })
  @ApiServiceUnavailableResponse({
    description: 'Au moins une dépendance ne répond pas.',
    standardSchema: healthResponseSchema,
  })
  async get(): Promise<HealthResponse> {
    const response = await this.health.check();
    if (response.status !== 'ok') {
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return response;
  }
}
