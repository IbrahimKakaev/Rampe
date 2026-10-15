import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createSiteRequestSchema, siteSchema, webPath } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';

import { API } from '../core/api';
import { FormState } from '../core/forms';
import { WizardSteps } from '../ui/wizard-steps';

/** Step 1 of the wizard: the address of the site. */
@Component({
  selector: 'rampe-new-site-page',
  imports: [RouterLink, WizardSteps],
  template: `
    <nav class="breadcrumb" aria-label="Fil d’Ariane">
      <ol>
        <li><a [routerLink]="sitesPath()">Sites</a></li>
        <li aria-current="page">Ajouter un site</li>
      </ol>
    </nav>
    <h1>Ajouter un site</h1>
    <rampe-wizard-steps [current]="1" />

    <form class="form" novalidate (submit)="submit($event)">
      @if (form.failure(); as failure) {
        <div class="alert" role="alert">
          <p>{{ failure }}</p>
        </div>
      }
      <div class="field">
        <label for="url">Adresse de la page d’accueil (obligatoire)</label>
        <span id="url-aide" class="field-hint">
          Avec http:// ou https://, par exemple https://www.exemple.fr. Seules les pages de cette
          adresse seront visitées : exemple.fr et www.exemple.fr sont deux sites différents.
        </span>
        <input
          id="url"
          name="url"
          type="url"
          autocomplete="url"
          [attr.aria-invalid]="form.errors().url ? true : null"
          [attr.aria-describedby]="form.errors().url ? 'url-aide url-erreur' : 'url-aide'"
        />
        @if (form.errors().url; as message) {
          <p id="url-erreur" class="field-error">{{ message }}</p>
        }
      </div>
      <div class="actions">
        <button type="submit" class="button" [attr.aria-disabled]="form.pending() ? true : null">
          Continuer
        </button>
        <a [routerLink]="sitesPath()">Annuler</a>
      </div>
    </form>
  `,
})
export class NewSitePage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** Route parameter: the organisation. */
  readonly org = input.required<string>();

  protected readonly form = new FormState(createSiteRequestSchema, {
    url: 'Saisissez une adresse complète en http ou https, par exemple https://www.exemple.fr.',
  });
  protected readonly sitesPath = computed(() => webPath('sites', { org: this.org() }));

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const request = this.form.read(event.target as HTMLFormElement);
    if (request === null) {
      return;
    }
    await this.form.submit(async () => {
      const site = siteSchema.parse(
        await firstValueFrom(this.http.post(`${API}/orgs/${this.org()}/sites`, request)),
      );
      await this.router.navigateByUrl(
        webPath('siteVerification', { org: this.org(), site: site.id }),
      );
    });
  }
}
