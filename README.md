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
| Deploy | Docker Compose on Coolify |

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

- **Database.** A Coolify PostgreSQL resource with scheduled S3 backups. `DATABASE_URL` is the resource internal URL.
- **Variables.** Set in the Coolify application. Required ones are listed in `docker-compose.prod.yml`: `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `ALLOWED_ORIGINS`, `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `STORAGE_ENCRYPTION_KEY` and the `S3_*` group. Web Push is optional: set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` as secrets (pair generated with `npx web-push generate-vapid-keys`, different from development). Without them the app works and push is not offered.
- **Sensitive files** (medical certificates and other documents). Use a dedicated private S3 compatible bucket, for example Cloudflare R2 with EU jurisdiction. Files are encrypted by the app with `STORAGE_ENCRYPTION_KEY` before upload, so the provider only sees opaque bytes. Enable versioning or replication for backups (the DB backups do not cover the bucket). Keep the key outside Coolify: losing it makes every file unreadable, and changing it requires re-encrypting existing files. A DPA with the storage provider is required.
- **Domain and TLS.** Assigned in Coolify to the `api` service (port 3001), routed by Traefik.
- **Migrations and seed.** They run when the container starts. If they fail the container does not start and Coolify keeps the previous version.
- **Web.** Added later as a second service in the same file, with the same label scheme.

## Roadmap

1. **Events and calendar.** Trainings and matches in the active season, recurring series, venues, opponents, personal calendar.
2. **Call-ups.** Three computed lists (called up, available, blocked), one tap answer from the player, availability for staff.
3. **Attendance, absences and suspensions.** Suspension days computed from the calendar and carried over when a season is cloned.
4. **Notifications.** In-app, email and push, user preferences, certificate expiry alerts at 30 and 15 days.

Details and data model in [ANALISI.md](ANALISI.md).

## License

[GNU AGPL v3](LICENSE).
