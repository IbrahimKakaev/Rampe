import { effect } from '@angular/core';

/**
 * Reloads a resource every `intervalMs` for as long as `active()` is true, to
 * follow a scan in progress. The timer stops as soon as `active()` turns false,
 * and when the component is destroyed.
 *
 * Must be called in an injection context, such as a component field.
 */
export function reloadWhile(
  active: () => boolean,
  resource: { reload(): boolean },
  intervalMs = 3000,
): void {
  effect((onCleanup) => {
    if (!active()) {
      return;
    }
    // An interval, not a timeout: `active()` keeps the same value from one
    // reload to the next, so this effect does not run again to rearm a timer.
    const timer = setInterval(() => {
      resource.reload();
    }, intervalMs);
    onCleanup(() => {
      clearInterval(timer);
    });
  });
}
