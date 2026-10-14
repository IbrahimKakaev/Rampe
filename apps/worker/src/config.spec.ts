import { describe, expect, it } from '@jest/globals';
import { ConfigError } from '@rampe/shared';

import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('reads a valid environment and applies defaults', () => {
    expect(loadConfig({ VALKEY_URL: 'redis://queue.internal:6379' })).toEqual({
      nodeEnv: 'development',
      valkeyUrl: 'redis://queue.internal:6379',
    });
  });

  it('rejects a missing queue URL and names the variable', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow('VALKEY_URL');
  });

  it('refuses the credentials of docker-compose.yml in production only', () => {
    const local = { VALKEY_URL: 'redis://:rampe-local-only@valkey:6379' };

    expect(() => loadConfig({ ...local, NODE_ENV: 'production' })).toThrow(
      /not allowed in production: VALKEY_URL\.$/,
    );
    expect(loadConfig(local).valkeyUrl).toBe(local.VALKEY_URL);
  });
});
