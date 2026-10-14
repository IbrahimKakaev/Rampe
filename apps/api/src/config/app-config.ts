import {
  assertNoLocalCredentials,
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
});

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly databaseUrl: string;
  readonly valkeyUrl: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: Env): AppConfig {
  const parsed = parseEnv(envSchema, env);
  assertNoLocalCredentials(parsed.NODE_ENV, {
    DATABASE_URL: parsed.DATABASE_URL,
    VALKEY_URL: parsed.VALKEY_URL,
  });
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    valkeyUrl: parsed.VALKEY_URL,
  };
}
