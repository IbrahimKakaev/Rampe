import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { siteSchema, webPath } from '@rampe/shared';
import * as z from 'zod/mini';

import { API, errorMessage, parseWith } from '../core/api';
import { formatDateTime, SCAN_STATUS_LABEL } from '../core/format';
import { titleFrom } from '../core/page-title';
import { Session } from '../core/session';
import { PreAuditNotice } from '../ui/pre-audit-notice';
import { Score, Trend } from '../ui/score';

@Component({
  selector: 'rampe-sites-page',
  imports: [RouterLink, PreAuditNotice, Score, Trend],
  templateUrl: './sites-page.html',
})
export class SitesPage {
  private readonly session = inject(Session);

  /** Route parameter: the organisation. */
  readonly org = input.required<string>();

  protected readonly sites = httpResource(() => `${API}/orgs/${this.org()}/sites`, {
    parse: parseWith(z.array(siteSchema)),
  });

  protected readonly organizationName = computed(
    () => this.session.organization(this.org())?.name ?? '',
  );
  protected readonly otherOrganizations = computed(() =>
    (this.session.me()?.organizations ?? []).filter(
      (organization) => organization.id !== this.org(),
    ),
  );
  /** The number to show in the pre-audit notice, when at least one score is on the page. */
  protected readonly criteriaToCheckManually = computed(() => {
    const sites = this.sites.hasValue() ? this.sites.value() : [];
    const scored = sites.find((site) => typeof site.lastScan?.score === 'number');
    return scored?.lastScan?.criteriaToCheckManually ?? null;
  });
  protected readonly loadError = computed(() => {
    const error = this.sites.error();
    return error === undefined ? null : errorMessage(error);
  });

  protected readonly statusLabel = SCAN_STATUS_LABEL;

  protected readonly newSitePath = computed(() => webPath('newSite', { org: this.org() }));
  protected readonly organizationPath = computed(() =>
    webPath('organization', { org: this.org() }),
  );

  constructor() {
    titleFrom(() =>
      this.organizationName() === '' ? null : `Sites de ${this.organizationName()}`,
    );
  }

  protected sitesPath(org: string): string {
    return webPath('sites', { org });
  }

  protected sitePath(site: string): string {
    return webPath('site', { org: this.org(), site });
  }

  protected verificationPath(site: string): string {
    return webPath('siteVerification', { org: this.org(), site });
  }

  protected dateTime(iso: string): string {
    return formatDateTime(iso);
  }
}
