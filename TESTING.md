# Tests and TDD workflow

Rule: every feature and every bug starts from a failing test. Write the test, see it red, write the minimum code, see it green, clean up.

## Levels

| Level | Where | What it covers | Cost |
|---|---|---|---|
| Unit API | `apps/api/src/**/*.spec.ts` | Pure logic and classes with fake dependencies (permissions, tokens, mail texts, guards) | seconds, no Docker |
| Integration API | `apps/api/test/*.int-spec.ts` | Real Nest app, real Postgres 16 (Testcontainers), `app.inject`. Business rules, tenants, roles, migrations | ~1 min, needs Docker |
| Unit web | `apps/web/tests/unit/*.test.ts` | Plain TypeScript: utils, language parity, API contract, source scans (layout rules, generated tokens) | seconds |
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

### E2E: layout sweep

`e2e/layout.spec.ts` is the one e2e that covers every page instead of one critical path, because it checks geometry, not behavior. It renders the 37 pages (plus the player views of the call-up and attendance pages) with sessions built through the API (admin, member, no club, two clubs, incomplete record). What it checks depends on the width:

- 390 px: no sideways scroll, h1 24 px, content gutter 16 px, one 24 px gap between page blocks, touch targets and inputs (buttons at least 44 px, inputs no shorter than before), the "Altro" sheet items, and that the call-up send button is not covered by the tab bar.
- 768 px: no sideways scroll and the 248 px sidebar.
- 1440 px: the content fills the width after the sidebar.
- 1920 px: h1 32 px, sidebar at the left edge, 248 px wide, content box 1280 px centered in the remaining width, gutter 24 px, one 32 px gap between page blocks, the 768 px column of the four narrow pages, the auth card (440 px) and legal column (768 px) widths, 16 px body text on the reference elements of structure, people, season and roster pages and on the auth and legal intro paragraphs, and the call-up action bar on the content box.

16 px body text elsewhere is not asserted by the sweep. It stays a page edit rule (see `CLAUDE.md`, "Layout e tipografia").

The geometry lives in pure functions (`e2e/layout-checks.ts`, tested by `tests/unit/layout-checks.test.ts`), so a bug in a measurement cannot turn into a false green. `tests/unit/layout-sources.test.ts` covers the rules the browser cannot reach, such as alternate h1 states, and runs with `npm run test:unit` (no browser, no API): no h1 carries a size or weight class, every page root carries `tm-page`, exactly four pages carry `tm-page--narrow`, no `max-w-3xl` remains, and `app/assets/css/tokens.css` equals the output of `theme-transform.mjs` for `mockup/ui/css/tokens.css`.

```bash
cd apps/web
npx playwright test e2e/layout.spec.ts                      # the whole sweep, about 9 minutes
npx playwright test e2e/layout.spec.ts -g "player"          # a subset, by test title
LAYOUT_LOG=1 npx playwright test e2e/layout.spec.ts         # also prints block counts, input heights and any console error, warning or page error per page
LAYOUT_SHOTS=after npx playwright test e2e/layout.spec.ts   # also saves full-page screenshots to test-results/layout-after/
```

Same prerequisites as above (API with `E2E_OUTBOX=1`). Each run creates a handful of accounts with unique emails and logs each one in once through the API. Playwright empties `test-results/` at the start of every run, so copy the screenshots out right after. A new page needs a row in the `PAGES` table of the spec; the table does not discover pages.

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
