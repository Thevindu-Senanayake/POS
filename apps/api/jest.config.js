/**
 * Jest config for API unit tests (money/stock domain logic + service helpers).
 * ts-jest reads the package tsconfig so NestJS decorator metadata and the
 * `@pos/*` workspace packages resolve exactly as they do at build time.
 * Env is loaded by the `test` script via `dotenv -e ../../.env`.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  setupFiles: ['<rootDir>/test/jest-setup.ts'],
  testEnvironment: 'node',
  clearMocks: true,
};
