import { effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';

/** The title of a page in the browser tab: what the page is, then the application. */
export function pageTitle(subject: string): string {
  return `${subject} — Rampe`;
}

/**
 * Keeps the document title in step with data loaded by the page, such as the
 * name of a site: several tabs of Rampe stay distinguishable. Returns nothing
 * until the data is there, and the route's own title stays in the meantime.
 *
 * Must be called in an injection context, such as a component constructor.
 */
export function titleFrom(subject: () => string | null): void {
  const title = inject(Title);
  effect(() => {
    const text = subject();
    if (text !== null) {
      title.setTitle(pageTitle(text));
    }
  });
}
