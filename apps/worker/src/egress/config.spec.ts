import { describe, expect, it } from '@jest/globals';
import { ConfigError } from '@rampe/shared';

import { loadEgressConfig } from './config.js';

describe('loadEgressConfig', () => {
  it('listens on 3128 and allows no private host by default', () => {
    expect(loadEgressConfig({})).toEqual({
      nodeEnv: 'development',
      port: 3128,
      allowedPrivateHosts: new Set(),
    });
  });

  it('reads the private hosts allowed for local use, case-insensitively', () => {
    const config = loadEgressConfig({
      EGRESS_ALLOWED_PRIVATE_HOSTS: ' fixture-site , Demo.Local ',
    });

    expect(config.allowedPrivateHosts).toEqual(new Set(['fixture-site', 'demo.local']));
  });

  it.each(['http://fixture-site', 'fixture-site:80', '10.0.0.0/8', '*.local', 'a b'])(
    'refuses %j, which is not a host name',
    (value) => {
      expect(() => loadEgressConfig({ EGRESS_ALLOWED_PRIVATE_HOSTS: value })).toThrow(ConfigError);
    },
  );

  it('refuses to start in production with private hosts allowed', () => {
    expect(() =>
      loadEgressConfig({ NODE_ENV: 'production', EGRESS_ALLOWED_PRIVATE_HOSTS: 'fixture-site' }),
    ).toThrow('EGRESS_ALLOWED_PRIVATE_HOSTS must be empty in production');
  });

  it('starts in production when no private host is allowed', () => {
    expect(loadEgressConfig({ NODE_ENV: 'production' }).allowedPrivateHosts.size).toBe(0);
  });
});
