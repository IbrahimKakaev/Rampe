import { describe, expect, it } from '@jest/globals';

import { formatScore, formatTrend, scanReasonLabel, trendDirection } from './format';

describe('formatScore', () => {
  it('shows a score as a whole percentage, the French way', () => {
    expect(formatScore(0.724).replace(/\s/g, ' ')).toBe('72 %');
    expect(formatScore(1).replace(/\s/g, ' ')).toBe('100 %');
  });
});

describe('formatTrend', () => {
  it.each([
    [0.05, 'En hausse de 5 points', 'up'],
    [-0.01, 'En baisse de 1 point', 'down'],
    [0.001, 'Stable', 'flat'],
    [null, 'Pas encore de comparaison', 'flat'],
  ] as const)('says %p in words: %s', (trend, text, direction) => {
    expect(formatTrend(trend)).toBe(text);
    expect(trendDirection(trend)).toBe(direction);
  });
});

describe('scanReasonLabel', () => {
  it('explains a known reason, and says so when it does not know it', () => {
    expect(scanReasonLabel('disallowed-by-robots')).toContain('robots.txt');
    expect(scanReasonLabel('something-new')).toBe('Raison inconnue.');
    expect(scanReasonLabel(null)).toBeNull();
  });
});
