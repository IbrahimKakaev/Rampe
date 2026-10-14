// Reads the output of `pnpm -r licenses list --json` on standard input and fails
// when a dependency carries a licence this project has not accepted.
//
// Rampe is a commercial SaaS: copyleft licences that would bind its own code
// (GPL, AGPL and the like) are refused. Anything unknown is refused too, so a
// new licence is always a decision somebody made, never an accident.

/** Permissive licences: use in a closed-source commercial product is allowed. */
const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  'Unlicense',
]);

/**
 * Licences accepted for named packages only, each with the reason.
 * MPL-2.0 is a file-level copyleft: it covers changes to the package's own
 * files, not the code that uses the package. None of these is modified here.
 */
const EXCEPTIONS = [
  {
    license: 'MPL-2.0',
    packages: /^(axe-core|@axe-core\/playwright)$/,
    reason: 'accessibility engine required by the project, used unmodified',
  },
  {
    license: 'MPL-2.0',
    packages: /^lightningcss(-[a-z0-9-]+)?$/,
    reason: 'CSS tool of the Angular build, used unmodified and not shipped',
  },
];

/** Whether an SPDX expression such as "MIT" or "(MIT OR CC0-1.0)" is acceptable for a package. */
export function isAccepted(expression, packageName) {
  const text = expression.trim().replace(/^\((.*)\)$/, '$1');
  if (text.includes(' OR ')) {
    return text.split(' OR ').some((part) => isAccepted(part, packageName));
  }
  if (text.includes(' AND ')) {
    return text.split(' AND ').every((part) => isAccepted(part, packageName));
  }
  return (
    ALLOWED.has(text) ||
    EXCEPTIONS.some((rule) => rule.license === text && rule.packages.test(packageName))
  );
}

/** Returns the packages whose licence is not accepted, as "name@versions: licence". */
export function findRefused(report) {
  return Object.entries(report).flatMap(([license, packages]) =>
    packages
      .filter(({ name }) => !isAccepted(license, name))
      .map(({ name, versions }) => `${name}@${versions.join(', ')}: ${license}`),
  );
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  let report;
  try {
    report = JSON.parse(input);
  } catch {
    console.error('check-licenses: expected the JSON output of `pnpm -r licenses list --json`.');
    return 2;
  }
  const count = Object.values(report).reduce((total, packages) => total + packages.length, 0);
  if (count === 0) {
    console.error('check-licenses: the licence report is empty, nothing was checked.');
    return 2;
  }
  const refused = findRefused(report);
  if (refused.length > 0) {
    console.error(`Licences not accepted for ${String(refused.length)} package(s):`);
    for (const line of refused.sort()) {
      console.error(`  ${line}`);
    }
    console.error('Remove the dependency, or record the decision in scripts/check-licenses.mjs.');
    return 1;
  }
  console.log(`Licences accepted for all ${String(count)} packages.`);
  return 0;
}

process.exitCode = await main();
