import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type HealthResponse, healthResponseSchema } from '@rampe/shared';
import { catchError, map, type Observable, of } from 'rxjs';

export type HealthState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly health: HealthResponse }
  | { readonly kind: 'unreachable' };

@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);

  /**
   * The API answers 503 with a regular report when a dependency is down, so an
   * HTTP error still carries a body worth showing. Anything that is not a valid
   * report means the API itself could not be reached.
   */
  load(): Observable<HealthState> {
    return this.http.get<unknown>('/api/v1/health').pipe(
      map(toState),
      catchError((error: unknown) =>
        of(toState(error instanceof HttpErrorResponse ? error.error : undefined)),
      ),
    );
  }
}

function toState(body: unknown): HealthState {
  const parsed = healthResponseSchema.safeParse(body);
  return parsed.success ? { kind: 'loaded', health: parsed.data } : { kind: 'unreachable' };
}
