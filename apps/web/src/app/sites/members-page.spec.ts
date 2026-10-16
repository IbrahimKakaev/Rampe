import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from '@jest/globals';
import type { Me, Role } from '@rampe/shared';

import { Session } from '../core/session';
import { MembersPage } from './members-page';

const ORG = '0192f2b0-0000-7000-8000-0000000000aa';
const ME = '0192f2b0-0000-7000-8000-000000000001';

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }
}

async function render(role: Role): Promise<{ element: HTMLElement; http: HttpTestingController }> {
  const me: Me = {
    user: { id: ME, email: 'moi@exemple.fr', name: 'Camille' },
    organizations: [{ id: ORG, name: 'Agence', role }],
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: Session,
        useValue: {
          me: () => me,
          organization: (id: string) =>
            me.organizations.find((organization) => organization.id === id),
        },
      },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(MembersPage);
  fixture.componentRef.setInput('org', ORG);
  await settle();
  http.expectOne(`/api/v1/orgs/${ORG}/members`).flush([
    {
      userId: ME,
      email: 'moi@exemple.fr',
      name: 'Camille',
      role,
      joinedAt: '2026-10-16T08:00:00.000Z',
    },
  ]);
  http.expectOne(`/api/v1/orgs/${ORG}/invitations`).flush([]);
  await settle();
  return { element: fixture.nativeElement as HTMLElement, http };
}

describe('MembersPage', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lets an owner invite, change roles and remove, each control named after its member', async () => {
    const { element } = await render('OWNER');
    const buttons = Array.from(element.querySelectorAll('button'), (button) =>
      button.textContent.replace(/\s+/g, ' ').trim(),
    );

    expect(element.textContent).toContain('(vous)');
    expect(element.querySelector('label[for^="role-"]')?.textContent.trim()).toBe(
      'Rôle de Camille',
    );
    expect(buttons).toEqual([
      'Changer le rôle de Camille',
      'Retirer Camille de l’organisation',
      'Envoyer l’invitation',
    ]);
  });

  it('shows a member the people of the organisation, without the controls', async () => {
    const { element } = await render('MEMBER');

    expect(element.querySelectorAll('button, select, input')).toHaveLength(0);
    expect(element.textContent).toContain('Seuls les propriétaires peuvent inviter');
    expect(element.textContent).toContain('Aucune invitation en attente.');
  });
});
