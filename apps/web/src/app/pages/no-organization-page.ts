import { Component } from '@angular/core';

/**
 * Shown by "My sites" to someone who belongs to no organisation any more:
 * everyone else is sent straight to the sites of their first organisation.
 */
@Component({
  selector: 'rampe-no-organization-page',
  template: `
    <h1>Mes sites</h1>
    <p class="prose">
      Vous ne faites partie d’aucune organisation. Demandez à une personne de votre organisation de
      vous inviter : vous recevrez un lien par e-mail.
    </p>
  `,
})
export class NoOrganizationPage {}
