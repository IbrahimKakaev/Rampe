import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { statementFieldsSchema, statementSchema, webPath } from '@rampe/shared';
import { firstValueFrom } from 'rxjs';

import { API, errorMessage, parseWith } from '../core/api';
import { FormState } from '../core/forms';
import { titleFrom } from '../core/page-title';

type Field = keyof typeof statementFieldsSchema.shape;

/** The fields of the form, in its order, with their label and hint. */
const FIELDS: readonly {
  readonly name: Field;
  readonly label: string;
  readonly hint?: string;
  readonly kind: 'text' | 'url' | 'textarea';
}[] = [
  { name: 'entityName', label: 'Entité responsable du site', kind: 'text' },
  { name: 'serviceName', label: 'Nom du site, tel que la déclaration le cite', kind: 'text' },
  {
    name: 'auditedBy',
    label: 'Audit réalisé par',
    hint: 'Laissez vide pour « en interne », ou donnez le nom de la société qui a audité le site.',
    kind: 'text',
  },
  {
    name: 'technologies',
    label: 'Technologies utilisées pour réaliser le site',
    hint: 'Par exemple : HTML5, CSS, JavaScript.',
    kind: 'text',
  },
  {
    name: 'testEnvironment',
    label: 'Environnement de test',
    hint: 'Les agents utilisateurs et technologies d’assistance utilisés, une combinaison par ligne : par exemple « Firefox et NVDA ».',
    kind: 'textarea',
  },
  {
    name: 'tools',
    label: 'Outils pour évaluer l’accessibilité',
    hint: 'Laissez vide pour citer Rampe et sa version d’axe-core.',
    kind: 'text',
  },
  { name: 'derogations', label: 'Dérogations pour charge disproportionnée', kind: 'textarea' },
  {
    name: 'exemptions',
    label: 'Contenus non soumis à l’obligation d’accessibilité',
    kind: 'textarea',
  },
  { name: 'contactFormUrl', label: 'Adresse du formulaire de contact', kind: 'url' },
  {
    name: 'contactDetails',
    label: 'Coordonnées du responsable',
    hint: 'Une adresse e-mail, une adresse postale ou un numéro de téléphone.',
    kind: 'text',
  },
  { name: 'multiYearPlanUrl', label: 'Adresse du schéma pluriannuel, s’il existe', kind: 'url' },
  {
    name: 'actionPlanUrl',
    label: 'Adresse du plan d’actions de l’année, s’il existe',
    kind: 'url',
  },
];

/**
 * The accessibility statement of an audit: the person completes what the
 * audit cannot know (contact, test environment…), the API writes the rest
 * after the official model. A draft while the audit is not complete.
 */
@Component({
  selector: 'rampe-statement-page',
  imports: [RouterLink],
  templateUrl: './statement-page.html',
})
export class StatementPage {
  private readonly http = inject(HttpClient);

  /** Route parameters. */
  readonly org = input.required<string>();
  readonly audit = input.required<string>();

  protected readonly statement = httpResource(
    () => `${API}/orgs/${this.org()}/audits/${this.audit()}/statement`,
    { parse: parseWith(statementSchema) },
  );
  protected readonly fields = FIELDS;
  protected readonly form = new FormState(
    statementFieldsSchema,
    Object.fromEntries(
      FIELDS.map(({ name, kind }) => [
        name,
        kind === 'url'
          ? 'Saisissez une adresse complète en http ou https, ou laissez le champ vide.'
          : 'Ce texte est trop long.',
      ]),
    ) as Record<Field, string>,
  );
  protected readonly saved = signal(false);
  protected readonly loadError = computed(() => {
    const error = this.statement.error();
    return error === undefined ? null : errorMessage(error);
  });
  protected readonly paths = computed(() => ({
    sites: webPath('sites', { org: this.org() }),
    audit: webPath('audit', { org: this.org(), audit: this.audit() }),
  }));

  constructor() {
    titleFrom(() =>
      this.statement.hasValue()
        ? this.statement.value().draft
          ? 'Déclaration d’accessibilité, brouillon'
          : 'Déclaration d’accessibilité'
        : null,
    );
  }

  protected value(name: Field): string {
    return this.statement.hasValue() ? this.statement.value().fields[name] : '';
  }

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.saved.set(false);
    const fields = this.form.read(event.target as HTMLFormElement);
    if (fields === null) {
      return;
    }
    await this.form.submit(async () => {
      this.statement.set(
        statementSchema.parse(
          await firstValueFrom(
            this.http.put(`${API}/orgs/${this.org()}/audits/${this.audit()}/statement`, fields),
          ),
        ),
      );
      this.saved.set(true);
    });
  }
}
