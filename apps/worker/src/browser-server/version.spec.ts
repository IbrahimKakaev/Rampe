import { readFileSync } from 'node:fs';

import { describe, expect, it } from '@jest/globals';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('browser image', () => {
  it('ships the browsers of the playwright-core version the worker drives them with', () => {
    const { dependencies } = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>;
    };
    const image = /^ARG PLAYWRIGHT_IMAGE=mcr\.microsoft\.com\/playwright:v([\d.]+)-/m.exec(
      read('../../../../docker/Dockerfile'),
    );

    expect(image?.[1]).toBeDefined();
    expect(dependencies['playwright-core']).toBe(image?.[1]);
    expect(dependencies['@axe-core/playwright']).toBeDefined();
  });
});
