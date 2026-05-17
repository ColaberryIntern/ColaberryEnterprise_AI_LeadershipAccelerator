import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
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
