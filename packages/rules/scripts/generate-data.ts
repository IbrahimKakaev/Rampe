/**
 * Generates the RGAA data of this package from its sources:
 * - data/sources/rgaa-4.1.2/criteres.json, the official criteria (DINUM);
 * - the rules of the installed axe-core, with their tags.
 *
 *   pnpm --filter @rampe/rules run generate
 *
 * Run it again after updating axe-core: the result is versioned, and the CI
 * fails when it is out of date. Runs with Node's TypeScript type stripping.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import type {
  AxeRgaaMapping,
  AxeRuleMapping,
  CriterionLink,
  RgaaCriterion,
  RgaaReferential,
  WcagReference,
} from '../src/rgaa/types.js';

const VERSION = '4.1.2';
const SOURCE_COMMIT = '95d5ef33df9efe7c862da02ea98c6b8c02909007';
const SOURCE_SHA256 = '25f71c18150d15514253badd883d0c62e329bc3928814779dc4b41497002a13a';
const SOURCE_PATH = new URL('../data/sources/rgaa-4.1.2/criteres.json', import.meta.url);
const WCAG_SCOPE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface SourceCriterion {
  number: number;
  title: string;
  tests: Record<string, string[]>;
  references: { wcag?: string[]; techniques?: string[] }[];
  particularCases?: (string | { ul: string[] })[];
  technicalNote?: (string | { ul: string[] })[];
}
interface SourceFile {
  wcag: { version: number };
  topics: { topic: string; number: number; criteria: { criterium: SourceCriterion }[] }[];
}
interface AxeRule {
  ruleId: string;
  tags: string[];
}

/** "[titre de page](#titre-de-page)" becomes "titre de page"; the rest is kept as written. */
function plainText(markdown: string): string {
  return markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
}

function paragraphs(items: SourceCriterion['particularCases']): string[] {
  return (items ?? [])
    .flatMap((item) => (typeof item === 'string' ? [item] : item.ul))
    .map(plainText);
}

function wcagReference(text: string): WcagReference {
  const [, id, level] = /^(\d+\.\d+\.\d+) .* \((A|AA)\)$/.exec(text) ?? [];
  if (id === undefined || (level !== 'A' && level !== 'AA')) {
    throw new Error(`Unexpected WCAG reference: ${text}`);
  }
  return { id, level };
}

function wcagFromTags(tags: readonly string[]): string[] {
  return tags
    .filter((tag) => /^wcag\d\d\d{1,2}$/.test(tag))
    .map((tag) => `${tag.charAt(4)}.${tag.charAt(5)}.${tag.slice(6)}`);
}

function readReferential(): RgaaReferential {
  const raw = readFileSync(SOURCE_PATH);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  if (sha256 !== SOURCE_SHA256) {
    throw new Error(
      `The source file changed (sha256 ${sha256}): check it, then update SOURCE_SHA256.`,
    );
  }
  const source = JSON.parse(raw.toString('utf8')) as SourceFile;
  const criteria: RgaaCriterion[] = source.topics.flatMap((topic) =>
    topic.criteria.map(({ criterium }) => {
      const id = `${String(topic.number)}.${String(criterium.number)}`;
      return {
        id,
        theme: topic.number,
        title: plainText(criterium.title),
        tests: Object.entries(criterium.tests).map(([number, lines]) => ({
          id: `${id}.${number}`,
          text: lines.map(plainText),
        })),
        wcag: criterium.references.flatMap((reference) => reference.wcag ?? []).map(wcagReference),
        techniques: criterium.references.flatMap((reference) => reference.techniques ?? []),
        particularCases: paragraphs(criterium.particularCases),
        technicalNotes: paragraphs(criterium.technicalNote),
      };
    }),
  );
  return {
    version: VERSION,
    source: {
      description: `Référentiel général d'amélioration de l'accessibilité, version ${VERSION}, critères et tests (WCAG ${String(source.wcag.version)})`,
      url: `https://github.com/DISIC/accessibilite.numerique.gouv.fr/blob/${SOURCE_COMMIT}/RGAA/criteres.json`,
      license: 'Licence Ouverte 2.0 (Etalab), DINUM',
      commit: SOURCE_COMMIT,
      sha256,
    },
    themes: source.topics.map((topic) => ({ number: topic.number, title: topic.topic })),
    criteria,
  };
}

