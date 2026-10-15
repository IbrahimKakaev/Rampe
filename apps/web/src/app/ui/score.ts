import { Component, computed, input } from '@angular/core';

import { formatScore, formatTrend, trendDirection } from '../core/format';

/**
 * A pre-audit score. The only way the application displays one, so that the
 * end-to-end tests can find every score (`data-score`) and check that the
 * pre-audit notice is on the same page.
 */
@Component({
  selector: 'rampe-score',
  host: {
    class: 'score',
    '[class.score--large]': 'large()',
    '[class.muted]': 'value() === null',
    '[attr.data-score]': 'value() === null ? null : value()',
  },
  template: `{{ text() }}`,
})
export class Score {
  readonly value = input.required<number | null>();
  readonly large = input(false);

  protected readonly text = computed(() => {
    const value = this.value();
    return value === null ? 'Pas de score' : formatScore(value);
  });
}

/** The change of the score since the scan before, in words; the colour only adds to them. */
@Component({
  selector: 'rampe-trend',
  host: { '[class]': '"trend trend--" + direction()' },
  template: `{{ text() }}`,
})
export class Trend {
  readonly value = input.required<number | null>();

  protected readonly text = computed(() => formatTrend(this.value()));
  protected readonly direction = computed(() => trendDirection(this.value()));
}
