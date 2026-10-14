import { describe, expect, it } from '@jest/globals';

import { type AuditStatus, conformity } from './conformity.js';

const CRITERIA = ['1.1', '1.2', '3.2', '8.5'];
const PAGES = ['accueil', 'contact'];

function grid(rows: Record<string, AuditStatus[]>): Record<string, Record<string, AuditStatus>> {
  return Object.fromEntries(
    Object.entries(rows).map(([page, statuses]) => [
      page,
      Object.fromEntries(statuses.map((status, index) => [CRITERIA[index] ?? '', status])),
    ]),
  );
}

describe('conformity', () => {
  it('follows the official method on an example worked out by hand', () => {
    // 1.1 is met everywhere: validated. 1.2 never applies: not applicable.
    // 3.2 fails on the home page and 8.5 on the contact page: both invalidated.
    // Rate: 1 validated / 3 applicable. Each page: 2 met / 3 applicable.
    const result = conformity(
      CRITERIA,
      PAGES,
      grid({ accueil: ['C', 'NA', 'NC', 'C'], contact: ['C', 'NA', 'C', 'NC'] }),
    );

    expect(result).toEqual({
      evaluated: 8,
      expected: 8,
      complete: true,
      validated: 1,
      invalidated: 2,
      notApplicable: 1,
      rate: 1 / 3,
      averageRate: 2 / 3,
      state: 'none',
    });
  });

  it('is total when every applicable criterion is met', () => {
    const result = conformity(
      CRITERIA,
      PAGES,
      grid({ accueil: ['C', 'NA', 'C', 'C'], contact: ['C', 'C', 'NA', 'C'] }),
    );

    expect(result).toMatchObject({
      rate: 1,
      averageRate: 1,
      state: 'total',
      validated: 4,
      notApplicable: 0,
    });
  });

  it('is partial from exactly 50 %', () => {
    // Validated: 1.1, 1.2. Invalidated: 3.2, 8.5.
    const result = conformity(
      CRITERIA,
      PAGES,
      grid({ accueil: ['C', 'C', 'NC', 'NC'], contact: ['C', 'NA', 'C', 'C'] }),
    );

    expect(result).toMatchObject({ rate: 0.5, state: 'partial' });
    // Home page: 2 of 4; contact page: 3 of 3.
    expect(result.averageRate).toBeCloseTo((0.5 + 1) / 2);
  });

  it('gives no rate while a single evaluation is missing', () => {
    const results = grid({ accueil: ['C', 'NA', 'C', 'C'], contact: ['C', 'NA', 'C', 'C'] });
    delete results['contact']?.['8.5'];

    expect(conformity(CRITERIA, PAGES, results)).toEqual({
      evaluated: 7,
      expected: 8,
      complete: false,
      validated: 0,
      invalidated: 0,
      notApplicable: 0,
      rate: null,
      averageRate: null,
      state: null,
    });
  });

  it('gives no rate when no criterion applies: that would prove nothing', () => {
    const result = conformity(
      CRITERIA,
      PAGES,
      grid({ accueil: ['NA', 'NA', 'NA', 'NA'], contact: ['NA', 'NA', 'NA', 'NA'] }),
    );

    expect(result).toMatchObject({
      complete: true,
      notApplicable: 4,
      rate: null,
      averageRate: null,
      state: null,
    });
  });

  it('leaves out of the average a page where nothing applies', () => {
    const result = conformity(
      CRITERIA,
      PAGES,
      grid({ accueil: ['C', 'NC', 'NA', 'NA'], contact: ['NA', 'NA', 'NA', 'NA'] }),
    );

    expect(result).toMatchObject({ rate: 0.5, averageRate: 0.5 });
  });

  it('is never complete without pages', () => {
    expect(conformity(CRITERIA, [], {})).toMatchObject({
      expected: 0,
      complete: false,
      rate: null,
    });
  });
});
