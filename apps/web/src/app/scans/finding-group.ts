import { httpResource } from '@angular/common/http';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { findingsPageSchema, webPath } from '@rampe/shared';

import { API, errorMessage, parseWith } from '../core/api';
import { IMPACT_LABEL } from '../core/format';

/** The API returns at most this many defects at once. */
const PAGE_SIZE = 500;

export type Grouping = 'critere' | 'gravite' | 'page';

/** The filter of the findings endpoint that selects a group. */
const FILTER: Readonly<Record<Grouping, string>> = {
  critere: 'criterion',
  gravite: 'impact',
  page: 'pageId',
};

/**
 * One group of defects behind a disclosure button. Its defects are loaded the
 * first time it is opened: a large site can have thousands.
 */
@Component({
  selector: 'rampe-finding-group',
  imports: [RouterLink],
  template: `
    <h3>
      <button
        type="button"
        class="disclosure"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="panelId()"
        (click)="toggle()"
      >
        <span class="disclosure__icon" aria-hidden="true"></span>
        <span>{{ label() }}</span>
        <span class="disclosure__count"
          ><span class="visually-hidden">, </span>{{ count() }} défaut{{
            count() > 1 ? 's' : ''
          }}</span
        >
      </button>
    </h3>
    <div [id]="panelId()" [hidden]="!open()">
      @if (open()) {
        @if (loadError(); as message) {
          <div class="alert" role="alert">
            <p>{{ message }}</p>
          </div>
        } @else if (findings.hasValue()) {
          @let result = findings.value();
          <ul class="findings">
            @for (finding of result.items; track finding.id) {
              <li>
                <a [routerLink]="findingPath(finding.id)">{{ finding.title ?? finding.ruleId }}</a>
                <div class="finding-meta">
                  @if (finding.impact; as impact) {
                    <span [class]="'badge badge--' + impact">{{ impactLabel[impact] }}</span>
                  }
                  @if (finding.isNew) {
                    <span class="badge badge--new">Nouveau</span>
                  }
                  @if (grouping() !== 'page') {
                    <span
                      >Page <code>{{ finding.pagePath }}</code></span
                    >
                  }
                  @if (grouping() !== 'critere') {
                    <span>{{ criteria(finding.rgaa) }}</span>
                  }
                </div>
              </li>
            }
          </ul>
          @if (result.total > result.items.length) {
            <p class="muted">
              Les {{ result.items.length }} premiers défauts sur {{ result.total }} sont affichés.
            </p>
          }
        } @else {
          <p role="status">Chargement des défauts…</p>
        }
      }
    </div>
  `,
})
export class FindingGroup {
  readonly org = input.required<string>();
  readonly scan = input.required<string>();
  readonly grouping = input.required<Grouping>();
  /** The value of the group: a criterion, "none", an impact or a page id. */
  readonly groupKey = input.required<string>();
  readonly label = input.required<string>();
  readonly count = input.required<number>();

  protected readonly open = signal(false);
  protected readonly impactLabel = IMPACT_LABEL;
  protected readonly panelId = computed(() => `groupe-${this.grouping()}-${this.groupKey()}`);

  protected readonly findings = httpResource(
    () => {
      if (!this.open()) {
        return undefined;
      }
      const query = new URLSearchParams({
        [FILTER[this.grouping()]]: this.groupKey(),
        limit: String(PAGE_SIZE),
      });
      return `${API}/orgs/${this.org()}/scans/${this.scan()}/findings?${query.toString()}`;
    },
    { parse: parseWith(findingsPageSchema) },
  );
  protected readonly loadError = computed(() => {
    const error = this.findings.error();
    return error === undefined ? null : errorMessage(error);
  });

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected findingPath(finding: string): string {
    return webPath('finding', { org: this.org(), scan: this.scan(), finding });
  }

  protected criteria(rgaa: { criteria: readonly string[]; uncertain: readonly string[] }): string {
    if (rgaa.criteria.length > 0) {
      return `Critère${rgaa.criteria.length > 1 ? 's' : ''} RGAA ${rgaa.criteria.join(', ')}`;
    }
    return rgaa.uncertain.length > 0
      ? `Critère RGAA à confirmer : ${rgaa.uncertain.join(', ')}`
      : 'Sans critère RGAA confirmé';
  }
}
