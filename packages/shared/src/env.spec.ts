import { describe, expect, it } from '@jest/globals';
import * as z from 'zod/mini';

import {
  assertNoLocalCredentials,
  ConfigError,
  nodeEnvSchema,
  parseEnv,
  portSchema,
  valkeyUrlSchema,
} from './env.js';

const schema = z.object({
  NODE_ENV: nodeEnvSchema,
  VALKEY_URL: valkeyUrlSchema,
  PORT: z._default(portSchema, 3000),
});

describe('parseEnv', () => {
  it('returns the parsed values with defaults applied', () => {
    expect(parseEnv(schema, { VALKEY_URL: 'redis://queue.internal:6379' })).toEqual({
      NODE_ENV: 'development',
      VALKEY_URL: 'redis://queue.internal:6379',
      PORT: 3000,
    });
  });

  it('accepts a TLS queue URL and coerces numbers', () => {
    const env = { VALKEY_URL: 'rediss://queue.internal:6380', PORT: '8081' };
    expect(parseEnv(schema, env)).toMatchObject({ PORT: 8081 });
  });

  it.each([
    ['a missing variable', {}, 'VALKEY_URL'],
    ['a queue URL with another scheme', { VALKEY_URL: 'http://h:6379' }, 'VALKEY_URL'],
    ['a port out of range', { VALKEY_URL: 'redis://h', PORT: '70000' }, 'PORT'],
    ['a fractional port', { VALKEY_URL: 'redis://h', PORT: '80.5' }, 'PORT'],
    ['a port that is not a number', { VALKEY_URL: 'redis://h', PORT: 'http' }, 'PORT'],
    ['an unknown NODE_ENV', { VALKEY_URL: 'redis://h', NODE_ENV: 'staging' }, 'NODE_ENV'],
  ])('rejects %s and names the variable', (_label, env, variable) => {
    expect(() => parseEnv(schema, env)).toThrow(ConfigError);
    expect(() => parseEnv(schema, env)).toThrow(variable);
  });

  it('never echoes a value, which may be a secret', () => {
    const env = { VALKEY_URL: 'http://user:tr3s-secret@h:6379' };
    let message = '';
    try {
      parseEnv(schema, env);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('VALKEY_URL');
    expect(message).not.toContain('tr3s-secret');
  });
});

describe('assertNoLocalCredentials', () => {
  const local = {
    DATABASE_URL: 'postgresql://rampe:rampe-local-only@postgres:5432/rampe',
    VALKEY_URL: 'redis://queue.internal:6379',
  };

  it('refuses a local development credential in production and names the variable', () => {
    expect(() => {
      assertNoLocalCredentials('production', local);
    }).toThrow(ConfigError);
    expect(() => {
      assertNoLocalCredentials('production', local);
    }).toThrow(/not allowed in production: DATABASE_URL\.$/);
  });

  it('lists every offending variable', () => {
    const both = { ...local, VALKEY_URL: 'redis://:rampe-local-only@valkey:6379' };
    expect(() => {
      assertNoLocalCredentials('production', both);
    }).toThrow(/not allowed in production: DATABASE_URL, VALKEY_URL\.$/);
  });

  it('accepts real credentials in production', () => {
    expect(() => {
      assertNoLocalCredentials('production', { DATABASE_URL: 'postgresql://u:p@db/rampe' });
    }).not.toThrow();
  });

  it.each(['development', 'test'])('accepts local credentials in %s', (nodeEnv) => {
    expect(() => {
      assertNoLocalCredentials(nodeEnv, local);
    }).not.toThrow();
  });
});
