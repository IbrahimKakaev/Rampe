import { HttpClient } from '@angular/common/http';
import { Component, inject, Injector, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { registerRequestSchema, webPath } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';

import { API } from '../core/api';
import { focusAfterRender } from '../core/focus';
import { FormState } from '../core/forms';

@Component({
  selector: 'rampe-register-page',
  imports: [RouterLink],
  templateUrl: './register-page.html',
})
export class RegisterPage {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);

  protected readonly form = new FormState(registerRequestSchema, {
    name: 'Saisissez votre nom.',
    organizationName: 'Saisissez le nom de votre organisation.',
    email: 'Saisissez une adresse e-mail valide, par exemple nom@exemple.fr.',
    password: 'Choisissez un mot de passe de 12 à 128 caractères.',
  });
  /** The address the confirmation link was sent to, once the form is sent. */
  protected readonly sentTo = signal<string | null>(null);
  protected readonly loginPath = webPath('login');

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const request = this.form.read(event.target as HTMLFormElement);
    if (request === null) {
      return;
    }
    await this.form.submit(async () => {
      await firstValueFrom(this.http.post(`${API}/auth/register`, request));
      this.sentTo.set(request.email);
      focusAfterRender(this.injector, '#inscription-envoyee');
    });
  }
}
