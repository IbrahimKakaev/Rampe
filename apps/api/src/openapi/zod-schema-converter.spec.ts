import { describe, expect, it } from '@jest/globals';
import { healthResponseSchema } from '@rampe/shared';
import * as z from 'zod/mini';

import { zodSchemaConverter } from './zod-schema-converter.js';

describe('zodSchemaConverter', () => {
  it('converts a Zod schema to an OpenAPI 3.0 schema, without JSON Schema keywords', () => {
    expect(zodSchemaConverter(healthResponseSchema, { schemaType: 'output' })).toEqual({
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'] },
          checks: {
            type: 'object',
            properties: {
              database: { type: 'string', enum: ['up', 'down'] },
              queue: { type: 'string', enum: ['up', 'down'] },
            },
            required: ['database', 'queue'],
            additionalProperties: false,
          },
        },
        required: ['status', 'checks'],
        additionalProperties: false,
      },
      components: {},
    });
  });

  it('describes what a client sends or receives, depending on the direction', () => {
    const schema = z.object({ port: z._default(z.number(), 3000) });

    const input = zodSchemaConverter(schema, { schemaType: 'input' });
    const output = zodSchemaConverter(schema, { schemaType: 'output' });

    expect(input?.schema).not.toHaveProperty('required');
    expect(output?.schema).toHaveProperty('required', ['port']);
  });

  it('leaves schemas from other libraries to NestJS', () => {
    const foreign = {
      '~standard': { version: 1, vendor: 'other', validate: () => ({ value: 1 }) },
    };

    expect(zodSchemaConverter(foreign, { schemaType: 'output' })).toBeUndefined();
  });
});
