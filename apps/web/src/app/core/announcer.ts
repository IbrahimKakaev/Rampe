import { Injectable, signal } from '@angular/core';

/**
 * Says something to screen reader users without moving their focus, through
 * a single polite live region in the application shell. Used for changes that
 * happen on their own, such as a scan that finishes.
 */
@Injectable({ providedIn: 'root' })
export class Announcer {
  private readonly text = signal('');

  readonly message = this.text.asReadonly();

  announce(message: string): void {
    // Clearing first makes a repeated message be announced again.
    this.text.set('');
    queueMicrotask(() => {
      this.text.set(message);
    });
  }
}
