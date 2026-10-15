import { HttpClient } from '@angular/common/http';
import { Component, inject, Injector, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forgotPasswordRequestSchema, webPath } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';

import { API } from '../core/api';
import { focusAfterRender } from '../core/focus';
import { FormState } from '../core/forms';

@Component({
  selector: 'rampe-forgot-password-page',
  imports: [RouterLink],
  template: `
    <h1>Mot de passe oublié</h1>

    @if (sent()) {
      <div class="success">
        <h2 id="lien-envoye">Vérifiez votre boîte de réception</h2>
        <p>
          Si un compte existe pour cette adresse, un lien de réinitialisation vient d’y être envoyé.
          Il est valable une heure.
        </p>
        <p><a [routerLink]="loginPath">Retour à la connexion</a></p>
      </div>
    } @else {
      <p class="page-intro">
        Indiquez l’adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau
        mot de passe.
      </p>
      <form class="form" novalidate (submit)="submit($event)">
        @if (form.failure(); as failure) {
          <div class="alert" role="alert">
            <p>{{ failure }}</p>
          </div>
        }
        <div class="field">
          <label for="email">Adresse e-mail (obligatoire)</label>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            [attr.aria-invalid]="form.errors().email ? true : null"
            [attr.aria-describedby]="form.errors().email ? 'email-erreur' : null"
          />
          @if (form.errors().email; as message) {
            <p id="email-erreur" class="field-error">{{ message }}</p>
          }
        </div>
        <div class="actions">
          <button type="submit" class="button" [attr.aria-disabled]="form.pending() ? true : null">
            Recevoir le lien
          </button>
          <a [routerLink]="loginPath">Retour à la connexion</a>
        </div>
      </form>
    }
  `,
})
export class ForgotPasswordPage {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);

  protected readonly form = new FormState(forgotPasswordRequestSchema, {
    email: 'Saisissez une adresse e-mail valide, par exemple nom@exemple.fr.',
  });
  protected readonly sent = signal(false);
  protected readonly loginPath = webPath('login');

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const request = this.form.read(event.target as HTMLFormElement);
    if (request === null) {
      return;
    }
    await this.form.submit(async () => {
      await firstValueFrom(this.http.post(`${API}/auth/password/forgot`, request));
      this.sent.set(true);
      focusAfterRender(this.injector, '#lien-envoye');
    });
  }
}
