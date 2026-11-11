# Tests and TDD workflow

Rule: every feature and every bug starts from a failing test. Write the test, see it red, write the minimum code, see it green, clean up.

## Levels

| Level | Where | What it covers | Cost |
|---|---|---|---|
| Unit API | `apps/api/src/**/*.spec.ts` | Pure logic and classes with fake dependencies (permissions, tokens, mail texts, guards) | seconds, no Docker |
| Integration API | `apps/api/test/*.int-spec.ts` | Real Nest app, real Postgres 16 (Testcontainers), `app.inject`. Business rules, tenants, roles, migrations | ~1 min, needs Docker |
| Unit web | `apps/web/tests/unit/*.test.ts` | Plain TypeScript: utils, language parity, API contract | seconds |
| Nuxt web | `apps/web/tests/nuxt/*.test.ts` | Stores, composables, components inside the Nuxt runtime (happy-dom, API mocked with `registerEndpoint`) | seconds |
| E2E | `apps/web/e2e/*.spec.ts` | Real browser (Chrome) against web + API + development DB. Few critical paths | ~20 s |

Pyramid: many unit tests, a fair number of integration tests, very few e2e. Add an e2e only for a path that crosses the whole stack and whose failure blocks use of the app.

## Commands

```bash
# API (apps/api)
npm run test:unit        # fast, on every save: npm run test:watch
npm run test:int         # requires Docker running
npm test                 # unit + integration

# Web (apps/web)
npm run test:unit
npm run test:nuxt
npm test                 # unit + nuxt
npm run test:coverage
npm run test:e2e         # see below
```

### E2E: prerequisites

1. Development database and API with the test outbox enabled (mails containing tokens are read from `/api/__test/outbox`, active only with `E2E_OUTBOX=1`, which is set in `apps/api/.env.dev` and never in production):
   `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
2. Chrome installed (no browser is downloaded). The web dev server starts by itself if it is not already running.
3. Every test uses unique emails: the development database does not need cleaning. Never point the e2e tests at an environment with real data.

If the API is not ready, `e2e/global-setup.ts` stops immediately and prints the command to run.

## Conventions

- **Extract logic into pure functions** and test them first. Examples: `decideAccess` (web, route access), `outboxEnabled`, `token.service`. The guard or component stays a thin shell.
- **API**: one `*.spec.ts` file next to the source for unit tests; integration tests use `startEnvironment()` and `newUser()` from `test/helpers.ts`. One integration test for every tenant rule and for every role that must be rejected.
- **Web**: test errors by the API `code`, never by the text. `tests/unit/i18n.test.ts` fails if en/fr lose a key or a placeholder, or if the API introduces a `code` without a translation: add the text in `it.ts`, `en.ts`, `fr.ts` together with the code.
- **Nuxt tests**: composables that use `useI18n()` must run inside `setup` (`inSetup` in `tests/nuxt/helpers.ts`). The API URL in tests is relative (`baseApiRelative`) and fake endpoints are registered with the `/api` prefix.
- **E2E**: after `page.goto` use `go()` (it waits for hydration; in development, clicks made earlier are lost). Select by role and visible text, as a person would.
- A bug found in use or in review is first reproduced with a test, at the lowest level that catches it, and then fixed.

## For every new slice

1. Write the business rules as unit/integration tests (red): permissions by role and scope, isolation between companies, validations, error codes.
2. Implement the backend until green.
3. Write the Vitest tests for stores and composables, then the UI. Add the texts in the three languages.
4. An e2e only if a new critical path appears.
5. Before closing: run only the tests the change needs (the ones that cover it plus the suites where a regression is plausible), keep both typechecks clean, and run `npm run test:e2e` only if a covered path was touched. The full `npm test` runs on explicit request.
