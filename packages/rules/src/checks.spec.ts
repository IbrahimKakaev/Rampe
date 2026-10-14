import { describe, expect, it } from '@jest/globals';

import { checksOfPage, checksOfPages } from './checks.js';

describe('checksOfPage', () => {
  it('counts one check per rule on the page', () => {
    expect(
      checksOfPage({
        passed: ['document-title', 'html-has-lang'],
        incomplete: ['color-contrast'],
        violations: [{ ruleId: 'image-alt' }],
      }),
    ).toEqual({ passed: 2, failed: 1, incomplete: 1 });
  });

  it('lets a defect win over a pass and a doubt for the same rule', () => {
    expect(
      checksOfPage({
        passed: ['image-alt', 'color-contrast', 'label'],
        incomplete: ['image-alt', 'color-contrast'],
        violations: [{ ruleId: 'image-alt' }, { ruleId: 'image-alt' }],
      }),
    ).toEqual({ passed: 1, failed: 1, incomplete: 1 });
  });
});

describe('checksOfPages', () => {
  it('adds up the checks of every page', () => {
    expect(
      checksOfPages([
        { passed: ['a', 'b'], incomplete: [], violations: [{ ruleId: 'c' }] },
        { passed: ['a'], incomplete: ['b'], violations: [] },
      ]),
    ).toEqual({ passed: 3, failed: 1, incomplete: 1 });
  });

  it('counts nothing for no page', () => {
    expect(checksOfPages([])).toEqual({ passed: 0, failed: 0, incomplete: 0 });
  });
});
