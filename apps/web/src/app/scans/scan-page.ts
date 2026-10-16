import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  findingsSummarySchema,
  scanComparisonSchema,
  scanPageSchema,
  scanSchema,
  siteSchema,
  webPath,
} from '@rampe/shared';
import * as z from 'zod/mini';

import { Announcer } from '../core/announcer';
import { API, errorMessage, parseWith } from '../core/api';
import {
  formatDateTime,
  formatScore,
  isScanActive,
  PAGE_ERROR_LABEL,
  SCAN_STATUS_LABEL,
  scanReasonLabel,
} from '../core/format';
import { reloadWhile } from '../core/polling';
import { titleFrom } from '../core/page-title';
import { PreAuditNotice } from '../ui/pre-audit-notice';
import { Score } from '../ui/score';
import { FindingGroup, type Grouping } from './finding-group';

const GROUPINGS: readonly { readonly value: Grouping; readonly label: string }[] = [
  { value: 'critere', label: 'Critère RGAA' },
  { value: 'gravite', label: 'Gravité' },
  { value: 'page', label: 'Page' },
];

@Component({
  selector: 'rampe-scan-page',
  imports: [RouterLink, FindingGroup, PreAuditNotice, Score],
  templateUrl: './scan-page.html',
})
export class ScanPage {
  private readonly router = inject(Router);
  private readonly announcer = inject(Announcer);

  /** Route parameters. */
  readonly org = input.required<string>();
  readonly scan = input.required<string>();
  /** Query parameter `groupe`: how the defects are grouped. */
  readonly groupe = input<string>();

  protected readonly scanResource = httpResource(
    () => `${API}/orgs/${this.org()}/scans/${this.scan()}`,
    { parse: parseWith(scanSchema) },
  );
  protected readonly pages = httpResource(
    () => `${API}/orgs/${this.org()}/scans/${this.scan()}/pages`,
    { parse: parseWith(z.array(scanPageSchema)) },
  );
  protected readonly site = httpResource(
    () =>
      this.scanResource.hasValue()
        ? `${API}/orgs/${this.org()}/sites/${this.scanResource.value().siteId}`
        : undefined,
    { parse: parseWith(siteSchema) },
  );
  /** Loaded once the scan is over: until then, its defects are still coming in. */
  protected readonly summary = httpResource(
    () =>
      this.finished()
        ? `${API}/orgs/${this.org()}/scans/${this.scan()}/findings/summary`
        : undefined,
    { parse: parseWith(findingsSummarySchema) },
  );

  protected readonly comparison = httpResource(
    () => (this.finished() ? `${API}/orgs/${this.org()}/scans/${this.scan()}/diff` : undefined),
    { parse: parseWith(scanComparisonSchema) },
  );
  protected readonly reportPath = computed(
    () => `${API}/orgs/${this.org()}/scans/${this.scan()}/report.pdf`,
  );
  /** Defects listed at most in each list of the comparison. */
  protected readonly listLimit = 50;
  protected readonly comparisonSummary = computed(() => {
    if (!this.comparison.hasValue()) {
      return '';
    }
    const { added, fixed, unchanged, notCompared } = this.comparison.value();
    const count = (value: number, one: string, many: string): string =>
      `${String(value)} ${value > 1 ? many : one}`;
    return (
      `${count(added.length, 'nouveau défaut', 'nouveaux défauts')}, ` +
      `${count(fixed.length, 'défaut corrigé', 'défauts corrigés')} et ` +
      `${count(unchanged, 'défaut inchangé', 'défauts inchangés')}, sur les pages analysées dans les deux scans.` +
      (notCompared > 0
        ? ` ${count(notCompared, 'défaut n’est pas comparé', 'défauts ne sont pas comparés')} : leur page n’a pas été analysée dans l’un des deux scans.`
        : '')
    );
  });

  protected readonly active = computed(
    () => this.scanResource.hasValue() && isScanActive(this.scanResource.value().status),
  );
  protected readonly finished = computed(
    () => this.scanResource.hasValue() && !isScanActive(this.scanResource.value().status),
  );
  protected readonly grouping = computed<Grouping>(() => {
    const value = this.groupe();
    return value === 'gravite' || value === 'page' ? value : 'critere';
  });
  protected readonly groups = computed(() => {
    if (!this.summary.hasValue()) {
      return [];
    }
    const summary = this.summary.value();
    switch (this.grouping()) {
      case 'gravite':
        return summary.byImpact;
      case 'page':
        return summary.byPage;
      case 'critere':
        return [
          ...summary.byCriterion,
          ...(summary.withoutCriterion > 0
            ? [
                {
                  key: 'none',
                  label: 'Sans critère RGAA confirmé',
                  count: summary.withoutCriterion,
                },
              ]
            : []),
        ];
    }
  });
  protected readonly findingCount = computed(() =>
    this.summary.hasValue()
      ? this.summary.value().byImpact.reduce((sum, group) => sum + group.count, 0)
      : 0,
  );
  protected readonly loadError = computed(() => {
    const error = this.scanResource.error() ?? this.pages.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly paths = computed(() => ({
    sites: webPath('sites', { org: this.org() }),
    site: this.scanResource.hasValue()
      ? webPath('site', { org: this.org(), site: this.scanResource.value().siteId })
      : webPath('sites', { org: this.org() }),
  }));

  protected readonly groupings = GROUPINGS;
  protected readonly statusLabel = SCAN_STATUS_LABEL;
  protected readonly pageErrorLabel = PAGE_ERROR_LABEL;

  constructor() {
    titleFrom(() =>
      this.site.hasValue() ? `Résultats du scan de ${this.site.value().host}` : null,
    );
    let wasActive = false;
    reloadWhile(
      () => {
        const active = this.active();
        if (wasActive && !active && this.scanResource.hasValue()) {
          const { status, score } = this.scanResource.value();
          this.announcer.announce(
            `Scan ${SCAN_STATUS_LABEL[status].toLowerCase()}.` +
              (score === null ? '' : ` Score de pré-audit automatique : ${formatScore(score)}.`),
          );
          this.pages.reload();
        }
        wasActive = active;
        return active;
      },
      {
        reload: () => {
          this.pages.reload();
          return this.scanResource.reload();
        },
      },
    );
  }

  protected reason(reason: string | null): string | null {
    return scanReasonLabel(reason);
  }

  protected dateTime(iso: string): string {
    return formatDateTime(iso);
  }

  protected chooseGrouping(value: Grouping): void {
    void this.router.navigate([], {
      queryParams: { groupe: value === 'critere' ? null : value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
