import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from '@jest/globals';

import { ContentText, splitInlineCode } from './content-text';
import { PreAuditNotice } from './pre-audit-notice';
import { Score, Trend } from './score';
import { chartGeometry, ScoreChart } from './score-chart';

async function render(
  component: new (...args: never[]) => unknown,
  inputs: Record<string, unknown>,
): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const text = (element: Element): string => element.textContent.replace(/\s+/g, ' ').trim();

describe('PreAuditNotice', () => {
  it('says the score comes from an automated pre-audit, and how many criteria remain to check by hand', async () => {
    const notice = text(await render(PreAuditNotice, { criteriaToCheckManually: 105 }));

    expect(notice).toContain('Pré-audit automatique.');
    expect(notice).toContain('Il ne mesure pas la conformité au RGAA.');
    expect(notice).toContain('105 critères RGAA restent à vérifier manuellement.');
  });
});

describe('Score', () => {
  it('shows a percentage and marks itself as a score', async () => {
    const score = await render(Score, { value: 0.8 });

    expect(text(score).replace(/\s/g, ' ')).toBe('80 %');
    expect(score.getAttribute('data-score')).toBe('0.8');
  });

  it('says there is no score, and is then no score for the honesty check', async () => {
    const score = await render(Score, { value: null });

    expect(text(score)).toBe('Pas de score');
    expect(score.hasAttribute('data-score')).toBe(false);
  });
});

describe('Trend', () => {
  it('gives the direction in words, the colour only adds to it', async () => {
    const trend = await render(Trend, { value: -0.04 });

    expect(text(trend)).toBe('En baisse de 4 points');
    expect(trend.classList).toContain('trend--down');
  });
});

describe('chartGeometry', () => {
  const points = [
    { date: '2026-10-01T10:00:00.000Z', score: 0 },
    { date: '2026-10-08T10:00:00.000Z', score: 0.5 },
    { date: '2026-10-15T10:00:00.000Z', score: 1 },
  ];

  it('always draws the full scale, 0 % at the bottom and 100 % at the top', () => {
    const [low, middle, high] = chartGeometry(points).points;

    expect(low?.y).toBeGreaterThan(middle?.y ?? 0);
    expect(middle?.y).toBeGreaterThan(high?.y ?? 0);
    expect(((low?.y ?? 0) + (high?.y ?? 0)) / 2).toBeCloseTo(middle?.y ?? 0);
    expect(chartGeometry(points).grid.map(({ label }) => label.replace(/\s/g, ' '))).toEqual([
      '0 %',
      '25 %',
      '50 %',
      '75 %',
      '100 %',
    ]);
  });

  it('spreads the scans evenly in time order, and labels the first and last dates', () => {
    const geometry = chartGeometry(points);
    const [first, second, third] = geometry.points;

    expect((second?.x ?? 0) - (first?.x ?? 0)).toBeCloseTo((third?.x ?? 0) - (second?.x ?? 0));
    expect(geometry.path.startsWith('M')).toBe(true);
    expect(geometry.xLabels.map(({ label }) => label)).toEqual(['01/10/2026', '15/10/2026']);
  });

  it('centres a single scan', () => {
    expect(chartGeometry(points.slice(1, 2)).xLabels).toHaveLength(1);
  });
});

describe('ScoreChart', () => {
  const points = [
    { date: '2026-10-01T10:00:00.000Z', score: 0.6 },
    { date: '2026-10-15T10:00:00.000Z', score: 0.75 },
  ];

  it('has a text summary and an equivalent table with every value', async () => {
    const chart = await render(ScoreChart, { points });
    const svg = chart.querySelector('svg');
    const rows = Array.from(chart.querySelectorAll('tbody tr'), (row) =>
      text(row).replace(/\s/g, ' '),
    );

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')?.replace(/\s/g, ' ')).toContain(
      'de 60 % le 01/10/2026 à 75 % le 15/10/2026',
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('75 %');
  });

  it('draws in the SVG namespace, so that the browser renders the points', async () => {
    const circles = (await render(ScoreChart, { points })).querySelectorAll('circle');

    expect(circles).toHaveLength(2);
    expect(circles[0]?.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
});

describe('ContentText', () => {
  it('shows the code of a correction text as code, never as HTML', async () => {
    const element = await render(ContentText, { text: 'Ajoutez `alt="<b>x</b>"` à l’image.' });

    expect(element.querySelector('code')?.textContent).toBe('alt="<b>x</b>"');
    expect(element.querySelector('b')).toBeNull();
    expect(splitInlineCode('a `b` c')).toEqual([
      { text: 'a ', code: false },
      { text: 'b', code: true },
      { text: ' c', code: false },
    ]);
  });
});
