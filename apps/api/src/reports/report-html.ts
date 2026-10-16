/**
 * The HTML of the pre-audit report, which the worker prints to a tagged PDF.
 *
 * A pure function of its data. Everything that comes from the scanned site
 * (addresses, page titles, selectors, extracts of code) is escaped: the
 * report is rendered by a browser, and an extract is text, never markup.
 * The structure is semantic HTML (headings, lists, tables with headers), so
 * that the tagged PDF keeps it for screen readers.
 */

export interface ReportFinding {
  readonly ruleId: string;
  /** French name of the defect, from the corrections content. */
  readonly title: string | null;
  /** How to fix it, from the corrections content; code between backquotes. */
  readonly fix: string | null;
  readonly impact: string | null;
  readonly pagePath: string;
  readonly selector: string;
  readonly html: string;
  /** Criteria linked with doubt: "critère RGAA à confirmer". */
  readonly uncertain: readonly string[];
}

export interface ReportData {
  readonly generatedAt: Date;
  readonly organizationName: string;
  readonly site: { readonly origin: string; readonly host: string };
  readonly scan: {
    readonly createdAt: Date;
    readonly finishedAt: Date;
    readonly status: 'COMPLETED' | 'PARTIAL';
    /** Why the scan stopped early, in French, or null. */
    readonly stopReason: string | null;
    readonly score: number;
    readonly checks: {
      readonly passed: number;
      readonly failed: number;
      readonly incomplete: number;
    };
    readonly referentialVersion: string;
    readonly axeVersion: string | null;
    readonly findingsAdded: number | null;
    readonly findingsFixed: number | null;
    readonly maxDepth: number;
  };
  readonly pages: readonly {
    readonly url: string;
    readonly analyzed: boolean;
    /** Why the page was not analysed, in French. */
    readonly failure: string | null;
    readonly findingCount: number;
  }[];
  /** Defects by RGAA criterion linked with certainty, in the order of the referential. */
  readonly criteria: readonly {
    readonly id: string;
    readonly title: string;
    readonly findings: readonly ReportFinding[];
  }[];
  /** Defects attached to no criterion with certainty. */
  readonly unattached: readonly ReportFinding[];
  /** Every criterion the automated pre-audit cannot decide, by theme. */
  readonly manualCriteria: readonly {
    readonly theme: string;
    readonly criteria: readonly {
      readonly id: string;
      readonly title: string;
      readonly partial: boolean;
    }[];
  }[];
  readonly criteriaToCheckManually: number;
  /** Defects found, each counted once whatever the number of its criteria. */
  readonly findingCount: number;
}

/** Occurrences of one rule listed under a criterion; the rest are counted. */
export const MAX_OCCURRENCES_PER_RULE = 25;

const IMPACT_LABEL: Readonly<Record<string, string>> = {
  critical: 'Critique',
  serious: 'Grave',
  moderate: 'Modéré',
  minor: 'Mineur',
};

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** A text of the corrections content, its code between backquotes shown as code. */
function contentText(text: string): string {
  return text
    .split('`')
    .map((part, index) => (index % 2 === 1 ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part)))
    .join('');
}

const DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${String(count)} ${count > 1 ? pluralForm : singular}`;
}

/** Groups the defects of a criterion by rule: the explanation is given once per rule. */
function byRule(findings: readonly ReportFinding[]): ReportFinding[][] {
  const groups = new Map<string, ReportFinding[]>();
  for (const finding of findings) {
    groups.set(finding.ruleId, [...(groups.get(finding.ruleId) ?? []), finding]);
  }
  return [...groups.values()];
}

function ruleSection(findings: readonly ReportFinding[], headingLevel: 3 | 4): string {
  const [first] = findings;
  if (first === undefined) {
    return '';
  }
  const shown = findings.slice(0, MAX_OCCURRENCES_PER_RULE);
  const rows = shown
    .map(
      (finding) => `
        <tr>
          <td><code>${escapeHtml(finding.pagePath)}</code></td>
          <td><code>${escapeHtml(finding.selector)}</code><pre>${escapeHtml(finding.html)}</pre></td>
          <td>${escapeHtml(finding.impact === null ? '—' : (IMPACT_LABEL[finding.impact] ?? finding.impact))}</td>
        </tr>`,
    )
    .join('');
  const uncertain =
    first.uncertain.length > 0
      ? `<p>Critère RGAA à confirmer : ${escapeHtml(first.uncertain.join(', '))}.</p>`
      : '';
  const more =
    findings.length > shown.length
      ? `<p>Et ${plural(findings.length - shown.length, 'autre occurrence', 'autres occurrences')}, visibles dans le tableau de bord.</p>`
      : '';
  const heading = `h${String(headingLevel)}`;
  return `
    <section class="rule">
      <${heading}>${escapeHtml(first.title ?? first.ruleId)}</${heading}>
      <p class="muted">Règle axe-core <code>${escapeHtml(first.ruleId)}</code>, ${plural(findings.length, 'occurrence')}.</p>
      ${uncertain}
      ${first.fix === null ? '' : `<p><strong>Comment corriger :</strong> ${contentText(first.fix)}</p>`}
      <table>
        <thead><tr><th scope="col">Page</th><th scope="col">Élément et extrait de code</th><th scope="col">Gravité</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${more}
    </section>`;
}

const STYLES = `
  @page { size: A4; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1b1b1f; margin: 0; }
  h1 { font-size: 22pt; line-height: 1.2; margin: 0 0 12pt; color: #0b3d91; }
  h2 { font-size: 15pt; margin: 18pt 0 8pt; color: #0b3d91; break-after: avoid; }
  h3 { font-size: 12pt; font-weight: 700; margin: 16pt 0 6pt; break-after: avoid; }
  h4 { font-size: 11pt; font-weight: 700; color: #0b3d91; margin: 10pt 0 4pt; break-after: avoid; }
  .cover { break-after: page; padding-top: 60mm; }
  .cover .subtitle { font-size: 14pt; margin: 0 0 24pt; }
  .cover dl { display: grid; grid-template-columns: max-content 1fr; gap: 4pt 14pt; margin: 0 0 18pt; }
  .cover dt { color: #4a4a55; }
  .cover dd { margin: 0; font-weight: 600; }
  .notice { border-left: 4pt solid #8a5a00; background: #fff6dc; padding: 8pt 10pt; margin: 12pt 0; }
  .muted { color: #4a4a55; }
  .chapter { break-before: page; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9.5pt; }
  caption { text-align: left; font-weight: 600; padding-bottom: 4pt; }
  th, td { text-align: left; vertical-align: top; padding: 3pt 5pt; border-bottom: 0.5pt solid #9a9aa5; }
  thead th { border-bottom: 1pt solid #4a4a55; }
  tr { break-inside: avoid; }
  code, pre { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 8.5pt; }
  pre { margin: 2pt 0 0; white-space: pre-wrap; overflow-wrap: anywhere; color: #4a4a55; }
  code { overflow-wrap: anywhere; }
  dl.figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6pt; }
  dl.figures div { border: 0.5pt solid #9a9aa5; padding: 6pt; }
  dl.figures dt { color: #4a4a55; font-size: 9pt; }
  dl.figures dd { margin: 2pt 0 0; font-size: 14pt; font-weight: 700; }
  .rule { break-inside: auto; }
`;

export function buildReportHtml(data: ReportData): string {
  const { scan, site } = data;
  const analyzed = data.pages.filter((page) => page.analyzed).length;
  const honesty = `Ce rapport présente un pré-audit automatique. Il ne constitue pas un audit de conformité au RGAA : un test automatique ne prouve jamais la conformité, et ${plural(data.criteriaToCheckManually, 'critère RGAA reste', 'critères RGAA restent')} à vérifier manuellement.`;

  const evolution =
    scan.findingsAdded === null || scan.findingsFixed === null
      ? '<p>Premier scan terminé de ce site : aucune comparaison possible.</p>'
      : `<p>Depuis le scan précédent : ${plural(scan.findingsAdded, 'nouveau défaut', 'nouveaux défauts')}, ${plural(scan.findingsFixed, 'défaut corrigé', 'défauts corrigés')}, comptés sur les seules pages analysées dans les deux scans.</p>`;

  const pagesRows = data.pages
    .map(
      (page) => `
        <tr>
          <td><code>${escapeHtml(page.url)}</code></td>
          <td>${page.analyzed ? 'Analysée' : `Non analysée : ${escapeHtml(page.failure ?? 'erreur')}`}</td>
          <td>${String(page.findingCount)}</td>
        </tr>`,
    )
    .join('');

  const criteriaSections = data.criteria
    .map(
      (criterion) => `
      <section>
        <h3>Critère ${escapeHtml(criterion.id)} : ${escapeHtml(criterion.title)}</h3>
        ${byRule(criterion.findings)
          .map((findings) => ruleSection(findings, 4))
          .join('')}
      </section>`,
    )
    .join('');

  const unattached =
    data.unattached.length === 0
      ? ''
      : `
      <section>
        <h3>Défauts sans critère RGAA confirmé</h3>
        <p>Ces défauts ne sont rattachés à aucun critère avec certitude : les sources officielles ne concordent pas. Un auditeur les rattache au bon critère.</p>
        ${byRule(data.unattached)
          .map((findings) => ruleSection(findings, 4))
          .join('')}
      </section>`;

  const manualTables = data.manualCriteria
    .map(
      (theme) => `
      <table>
        <caption>${escapeHtml(theme.theme)}</caption>
        <thead><tr><th scope="col">Critère</th><th scope="col">Intitulé</th><th scope="col">Part automatique</th></tr></thead>
        <tbody>${theme.criteria
          .map(
            (criterion) => `
          <tr>
            <td>${escapeHtml(criterion.id)}</td>
            <td>${escapeHtml(criterion.title)}</td>
            <td>${criterion.partial ? 'Partielle : le robot en teste une partie' : 'Aucune : vérification humaine'}</td>
          </tr>`,
          )
          .join('')}</tbody>
      </table>`,
    )
    .join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Pré-audit automatique d’accessibilité de ${escapeHtml(site.host)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <section class="cover">
    <h1>Rapport de pré-audit automatique d’accessibilité</h1>
    <p class="subtitle">${escapeHtml(site.origin)}/</p>
    <dl>
      <dt>Organisation</dt><dd>${escapeHtml(data.organizationName)}</dd>
      <dt>Scan terminé le</dt><dd>${escapeHtml(DATE.format(scan.finishedAt))}</dd>
      <dt>Référentiel</dt><dd>RGAA ${escapeHtml(scan.referentialVersion)}${scan.axeVersion === null ? '' : `, tests automatiques axe-core ${escapeHtml(scan.axeVersion)}`}</dd>
      <dt>Rapport produit le</dt><dd>${escapeHtml(DATE.format(data.generatedAt))}</dd>
    </dl>
    <div class="notice"><p>${honesty}</p></div>
  </section>

  <section>
    <h2>Synthèse</h2>
    <div class="notice"><p><strong>Pré-audit automatique.</strong> Le score est la part des vérifications automatiques réussies. Il ne mesure pas la conformité au RGAA : ${plural(data.criteriaToCheckManually, 'critère RGAA reste', 'critères RGAA restent')} à vérifier manuellement.</p></div>
    <dl class="figures">
      <div><dt>Score de pré-audit automatique</dt><dd>${escapeHtml(PERCENT.format(scan.score))}</dd></div>
      <div><dt>Vérifications réussies</dt><dd>${String(scan.checks.passed)}</dd></div>
      <div><dt>Vérifications échouées</dt><dd>${String(scan.checks.failed)}</dd></div>
      <div><dt>Résultats à examiner à la main</dt><dd>${String(scan.checks.incomplete)}</dd></div>
      <div><dt>Pages analysées</dt><dd>${String(analyzed)} sur ${String(data.pages.length)}</dd></div>
      <div><dt>Défauts détectés</dt><dd>${String(data.findingCount)}</dd></div>
    </dl>
    <p>${plural(data.criteria.length, 'critère RGAA concerné', 'critères RGAA concernés')} par au moins un défaut, et ${plural(data.unattached.length, 'défaut', 'défauts')} sans critère confirmé. Un défaut rattaché à plusieurs critères figure dans chacun d’eux.</p>
    ${evolution}
  </section>

  <section>
    <h2>Périmètre</h2>
    <p>Le robot RampeBot a visité le site ${escapeHtml(site.origin)}/ le ${escapeHtml(DATE.format(scan.createdAt))}, depuis sa page d’accueil et son plan de site, jusqu’à ${plural(scan.maxDepth, 'clic')} de l’accueil, en respectant son fichier robots.txt. Il a visité ${plural(data.pages.length, 'page')}. Seules les pages publiques sont visitées.</p>
    ${scan.status === 'PARTIAL' ? `<p><strong>Scan terminé en partie.</strong> ${escapeHtml(scan.stopReason ?? '')}</p>` : ''}
    <table>
      <caption>Pages visitées, dans l’ordre de visite</caption>
      <thead><tr><th scope="col">Adresse</th><th scope="col">Résultat</th><th scope="col">Défauts</th></tr></thead>
      <tbody>${pagesRows}</tbody>
    </table>
  </section>

  <section class="chapter">
    <h2>Défauts par critère RGAA</h2>
    ${data.findingCount === 0 ? '<p>Le robot n’a détecté aucun défaut. Cela ne prouve pas l’accessibilité du site : les critères qu’il ne peut pas tester restent à vérifier à la main.</p>' : ''}
    ${criteriaSections}
    ${unattached}
  </section>

  <section class="chapter">
    <h2>Critères à vérifier manuellement</h2>
    <p>Les ${plural(data.criteriaToCheckManually, 'critère suivant', 'critères suivants')} du RGAA ${escapeHtml(scan.referentialVersion)} ne peuvent pas être tranchés par un robot. Même sans défaut détecté, une personne doit les vérifier sur un échantillon de pages pour établir le taux de conformité selon la méthode officielle.</p>
    ${manualTables}
  </section>

  <section>
    <h2>Méthode et limites</h2>
    <ul>
      <li>Une vérification est une règle automatique appliquée à une page où elle s’applique. Le score est la part des vérifications réussies ; il n’est pas pondéré par la gravité.</li>
      <li>Les résultats que les tests automatiques ne savent pas trancher ne comptent ni pour ni contre : ils sont à examiner à la main.</li>
      <li>Les pages qu’on n’atteint qu’après une connexion, ou par un lien que le robot ne voit pas, ne sont pas analysées.</li>
      <li>Le rattachement d’un défaut à un critère RGAA s’appuie sur les sources officielles. Quand elles ne concordent pas, il est signalé « à confirmer ».</li>
    </ul>
    <div class="notice"><p>${honesty}</p></div>
  </section>
</main>
</body>
</html>
`;
}
