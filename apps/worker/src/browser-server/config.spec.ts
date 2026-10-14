import { describe, expect, it } from '@jest/globals';
import { ConfigError } from '@rampe/shared';

import { loadBrowserServerConfig } from './config.js';

const valid = {
  BROWSER_WS_PATH: '/Zm9yLXRlc3RzLW9ubHktMTIzNDU2',
  EGRESS_PROXY_URL: 'http://egress-proxy:3128',
};

describe('loadBrowserServerConfig', () => {
  it('reads the secret path and the proxy, and listens on 3000 by default', () => {
    expect(loadBrowserServerConfig(valid)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      wsPath: valid.BROWSER_WS_PATH,
      egressProxyUrl: valid.EGRESS_PROXY_URL,
    });
  });

  it.each(['/short', 'no-leading-slash-but-long-enough', '/has spaces in the secret path!'])(
    'refuses the secret path %j',
    (path) => {
      expect(() => loadBrowserServerConfig({ ...valid, BROWSER_WS_PATH: path })).toThrow(
        ConfigError,
      );
    },
  );

  it('refuses to run without the egress proxy', () => {
    expect(() => loadBrowserServerConfig({ BROWSER_WS_PATH: valid.BROWSER_WS_PATH })).toThrow(
      'EGRESS_PROXY_URL',
    );
  });

  it('refuses the local secret path in production', () => {
    expect(() =>
      loadBrowserServerConfig({
        ...valid,
        NODE_ENV: 'production',
        BROWSER_WS_PATH: '/rampe-browser-local-only',
      }),
    ).toThrow('not allowed in production: BROWSER_WS_PATH');
  });
});
