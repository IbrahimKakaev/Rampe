import { Component, effect, ElementRef, inject, input } from '@angular/core';

export interface TextPart {
  readonly text: string;
  readonly code: boolean;
}

/**
 * Splits a text of the corrections content into plain parts and code parts:
 * the content marks code between backquotes, as in `alt="…"`.
 */
export function splitInlineCode(text: string): TextPart[] {
  return text
    .split('`')
    .map((part, index) => ({ text: part, code: index % 2 === 1 }))
    .filter((part) => part.text !== '');
}

/**
 * Shows a text of the corrections content, its code in `<code>`. Built from
 * text nodes only: the content is never interpreted as HTML. The nodes are
 * created here rather than in a template, where the formatting of the
 * template would add spaces around the code.
 */
@Component({
  selector: 'rampe-content-text',
  template: '',
})
export class ContentText {
  readonly text = input.required<string>();

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect(() => {
      host.replaceChildren(
        ...splitInlineCode(this.text()).map(({ text, code }) => {
          if (!code) {
            return document.createTextNode(text);
          }
          const element = document.createElement('code');
          element.textContent = text;
          return element;
        }),
      );
    });
  }
}
