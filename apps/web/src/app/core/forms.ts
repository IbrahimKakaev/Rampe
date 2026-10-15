import { afterNextRender, inject, Injector, signal } from '@angular/core';
import type * as z from 'zod/mini';

import { errorMessage } from './api';

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

/**
 * The state of a form whose fields are read on submit. The values are checked
 * with the schema the API applies, so a request the API would refuse is not
 * sent. Each invalid field gets its own message, written for the person, and
 * the first one receives the focus.
 *
 * Must be created in an injection context, such as a component field.
 */
export class FormState<Output, Field extends string> {
  readonly errors = signal<FieldErrors<Field>>({});
  /** Why the request failed, as the API or the network explains it. */
  readonly failure = signal<string | null>(null);
  readonly pending = signal(false);

  private readonly injector = inject(Injector);

  /**
   * @param messages The message of each field, in the order of the form: the
   *   first invalid field in this order receives the focus.
   */
  constructor(
    private readonly schema: z.ZodMiniType<Output>,
    private readonly messages: Readonly<Record<Field, string>>,
  ) {}

  /** The validated values of the form, or null after showing what to correct. */
  read(form: HTMLFormElement): Output | null {
    const values = Object.fromEntries(
      [...new FormData(form)].map(([name, value]) => [
        name,
        typeof value === 'string' ? value : '',
      ]),
    );
    const result = this.schema.safeParse(values);
    if (result.success) {
      this.errors.set({});
      return result.data;
    }
    const invalid = new Set(result.error.issues.map((issue) => issue.path[0]));
    const fields = (Object.keys(this.messages) as Field[]).filter((field) => invalid.has(field));
    this.errors.set(
      Object.fromEntries(
        fields.map((field) => [field, this.messages[field]]),
      ) as FieldErrors<Field>,
    );
    const [first] = fields;
    if (first !== undefined) {
      // After rendering, so that the field is announced with its error message.
      afterNextRender(
        () => {
          focusField(form, first);
        },
        { injector: this.injector },
      );
    }
    return null;
  }

  /** Runs the request once at a time, and keeps the reason if it fails. */
  async submit(request: () => Promise<void>): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await request();
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

function focusField(form: HTMLFormElement, name: string): void {
  const field = form.elements.namedItem(name);
  const element = field instanceof RadioNodeList ? field[0] : field;
  if (element instanceof HTMLElement) {
    element.focus();
  }
}
