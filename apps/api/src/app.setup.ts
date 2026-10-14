import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { zodSchemaConverter } from './openapi/zod-schema-converter.js';

export const API_PREFIX = 'api/v1';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Rampe API')
    .setDescription("API de Rampe, outil de pré-audit d'accessibilité RGAA.")
    .setVersion('1')
    .build();
  return SwaggerModule.createDocument(app, config, { standardSchemaConverter: zodSchemaConverter });
}

/** Everything that shapes the HTTP surface, shared by the real server and the tests. */
export function setupApp(app: NestExpressApplication): void {
  // Do not advertise the framework to whoever probes the API.
  app.disable('x-powered-by');
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: `${API_PREFIX}/openapi.json`,
  });
}
