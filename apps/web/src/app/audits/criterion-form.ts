import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { type CriterionEvaluation, criterionEvaluationSchema } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod/mini';

import { API } from '../core/api';
import { FormState } from '../core/forms';

const STATUSES = [
  { value: 'C', label: 'Conforme' },
  { value: 'NC', label: 'Non conforme' },
  { value: 'NA', label: 'Non applicable' },
  { value: '', label: 'Non évalué' },
] as const;

const STATUS_TEXT: Readonly<Record<string, string>> = {
  C: 'conforme',
  NC: 'non conforme',
  NA: 'non applicable',
};

const AUTOMATION_TEXT: Readonly<Record<CriterionEvaluation['automation'], string>> = {
  automatable: 'Automatisable',
  partial: 'Partiellement automatisable',
  manual: 'Manuel',
};

const evaluationFormSchema = z.strictObject({
  status: z.enum(['C', 'NC', 'NA', '']),
  note: z.string().check(z.trim(), z.maxLength(2000)),
});

/**
 * One criterion of the grid on one page: its status, a note, and what the
 * automated results propose. A form of its own, saved by its own button: the
 * status is never recorded while the auditor moves through the options with
 * the arrow keys.
 */
@Component({
  selector: 'rampe-criterion-form',
  template: `
    <form class="criterion" novalidate [attr.aria-labelledby]="id('titre')" (submit)="save($event)">
      <h3 [id]="id('titre')">Critère {{ row().criterion }} : {{ row().title }}</h3>
      <p class="criterion__meta">
        {{ automation() }}. Statut actuel : <strong>{{ current() }}</strong>
      </p>
      @if (proposalText(); as proposal) {
        <p class="proposal">{{ proposal }}</p>
      }
      @if (form.failure(); as failure) {
        <div class="alert" role="alert">
          <p>{{ failure }}</p>
        </div>
      }
      <fieldset class="criterion__statuses">
        <legend>Statut du critère {{ row().criterion }}</legend>
        @for (option of statuses; track option.value) {
          <div class="choice">
            <input
              type="radio"
              name="status"
              [id]="id(option.value === '' ? 'aucun' : option.value)"
              [value]="option.value"
              [checked]="(row().status ?? '') === option.value"
            />
            <label [for]="id(option.value === '' ? 'aucun' : option.value)">{{
              option.label
            }}</label>
          </div>
        }
      </fieldset>
      <div class="field">
        <label [for]="id('note')">Note sur le critère {{ row().criterion }}</label>
        <textarea
          [id]="id('note')"
          name="note"
          rows="2"
          [value]="row().note ?? ''"
          [attr.aria-invalid]="form.errors().note ? true : null"
          [attr.aria-describedby]="form.errors().note ? id('note-erreur') : null"
        ></textarea>
        @if (form.errors().note; as message) {
          <p [id]="id('note-erreur')" class="field-error">{{ message }}</p>
        }
      </div>
      <div class="actions">
        <button
          type="submit"
          class="button button--secondary"
          [attr.aria-disabled]="form.pending() ? true : null"
        >
          Enregistrer le critère {{ row().criterion }}
        </button>
        <span role="status">
          @if (saved()) {
            Critère {{ row().criterion }} enregistré.
          }
        </span>
      </div>
    </form>
  `,
})
export class CriterionForm {
  private readonly http = inject(HttpClient);

  readonly org = input.required<string>();
  readonly audit = input.required<string>();
  readonly page = input.required<string>();
  readonly row = input.required<CriterionEvaluation>();
  /** The criterion as recorded, after a save. */
  readonly changed = output<CriterionEvaluation>();

  protected readonly statuses = STATUSES;
  protected readonly saved = signal(false);
  protected readonly form = new FormState(evaluationFormSchema, {
    status: 'Choisissez un statut.',
    note: 'La note fait au plus 2 000 caractères.',
  });

  protected readonly automation = computed(() => AUTOMATION_TEXT[this.row().automation]);
  protected readonly current = computed(() => {
    const { status, origin, author } = this.row();
    if (status === null) {
      return 'non évalué';
    }
    const text = STATUS_TEXT[status] ?? status;
    if (origin === 'AUTOMATIC') {
      return `${text}, défaut détecté par le robot`;
    }
    return author === null ? text : `${text}, par ${author}`;
  });
  /** What the automated results proposed, and what remains for the auditor to do. */
  protected readonly proposalText = computed(() => {
    const { proposal, origin, status } = this.row();
    const rules = this.rules();
    switch (proposal) {
      case 'NON_COMPLIANT':
        return origin === 'AUTOMATIC'
          ? `Défaut détecté par le robot sur cette page : ${rules}. Pour infirmer ce défaut, choisissez un autre statut et expliquez pourquoi dans la note.`
          : `Le robot avait détecté un défaut sur cette page : ${rules}. Le statut est celui de l’auditeur.`;
      case 'COMPLIANT_TO_CONFIRM':
        return status === null
          ? `Proposition du robot : conforme, il n’a détecté aucun défaut de ce type : ${rules}. Un test automatique ne suffit pas : vérifiez, puis choisissez le statut.`
          : `Le robot avait proposé « conforme », sans défaut détecté de ce type : ${rules}. Le statut est celui de l’auditeur.`;
      case 'CLUE':
        return `Indice : un défaut détecté (${rules}) pourrait concerner ce critère, correspondance à confirmer.`;
      case null:
        return null;
    }
  });
  protected readonly rules = computed(() =>
    this.row()
      .proposalRules.map(({ ruleId, title }) => title ?? ruleId)
      .join(', '),
  );

  /** Ids unique on the page: one form per criterion. */
  protected id(part: string): string {
    return `critere-${this.row().criterion.replace('.', '-')}-${part}`;
  }

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.saved.set(false);
    const values = this.form.read(event.target as HTMLFormElement);
    if (values === null) {
      return;
    }
    await this.form.submit(async () => {
      const { audit, criterion } = { audit: this.audit(), criterion: this.row().criterion };
      const saved = criterionEvaluationSchema.parse(
        await firstValueFrom(
          this.http.put(
            `${API}/orgs/${this.org()}/audits/${audit}/pages/${this.page()}/criteria/${criterion}`,
            {
              status: values.status === '' ? null : values.status,
              note: values.note === '' ? null : values.note,
            },
          ),
        ),
      );
      this.saved.set(true);
      this.changed.emit(saved);
    });
  }
}
