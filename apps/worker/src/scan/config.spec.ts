import { describe, expect, it } from '@jest/globals';
import { ConfigError } from '@rampe/shared';

import { loadScanConfig } from './config.js';

const valid = {
  VALKEY_URL: 'redis://queue.internal:6379',
  BROWSER_WS_ENDPOINT: 'ws://browser:3000/c2VjcmV0LXBhdGgtZm9yLXRlc3Rz',
  EGRESS_PROXY_URL: 'http://egress-proxy:3128',
  SCAN_BOT_INFO_URL: 'https://rampe.example/robot',
};

describe('loadScanConfig', () => {
  it('reads the addresses of the browser, the proxy and the information page', () => {
    expect(loadScanConfig(valid)).toEqual({
      nodeEnv: 'development',
      valkeyUrl: valid.VALKEY_URL,
      browserWsEndpoint: valid.BROWSER_WS_ENDPOINT,
      egressProxyUrl: valid.EGRESS_PROXY_URL,
      botInfoUrl: valid.SCAN_BOT_INFO_URL,
    });
  });

  it.each([
    ['BROWSER_WS_ENDPOINT', 'http://browser:3000/x'],
    ['EGRESS_PROXY_URL', 'https://egress-proxy:3128'],
    ['SCAN_BOT_INFO_URL', 'ftp://rampe.example/robot'],
  ])('refuses a %s with another scheme', (name, value) => {
    expect(() => loadScanConfig({ ...valid, [name]: value })).toThrow(ConfigError);
    expect(() => loadScanConfig({ ...valid, [name]: value })).toThrow(name);
  });

  it('refuses the local secret path of the browser in production', () => {
    const local = {
      ...valid,
      NODE_ENV: 'production',
      BROWSER_WS_ENDPOINT: 'ws://browser:3000/rampe-browser-local-only',
    };

    expect(() => loadScanConfig(local)).toThrow('not allowed in production: BROWSER_WS_ENDPOINT');
  });
});
