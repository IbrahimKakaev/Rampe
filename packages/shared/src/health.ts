import * as z from 'zod/mini';

export const dependencyStatusSchema = z.enum(['up', 'down']);
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

/** Body of `GET /api/v1/health`. `status` is `ok` only when every dependency is up. */
export const healthResponseSchema = z.strictObject({
  status: z.enum(['ok', 'degraded']),
  checks: z.strictObject({
    database: dependencyStatusSchema,
    queue: dependencyStatusSchema,
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type HealthChecks = HealthResponse['checks'];

export function buildHealthResponse(checks: HealthChecks): HealthResponse {
  const allUp = Object.values(checks).every((status) => status === 'up');
  return { status: allUp ? 'ok' : 'degraded', checks };
}
