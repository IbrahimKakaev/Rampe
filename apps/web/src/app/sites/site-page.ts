import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  SCAN_MAX_PAGES_LIMIT,
  scanScheduleSchema,
  scanSchema,
  siteSchema,
  webPath,
} from '@rampe/shared';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod/mini';

import { Announcer } from '../core/announcer';
import { API, errorMessage, parseWith } from '../core/api';
import { formatDateTime, isScanActive, SCAN_STATUS_LABEL } from '../core/format';
import { FormState } from '../core/forms';
import { titleFrom } from '../core/page-title';
import { reloadWhile } from '../core/polling';
import { PreAuditNotice } from '../ui/pre-audit-notice';
import { Score } from '../ui/score';
import { ScoreChart, type ScorePoint } from '../ui/score-chart';

const METHOD_LABEL = { DNS: 'par un enregistrement DNS', FILE: 'par un fichier' } as const;

const SCHEDULES = [
  { value: 'NONE', label: 'Aucun : seulement à la demande' },
  { value: 'DAILY', label: 'Chaque jour' },
  { value: 'WEEKLY', label: 'Chaque semaine' },
] as const;

/**
 * The settings as typed: the page limit is a whole number within the bounds
 * the API accepts, the schedule one of its values.
 */
const limitsSchema = z.strictObject({
  schedule: scanScheduleSchema,
  maxPages: z.pipe(
    z.string().check(z.trim(), z.regex(/^\d{1,3}$/)),
    z.pipe(
      z.transform((value: string) => Number(value)),
      z.number().check(z.gte(1), z.lte(SCAN_MAX_PAGES_LIMIT)),
    ),
  ),
});

@Component({
  selector: 'rampe-site-page',
  imports: [RouterLink, PreAuditNotice, Score, ScoreChart],
  templateUrl: './site-page.html',
})
export class SitePage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly announcer = inject(Announcer);

  /** Route parameters. */
  readonly org = input.required<string>();
  readonly site = input.required<string>();

  protected readonly siteResource = httpResource(
    () => `${API}/orgs/${this.org()}/sites/${this.site()}`,
    { parse: parseWith(siteSchema) },
  );
  protected readonly scans = httpResource(
    () => `${API}/orgs/${this.org()}/sites/${this.site()}/scans`,
    { parse: parseWith(z.array(scanSchema)) },
  );

  /** The scan in progress, if any: the page follows it until it ends. */
  protected readonly activeScan = computed(() =>
    this.scans.hasValue()
      ? this.scans.value().find((scan) => isScanActive(scan.status))
      : undefined,
  );
  /** Finished scans with a score, oldest first, for the chart. */
  protected readonly scorePoints = computed<ScorePoint[]>(() =>
    (this.scans.hasValue() ? this.scans.value() : [])
      .flatMap((scan) =>
        scan.score !== null && scan.finishedAt !== null
          ? [{ date: scan.finishedAt, score: scan.score }]
          : [],
      )
      .reverse(),
  );
  protected readonly criteriaToCheckManually = computed(
    () => (this.scans.hasValue() ? this.scans.value()[0]?.criteriaToCheckManually : undefined) ?? 0,
  );
  protected readonly loadError = computed(() => {
    const error = this.siteResource.error() ?? this.scans.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly paths = computed(() => ({
    sites: webPath('sites', { org: this.org() }),
    verification: webPath('siteVerification', { org: this.org(), site: this.site() }),
  }));

  protected readonly start = new FormState(z.strictObject({}), {});
  protected readonly limits = new FormState(limitsSchema, {
    schedule: 'Choisissez la fréquence des scans.',
    maxPages: `Saisissez un nombre entier de 1 à ${String(SCAN_MAX_PAGES_LIMIT)}.`,
  });
  protected readonly limitsSaved = signal(false);

  protected readonly statusLabel = SCAN_STATUS_LABEL;
  protected readonly methodLabel = METHOD_LABEL;
  protected readonly maxPagesLimit = SCAN_MAX_PAGES_LIMIT;
  protected readonly schedules = SCHEDULES;

  constructor() {
    titleFrom(() => (this.siteResource.hasValue() ? this.siteResource.value().host : null));
    let wasActive = false;
    reloadWhile(() => {
      const active = this.activeScan() !== undefined;
      if (wasActive && !active) {
        this.announcer.announce('Le scan est terminé.');
        this.siteResource.reload();
      }
      wasActive = active;
      return active;
    }, this.scans);
  }

  protected scanPath(scan: string): string {
    return webPath('scan', { org: this.org(), scan });
  }

  protected dateTime(iso: string): string {
    return formatDateTime(iso);
  }

  protected async startScan(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.start.submit(async () => {
      const scan = scanSchema.parse(
        await firstValueFrom(
          this.http.post(`${API}/orgs/${this.org()}/sites/${this.site()}/scans`, null),
        ),
      );
      await this.router.navigateByUrl(this.scanPath(scan.id));
    });
  }

  protected async saveLimits(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.limitsSaved.set(false);
    const changes = this.limits.read(event.target as HTMLFormElement);
    if (changes === null) {
      return;
    }
    await this.limits.submit(async () => {
      const site = siteSchema.parse(
        await firstValueFrom(
          this.http.patch(`${API}/orgs/${this.org()}/sites/${this.site()}`, changes),
        ),
      );
      this.siteResource.set(site);
      this.limitsSaved.set(true);
    });
  }
}
