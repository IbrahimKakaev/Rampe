import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  type Audit,
  auditSchema,
  nameSchema,
  scanPageSchema,
  siteSchema,
  webPath,
} from '@rampe/shared';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod/mini';

import { Announcer } from '../core/announcer';
import { API, errorMessage, parseWith } from '../core/api';
import { formatDateTime, formatRate } from '../core/format';
import { FormState } from '../core/forms';
import { titleFrom } from '../core/page-title';

/** The words of the accessibility statement for each conformity state. */
const STATE_LABEL = {
  total: 'Totalement conforme',
  partial: 'Partiellement conforme',
  none: 'Non conforme',
} as const;

const fromScanSchema = z.strictObject({ url: z.string().check(z.minLength(1)), title: nameSchema });
const otherPageSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  title: nameSchema,
});

/**
 * A manual audit: its sample, its progress and, once complete, its RGAA
 * conformity rates by the official method. The statuses come from the
 * auditor; from the scan, only defects found are taken as « non conforme ».
 */
@Component({
  selector: 'rampe-audit-page',
  imports: [RouterLink],
  templateUrl: './audit-page.html',
})
export class AuditPage {
  private readonly http = inject(HttpClient);
  private readonly announcer = inject(Announcer);

  /** Route parameters. */
  readonly org = input.required<string>();
  readonly audit = input.required<string>();

  protected readonly auditResource = httpResource(
    () => `${API}/orgs/${this.org()}/audits/${this.audit()}`,
    { parse: parseWith(auditSchema) },
  );
  protected readonly site = httpResource(
    () =>
      this.auditResource.hasValue()
        ? `${API}/orgs/${this.org()}/sites/${this.auditResource.value().siteId}`
        : undefined,
    { parse: parseWith(siteSchema) },
  );
  private readonly scanPages = httpResource(
    () => {
      const scanId = this.auditResource.hasValue() ? this.auditResource.value().scanId : null;
      return scanId === null ? undefined : `${API}/orgs/${this.org()}/scans/${scanId}/pages`;
    },
    { parse: parseWith(z.array(scanPageSchema)) },
  );

  /** Pages of the reference scan that could join the sample. */
  protected readonly candidates = computed(() => {
    const sampled = new Set(
      this.auditResource.hasValue() ? this.auditResource.value().pages.map(({ url }) => url) : [],
    );
    return (this.scanPages.hasValue() ? this.scanPages.value() : []).filter(
      (page) => page.status === 'ANALYZED' && !sampled.has(page.url),
    );
  });
  protected readonly loadError = computed(() => {
    const error = this.auditResource.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly paths = computed(() => ({
    sites: webPath('sites', { org: this.org() }),
    site: this.auditResource.hasValue()
      ? webPath('site', { org: this.org(), site: this.auditResource.value().siteId })
      : webPath('sites', { org: this.org() }),
    statement: webPath('statement', { org: this.org(), audit: this.audit() }),
  }));

  protected readonly fromScan = new FormState(fromScanSchema, {
    url: 'Choisissez une page du scan.',
    title: 'Donnez un nom à la page, par exemple « Accueil » ou « Contact ».',
  });
  protected readonly otherPage = new FormState(otherPageSchema, {
    url: 'Saisissez une adresse complète en http ou https.',
    title: 'Donnez un nom à la page.',
  });
  protected readonly removal = new FormState(z.strictObject({}), {});
  protected readonly stateLabel = STATE_LABEL;

  constructor() {
    titleFrom(() => (this.site.hasValue() ? `Audit manuel de ${this.site.value().host}` : null));
  }

  protected pagePath(page: string): string {
    return webPath('auditPage', { org: this.org(), audit: this.audit(), page });
  }

  protected dateTime(iso: string): string {
    return formatDateTime(iso);
  }

  protected rate(value: number): string {
    return formatRate(value);
  }

  protected remaining(audit: Audit): number {
    return audit.conformity.expected - audit.conformity.evaluated;
  }

  protected async addFromScan(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const page = this.fromScan.read(event.target as HTMLFormElement);
    if (page !== null) {
      await this.fromScan.submit(() => this.saveSample((pages) => [...pages, page], page.title));
    }
  }

  protected async addOther(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const page = this.otherPage.read(event.target as HTMLFormElement);
    if (page !== null) {
      await this.otherPage.submit(() => this.saveSample((pages) => [...pages, page], page.title));
    }
  }

  protected async remove(event: SubmitEvent, url: string, title: string): Promise<void> {
    event.preventDefault();
    await this.removal.submit(async () => {
      await this.saveSample((pages) => pages.filter((page) => page.url !== url));
      this.announcer.announce(`${title} est retirée de l’échantillon.`);
    });
  }

  private async saveSample(
    change: (pages: { url: string; title: string }[]) => { url: string; title: string }[],
    added?: string,
  ): Promise<void> {
    const current = this.auditResource.hasValue()
      ? this.auditResource.value().pages.map(({ url, title }) => ({ url, title }))
      : [];
    const audit = auditSchema.parse(
      await firstValueFrom(
        this.http.put(`${API}/orgs/${this.org()}/audits/${this.audit()}/pages`, {
          pages: change(current),
        }),
      ),
    );
    this.auditResource.set(audit);
    if (added !== undefined) {
      this.announcer.announce(`${added} est ajoutée à l’échantillon.`);
    }
  }
}
