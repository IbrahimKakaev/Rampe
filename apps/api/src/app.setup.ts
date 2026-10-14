import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { csrfProtection } from './security/csrf.js';
import { zodSchemaConverter } from './openapi/zod-schema-converter.js';

export const API_PREFIX = 'api/v1';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Rampe API')
    .setDescription(
      "API de Rampe, outil de pré-audit d'accessibilité RGAA. La session est portée par un cookie HttpOnly ; " +
        'toute requête qui modifie quelque chose doit répéter le cookie XSRF-TOKEN dans l’en-tête X-XSRF-TOKEN.',
    )
    .setVersion('1')
    .addCookieAuth('rampe_session')
    .build();
  return SwaggerModule.createDocument(app, config, { standardSchemaConverter: zodSchemaConverter });
}

/** Everything that shapes the HTTP surface, shared by the real server and the tests. */
export function setupApp(app: NestExpressApplication, options: { secureCookies: boolean }): void {
  // Do not advertise the framework to whoever probes the API.
  app.disable('x-powered-by');
  // Exactly one proxy, nginx, stands in front: its X-Forwarded-For gives the client address.
  app.set('trust proxy', 1);
  const strictHeaders = helmet();
  // The documentation page runs inline scripts: it gets every header but the content policy.
  const documentationHeaders = helmet({ contentSecurityPolicy: false });
  app.use((request: { path: string }, response: unknown, next: () => void) => {
    const headers = request.path.startsWith(`/${API_PREFIX}/docs`)
      ? documentationHeaders
      : strictHeaders;
    (headers as (req: unknown, res: unknown, next: () => void) => void)(request, response, next);
  });
  app.use(cookieParser());
  app.use(csrfProtection(options.secureCookies));
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: `${API_PREFIX}/openapi.json`,
  });
}
