import { expect, type Locator, type Page } from '@playwright/test';

/** How a test person uses the page: with a mouse, or with the keyboard alone. */
export interface Driver {
  readonly name: string;
  activate(target: Locator): Promise<void>;
  fill(target: Locator, value: string): Promise<void>;
}

export function mouse(): Driver {
  return {
    name: 'à la souris',
    activate: (target) => target.click(),
    fill: (target, value) => target.fill(value),
  };
}

/**
 * Fails unless the focused element shows a visible focus indicator. The
 * application draws it as an outline; the page itself (nothing focused) and
 * headings focused by the application after a navigation are exempt, since
 * Tab never stops on them.
 */
export async function expectVisibleFocus(page: Page): Promise<void> {
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body || element.tagName === 'H1') {
      return null;
    }
    const style = getComputedStyle(element);
    return {
      element: `${element.tagName.toLowerCase()} « ${element.textContent.trim().slice(0, 40)} »`,
      visible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
    };
  });
  if (focus !== null) {
    expect(focus.visible, `focus not visible on ${focus.element}`).toBe(true);
  }
}

/**
 * Reaches every target with Tab, as a keyboard user does, checking at each
 * stop that the focus can be seen; then presses Enter or types.
 */
export function keyboard(page: Page): Driver {
  async function tabTo(target: Locator): Promise<void> {
    await expect(target).toBeVisible();
    for (let presses = 0; presses < 150; presses += 1) {
      if (await target.evaluate((element) => element === document.activeElement)) {
        return;
      }
      await page.keyboard.press('Tab');
      await expectVisibleFocus(page);
    }
    throw new Error(`${target.toString()} cannot be reached with the Tab key`);
  }
  return {
    name: 'au clavier seul',
    activate: async (target) => {
      await tabTo(target);
      await page.keyboard.press('Enter');
    },
    fill: async (target, value) => {
      await tabTo(target);
      await page.keyboard.type(value);
    },
  };
}
