import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let element: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
    document.body.append(element);
  });

  it('exposes the page landmarks', () => {
    expect(element.querySelector('header')).not.toBeNull();
    expect(element.querySelectorAll('main')).toHaveLength(1);
    expect(element.querySelector('footer')).not.toBeNull();
  });

  it('offers a skip link as the first focusable element', () => {
    const first = element.querySelector('a, button, input, select, textarea, [tabindex]');

    expect(first?.textContent).toBe('Aller au contenu');
  });

  it('moves focus to the main content when the skip link is used, without navigating', () => {
    const skipLink = element.querySelector<HTMLAnchorElement>('.skip-link');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });

    skipLink?.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(element.querySelector('main'));
  });

  it('never claims conformity on the strength of automated tests', () => {
    const footer = element.querySelector('footer')?.textContent ?? '';

    expect(footer).toContain('pré-audit automatique');
    expect(footer).toContain('ne prouve jamais la conformité');
  });
});
