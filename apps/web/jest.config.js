import { fileURLToPath } from 'node:url';

import presets from 'jest-preset-angular/presets/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const preset = presets.createEsmPreset({
  tsconfig: '<rootDir>/tsconfig.spec.json',
  testEnvironment: 'jest-preset-angular/environments/jest-jsdom-env',
});

export default {
  ...preset,
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@rampe/shared$': `${root}packages/shared/src/index.ts`,
    '^@rampe/rules$': `${root}packages/rules/src/index.ts`,
  },
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  restoreMocks: true,
};
