import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';

import {
  type StartedDependency,
  startPostgres,
  startValkey,
} from '../../../../test-support/containers.js';
import { AppModule } from '../../src/app.module.js';
import { setupApp } from '../../src/app.setup.js';
import { loadConfig } from '../../src/config/app-config.js';
import { Clock } from '../../src/infra/clock.js';
import { Mailer, type MailMessage } from '../../src/infra/mailer.js';
import { Prisma } from '../../src/infra/prisma.js';
import { TxtResolver } from '../../src/sites/ownership.js';

const apiRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Keeps the e-mails instead of sending them. */
export class CapturingMailer extends Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The token of the last link sent to an address. */
  lastToken(to: string): string {
    const message = [...this.sent].reverse().find((candidate) => candidate.to === to);
    const token = /jeton=([A-Za-z0-9_%-]+)/.exec(message?.text ?? '')?.[1];
    if (token === undefined) {
      throw new Error(`No link sent to ${to}`);
    }
    return decodeURIComponent(token);
  }
}

/** A clock the test moves forward, instead of waiting for a day or a year to pass. */
export class FakeClock extends Clock {
  private current = new Date();

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** A DNS whose TXT records the test decides. */
export class FakeTxtResolver extends TxtResolver {
  readonly records = new Map<string, string[]>();

  resolve(name: string): Promise<string[]> {
    return Promise.resolve(this.records.get(name) ?? []);
  }
}

export interface Harness {
  readonly app: NestExpressApplication;
  readonly prisma: Prisma;
  readonly mailer: CapturingMailer;
  readonly dns: FakeTxtResolver;
  readonly clock: FakeClock;
  readonly valkeyUrl: string;
  /** A browser: its own cookies and CSRF token. */
  client(): Promise<Client>;
  /** Clears the request counters of the rate limiter. */
  resetRateLimits(): Promise<void>;
  close(): Promise<void>;
}

export interface Client {
  get(path: string): request.Test;
  post(path: string, body?: object): request.Test;
  patch(path: string, body?: object): request.Test;
  delete(path: string, body?: object): request.Test;
}

/** Starts PostgreSQL and Valkey, applies the migrations, and boots the API on them. */
export async function startHarness(): Promise<Harness> {
  const [postgres, valkey]: [StartedDependency, StartedDependency] = await Promise.all([
    startPostgres(),
    startValkey(),
  ]);
  await promisify(execFile)('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: postgres.url },
  });
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: postgres.url,
    VALKEY_URL: valkey.url,
    SMTP_URL: 'smtp://127.0.0.1:1025',
    PUBLIC_URL: 'https://rampe.test',
    COOKIE_SECURE: 'false',
  });
  const mailer = new CapturingMailer();
  const dns = new FakeTxtResolver();
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .overrideProvider(TxtResolver)
    .useValue(dns)
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  setupApp(app, { secureCookies: false });
  await app.init();
  const valkeyAdmin = new Redis(valkey.url);

  return {
    app,
    prisma: app.get(Prisma),
    mailer,
    dns,
    clock,
    valkeyUrl: valkey.url,
    async client() {
      const agent = request.agent(app.getHttpServer());
      const first = await agent.get('/api/v1/health');
      const cookies = ([] as string[]).concat(first.headers['set-cookie'] ?? []);
      const token = /XSRF-TOKEN=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '';
      const send = (method: 'post' | 'patch' | 'delete', path: string, body?: object) =>
        agent[method](`/api/v1${path}`).set('x-xsrf-token', token).send(body);
      return {
        get: (path) => agent.get(`/api/v1${path}`),
        post: (path, body) => send('post', path, body),
        patch: (path, body) => send('patch', path, body),
        delete: (path, body) => send('delete', path, body),
      };
    },
    async resetRateLimits() {
      const keys = await valkeyAdmin.keys('rampe:rate:*');
      if (keys.length > 0) {
        await valkeyAdmin.del(...keys);
      }
    },
    async close() {
      valkeyAdmin.disconnect();
      await app.close();
      await Promise.all([postgres.container.stop(), valkey.container.stop()]);
    },
  };
}

/** Registers, verifies and signs in an account; returns its client and organisation. */
export async function signedInAccount(
  harness: Harness,
  email: string,
  organizationName = `Organisation de ${email}`,
): Promise<{ client: Client; organizationId: string; userId: string }> {
  const client = await harness.client();
  await client
    .post('/auth/register', {
      email,
      password: 'un mot de passe solide',
      name: email.split('@')[0],
      organizationName,
    })
    .expect(202);
  await client.post('/auth/verify-email', { token: harness.mailer.lastToken(email) }).expect(204);
  const me = await client
    .post('/auth/login', { email, password: 'un mot de passe solide' })
    .expect(200);
  const body = me.body as { user: { id: string }; organizations: { id: string }[] };
  return { client, organizationId: body.organizations[0]?.id ?? '', userId: body.user.id };
}
