import { nodeJestConfig } from '../../jest.preset.js';

export default nodeJestConfig({
  // The Prisma client is generated code.
  coveragePathIgnorePatterns: ['/src/generated/'],
});
