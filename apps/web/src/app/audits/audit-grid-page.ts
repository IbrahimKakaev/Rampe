import { httpResource } from '@angular/common/http';
import { Component, computed, inject, Injector, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  auditSchema,
  type CriterionEvaluation,
  criterionEvaluationSchema,
  webPath,
} from '@rampe/shared';
import * as z from 'zod/mini';

import { Announcer } from '../core/announcer';
import { API, errorMessage, parseWith } from '../core/api';
import { focusAfterRender } from '../core/focus';
import { titleFrom } from '../core/page-title';
import { CriterionForm } from './criterion-form';

/**
 * The grid of the 106 RGAA criteria on one page of the sample, one theme at a
 * time. Usable with the keyboard alone: each criterion is a form, its status
 * a group of radio buttons, saved by its own button.
 */
@Component({
  selector: 'rampe-audit-grid-page',
  imports: [RouterLink, CriterionForm],
  templateUrl: './audit-grid-page.html',
})
export class AuditGridPage {
  private readonly announcer = inject(Announcer);
  private readonly injector = inject(Injector);

  /** Route parameters. */
  readonly org = input.required<string>();
  readonly audit = input.required<string>();
  readonly page = input.required<string>();

  protected readonly auditResource = httpResource(
    () => `${API}/orgs/${this.org()}/audits/${this.audit()}`,
    { parse: parseWith(auditSchema) },
  );
  protected readonly criteria = httpResource(
    () => `${API}/orgs/${this.org()}/audits/${this.audit()}/pages/${this.page()}/criteria`,
    { parse: parseWith(z.array(criterionEvaluationSchema)) },
  );

  protected readonly theme = signal(1);
  protected readonly onlyRemaining = signal(false);

  protected readonly samplePage = computed(() =>
    this.auditResource.hasValue()
      ? this.auditResource.value().pages.find((page) => page.id === this.page())
      : undefined,
  );
  protected readonly neighbours = computed(() => {
    const pages = this.auditResource.hasValue() ? this.auditResource.value().pages : [];
    const index = pages.findIndex((page) => page.id === this.page());
    return { previous: pages[index - 1], next: pages[index + 1] };
  });
  protected readonly themes = computed(() => {
    const rows = this.criteria.hasValue() ? this.criteria.value() : [];
    const themes = new Map<number, { number: number; title: string; remaining: number }>();
    for (const row of rows) {
      const theme = themes.get(row.theme) ?? {
        number: row.theme,
        title: row.themeTitle,
        remaining: 0,
      };
      theme.remaining += row.status === null ? 1 : 0;
      themes.set(row.theme, theme);
    }
    return [...themes.values()];
  });
  protected readonly shown = computed(() =>
    (this.criteria.hasValue() ? this.criteria.value() : []).filter(
      (row) => row.theme === this.theme() && (!this.onlyRemaining() || row.status === null),
    ),
  );
  protected readonly evaluated = computed(
    () =>
      (this.criteria.hasValue() ? this.criteria.value() : []).filter((row) => row.status !== null)
        .length,
  );
  protected readonly evaluatedText = computed(() => {
    const total = this.criteria.hasValue() ? this.criteria.value().length : 0;
    const count = this.evaluated();
    return `${String(count)} critère${count > 1 ? 's' : ''} évalué${count > 1 ? 's' : ''} sur ${String(total)}`;
  });
  protected readonly currentTheme = computed(() =>
    this.themes().find((theme) => theme.number === this.theme()),
  );
  protected readonly loadError = computed(() => {
    const error = this.criteria.error() ?? this.auditResource.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly paths = computed(() => ({
    sites: webPath('sites', { org: this.org() }),
    audit: webPath('audit', { org: this.org(), audit: this.audit() }),
  }));

  constructor() {
    titleFrom(() => {
      const page = this.samplePage();
      return page === undefined ? null : `Grille RGAA de la page ${page.title}`;
    });
  }

  protected pagePath(page: string): string {
    return webPath('auditPage', { org: this.org(), audit: this.audit(), page });
  }

  protected chooseTheme(theme: number): void {
    this.theme.set(theme);
  }

  protected toggleRemaining(event: Event): void {
    this.onlyRemaining.set((event.target as HTMLInputElement).checked);
  }

  /** Keeps the grid and the progress of the sample in step with a saved criterion. */
  protected recorded(saved: CriterionEvaluation): void {
    this.criteria.update((rows) =>
      rows?.map((row) => (row.criterion === saved.criterion ? saved : row)),
    );
    this.auditResource.reload();
    // With the filter on, the saved criterion leaves the list and its form with it.
    if (this.onlyRemaining() && saved.status !== null) {
      this.announcer.announce(`Critère ${saved.criterion} enregistré.`);
      focusAfterRender(this.injector, '#thematique-courante');
    }
  }
}
