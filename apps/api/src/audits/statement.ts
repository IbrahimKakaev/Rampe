import type { Conformity, Statement, StatementFields } from '@rampe/shared';

/**
 * The accessibility statement of an audit, following the official model
 * (accessibilite.numerique.gouv.fr/obligations/declaration-accessibilite,
 * consulted on 16 October 2026): opening commitment, conformity state and
 * test results, non-accessible content, how the statement was made, feedback
 * and contact, remedies with the Défenseur des droits. The fixed sentences
 * checked against the model (commitment, results, contact, remedies and the
 * three ways to reach the Défenseur des droits) are kept as it writes them.
 *
 * While the audit is not complete, the statement is a draft: it says so, and
 * it states no conformity, since the rate does not exist yet.
 */

export interface StatementInput {
  readonly fields: StatementFields;
  readonly siteOrigin: string;
  readonly referentialVersion: string;
  readonly conformity: Conformity;
  /** Criteria found non-conforming on at least one page, with the auditor's notes. */
  readonly nonConforming: readonly {
    readonly id: string;
    readonly title: string;
    readonly notes: readonly string[];
  }[];
  readonly pages: readonly { readonly title: string; readonly url: string }[];
  /** When the last evaluation was recorded: the date of the statement. */
  readonly lastEvaluationAt: Date | null;
  readonly generatedAt: Date;
  readonly axeVersion: string | null;
}

type Block = Statement['sections'][number]['blocks'][number];

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

const STATE: Readonly<Record<NonNullable<Conformity['state']>, string>> = {
  total: 'totalement',
  partial: 'partiellement',
  none: 'non',
};

const paragraph = (text: string): Block => ({ type: 'paragraph', text });
const list = (items: readonly { text: string; href?: string | null }[]): Block => ({
  type: 'list',
  items: items.map(({ text, href }) => ({ text, href: href ?? null })),
});
/** What the person still has to write, shown as such in the draft and the final text. */
const toComplete = (what: string): string => `[À compléter : ${what}]`;
const or = (value: string, placeholder: string): string =>
  value === '' ? toComplete(placeholder) : value;
/** A text of several lines becomes one paragraph per line. */
const paragraphs = (value: string, empty: string): Block[] =>
  value === ''
    ? [paragraph(empty)]
    : value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map(paragraph);

