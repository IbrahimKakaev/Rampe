import { expect, test } from '@playwright/test';
import { fingerprintsOfPage } from '@rampe/rules';
import type { AnalyzedPage } from '@rampe/shared';

import { scan } from './support/compose.js';

/**
 * The same address of the test site in three states. Between states 1 and 2
 * the page changes around the defect: content added before it, a new image
 * before it in the same container, a regenerated class name. In state 3 the
 * defect itself moves to another element.
 */
async function fingerprintsInState(state: number): Promise<string[]> {
  const report = await scan(`http://fixture-site/variantes/image.html?etat=${String(state)}`, [
    '--max-pages',
    '1',
  ]);
  const [page] = report.pages;
  expect(page?.status).toBe('analyzed');
  const analyzed = page as AnalyzedPage;
  return fingerprintsOfPage(
    analyzed.url,
    analyzed.violations.flatMap((violation) =>
      violation.nodes.map((node) => ({ ruleId: violation.ruleId, selector: node.selector })),
    ),
  );
}

test.describe('defect fingerprints on a real page', () => {
  test.describe.configure({ timeout: 2 * 60_000 });

  test('stay the same when the page changes around the defect, and change when the defect does', async () => {
    const first = await fingerprintsInState(1);
    const second = await fingerprintsInState(2);
    const third = await fingerprintsInState(3);

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(third).toHaveLength(1);
    expect(third).not.toEqual(first);
  });
});
