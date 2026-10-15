import { HttpClient } from '@angular/common/http';
import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tokenSchema, webPath } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';

import { API, errorMessage } from '../core/api';

type State =
  | { readonly kind: 'pending' }
  | { readonly kind: 'confirmed' }
  | { readonly kind: 'failed'; readonly message: string };

/** Opened from the link of the confirmation e-mail: confirms the address straight away. */
@Component({
  selector: 'rampe-verify-email-page',
  imports: [RouterLink],
  template: `
    <h1>Confirmation de votre adresse e-mail</h1>
    <div role="status">
      @switch (state().kind) {
        @case ('pending') {
          <p>Confirmation en cours…</p>
        }
        @case ('confirmed') {
          <div class="success">
            <p>Votre adresse est confirmée. Vous pouvez maintenant vous connecter.</p>
            <p><a [routerLink]="paths.login">Se connecter</a></p>
          </div>
        }
      }
    </div>
    @if (failure(); as message) {
      <div class="alert" role="alert">
        <p>{{ message }}</p>
        <p>
          Si votre compte n’est pas encore confirmé, demandez un lien de réinitialisation du mot de
          passe : il confirme aussi votre adresse.
        </p>
        <p><a [routerLink]="paths.forgotPassword">Recevoir un lien de réinitialisation</a></p>
      </div>
    }
  `,
})
export class VerifyEmailPage implements OnInit {
  private readonly http = inject(HttpClient);

  /** Query parameter `jeton`, from the link of the e-mail. */
  readonly jeton = input<string>();

  protected readonly state = signal<State>({ kind: 'pending' });
  protected readonly paths = { login: webPath('login'), forgotPassword: webPath('forgotPassword') };

  protected failure(): string | null {
    const state = this.state();
    return state.kind === 'failed' ? state.message : null;
  }

  ngOnInit(): void {
    void this.confirm();
  }

  private async confirm(): Promise<void> {
    const token = tokenSchema.safeParse(this.jeton());
    if (!token.success) {
      this.state.set({
        kind: 'failed',
        message: 'Ce lien est incomplet. Copiez-le en entier depuis l’e-mail.',
      });
      return;
    }
    try {
      await firstValueFrom(this.http.post(`${API}/auth/verify-email`, { token: token.data }));
      this.state.set({ kind: 'confirmed' });
    } catch (error) {
      this.state.set({ kind: 'failed', message: errorMessage(error) });
    }
  }
}
