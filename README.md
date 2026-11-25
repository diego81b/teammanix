# TeamManix

Multi-tenant PWA for sports clubs. A club registers itself, creates its structure (optional sections, teams, seasons), registers people and invites staff, managers and players with scoped access roles. Coaches plan trainings and matches, call players up and track attendance.

> Status: early development. Club, structure, people, roster, invitations, roles, permissions and medical certificates are implemented. Events, call-ups, attendance and notifications come next (see [Roadmap](#roadmap)).


## Features

- **Self-service clubs.** Whoever creates a club becomes its admin. Registration with email verification, password reset and login. The UI is available in Italian, English and French.
- **Structure.** Club, optional sections that group teams, teams (a sport profile each) and seasons. One active season and one draft per team. A season can be closed, cloned into a draft with a chosen roster, or promoted to another team.
- **People and roster.** A person (player or staff) is a registry record, separate from a user account. It is linked to an account when an invitation is accepted.
- **Access roles with scope.** Roles apply to the whole club, one section or one team. Fine-grained permissions can be adjusted per person. The last admin of a club can never be removed.
- **Invitations by email.** Invite, resend, revoke, accept. Links expire.
- **Medical certificates.** Health data (GDPR art. 9): type, issue and expiry by default, optional encrypted file upload per club. Every read is audited.
- **Strict tenant isolation.** Every club-owned entity carries a tenant filter that fails closed.

## Tech stack

| Area | Technology |
|---|---|
| API | NestJS 11 on Fastify, MikroORM 6, PostgreSQL 16, JWT, argon2 |
| Web | Nuxt 4 (SPA, `ssr: false`), Vue 3, TypeScript, Nuxt UI 4, Pinia, `@nuxtjs/i18n` |
| Mail | Brevo transactional API |
| Files | AES-256-GCM encrypted by the app; filesystem driver in development, any S3 compatible service in production |
| Tests | Jest and Testcontainers (API), Vitest and `@nuxt/test-utils` (web), Playwright (end to end) |
| Deploy | Docker Compose on Coolify (API on Node, web as static files behind nginx) |

The repository is a monorepo without a workspace root: `apps/api` and `apps/web` are independent npm projects.

```
apps/
  api/        NestJS API, entities, migrations, seed, integration tests
  web/        Nuxt SPA, i18n locales (it, en, fr), unit, Nuxt and e2e tests
docs/         glossary (Italian to English domain terms)
mockup/       UI mockups and brand assets
ANALISI.md    functional analysis and data model (Italian)
TESTING.md    test levels and conventions
CLAUDE.md     guidance for AI coding assistants
```

## Getting started

Requirements: Docker, Node.js 22.

### 1. API and database

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

This starts PostgreSQL (`127.0.0.1:5433`, user and database `teammanix`, password `devpassword`) and the API (`http://127.0.0.1:3001/api`). On start the API applies migrations and the seed, and nodemon restarts it on every change.

Configuration lives in one env file per app, inside the app folder, never in the repository root:

- `apps/api/.env.dev` holds the committed development defaults and is read by the compose file.
- `apps/api/.env` is for personal values and secrets. It is not versioned and overrides `.env.dev`. Use `apps/api/.env.example` as a model.

Without `BREVO_API_KEY` emails are only written to the API log. With a key, `MAIL_FROM_EMAIL` must be an address on a domain authenticated in Brevo, or the API refuses to start.

### 2. Web

```sh
cd apps/web
npm install
npm run dev        # http://localhost:5173
```

The web app uses the same convention: defaults in `apps/web/.env.dev`, personal values in `apps/web/.env` (model: `.env.example`, only `NUXT_PUBLIC_*` variables).

### 3. Reset the development database

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

## Development workflow

TDD is mandatory: a failing test first, then the minimum code, then refactor. Test levels, commands and per-slice checklists are in [TESTING.md](TESTING.md).

```sh
# API
cd apps/api
npm run test:unit        # no Docker needed
npm run test:int         # Testcontainers, needs Docker
npm run typecheck

# Web
cd apps/web
npm test                 # unit and Nuxt runtime tests
npx nuxt typecheck
npm run test:e2e         # Playwright, needs the API running with E2E_OUTBOX=1
```

Create a migration after changing an entity:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:create
```

Conventions:

- Code is in English: identifiers, API routes, web URLs, DB schema, error codes, comments, test names, commits, issues and PRs. Italian is only for user-facing texts (i18n, emails, legal pages) and the specs. The domain vocabulary is in [docs/glossary.md](docs/glossary.md).
- Every API error has a stable uppercase `code`. The web app translates by code and never shows the server `message`.
- Business rules live in pure functions tested first. Guards, components and middleware stay thin.

## Deployment (Coolify on Hetzner)

`docker-compose.prod.yml` is a standalone file, not an overlay. Create a Docker Compose application in Coolify that points to it.

The whole setup (project, database, application, variables, domains, deployment) can be provisioned from code with OpenTofu instead of clicking in Coolify: see [infra/coolify/README.md](infra/coolify/README.md), which also covers rebuilding an environment from zero. The list below is what that configuration sets up, and the reference for doing it by hand.

- **Database.** A Coolify PostgreSQL resource with scheduled S3 backups. `DATABASE_URL` is the resource internal URL.
- **Variables.** Set in the Coolify application. Required ones are listed in `docker-compose.prod.yml`: `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `ALLOWED_ORIGINS`, `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `STORAGE_ENCRYPTION_KEY` and the `S3_*` group. Web Push is optional: set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` as secrets (pair generated with `npx web-push generate-vapid-keys`, different from development). Without them the app works and push is not offered.
- **Sensitive files** (medical certificates and other documents). Use a dedicated private S3 compatible bucket, for example Cloudflare R2 with EU jurisdiction. Files are encrypted by the app before upload (a random key per file, wrapped by `STORAGE_ENCRYPTION_KEY`), so the provider only sees opaque bytes. The DB backups do not cover the bucket (see Backups). Keep the key outside Coolify: losing it makes every file unreadable, and replacing it follows the rotation procedure below. A DPA with the storage provider is required.
- **Domain, TLS and routing.** One domain for the whole app, split by path in Coolify. The `web` service (static SPA behind nginx, port 80) takes the root, for example `https://app.example.com`. The `api` service (port 3001) takes `https://app.example.com/api`, with prefix stripping off because the API routes already start with `/api`. The web bundle calls `/api` (build argument `NUXT_PUBLIC_API_BASE_URL`, default `/api`, baked in at build time), so there is no CORS: set `APP_URL` and `ALLOWED_ORIGINS` to the web origin. To serve the API from another host, rebuild the web service with that URL as the build argument.
- **Migrations and seed.** They run when the container starts. If they fail the container does not start and Coolify keeps the previous version.
- **Web health.** `/healthz` on the web container. Every client route falls back to `index.html`, `/_nuxt/*` is cached for a year, `index.html` and `sw.js` are always revalidated.

### Mail domain (Brevo)

Authenticate the sending domain in Brevo (Senders, domains and dedicated IPs, Domains) before the first real email. Without it Gmail and Outlook route the mail to spam, and the API refuses to start if `MAIL_FROM_EMAIL` is not on an authenticated domain.

1. Add the domain in Brevo and publish the DNS records it shows: the Brevo code TXT, the two DKIM CNAMEs (`brevo1._domainkey`, `brevo2._domainkey`) and the SPF TXT with `include:spf.brevo.com`. Keep a single SPF record per domain: merge the include into the existing one.
2. Publish DMARC, starting in monitoring mode: `_dmarc  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com"`. After a few weeks of clean reports move to `p=quarantine`.
3. Set `MAIL_FROM_EMAIL` to an address on that domain.
4. Check: send a registration verification email to a Gmail and an Outlook mailbox. It must reach the inbox, and "Show original" must read `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

### Backups

Two things need a backup, and neither covers the other.

- **Postgres.** Scheduled backups on the Coolify PostgreSQL resource, to an S3 destination that is not the file bucket. Keep at least 14 daily copies.
- **File bucket.** Not backed up for the pilot (one club, few certificate files, decided 2026-11-18). Cloudflare R2 has no S3 versioning switch, so a copy needs a scheduled job (for example `rclone`) to a second bucket with separate credentials. Add it before opening to more clubs. Until then a deleted or overwritten file is gone, and the club uploads the certificate again (type and dates live in the database).
- **Never store the encryption key next to a bucket backup.** A stolen backup is readable only if the key is next to it.
- **Restore drill** (once before the pilot, then after any change of provider). On a spare Coolify environment: restore the database dump, point a copy of the API at the restored database and at the production bucket (read-only credentials, or a copy of the bucket if one exists), with the production `STORAGE_ENCRYPTION_KEY`, log in and download one certificate file. If the download fails with an authentication error, the key or the bucket is wrong. Write the date and the result of the drill below.

| Date | Who | Database | Bucket | Certificate download |
|---|---|---|---|---|
| (to fill in) | | | | |

### Key custody (`STORAGE_ENCRYPTION_KEY`)

The key is 32 random bytes in base64. Losing it makes every stored file unreadable, and there is no recovery.

- **Generate:** `cd apps/api && npm run keys:gen -- prod` (also `staging` and `dev`, default `dev`). It writes `JWT_SECRET` and `STORAGE_ENCRYPTION_KEY` to `secrets/<env>/` in the repository root (gitignored) and, for staging and prod, a `coolify-env.txt` ready to paste into Coolify. It refuses to overwrite existing files. Delete `coolify-env.txt` once the values are in the password manager and Coolify. Never reuse the development value.
- **Primary copy:** the company password manager, in a vault shared with at least two named people, so no single person is a point of failure. The Coolify secret is a working copy, not the record.
- **Emergency copy:** printed or on an encrypted USB drive, in a sealed envelope kept offline by the legal representative of the company. Different place from any bucket backup.
- **Retrieval, written for the second person:** open the password manager, vault "TeamManix production", entry "STORAGE_ENCRYPTION_KEY". If the manager is unreachable, use the emergency envelope. Check a retrieved key by setting it on the spare environment of the restore drill and downloading a file.
- **Rotation.** Each file has its own random key, wrapped by `STORAGE_ENCRYPTION_KEY` and stored with the key id, so a rotation rewraps the small per-file keys and never re-encrypts the files. Generate a new key, set it as `STORAGE_ENCRYPTION_KEY`, put the old one in `STORAGE_ENCRYPTION_KEY_PREVIOUS` (comma separated list), redeploy: old files stay readable, new files use the new key. Then run `npm run storage:rewrap -- --dry-run` and `npm run storage:rewrap` in the API container (add `--club <id>` for one club): it is safe to repeat and stops at the first object it cannot read. When it reports nothing left to rewrap, remove the old key from `STORAGE_ENCRYPTION_KEY_PREVIOUS`. After a suspected leak of the key, rotate immediately and treat the old bucket backups as exposed: they stay readable with the old key until it is destroyed. Update the password manager and the emergency copy in the same session, and destroy the old emergency copy. Inventory, loss and rotation of every server secret: [docs/ops/keys.md](docs/ops/keys.md).

### Releases and CI

- **CI.** Every pull request and every push to `develop`, `staging` and `main` runs `.github/workflows/ci.yml`: API typecheck and unit tests, web typecheck and unit and Nuxt tests. Integration and e2e tests are not in CI yet.
- **Staging.** Merge `develop` into `staging`. Coolify deploys the `staging` branch on each push.
- **Branch rules.** `staging` and `main` accept only commits on which the CI jobs `api` and `web` passed, and are never force pushed or deleted; `production` moves only through the release workflow. Webhook and rules are managed by OpenTofu: [infra/coolify/README.md](infra/coolify/README.md), "Continuous deployment".
- **Production.** Merge `staging` into `main`, then push a tag `vX.Y.Z` on the `main` commit. `.github/workflows/release.yml` runs CI, refuses a tag that is not reachable from `main`, and moves the `production` branch to the tag. Coolify deploys `production` on each push.
- **Rollback.** The release workflow only moves `production` forward (a non-fast-forward push fails). Roll back with a fix commit on `main` and a new tag.

## Roadmap

1. **Events and calendar.** Trainings and matches in the active season, recurring series, venues, opponents, personal calendar.
2. **Call-ups.** Three computed lists (called up, available, blocked), one tap answer from the player, availability for staff.
3. **Attendance, absences and suspensions.** Suspension days computed from the calendar and carried over when a season is cloned.
4. **Notifications.** In-app, email and push, user preferences, certificate expiry alerts at 30 and 15 days.

Details and data model in [ANALISI.md](ANALISI.md).

## License

[GNU AGPL v3](LICENSE).
