import type { StandardSchemaConverter } from '@nestjs/swagger';
import * as z from 'zod/mini';

/**
 * Turns the Zod schemas given to `@ApiResponse({ standardSchema })` and friends
 * into OpenAPI schemas.
 *
 * NestJS can do this by itself for the full Zod build, which attaches a JSON
 * Schema converter to every schema. This project uses `zod/mini`, whose schemas
 * are shared with the browser and leave that converter out to stay small, so the
 * conversion is done here instead.
 */
export const zodSchemaConverter: StandardSchemaConverter = (schema, { schemaType }) => {
  if (!(schema instanceof z.core.$ZodType)) {
    return undefined;
  }
  const {
    $schema: _dialect,
    $defs: components = {},
    ...openApiSchema
  } = z.toJSONSchema(schema, { target: 'openapi-3.0', io: schemaType });
  return { schema: openApiSchema, components };
};