function readAxeMapping(referential: RgaaReferential): AxeRgaaMapping {
  const axe = createRequire(import.meta.url)('axe-core') as {
    version: string;
    getRules: (tags?: string[]) => AxeRule[];
  };
  const byId = new Map(referential.criteria.map((criterion) => [criterion.id, criterion]));
  const tagSource = `axe-core ${axe.version}`;

  const rules: AxeRuleMapping[] = axe.getRules(WCAG_SCOPE).map(({ ruleId, tags }) => {
    const wcag = wcagFromTags(tags);
    const testsByCriterion = new Map<string, string[]>();
    for (const tag of tags) {
      const test = /^RGAA-(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
      if (test !== undefined) {
        const criterion = test.split('.').slice(0, 2).join('.');
        testsByCriterion.set(criterion, [...(testsByCriterion.get(criterion) ?? []), test]);
      }
    }
    const links: CriterionLink[] = [...testsByCriterion].map(([criterion, tests]) => {
      const official = byId.get(criterion);
      if (official === undefined) {
        throw new Error(
          `${ruleId}: axe-core names criterion ${criterion}, which RGAA ${VERSION} does not have`,
        );
      }
      const officialWcag = official.wcag.map((reference) => reference.id);
      const shared = wcag.filter((id) => officialWcag.includes(id));
      return shared.length > 0
        ? {
            criterion,
            tests,
            status: 'confirmed',
            reason: `Étiquette ${tests.map((test) => `RGAA-${test}`).join(', ')} de ${tagSource}, et critère WCAG ${shared.join(', ')} commun avec les références officielles du critère.`,
          }
        : {
            criterion,
            tests,
            status: 'uncertain',
            reason: `Étiquette ${tests.map((test) => `RGAA-${test}`).join(', ')} de ${tagSource}, mais aucun des critères WCAG de la règle (${wcag.join(', ') || 'aucun'}) ne figure dans les références officielles du critère (${officialWcag.join(', ')}).`,
          };
    });
    const candidates =
      links.length > 0
        ? []
        : referential.criteria
            .filter((criterion) => criterion.wcag.some((reference) => wcag.includes(reference.id)))
            .map((criterion) => criterion.id);
    return { ruleId, experimental: tags.includes('experimental'), tags, wcag, links, candidates };
  });

  return {
    axeVersion: axe.version,
    referential: VERSION,
    sources: [
      {
        description: `Étiquettes RGAA des règles de ${tagSource} (correspondance établie par Deque, non officielle)`,
        url: `https://github.com/dequelabs/axe-core/blob/v${axe.version}/doc/rule-descriptions.md`,
        license: 'MPL-2.0, Deque Systems',
      },
      {
        description: `Références WCAG des critères du RGAA ${VERSION} (officielles)`,
        url: referential.source.url,
        license: referential.source.license,
      },
    ],
    rules,
  };
}

function write(
  file: string,
  header: string,
  exportName: string,
  type: string,
  data: unknown,
): void {
  const content = [
    '// Generated by scripts/generate-data.ts: do not edit by hand.',
    `// ${header}`,
    `import type { ${type} } from '../types.js';`,
    '',
    `export const ${exportName}: ${type} = ${JSON.stringify(data, null, 2)};`,
    '',
  ].join('\n');
  writeFileSync(new URL(`../src/rgaa/data/${file}`, import.meta.url), content);
}

const referential = readReferential();
const mapping = readAxeMapping(referential);
write(
  `rgaa-${VERSION}.generated.ts`,
  `Source: ${referential.source.url} (${referential.source.license}).`,
  'RGAA_4_1_2',
  'RgaaReferential',
  referential,
);
write(
  `axe-mapping-${VERSION}.generated.ts`,
  `Sources: axe-core ${mapping.axeVersion} rule tags, and the official WCAG references of RGAA ${VERSION}.`,
  'AXE_RGAA_MAPPING',
  'AxeRgaaMapping',
  mapping,
);
console.log(
  `RGAA ${VERSION}: ${String(referential.criteria.length)} criteria; axe-core ${mapping.axeVersion}: ${String(mapping.rules.length)} rules.`,
);
