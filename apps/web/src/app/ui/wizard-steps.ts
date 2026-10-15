import { Component, input } from '@angular/core';

const STEPS = ['Adresse du site', 'Preuve de propriété', 'Premier scan'] as const;

/** Where the person stands in the add-a-site wizard. */
@Component({
  selector: 'rampe-wizard-steps',
  template: `
    <ol class="steps" aria-label="Étapes de l’ajout d’un site">
      @for (step of steps; track step; let index = $index) {
        <li [attr.aria-current]="index + 1 === current() ? 'step' : null">
          {{ step }}
          @if (index + 1 < current()) {
            <span class="visually-hidden">(terminée)</span>
          }
        </li>
      }
    </ol>
  `,
})
export class WizardSteps {
  readonly current = input.required<1 | 2 | 3>();
  protected readonly steps = STEPS;
}
