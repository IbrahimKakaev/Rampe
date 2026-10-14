import {
  assertNoLocalCredentials,
  ConfigError,
  type Env,
  type NodeEnv,
  nodeEnvSchema,
  parseEnv,
  portSchema,
  valkeyUrlSchema,
} from '@rampe/shared';
import * as z from 'zod/mini';

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z._default(portSchema, 3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: valkeyUrlSchema,
  /** SMTP server, such as smtp://mailpit:1025 locally. */
  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  MAIL_FROM: z._default(z.string().check(z.minLength(3)), 'Rampe <ne-pas-repondre@rampe.local>'),
  /** Address of the interface, for the links in e-mails. */
  PUBLIC_URL: z.url({ protocol: /^https?$/ }),
  /** Cookies are Secure by default; only a local HTTP setup may turn it off. */
  COOKIE_SECURE: z._default(z.enum(['true', 'false']), 'true'),
});

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly databaseUrl: string;
  readonly valkeyUrl: string;
  readonly smtpUrl: string;
  readonly mailFrom: string;
  readonly publicUrl: string;
  readonly cookieSecure: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: Env): AppConfig {
  const parsed = parseEnv(envSchema, env);
  assertNoLocalCredentials(parsed.NODE_ENV, {
    DATABASE_URL: parsed.DATABASE_URL,
    VALKEY_URL: parsed.VALKEY_URL,
  });
  if (parsed.NODE_ENV === 'production' && parsed.COOKIE_SECURE === 'false') {
    throw new ConfigError(
      'COOKIE_SECURE=false is not allowed in production: session cookies would travel in clear.',
    );
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    valkeyUrl: parsed.VALKEY_URL,
    smtpUrl: parsed.SMTP_URL,
    mailFrom: parsed.MAIL_FROM,
    publicUrl: parsed.PUBLIC_URL.replace(/\/$/, ''),
    cookieSecure: parsed.COOKIE_SECURE === 'true',
  };
}
