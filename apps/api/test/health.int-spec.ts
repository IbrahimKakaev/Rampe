import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@rampe/shared';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import request from 'supertest';

import {
  type StartedDependency,
  startPostgres,
  startValkey,
} from '../../../test-support/containers.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { loadConfig } from '../src/config/app-config.js';

/**
 * Pausing a container freezes it: its clients get no answer, as in a real
 * outage, and recover when it resumes.
 */
async function docker(action: 'pause' | 'unpause', containerId: string): Promise<void> {
  await promisify(execFile)('docker', [action, containerId]);
}

async function eventually(check: () => Promise<void>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

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
      SMTP_URL: 'smtp://127.0.0.1:1025',
      PUBLIC_URL: 'http://127.0.0.1:8080',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    setupApp(app, { secureCookies: false });
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

  it('answers 503 and names the queue while Valkey does not answer, then recovers', async () => {
    await docker('pause', valkey.container.getId());
    const during = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    await docker('unpause', valkey.container.getId());

    expect(during.body).toEqual({ status: 'degraded', checks: { database: 'up', queue: 'down' } });
    await eventually(async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    });
  });

  it('answers 503 and names the database while PostgreSQL does not answer, then recovers', async () => {
    await docker('pause', postgres.container.getId());
    const during = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    await docker('unpause', postgres.container.getId());

    expect(during.body).toEqual({ status: 'degraded', checks: { database: 'down', queue: 'up' } });
    await eventually(async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    });
  });
});
