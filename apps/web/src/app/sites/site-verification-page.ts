import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, Injector, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  scanSchema,
  siteSchema,
  verificationInstructionsSchema,
  type VerificationResult,
  verificationResultSchema,
  webPath,
} from '@rampe/shared';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod/mini';

import { API, errorMessage, parseWith } from '../core/api';
import { focusAfterRender } from '../core/focus';
import { FormState } from '../core/forms';
import { titleFrom } from '../core/page-title';
import { WizardSteps } from '../ui/wizard-steps';

type Method = VerificationResult['method'];

/** Steps 2 and 3 of the wizard: prove ownership of the site, then start its first scan. */
@Component({
  selector: 'rampe-site-verification-page',
  imports: [RouterLink, WizardSteps],
  templateUrl: './site-verification-page.html',
})
export class SiteVerificationPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** Route parameters. */
  readonly org = input.required<string>();
  readonly site = input.required<string>();

  protected readonly siteResource = httpResource(
    () => `${API}/orgs/${this.org()}/sites/${this.site()}`,
    { parse: parseWith(siteSchema) },
  );
  protected readonly instructions = httpResource(
    () => `${API}/orgs/${this.org()}/sites/${this.site()}/verification`,
    { parse: parseWith(verificationInstructionsSchema) },
  );

  protected readonly method = signal<Method>('FILE');
  protected readonly result = signal<VerificationResult | null>(null);
  protected readonly check = new FormState(z.strictObject({}), {});
  protected readonly scan = new FormState(z.strictObject({}), {});

  protected readonly verified = computed(
    () =>
      this.result()?.verified === true ||
      (this.siteResource.hasValue() && this.siteResource.value().verified),
  );
  protected readonly loadError = computed(() => {
    const error = this.siteResource.error() ?? this.instructions.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly paths = computed(() => ({
    sites: webPath('sites', { org: this.org() }),
    site: webPath('site', { org: this.org(), site: this.site() }),
  }));

  constructor() {
    titleFrom(() =>
      this.siteResource.hasValue()
        ? `Prouver la propriété de ${this.siteResource.value().host}`
        : null,
    );
  }

  protected choose(method: Method): void {
    this.method.set(method);
    this.result.set(null);
  }

  protected async verify(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.check.submit(async () => {
      const result = verificationResultSchema.parse(
        await firstValueFrom(
          this.http.post(`${API}/orgs/${this.org()}/sites/${this.site()}/verification/check`, {
            method: this.method(),
          }),
        ),
      );
      this.result.set(result);
      // On success the form gives way to the next step: its heading takes the focus.
      if (result.verified) {
        focusAfterRender(this.injector, '#premier-scan');
      }
    });
  }

  protected async startScan(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.scan.submit(async () => {
      const scan = scanSchema.parse(
        await firstValueFrom(
          this.http.post(`${API}/orgs/${this.org()}/sites/${this.site()}/scans`, null),
        ),
      );
      await this.router.navigateByUrl(webPath('scan', { org: this.org(), scan: scan.id }));
    });
  }
}
