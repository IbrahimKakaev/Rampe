import { describe, expect, it } from '@jest/globals';
import { ConfigError } from '@rampe/shared';

import { loadConfig } from './app-config.js';

const valid = {
  DATABASE_URL: 'postgresql://rampe:s3cret@db.internal:5432/rampe',
  VALKEY_URL: 'redis://queue.internal:6379',
};

describe('loadConfig', () => {
  it('reads a valid environment and applies defaults', () => {
    expect(loadConfig(valid)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl: valid.DATABASE_URL,
      valkeyUrl: valid.VALKEY_URL,
    });
  });

  it.each([
    ['a missing database URL', { VALKEY_URL: valid.VALKEY_URL }, 'DATABASE_URL'],
    [
      'a database URL with another scheme',
      { ...valid, DATABASE_URL: 'mysql://h/db' },
      'DATABASE_URL',
    ],
    ['a missing queue URL', { DATABASE_URL: valid.DATABASE_URL }, 'VALKEY_URL'],
  ])('rejects %s and names the variable', (_label, env, variable) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(variable);
  });

  it('refuses the credentials of docker-compose.yml in production, for either dependency', () => {
    const database = 'postgresql://rampe:rampe-local-only@postgres:5432/rampe';
    const queue = 'redis://:rampe-local-only@valkey:6379';

    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', DATABASE_URL: database })).toThrow(
      /not allowed in production: DATABASE_URL\.$/,
    );
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', VALKEY_URL: queue })).toThrow(
      /not allowed in production: VALKEY_URL\.$/,
    );
    expect(loadConfig({ ...valid, DATABASE_URL: database, VALKEY_URL: queue }).nodeEnv).toBe(
      'development',
    );
  });

  it('accepts real credentials in production', () => {
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).nodeEnv).toBe('production');
  });
});
