import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // `.test.js` is here because `backend/src/scripts/` is plain JavaScript on
  // purpose: those scripts run from source inside the container and cannot
  // import compiled TypeScript. Matching only `.test.ts` meant every test
  // written beside them was collected by nobody and passed by default — five
  // suites and 117 assertions that had never once run in CI, which is a worse
  // state than having no tests at all, because the green tick was reporting on
  // an empty set. All five pass; adding the pattern is what makes them real.
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.js'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/controllers/**/*.ts',
    'src/utils/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      // Skip cross-file type checking during test runs. ts-jest's default
      // type-checks the full import graph, which on this codebase pulls in
      // 100+ Sequelize models (models/index.ts is 1000+ lines) and exhausts
      // the V8 heap. `tsc --noEmit` is the canonical type gate; jest is the
      // runtime gate.
      isolatedModules: true,
    }],
  },
};

export default config;
