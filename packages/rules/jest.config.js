import { nodeJestConfig } from '../../jest.preset.js';

// This package is pure logic and must stay fully covered: the build fails below 100 %.
export default nodeJestConfig({
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
});
