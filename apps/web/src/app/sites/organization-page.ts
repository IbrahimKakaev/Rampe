import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  deleteOrganizationRequestSchema,
  nameSchema,
  organizationSchema,
  webPath,
} from '@rampe/shared';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod/mini';

import { Announcer } from '../core/announcer';
import { API, errorMessage, parseWith } from '../core/api';
import { FormState } from '../core/forms';
import { titleFrom } from '../core/page-title';
import { Session } from '../core/session';

/** The settings form as typed: the retention period is a whole number of months. */
const settingsSchema = z.strictObject({
  name: nameSchema,
  retentionMonths: z.pipe(
    z.string().check(z.trim(), z.regex(/^\d{1,3}$/)),
    z.pipe(
      z.transform((value: string) => Number(value)),
      z.number().check(z.gte(1), z.lte(120)),
    ),
  ),
});

/**
 * The settings of an organisation: its name, how long scans are kept, and its
 * deletion with all its data. Changes are reserved to owners; members see the
 * settings without the forms.
 */
@Component({
  selector: 'rampe-organization-page',
  imports: [RouterLink],
  templateUrl: './organization-page.html',
})
export class OrganizationPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = inject(Session);
  private readonly announcer = inject(Announcer);

  /** Route parameter: the organisation. */
  readonly org = input.required<string>();

  protected readonly organization = httpResource(() => `${API}/orgs/${this.org()}`, {
    parse: parseWith(organizationSchema),
  });
  protected readonly owner = computed(
    () => this.organization.hasValue() && this.organization.value().role === 'OWNER',
  );
  protected readonly loadError = computed(() => {
    const error = this.organization.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly sitesPath = computed(() => webPath('sites', { org: this.org() }));

  protected readonly settings = new FormState(settingsSchema, {
    name: 'Saisissez le nom de l’organisation.',
    retentionMonths: 'Saisissez un nombre entier de mois, de 1 à 120.',
  });
  protected readonly saved = signal(false);
  protected readonly deletion = new FormState(deleteOrganizationRequestSchema, {
    password: 'Saisissez votre mot de passe pour confirmer.',
  });

  constructor() {
    titleFrom(() =>
      this.organization.hasValue() ? `Paramètres de ${this.organization.value().name}` : null,
    );
  }

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.saved.set(false);
    const changes = this.settings.read(event.target as HTMLFormElement);
    if (changes === null) {
      return;
    }
    await this.settings.submit(async () => {
      this.organization.set(
        organizationSchema.parse(
          await firstValueFrom(this.http.patch(`${API}/orgs/${this.org()}`, changes)),
        ),
      );
      await this.session.refresh();
      this.saved.set(true);
    });
  }

  protected async remove(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const confirmation = this.deletion.read(event.target as HTMLFormElement);
    if (confirmation === null) {
      return;
    }
    await this.deletion.submit(async () => {
      await firstValueFrom(this.http.delete(`${API}/orgs/${this.org()}`, { body: confirmation }));
      await this.session.refresh();
      await this.router.navigateByUrl(webPath('dashboard'));
      this.announcer.announce('L’organisation et toutes ses données ont été supprimées.');
    });
  }
}
