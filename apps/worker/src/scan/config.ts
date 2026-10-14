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
  /** Address of the isolated browser, including its secret path. */
  BROWSER_WS_ENDPOINT: z.url({ protocol: /^wss?$/ }),
  EGRESS_PROXY_URL: z.url({ protocol: /^http$/ }),
  /** Page that explains what RampeBot does, linked from its User-Agent. */
  SCAN_BOT_INFO_URL: z.url({ protocol: /^https?$/ }),
});

export interface ScanConfig {
  readonly nodeEnv: NodeEnv;
  readonly valkeyUrl: string;
  readonly browserWsEndpoint: string;
  readonly egressProxyUrl: string;
  readonly botInfoUrl: string;
}

export function loadScanConfig(env: Env): ScanConfig {
  const parsed = parseEnv(envSchema, env);
  assertNoLocalCredentials(parsed.NODE_ENV, {
    VALKEY_URL: parsed.VALKEY_URL,
    BROWSER_WS_ENDPOINT: parsed.BROWSER_WS_ENDPOINT,
  });
  return {
    nodeEnv: parsed.NODE_ENV,
    valkeyUrl: parsed.VALKEY_URL,
    browserWsEndpoint: parsed.BROWSER_WS_ENDPOINT,
    egressProxyUrl: parsed.EGRESS_PROXY_URL,
    botInfoUrl: parsed.SCAN_BOT_INFO_URL,
  };
}
