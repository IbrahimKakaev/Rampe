import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@rampe/shared';
import request from 'supertest';

import {
  type StartedDependency,
  startPostgres,
  startValkey,
} from '../../../test-support/containers.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { loadConfig } from '../src/config/app-config.js';

/** The part of the OpenAPI document these tests read. */
interface OpenApiDocument {
  paths: Record<
    string,
    { get: { responses: Record<string, { content: { 'application/json': { schema: unknown } } }> } }
  >;
}

describe('GET /api/v1/health against real PostgreSQL and Valkey', () => {
  let postgres: StartedDependency;
  let valkey: StartedDependency;
  let app: NestExpressApplication;

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: postgres.url,
      VALKEY_URL: valkey.url,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([postgres.container.stop(), valkey.container.stop()]);
  });

  it('answers 200 with every dependency up, in the shared response format', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
      checks: { database: 'up', queue: 'up' },
    });
  });

  it('does not advertise the framework it runs on', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.headers).not.toHaveProperty('x-powered-by');
  });

  it('documents the endpoint and its response schema in OpenAPI', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/openapi.json').expect(200);

    const document = response.body as OpenApiDocument;
    const responses = document.paths['/api/v1/health']?.get.responses ?? {};
    for (const status of ['200', '503']) {
      expect(responses[status]?.content['application/json'].schema).toMatchObject({
        required: ['status', 'checks'],
        properties: {
          status: { enum: ['ok', 'degraded'] },
          checks: { properties: { queue: { enum: ['up', 'down'] } } },
        },
      });
    }
  });

  it('answers 503 and names the queue once Valkey is stopped', async () => {
    await valkey.container.stop();

    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);

    expect(response.body).toEqual({
      status: 'degraded',
      checks: { database: 'up', queue: 'down' },
    });
  });

  it('answers 503 and names the database once PostgreSQL is stopped too', async () => {
    await postgres.container.stop();

    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);

    expect(response.body).toEqual({
      status: 'degraded',
      checks: { database: 'down', queue: 'down' },
    });
  });
});
