import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  createInvitationRequestSchema,
  invitationSchema,
  type Member,
  memberSchema,
  type Role,
  roleSchema,
  webPath,
} from '@rampe/shared';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod/mini';

import { Announcer } from '../core/announcer';
import { API, errorMessage, parseWith } from '../core/api';
import { formatDateTime } from '../core/format';
import { FormState } from '../core/forms';
import { titleFrom } from '../core/page-title';
import { Session } from '../core/session';

const ROLE_LABEL: Readonly<Record<Role, string>> = {
  OWNER: 'Propriétaire',
  MEMBER: 'Membre',
};

/**
 * The people of an organisation and the invitations on their way. Everyone
 * sees them; owners invite, change roles and remove. The API keeps at least
 * one owner and says so when a change would leave none.
 */
@Component({
  selector: 'rampe-members-page',
  imports: [RouterLink],
  templateUrl: './members-page.html',
})
export class MembersPage {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly announcer = inject(Announcer);
  private readonly router = inject(Router);

  /** Route parameter: the organisation. */
  readonly org = input.required<string>();

  protected readonly members = httpResource(() => `${API}/orgs/${this.org()}/members`, {
    parse: parseWith(z.array(memberSchema)),
  });
  protected readonly invitations = httpResource(() => `${API}/orgs/${this.org()}/invitations`, {
    parse: parseWith(z.array(invitationSchema)),
  });

  protected readonly owner = computed(
    () => this.session.organization(this.org())?.role === 'OWNER',
  );
  protected readonly me = computed(() => this.session.me()?.user.id ?? null);
  protected readonly organizationName = computed(
    () => this.session.organization(this.org())?.name ?? '',
  );
  protected readonly loadError = computed(() => {
    const error = this.members.error() ?? this.invitations.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly paths = computed(() => ({
    sites: webPath('sites', { org: this.org() }),
  }));

  protected readonly invite = new FormState(createInvitationRequestSchema, {
    email: 'Saisissez une adresse e-mail valide, par exemple nom@exemple.fr.',
    role: 'Choisissez un rôle.',
  });
  /** One state for the changes made in the tables: the failure is shown above them. */
  protected readonly change = new FormState(z.strictObject({ role: roleSchema }), {
    role: 'Choisissez un rôle.',
  });
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly roles = ['MEMBER', 'OWNER'] as const;

  constructor() {
    titleFrom(() =>
      this.organizationName() === '' ? null : `Membres de ${this.organizationName()}`,
    );
  }

  protected dateTime(iso: string): string {
    return formatDateTime(iso);
  }

  protected async sendInvitation(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const request = this.invite.read(form);
    if (request === null) {
      return;
    }
    await this.invite.submit(async () => {
      invitationSchema.parse(
        await firstValueFrom(this.http.post(`${API}/orgs/${this.org()}/invitations`, request)),
      );
      form.reset();
      this.invitations.reload();
      this.announcer.announce(`Invitation envoyée à ${request.email}.`);
    });
  }

  protected async changeRole(event: SubmitEvent, member: Member): Promise<void> {
    event.preventDefault();
    const request = this.change.read(event.target as HTMLFormElement);
    if (request === null) {
      return;
    }
    await this.change.submit(async () => {
      memberSchema.parse(
        await firstValueFrom(
          this.http.patch(`${API}/orgs/${this.org()}/members/${member.userId}`, request),
        ),
      );
      this.members.reload();
      if (member.userId === this.me()) {
        await this.session.refresh();
      }
      this.announcer.announce(
        `${member.name} est maintenant ${ROLE_LABEL[request.role].toLowerCase()}.`,
      );
    });
  }

  protected async remove(event: SubmitEvent, member: Member): Promise<void> {
    event.preventDefault();
    await this.change.submit(async () => {
      await firstValueFrom(this.http.delete(`${API}/orgs/${this.org()}/members/${member.userId}`));
      if (member.userId === this.me()) {
        // Leaving the organisation: its pages are no longer open to the person.
        await this.session.refresh();
        await this.router.navigateByUrl(webPath('dashboard'));
        this.announcer.announce('Vous ne faites plus partie de cette organisation.');
        return;
      }
      this.members.reload();
      this.announcer.announce(`${member.name} ne fait plus partie de l’organisation.`);
    });
  }

  protected async revoke(event: SubmitEvent, id: string, email: string): Promise<void> {
    event.preventDefault();
    await this.change.submit(async () => {
      await firstValueFrom(this.http.delete(`${API}/orgs/${this.org()}/invitations/${id}`));
      this.invitations.reload();
      this.announcer.announce(`L’invitation de ${email} est annulée.`);
    });
  }
}
