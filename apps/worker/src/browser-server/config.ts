import {
  assertNoLocalCredentials,
  type Env,
  type NodeEnv,
  nodeEnvSchema,
  parseEnv,
  portSchema,
} from '@rampe/shared';
import * as z from 'zod/mini';

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z._default(portSchema, 3000),
  /**
   * Secret path of the browser's WebSocket endpoint. Only the worker knows it,
   * so that nothing else on the sandbox network can drive the browser.
   */
  BROWSER_WS_PATH: z.string().check(z.regex(/^\/[A-Za-z0-9_-]{24,}$/)),
  EGRESS_PROXY_URL: z.url({ protocol: /^http$/ }),
});

export interface BrowserServerConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly wsPath: string;
  readonly egressProxyUrl: string;
}

export function loadBrowserServerConfig(env: Env): BrowserServerConfig {
  const parsed = parseEnv(envSchema, env);
  assertNoLocalCredentials(parsed.NODE_ENV, { BROWSER_WS_PATH: parsed.BROWSER_WS_PATH });
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    wsPath: parsed.BROWSER_WS_PATH,
    egressProxyUrl: parsed.EGRESS_PROXY_URL,
  };
}
