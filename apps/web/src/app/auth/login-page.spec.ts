import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { LoginPage } from './login-page';

const ME = {
  user: { id: '0192f2b0-0000-7000-8000-000000000001', email: 'nom@exemple.fr', name: 'Nom' },
  organizations: [],
};

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LoginPage);
    fixture.componentRef.setInput('retour', '/organisations/x/sites');
    element = fixture.nativeElement as HTMLElement;
    document.body.append(element);
    await fixture.whenStable();
  });

  afterEach(() => {
    element.remove();
    http.verify();
  });

  function fill(name: string, value: string): void {
    const input = element.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (input !== null) {
      input.value = value;
    }
  }

  /** Lets the request and the navigation that follows it run. */
  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round += 1) {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    }
  }

  async function submit(): Promise<void> {
    element.querySelector('form')?.requestSubmit();
    await settle();
  }

  it('names what to correct, links each message to its field and focuses the first one', async () => {
    fill('email', 'pas une adresse');
    await submit();

    const email = element.querySelector('#email');
    expect(email?.getAttribute('aria-invalid')).toBe('true');
    expect(
      element.querySelector(`#${email?.getAttribute('aria-describedby') ?? ''}`)?.textContent,
    ).toContain('adresse e-mail valide');
    expect(element.querySelector('#password-erreur')?.textContent).toContain('mot de passe');
    expect(document.activeElement).toBe(email);
  });

  it('signs in, then goes back to the page that asked for it', async () => {
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fill('email', ' Nom@Exemple.fr ');
    fill('password', 'un mot de passe solide');
    await submit();

    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.body).toEqual({
      email: 'nom@exemple.fr',
      password: 'un mot de passe solide',
    });
    request.flush(ME);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/organisations/x/sites');
  });

  it('shows the reason given by the API, as an alert', async () => {
    fill('email', 'nom@exemple.fr');
    fill('password', 'faux');
    await submit();

    http
      .expectOne('/api/v1/auth/login')
      .flush(
        { statusCode: 401, message: 'Adresse e-mail ou mot de passe incorrect.' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Adresse e-mail ou mot de passe incorrect.',
    );
  });
});
