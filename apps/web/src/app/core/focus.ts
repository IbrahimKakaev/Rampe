import { afterNextRender, type Injector } from '@angular/core';

/**
 * Moves the focus to an element once it is rendered: a message that replaces
 * the form the focus was in, for instance. Without this, the focus would fall
 * back to the top of the document.
 */
export function focusAfterRender(injector: Injector, selector: string): void {
  afterNextRender(
    () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) {
        return;
      }
      if (!element.hasAttribute('tabindex') && element.tabIndex < 0) {
        element.tabIndex = -1;
      }
      element.focus();
    },
    { injector },
  );
}
