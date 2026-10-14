import { RGAA_4_1_2 } from './data/rgaa-4.1.2.generated.js';
import type { RgaaCriterion, RgaaReferential } from './types.js';

/** The RGAA version Rampe evaluates against. Scans and audits record it. */
export const CURRENT_REFERENTIAL: RgaaReferential = RGAA_4_1_2;

const criteriaById = new Map(
  CURRENT_REFERENTIAL.criteria.map((criterion) => [criterion.id, criterion]),
);

export function criterionById(id: string): RgaaCriterion | undefined {
  return criteriaById.get(id);
}

/** Orders criterion or test numbers as the RGAA does: 1.2 before 1.10. */
export function compareRgaaIds(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}
