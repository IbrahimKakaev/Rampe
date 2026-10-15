import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from '@jest/globals';
import { CORRECTIONS_FR } from '@rampe/rules';

/** Rules on what the interface may say, checked on its source files. */

const appDirectory = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const sources = sourceFiles(appDirectory).map((path) => ({
  path: relative(appDirectory, path),
  text: readFileSync(path, 'utf8'),
}));

describe('interface texts', () => {
  it('reads every component of the application', () => {
    // Guards against a check that passes because it no longer finds the files.
    expect(sources.map(({ path }) => path)).toEqual(
      expect.arrayContaining(['app.html', 'scans/finding-page.html', 'ui/pre-audit-notice.ts']),
    );
  });

  it('writes no correction text in a component: they all come from the content file', () => {
    const texts = Object.values(CORRECTIONS_FR).flatMap(({ title, impact, fix }) => [
      title,
      impact,
      fix,
    ]);
    const copied = sources.flatMap(({ path, text }) =>
      texts
        .filter((correction) => text.includes(correction))
        .map((correction) => `${path}: ${correction}`),
    );

    expect(texts.length).toBeGreaterThan(100);
    expect(copied).toEqual([]);
  });

  it('never calls anything « conforme »: the views show an automated pre-audit', () => {
    const claims = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/\b(non[\s-])?conformes?\b/gi)].map((match) => `${path}: ${match[0]}`),
    );

    expect(claims).toEqual([]);
  });
});
