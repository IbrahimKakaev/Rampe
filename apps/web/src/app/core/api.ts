import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorSchema } from '@rampe/shared';

/** Every API path starts here; nginx forwards it to the API on the same origin. */
export const API = '/api/v1';

const GENERIC_ERROR = 'Une erreur est survenue. Réessayez dans un instant.';

/**
 * The French message to show for a failed request. The API writes its own
 * messages in French for the person using the application; anything else
 * (validation details, server errors) gets a generic wording.
 */
export function errorMessage(error: unknown, fallback = GENERIC_ERROR): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return 'Le service ne répond pas. Vérifiez votre connexion, puis réessayez.';
  }
  if (error.status === 429) {
    return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
  }
  if (error.status >= 500) {
    return fallback;
  }
  const body = apiErrorSchema.safeParse(error.error);
  return body.success && typeof body.data.message === 'string' ? body.data.message : fallback;
}

/** Validates a response body against its schema: the API is a trust boundary for the browser too. */
export function parseWith<T>(schema: { parse(value: unknown): T }): (value: unknown) => T {
  return (value) => schema.parse(value);
}
