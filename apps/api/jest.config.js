const base = {
  testEnvironment: 'node',
  rootDir: '.',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: false }] },
};

/**
 * Due progetti:
 * - unit: logica pura in src/**\/*.spec.ts, nessuna dipendenza esterna, secondi.
 * - integration: API vera + Postgres reale (testcontainers) in test/**\/*.int-spec.ts, richiede Docker.
 */
module.exports = {
  testTimeout: 120000,
  maxWorkers: 1,
  projects: [
    { ...base, displayName: 'unit', testRegex: 'src/.*\.spec\.ts$' },
    { ...base, displayName: 'integration', testRegex: 'test/.*\.int-spec\.ts$' },
  ],
};
