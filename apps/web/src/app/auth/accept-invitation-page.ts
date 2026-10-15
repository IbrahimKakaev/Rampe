import { HttpClient } from '@angular/common/http';
import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { organizationSchema, tokenSchema, webPath } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod/mini';

import { API } from '../core/api';
import { FormState } from '../core/forms';
import { Session } from '../core/session';

/** Opened from the link of an invitation e-mail, once signed in. */
@Component({
  selector: 'rampe-accept-invitation-page',
  imports: [RouterLink],
  template: `
    <h1>Rejoindre une organisation</h1>
    @if (hasToken()) {
      <p class="page-intro">
        Vous avez reçu une invitation à rejoindre une organisation sur Rampe. L’invitation n’est
        valable que pour l’adresse e-mail à laquelle elle a été envoyée.
      </p>
      <form novalidate (submit)="accept($event)">
        @if (form.failure(); as failure) {
          <div class="alert" role="alert">
            <p>{{ failure }}</p>
          </div>
        }
        <div class="actions">
          <button type="submit" class="button" [attr.aria-disabled]="form.pending() ? true : null">
            Rejoindre l’organisation
          </button>
          <a [routerLink]="dashboard">Plus tard</a>
        </div>
      </form>
    } @else {
      <div class="alert" role="alert">
        <p>Ce lien d’invitation est incomplet. Copiez-le en entier depuis l’e-mail.</p>
      </div>
    }
  `,
})
export class AcceptInvitationPage {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  /** Query parameter `jeton`, from the link of the e-mail. */
  readonly jeton = input<string>();

  protected readonly form = new FormState(z.strictObject({}), {});
  protected readonly dashboard = webPath('dashboard');

  protected hasToken(): boolean {
    return tokenSchema.safeParse(this.jeton()).success;
  }

  protected async accept(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.form.submit(async () => {
      const organization = organizationSchema.parse(
        await firstValueFrom(this.http.post(`${API}/invitations/accept`, { token: this.jeton() })),
      );
      await this.session.refresh();
      await this.router.navigateByUrl(webPath('sites', { org: organization.id }));
    });
  }
}
