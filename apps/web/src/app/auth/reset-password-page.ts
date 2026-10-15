import { HttpClient } from '@angular/common/http';
import { Component, inject, Injector, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { passwordSchema, tokenSchema, webPath } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod/mini';

import { API } from '../core/api';
import { focusAfterRender } from '../core/focus';
import { FormState } from '../core/forms';

@Component({
  selector: 'rampe-reset-password-page',
  imports: [RouterLink],
  template: `
    <h1>Choisir un nouveau mot de passe</h1>

    @if (!hasToken()) {
      <div class="alert" role="alert">
        <p>
          Ce lien est incomplet. Copiez-le en entier depuis l’e-mail, ou demandez-en un nouveau.
        </p>
        <p><a [routerLink]="paths.forgotPassword">Recevoir un nouveau lien</a></p>
      </div>
    } @else if (changed()) {
      <div class="success">
        <h2 id="mot-de-passe-change">Mot de passe changé</h2>
        <p>Vos autres sessions ont été fermées. Connectez-vous avec votre nouveau mot de passe.</p>
        <p><a [routerLink]="paths.login">Se connecter</a></p>
      </div>
    } @else {
      <form class="form" novalidate (submit)="submit($event)">
        @if (form.failure(); as failure) {
          <div class="alert" role="alert">
            <p>{{ failure }}</p>
            <p><a [routerLink]="paths.forgotPassword">Recevoir un nouveau lien</a></p>
          </div>
        }
        <div class="field">
          <label for="password">Nouveau mot de passe (obligatoire)</label>
          <span id="password-aide" class="field-hint">12 caractères au moins.</span>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="new-password"
            [attr.aria-invalid]="form.errors().password ? true : null"
            [attr.aria-describedby]="
              form.errors().password ? 'password-aide password-erreur' : 'password-aide'
            "
          />
          @if (form.errors().password; as message) {
            <p id="password-erreur" class="field-error">{{ message }}</p>
          }
        </div>
        <div class="actions">
          <button type="submit" class="button" [attr.aria-disabled]="form.pending() ? true : null">
            Enregistrer le mot de passe
          </button>
        </div>
      </form>
    }
  `,
})
export class ResetPasswordPage {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);

  /** Query parameter `jeton`, from the link of the e-mail. */
  readonly jeton = input<string>();

  protected readonly form = new FormState(z.strictObject({ password: passwordSchema }), {
    password: 'Choisissez un mot de passe de 12 à 128 caractères.',
  });
  protected readonly changed = signal(false);
  protected readonly paths = { login: webPath('login'), forgotPassword: webPath('forgotPassword') };

  protected hasToken(): boolean {
    return tokenSchema.safeParse(this.jeton()).success;
  }

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const request = this.form.read(event.target as HTMLFormElement);
    if (request === null) {
      return;
    }
    await this.form.submit(async () => {
      await firstValueFrom(
        this.http.post(`${API}/auth/password/reset`, { token: this.jeton(), ...request }),
      );
      this.changed.set(true);
      focusAfterRender(this.injector, '#mot-de-passe-change');
    });
  }
}
