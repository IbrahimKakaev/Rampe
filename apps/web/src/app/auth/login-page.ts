import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { loginRequestSchema, webPath } from '@rampe/shared';

import { safeReturnPath } from '../core/guards';
import { FormState } from '../core/forms';
import { Session } from '../core/session';

@Component({
  selector: 'rampe-login-page',
  imports: [RouterLink],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  /** Query parameter `retour`: the page to come back to once signed in. */
  readonly retour = input<string>();

  protected readonly form = new FormState(loginRequestSchema, {
    email: 'Saisissez une adresse e-mail valide, par exemple nom@exemple.fr.',
    password: 'Saisissez votre mot de passe.',
  });
  protected readonly paths = {
    forgotPassword: webPath('forgotPassword'),
    register: webPath('register'),
  };

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const credentials = this.form.read(event.target as HTMLFormElement);
    if (credentials === null) {
      return;
    }
    await this.form.submit(async () => {
      await this.session.login(credentials);
      await this.router.navigateByUrl(safeReturnPath(this.retour()));
    });
  }
}
