import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Jest configuration shared by the Node packages (everything except apps/web).
 * Tests run as native ES modules; workspace packages resolve to their sources
 * so that no build is needed before testing.
 */
export function nodeJestConfig(overrides = {}) {
  return {
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
      '^(\\.{1,2}/.*)\\.js$': '$1',
      '^@rampe/shared$': `${root}packages/shared/src/index.ts`,
      '^@rampe/rules$': `${root}packages/rules/src/index.ts`,
    },
    transform: {
      '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
    },
    testMatch: ['<rootDir>/src/**/*.spec.ts'],
    collectCoverageFrom: ['<rootDir>/src/**/*.ts', '!<rootDir>/src/**/*.spec.ts'],
    coverageDirectory: '<rootDir>/coverage',
    restoreMocks: true,
    ...overrides,
  };
}
