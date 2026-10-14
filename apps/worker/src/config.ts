import {
  assertNoLocalCredentials,
  type Env,
  type NodeEnv,
  nodeEnvSchema,
  parseEnv,
  valkeyUrlSchema,
} from '@rampe/shared';
import * as z from 'zod/mini';

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  VALKEY_URL: valkeyUrlSchema,
});

export interface WorkerConfig {
  readonly nodeEnv: NodeEnv;
  readonly valkeyUrl: string;
}

export function loadConfig(env: Env): WorkerConfig {
  const parsed = parseEnv(envSchema, env);
  assertNoLocalCredentials(parsed.NODE_ENV, { VALKEY_URL: parsed.VALKEY_URL });
  return { nodeEnv: parsed.NODE_ENV, valkeyUrl: parsed.VALKEY_URL };
}
