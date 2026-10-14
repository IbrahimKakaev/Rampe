/**
 * Prepares the local demonstration: a verified account, an organisation and
 * the test site, then verifies the site and scans it through the real API.
 * Run once by `docker compose up`; does nothing if the demo account exists.
 * Development only: it refuses to run in production.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigError, LOCAL_ONLY_MARKER, parseEnv } from '@rampe/shared';
import * as z from 'zod/mini';

import { PrismaClient } from './generated/prisma/client.js';
import { hashPassword } from './security/secrets.js';

const env = parseEnv(
  z.object({
    NODE_ENV: z.enum(['development', 'test']),
    DATABASE_URL: z.url(),
    API_URL: z.url(),
    DEMO_EMAIL: z.email(),
    DEMO_PASSWORD: z.string().check(z.includes(LOCAL_ONLY_MARKER)),
    DEMO_SITE_URL: z.url(),
    DEMO_VERIFICATION_TOKEN: z.string().check(z.regex(/^[A-Za-z0-9_-]{32,128}$/)),
  }),
  process.env,
);

/** A minimal client of the API, cookies and CSRF token included. */
class ApiClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  async call(method: string, path: string, body?: unknown): Promise<unknown> {
    if (!this.cookies.has('XSRF-TOKEN')) {
      await this.send('GET', '/health');
    }
    return this.send(method, path, body);
  }

  private async send(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        'x-xsrf-token': this.cookies.get('XSRF-TOKEN') ?? '',
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const [name = '', ...value] = pair.split('=');
      this.cookies.set(name, value.join('='));
    }
    const text = await response.text();
    if (!response.ok && path !== '/health') {
      throw new Error(`${method} ${path}: ${String(response.status)} ${text}`);
    }
    return text === '' ? null : JSON.parse(text);
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    if ((await prisma.user.findUnique({ where: { email: env.DEMO_EMAIL } })) !== null) {
      console.info('Demo account already present: nothing to do.');
      return;
    }
    const origin = new URL(env.DEMO_SITE_URL);
    const user = await prisma.user.create({
      data: {
        email: env.DEMO_EMAIL,
        name: 'Compte de démonstration',
        passwordHash: await hashPassword(env.DEMO_PASSWORD),
        emailVerifiedAt: new Date(),
      },
    });
    const organization = await prisma.organization.create({
      data: { name: 'Démonstration', memberships: { create: { userId: user.id, role: 'OWNER' } } },
    });
    const site = await prisma.site.create({
      data: {
        organizationId: organization.id,
        origin: origin.origin,
        host: origin.hostname,
        verificationToken: env.DEMO_VERIFICATION_TOKEN,
      },
    });
    console.info(`Demo account ${env.DEMO_EMAIL} created.`);

    const api = new ApiClient(env.API_URL);
    await api.call('POST', '/auth/login', { email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
    const proof = (await api.call(
      'POST',
      `/orgs/${organization.id}/sites/${site.id}/verification/check`,
      {
        method: 'FILE',
      },
    )) as { verified: boolean; detail: string };
    if (!proof.verified) {
      throw new Error(`The demo site could not be verified: ${proof.detail}`);
    }
    await api.call('POST', `/orgs/${organization.id}/sites/${site.id}/scans`);
    console.info('Demo site verified; its first scan is running.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
});
