import { Component, computed, input } from '@angular/core';

import { formatDateTime, formatScore, formatShortDate } from '../core/format';
import { Score } from './score';

export interface ScorePoint {
  /** When the scan finished, ISO 8601. */
  readonly date: string;
  /** Pre-audit score between 0 and 1. */
  readonly score: number;
}

const WIDTH = 640;
const HEIGHT = 240;
const MARGIN = { top: 12, right: 24, bottom: 36, left: 52 };
const GRID = [0, 0.25, 0.5, 0.75, 1];

export interface ChartGeometry {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly path: string;
  readonly grid: readonly { readonly y: number; readonly label: string }[];
  readonly xLabels: readonly {
    readonly x: number;
    readonly label: string;
    readonly anchor: string;
  }[];
}

/**
 * Places the scores in the drawing: time from left to right, evenly spaced in
 * the order of the scans; the score from 0 % at the bottom to 100 % at the top,
 * always on the full scale so that a small change does not look large.
 */
export function chartGeometry(points: readonly ScorePoint[]): ChartGeometry {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const y = (score: number): number => MARGIN.top + (1 - score) * plotHeight;
  const x = (index: number): number =>
    points.length === 1
      ? MARGIN.left + plotWidth / 2
      : MARGIN.left + (index / (points.length - 1)) * plotWidth;
  const placed = points.map((point, index) => ({ x: x(index), y: y(point.score) }));
  const first = points[0];
  const last = points.at(-1);
  const xLabels =
    first === undefined || last === undefined
      ? []
      : points.length === 1
        ? [{ x: x(0), label: formatShortDate(first.date), anchor: 'middle' }]
        : [
            { x: x(0), label: formatShortDate(first.date), anchor: 'start' },
            { x: x(points.length - 1), label: formatShortDate(last.date), anchor: 'end' },
          ];
  return {
    points: placed,
    path: placed
      .map(
        (point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
      )
      .join(' '),
    grid: GRID.map((score) => ({ y: y(score), label: formatScore(score) })),
    xLabels,
  };
}

/**
 * The evolution of the pre-audit score. The drawing has a text summary, and the
 * table under it gives every value: nothing is shown only as a picture.
 */
@Component({
  selector: 'rampe-score-chart',
  imports: [Score],
  template: `
    <figure class="chart">
      <figcaption>{{ caption() }}</figcaption>
      <svg
        role="img"
        [attr.aria-label]="summary()"
        [attr.viewBox]="viewBox"
        preserveAspectRatio="xMidYMid meet"
      >
        @for (line of geometry().grid; track line.y) {
          <line
            class="chart__grid"
            [attr.x1]="left"
            [attr.x2]="right"
            [attr.y1]="line.y"
            [attr.y2]="line.y"
          />
          <text
            class="chart__axis-label"
            [attr.x]="left - 8"
            [attr.y]="line.y + 4"
            text-anchor="end"
          >
            {{ line.label }}
          </text>
        }
        @for (label of geometry().xLabels; track label.x) {
          <text
            class="chart__axis-label"
            [attr.x]="label.x"
            [attr.y]="bottom + 24"
            [attr.text-anchor]="label.anchor"
          >
            {{ label.label }}
          </text>
        }
        @if (geometry().points.length > 1) {
          <path class="chart__line" [attr.d]="geometry().path" />
        }
        @for (point of geometry().points; track $index) {
          <circle class="chart__point" [attr.cx]="point.x" [attr.cy]="point.y" r="5" />
        }
      </svg>
    </figure>
    <table class="data-table">
      <caption>
        Données du graphique : score de pré-audit automatique par scan
      </caption>
      <thead>
        <tr>
          <th scope="col">Fin du scan</th>
          <th scope="col" class="number">Score de pré-audit automatique</th>
        </tr>
      </thead>
      <tbody>
        @for (point of points(); track point.date) {
          <tr>
            <th scope="row">
              <time [attr.datetime]="point.date">{{ dateTime(point.date) }}</time>
            </th>
            <td class="number"><rampe-score [value]="point.score" /></td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ScoreChart {
  /** The scores, oldest first. */
  readonly points = input.required<readonly ScorePoint[]>();
  readonly caption = input('Évolution du score de pré-audit automatique');

  protected readonly viewBox = `0 0 ${String(WIDTH)} ${String(HEIGHT)}`;
  protected readonly left = MARGIN.left;
  protected readonly right = WIDTH - MARGIN.right;
  protected readonly bottom = HEIGHT - MARGIN.bottom;

  protected readonly geometry = computed(() => chartGeometry(this.points()));

  protected readonly summary = computed(() => {
    const points = this.points();
    const first = points[0];
    const last = points.at(-1);
    if (first === undefined || last === undefined) {
      return 'Graphique vide : aucun scan terminé.';
    }
    const scans = `${String(points.length)} scan${points.length > 1 ? 's' : ''}`;
    return (
      `Graphique en ligne, ${scans} : de ${formatScore(first.score)} le ${formatShortDate(first.date)} ` +
      `à ${formatScore(last.score)} le ${formatShortDate(last.date)}. Toutes les valeurs sont dans le tableau qui suit.`
    );
  });

  protected dateTime(iso: string): string {
    return formatDateTime(iso);
  }
}
