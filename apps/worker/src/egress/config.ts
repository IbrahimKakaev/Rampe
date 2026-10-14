import {
  ConfigError,
  type Env,
  type NodeEnv,
  nodeEnvSchema,
  parseEnv,
  portSchema,
} from '@rampe/shared';
import * as z from 'zod/mini';

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z._default(portSchema, 3128),
  EGRESS_ALLOWED_PRIVATE_HOSTS: z._default(z.string(), ''),
});

const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export interface EgressConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  /**
   * Host names allowed to resolve to private addresses, such as the local test
   * site. Always empty in production: the proxy refuses to start otherwise.
   */
  readonly allowedPrivateHosts: ReadonlySet<string>;
}

export function loadEgressConfig(env: Env): EgressConfig {
  const parsed = parseEnv(envSchema, env);
  const hosts = parsed.EGRESS_ALLOWED_PRIVATE_HOSTS.split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== '');
  const invalid = hosts.filter((host) => !HOSTNAME.test(host));
  if (invalid.length > 0) {
    throw new ConfigError(
      `EGRESS_ALLOWED_PRIVATE_HOSTS must list host names separated by commas; invalid: ${invalid.join(', ')}`,
    );
  }
  if (parsed.NODE_ENV === 'production' && hosts.length > 0) {
    throw new ConfigError(
      'EGRESS_ALLOWED_PRIVATE_HOSTS must be empty in production: it would let the scanner reach private addresses.',
    );
  }
  return { nodeEnv: parsed.NODE_ENV, port: parsed.PORT, allowedPrivateHosts: new Set(hosts) };
}
