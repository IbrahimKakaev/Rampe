import * as z from 'zod/mini';

/**
 * Marker contained in every credential that docker-compose.yml ships for local
 * use. Those values are public, so services refuse to start with them in production.
 */
export const LOCAL_ONLY_MARKER = 'local-only';

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export type Env = Readonly<Record<string, string | undefined>>;

/**
 * Validates environment variables once at startup, so that a bad setting fails
 * fast and legibly. The error names each offending variable but never its value,
 * which may be a secret.
 */
export function parseEnv<Schema extends z.ZodMiniType>(schema: Schema, env: Env): z.output<Schema> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Throws when a production service is still configured with a local development credential. */
export function assertNoLocalCredentials(
  nodeEnv: string,
  credentials: Readonly<Record<string, string>>,
): void {
  if (nodeEnv !== 'production') {
    return;
  }
  const offenders = Object.entries(credentials)
    .filter(([, value]) => value.includes(LOCAL_ONLY_MARKER))
    .map(([name]) => name);
  if (offenders.length > 0) {
    throw new ConfigError(
      `Local development credentials are not allowed in production: ${offenders.join(', ')}.`,
    );
  }
}

export const nodeEnvSchema = z._default(
  z.enum(['development', 'test', 'production']),
  'development',
);
export type NodeEnv = z.output<typeof nodeEnvSchema>;

/** URL of the Valkey server that holds the job queues. Valkey speaks the Redis protocol. */
export const valkeyUrlSchema = z.url({ protocol: /^rediss?$/ });

/** A TCP port given as text, as environment variables are. */
export const portSchema = z.coerce.number().check(z.multipleOf(1), z.gte(1), z.lte(65_535));
