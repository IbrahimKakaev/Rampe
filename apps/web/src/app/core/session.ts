import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { type LoginRequest, type Me, meSchema } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';

import { API } from './api';

/**
 * Who is signed in. The session itself lives in an HttpOnly cookie the
 * application cannot read: this service only keeps what the API says about it.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly http = inject(HttpClient);
  private readonly state = signal<Me | null>(null);

  readonly me = this.state.asReadonly();
  readonly signedIn = computed(() => this.state() !== null);

  /**
   * Asks the API who is signed in. Any failure means "nobody": an expired
   * session (401) as much as an API that cannot be reached. This first request
   * also gives the browser its anti-CSRF cookie.
   */
  async refresh(): Promise<void> {
    try {
      this.state.set(meSchema.parse(await firstValueFrom(this.http.get(`${API}/auth/me`))));
    } catch {
      this.state.set(null);
    }
  }

  async login(credentials: LoginRequest): Promise<void> {
    const me = await firstValueFrom(this.http.post(`${API}/auth/login`, credentials));
    this.state.set(meSchema.parse(me));
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${API}/auth/logout`, null));
    } finally {
      this.state.set(null);
    }
  }

  /** Forgets the session, after the API said it has expired. */
  clear(): void {
    this.state.set(null);
  }

  organization(id: string): Me['organizations'][number] | undefined {
    return this.state()?.organizations.find((organization) => organization.id === id);
  }
}
