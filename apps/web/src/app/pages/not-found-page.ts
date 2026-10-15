import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { webPath } from '@rampe/shared';

@Component({
  selector: 'rampe-not-found-page',
  imports: [RouterLink],
  template: `
    <h1>Page introuvable</h1>
    <p>
      Cette adresse ne correspond à aucune page de Rampe. Vérifiez-la, ou repartez de l’accueil.
    </p>
    <p><a [routerLink]="home">Aller à l’accueil</a></p>
  `,
})
export class NotFoundPage {
  protected readonly home = webPath('home');
}