export function buildStatement(input: StatementInput): Omit<Statement, 'fields'> {
  const { fields, conformity } = input;
  const draft = !conformity.complete;
  const entity = or(fields.entityName, 'nom de l’entité responsable du site');
  const service = or(fields.serviceName, 'nom du site');
  const auditor = fields.auditedBy === '' ? 'en interne' : fields.auditedBy;
  const remaining = conformity.expected - conformity.evaluated;

  const plans = [
    ...(fields.multiYearPlanUrl === ''
      ? []
      : [{ text: 'Schéma pluriannuel de mise en accessibilité', href: fields.multiYearPlanUrl }]),
    ...(fields.actionPlanUrl === ''
      ? []
      : [{ text: 'Plan d’actions de l’année en cours', href: fields.actionPlanUrl }]),
  ];

  const intro: Block[] = [
    ...(draft
      ? [
          paragraph(
            `Brouillon : l’audit n’est pas complet, ${String(remaining)} évaluation${remaining > 1 ? 's' : ''} sur ${String(conformity.expected)} reste${remaining > 1 ? 'nt' : ''} à faire. Cette déclaration ne peut pas être publiée en l’état.`,
          ),
        ]
      : []),
    paragraph(
      `${entity} s’engage à rendre ses sites internet, intranet, extranet et ses progiciels accessibles conformément à l’article 47 de la loi n° 2005-102 du 11 février 2005.`,
    ),
    ...(plans.length > 0
      ? [
          paragraph('À cette fin, elle met en œuvre la stratégie et les actions suivantes :'),
          list(plans),
        ]
      : []),
    paragraph(
      `Cette déclaration d’accessibilité s’applique au site ${service} (${input.siteOrigin}/).`,
    ),
  ];

  const results: Block[] =
    draft || conformity.rate === null || conformity.state === null
      ? [
          paragraph(
            `L’état de conformité sera établi quand l’audit sera complet : ${String(conformity.evaluated)} évaluation${conformity.evaluated > 1 ? 's' : ''} sur ${String(conformity.expected)} ${conformity.evaluated > 1 ? 'sont faites' : 'est faite'}.`,
          ),
        ]
      : [
          paragraph(
            `${service} est ${STATE[conformity.state]} conforme avec le référentiel général d’amélioration de l’accessibilité (RGAA), version ${input.referentialVersion}${conformity.state === 'total' ? '' : ', en raison des non-conformités énumérées ci-dessous'}.`,
          ),
        ];
  const testResults: Block[] =
    conformity.rate === null
      ? [paragraph('Les résultats seront donnés à la fin de l’audit.')]
      : [
          paragraph(
            `L’audit de conformité réalisé ${auditor === 'en interne' ? 'en interne' : `par ${auditor}`} révèle que :`,
          ),
          list([
            { text: `${PERCENT.format(conformity.rate)} des critères RGAA sont respectés.` },
            ...(conformity.averageRate === null
              ? []
              : [
                  {
                    text: `Le taux moyen de conformité du service en ligne s’élève à ${PERCENT.format(conformity.averageRate)}.`,
                  },
                ]),
          ]),
        ];

  const nonConformities: Block[] =
    input.nonConforming.length === 0
      ? [
          paragraph(
            draft ? 'Aucune non-conformité relevée pour l’instant.' : 'Aucune non-conformité.',
          ),
        ]
      : [
          list(
            input.nonConforming.map(({ id, title, notes }) => ({
              text: `Critère ${id} : ${title}${notes.length > 0 ? ` ${notes.join(' ')}` : ''}`,
            })),
          ),
        ];

  const date = DATE.format(input.lastEvaluationAt ?? input.generatedAt);
  const tools =
    fields.tools !== ''
      ? fields.tools
      : `Rampe : pré-audit automatique${input.axeVersion === null ? '' : ` avec axe-core ${input.axeVersion}`}, puis évaluation manuelle des critères du RGAA.`;

  const contact = [
    ...(fields.contactFormUrl === ''
      ? []
      : [{ text: 'Formulaire de contact', href: fields.contactFormUrl }]),
    ...(fields.contactDetails === '' ? [] : [{ text: fields.contactDetails }]),
  ];

  return {
    draft,
    title: draft ? 'Déclaration d’accessibilité — brouillon' : 'Déclaration d’accessibilité',
    intro,
    sections: [
      { heading: 'État de conformité', level: 2, blocks: results },
      { heading: 'Résultats des tests', level: 3, blocks: testResults },
      {
        heading: 'Contenus non accessibles',
        level: 2,
        blocks: [
          paragraph(
            'Les contenus listés ci-dessous ne sont pas accessibles pour les raisons suivantes.',
          ),
        ],
      },
      { heading: 'Non-conformités', level: 3, blocks: nonConformities },
      {
        heading: 'Dérogations pour charge disproportionnée',
        level: 3,
        blocks: paragraphs(fields.derogations, 'Aucune dérogation n’est invoquée.'),
      },
      {
        heading: 'Contenus non soumis à l’obligation d’accessibilité',
        level: 3,
        blocks: paragraphs(fields.exemptions, 'Aucun contenu n’est exclu.'),
      },
      {
        heading: 'Établissement de cette déclaration d’accessibilité',
        level: 2,
        blocks: [
          paragraph(
            draft
              ? `Ce brouillon a été produit le ${DATE.format(input.generatedAt)}.`
              : `Cette déclaration a été établie le ${date}.`,
          ),
        ],
      },
      {
        heading: 'Technologies utilisées pour la réalisation du site',
        level: 3,
        blocks: paragraphs(
          fields.technologies,
          toComplete('technologies du site, par exemple HTML5, CSS, JavaScript'),
        ),
      },
      {
        heading: 'Environnement de test',
        level: 3,
        blocks: [
          paragraph(
            'Agents utilisateurs et technologies d’assistance utilisés pour vérifier la restitution des contenus :',
          ),
          ...paragraphs(
            fields.testEnvironment,
            toComplete(
              'agents utilisateurs et technologies d’assistance, par exemple Firefox et NVDA, Safari et VoiceOver',
            ),
          ),
        ],
      },
      {
        heading: 'Outils pour évaluer l’accessibilité',
        level: 3,
        blocks: paragraphs(tools, tools),
      },
      {
        heading: 'Pages du site ayant fait l’objet de la vérification de conformité',
        level: 3,
        blocks: [
          input.pages.length === 0
            ? paragraph(toComplete('échantillon de pages de l’audit'))
            : list(input.pages.map(({ title, url }) => ({ text: `${title} : ${url}`, href: url }))),
        ],
      },
      {
        heading: 'Retour d’information et contact',
        level: 2,
        blocks: [
          paragraph(
            `Si vous n’arrivez pas à accéder à un contenu ou à un service, vous pouvez contacter le responsable de ${service} pour être orienté vers une alternative accessible ou obtenir le contenu sous une autre forme.`,
          ),
          contact.length === 0
            ? paragraph(toComplete('formulaire de contact ou coordonnées du responsable'))
            : list(contact),
        ],
      },
      {
        heading: 'Voies de recours',
        level: 2,
        blocks: [
          paragraph('Cette procédure est à utiliser dans le cas suivant.'),
          paragraph(
            'Vous avez signalé au responsable du site internet un défaut d’accessibilité qui vous empêche d’accéder à un contenu ou à un des services du portail et vous n’avez pas obtenu de réponse satisfaisante.',
          ),
          list([
            {
              text: 'Écrire un message au Défenseur des droits',
              href: 'https://www.defenseurdesdroits.fr/nous-contacter-355',
            },
            {
              text: 'Contacter le délégué du Défenseur des droits près de chez vous',
              href: 'https://www.defenseurdesdroits.fr/carte-des-delegues',
            },
            {
              text: 'Envoyer un courrier par la poste (gratuit, ne pas mettre de timbre) : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07',
            },
          ]),
        ],
      },
    ],
  };
}
