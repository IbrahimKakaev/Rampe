/**
 * Writes docs/rgaa-4.1.2.md: the classification of the 106 criteria and the
 * correspondence with axe-core, readable by an auditor. Generated from the
 * compiled package: run `pnpm --filter @rampe/rules run generate`.
 */
import { writeFileSync } from 'node:fs';

import {
  activeRules,
  AXE_RGAA_MAPPING,
  CLASSIFICATION,
  criteriaToCheckManually,
  CURRENT_REFERENTIAL,
} from '../dist/report-data.js';

const LABELS = {
  automatable: 'automatisable',
  partial: 'partiellement automatisable',
  manual: 'manuel',
} as const;
const cell = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const count = (automation: keyof typeof LABELS): number =>
  CLASSIFICATION.filter((entry) => entry.automation === automation).length;

const rules = activeRules();
const uncertain = rules.flatMap((rule) =>
  rule.links
    .filter((link) => link.status === 'uncertain')
    .map((link) => ({ rule: rule.ruleId, link })),
);
const untagged = rules.filter((rule) => rule.links.length === 0);
const themeTitle = new Map(CURRENT_REFERENTIAL.themes.map((theme) => [theme.number, theme.title]));

const lines = [
  `# RGAA ${CURRENT_REFERENTIAL.version} : classement des critères et correspondance avec axe-core`,
  '',
  '> Fichier généré par `pnpm --filter @rampe/rules run generate` : ne pas modifier à la main.',
  '',
  'Sources :',
  '',
  `- [${CURRENT_REFERENTIAL.source.description}](${CURRENT_REFERENTIAL.source.url}), ${CURRENT_REFERENTIAL.source.license}.`,
  ...AXE_RGAA_MAPPING.sources.map(
    (source) => `- [${source.description}](${source.url}), ${source.license}.`,
  ),
  '',
  '## Synthèse',
  '',
  `Rampe exécute ${String(rules.length)} règles d'axe-core ${AXE_RGAA_MAPPING.axeVersion} (WCAG 2.1 A et AA, hors règles expérimentales).`,
  '',
  '| Classement | Critères |',
  '| --- | --- |',
  `| Automatisable | ${String(count('automatable'))} |`,
  `| Partiellement automatisable | ${String(count('partial'))} |`,
  `| Manuel | ${String(count('manual'))} |`,
  '',
  `Après un pré-audit automatique, ${String(criteriaToCheckManually())} critères sur ${String(CLASSIFICATION.length)} restent à vérifier à la main.`,
  '',
  '## À arbitrer',
  '',
  'Correspondances incertaines : l’étiquette RGAA d’axe-core et les références WCAG officielles du critère ne concordent pas. L’interface les affiche « critère RGAA à confirmer ».',
  '',
  '| Règle | Critère | Raison |',
  '| --- | --- | --- |',
  ...uncertain.map(
    ({ rule, link }) => `| \`${rule}\` | ${link.criterion} | ${cell(link.reason)} |`,
  ),
  '',
  'Règles sans étiquette RGAA dans axe-core : leurs défauts sont signalés sans critère, avec les critères candidats d’après les références WCAG officielles.',
  '',
  '| Règle | Critères WCAG | Critères RGAA candidats |',
  '| --- | --- | --- |',
  ...untagged.map(
    (rule) => `| \`${rule.ruleId}\` | ${rule.wcag.join(', ')} | ${rule.candidates.join(', ')} |`,
  ),
  '',
  '## Les 106 critères',
  '',
  '| Critère | Thème | Intitulé | Classement | Règles | Justification |',
  '| --- | --- | --- | --- | --- | --- |',
  ...CLASSIFICATION.map((entry) => {
    const criterion = CURRENT_REFERENTIAL.criteria.find(
      (candidate) => candidate.id === entry.criterion,
    );
    return `| ${entry.criterion} | ${cell(themeTitle.get(criterion?.theme ?? 0) ?? '')} | ${cell(criterion?.title ?? '')} | ${LABELS[entry.automation]} | ${entry.rules.map((rule) => `\`${rule}\``).join(', ')} | ${cell(entry.justification)} |`;
  }),
  '',
  '## Correspondance règle par règle',
  '',
  '| Règle | WCAG | Critère RGAA | Tests | État | Source |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rules.flatMap((rule) =>
    rule.links.length === 0
      ? [
          `| \`${rule.ruleId}\` | ${rule.wcag.join(', ')} | — | — | sans étiquette | Candidats : ${rule.candidates.join(', ')} |`,
        ]
      : rule.links.map(
          (link) =>
            `| \`${rule.ruleId}\` | ${rule.wcag.join(', ')} | ${link.criterion} | ${link.tests.join(', ')} | ${link.status === 'confirmed' ? 'confirmé' : 'incertain'} | ${cell(link.reason)} |`,
        ),
  ),
  '',
];

writeFileSync(new URL('../../../docs/rgaa-4.1.2.md', import.meta.url), lines.join('\n'));
console.log('docs/rgaa-4.1.2.md written.');
