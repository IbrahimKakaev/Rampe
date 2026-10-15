import { httpResource } from '@angular/common/http';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { findingDetailSchema, scanSchema, siteSchema, webPath } from '@rampe/shared';

import { API, errorMessage, parseWith } from '../core/api';
import { IMPACT_LABEL } from '../core/format';
import { titleFrom } from '../core/page-title';
import { ContentText } from '../ui/content-text';

/**
 * One defect: where it is, its code, the RGAA criteria it breaks and how to
 * fix it. The explanations come from the corrections content of
 * `packages/rules`, through the API; none is written here.
 */
@Component({
  selector: 'rampe-finding-page',
  imports: [RouterLink, ContentText],
  templateUrl: './finding-page.html',
})
export class FindingPage {
  /** Route parameters. */
  readonly org = input.required<string>();
  readonly scan = input.required<string>();
  readonly finding = input.required<string>();

  protected readonly detail = httpResource(
    () => `${API}/orgs/${this.org()}/scans/${this.scan()}/findings/${this.finding()}`,
    { parse: parseWith(findingDetailSchema) },
  );
  protected readonly scanResource = httpResource(
    () => `${API}/orgs/${this.org()}/scans/${this.scan()}`,
    { parse: parseWith(scanSchema) },
  );
  protected readonly site = httpResource(
    () =>
      this.scanResource.hasValue()
        ? `${API}/orgs/${this.org()}/sites/${this.scanResource.value().siteId}`
        : undefined,
    { parse: parseWith(siteSchema) },
  );

  protected readonly title = computed(() =>
    this.detail.hasValue() ? (this.detail.value().title ?? this.detail.value().ruleId) : 'Défaut',
  );
  protected readonly loadError = computed(() => {
    const error = this.detail.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly paths = computed(() => ({
    sites: webPath('sites', { org: this.org() }),
    site: this.scanResource.hasValue()
      ? webPath('site', { org: this.org(), site: this.scanResource.value().siteId })
      : webPath('sites', { org: this.org() }),
    scan: webPath('scan', { org: this.org(), scan: this.scan() }),
  }));

  protected readonly impactLabel = IMPACT_LABEL;

  constructor() {
    titleFrom(() => (this.detail.hasValue() ? this.title() : null));
  }

  protected criterionTitle(titles: Readonly<Record<string, string>>, id: string): string {
    return titles[id] ?? '';
  }
}
