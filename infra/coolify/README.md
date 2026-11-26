# infra/coolify

OpenTofu configuration that provisions one TeamManix environment on an existing Coolify: project, environment, PostgreSQL, the compose application (`docker-compose.prod.yml`, cloned over SSH with a read only deploy key), its variables and the deployment. One tofu workspace per environment: `staging` now, `prod` later (always `prod`, never `production`: Coolify creates an environment with that name in every new project and the two would clash).

Status: validated (`tofu fmt`, `init`, `validate`, `tofu test` with a mocked provider) and `tofu.ps1` and `credentials.ps1` tested against the real Credential Manager with throwaway values. Not yet applied against a live Coolify: the first apply may need small fixes, see "Check after the first apply".

This guide is meant to rebuild everything from zero: a new PC, a new environment, a Coolify that was destroyed, a new server.

## What is and is not automated

| Automated here | By hand, once per environment |
|---|---|
| Coolify project, environment, PostgreSQL, compose app, variables, domain mapping, deployments | DNS record (Cloudflare) |
| Backup storage and the daily Postgres backup schedule | S3 bucket for the sensitive files |
| Git deploy key (`npm run coolify:secrets`) | S3 bucket for the Postgres backups (a second, dedicated bucket) |
| `JWT_SECRET`, `STORAGE_ENCRYPTION_KEY` (generated) | Brevo account, authenticated domain, API key |
| Encrypted state, one workspace per environment | Coolify itself: install, enable the API, create the root token |
| GitHub push webhook to Coolify, branch rulesets with the required CI checks | The deploy branch (`git push`), the GitHub token |

## Tools on the PC

`tofu` (`winget install OpenTofu.Tofu`), Node 22 (for `npm run coolify:secrets`), `gh` logged in with admin rights on the repository, `ssh-keygen` (Git for Windows has it), Windows PowerShell 5.1 or later. No PowerShell module is needed.

## 1. Credentials on the PC (once per PC)

The Coolify token and the state passphrase live in the Windows Credential Manager (generic credentials named `teammanix/<name>`, visible in Control Panel, Credential Manager, Windows Credentials), never in a file or a permanent environment variable. No module to install: `credman.ps1` talks to the Windows API. `tofu.ps1` reads the entries, hands them to one tofu process and removes them from the environment when it ends. Run `credentials.ps1` in your own terminal, not through Claude Code: values are typed at a hidden prompt or generated, they never go through a command line or a file.

```powershell
.\infra\coolify\credentials.ps1 set coolify-endpoint      # https://coolify.example.com, no trailing slash
.\infra\coolify\credentials.ps1 set coolify-token         # root token, see section 2
.\infra\coolify\credentials.ps1 set github-token          # fine-grained GitHub token, see "Continuous deployment"
.\infra\coolify\credentials.ps1 new-passphrase staging    # prod: new-passphrase prod
.\infra\coolify\credentials.ps1 check staging             # which entries exist, never the values
```

Windows protects the entries with the key of the current user: nothing is in plaintext on disk, but any process of your user can read them (Claude Code included, when it runs `tofu.ps1`). Keep the PC disk encrypted (BitLocker).

`new-passphrase` generates the state passphrase (24 random bytes in base64), stores it as `teammanix-<env>-tofu-passphrase` and prints it once: copy it into the password manager next to the other keys of the environment and close the terminal. It refuses to replace an existing one, because a new passphrase makes the existing state unreadable. Set it before the first apply. Without the passphrase tofu refuses to run, so the state is never written in plaintext.

## 2. Coolify (once per instance)

Versions: Coolify 4.1.0 is the minimum, 4.7.0 or later is recommended for writes. The provider (0.1.34) is pinned and its API contract was written against Coolify 4.6.0.

1. Settings: enable the API.
2. Keys & Tokens: create a token with the **root** permission. Three reasons it must be root: the backup storage endpoint (`/s3-storages`) rejects scoped tokens; the provider reads the database password only with `root` or `read:sensitive`, otherwise `DATABASE_URL` stays empty; and since Coolify 4.6.0 a token limited to one project does not isolate the server, so a narrower token buys no safety. The token controls everything on the instance, so it is for Tofu only. Store it with `credentials.ps1 set coolify-token` (section 1).
3. Note the UUID of the server (the id in the URL of its page). It goes in `<env>.tfvars`.
4. The compose file joins the external Docker network `coolify`, which every Coolify server has. If the server has several destinations, the database must be on `coolify` too: set `destination_uuid`.

## 3. Inputs outside Coolify (once per environment)

- **DNS (Cloudflare).** An A record, for example `staging`, to the IP of the Hetzner server. The full name is the `domain` variable. Set it to **DNS only** (grey cloud): with the orange proxy the Let's Encrypt certificate may not be issued; once it works you can turn the proxy on with SSL mode "Full (strict)". A wildcard `*.example.com` to the same server already covers it. The record must exist before stage 2 of the apply, not before `plan`.
- **S3 bucket** for the sensitive files, private, one bucket per environment (see the main README: sensitive files, backups, key custody). You need endpoint, bucket, access key id and secret.
- **S3 bucket for the Postgres backups**, a second bucket, not the one above. Private, with at-rest encryption from the provider (Coolify is not known to encrypt dumps itself, and they hold personal data, certificate metadata included). The endpoint must be public: the provider rejects a private host. Create an access key scoped to this bucket only, and different from the `S3_*` key of the app: the app never receives the backup values, but a shared key would let a compromised API container read or delete the backups. You need endpoint, region, bucket, access key id and secret.
- **Brevo.** Authenticated sending domain (SPF, DKIM, DMARC records in the same Cloudflare, the DKIM CNAMEs stay DNS only; steps in the main README, "Mail domain"), an API key, and a `MAIL_FROM_EMAIL` on that domain.

## 4. Secrets and variables (once per environment)

```sh
cd apps/api && npm run coolify:secrets -- staging     # or prod
```

It works on `secrets/<env>/` (gitignored):
- `secrets.json`, flat NAME to value. It adds `JWT_SECRET` and `STORAGE_ENCRYPTION_KEY` when missing (the files of `keys:gen`, `jwt_secret.key` and `storage_enc.key`, stay the record and are reused) and adds an empty entry for every other required variable of `docker-compose.prod.yml`, plus the five backup entries `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`. They are in `secrets.json` but the app never receives them: Tofu uses them for the backup storage and keeps them out of the application variables.
- `deploy_key` and `deploy_key.pub`: an ed25519 key, registered on the repository as a read only deploy key titled `coolify-<env>`.

Nothing that exists is overwritten. Fill in the empty values (`BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; optional: `S3_REGION`, `MAIL_FROM_NAME`, `VAPID_*`; an optional entry left empty is dropped and the default of the compose file applies), and the five `BACKUP_S3_*` values, all required, then run it again: it lists what is still empty. A plan stops with `Backup bucket keys missing or empty in secrets.json` and the names while one of the five is empty. `DATABASE_URL`, `APP_URL` and `ALLOWED_ORIGINS` are computed by Tofu and must not be in the file. A unit test keeps this list and `docker-compose.prod.yml` aligned.

Then copy `staging.tfvars.example` to `staging.tfvars` (gitignored) and fill in `server_uuid`, `domain`, `deploy_key_file`. Set the branch Coolify deploys: `git_branch = "staging"` for staging; for prod `git_branch = "production"` and `release_branch = "main"` (see "Continuous deployment"). The backup schedule (`0 3 * * *`), its retention in the backup bucket (30 days) and on the server (7 days) have defaults; the example lists them commented out.

## 5. Apply

```powershell
.\infra\coolify\tofu.ps1 init
.\infra\coolify\tofu.ps1 plan
.\infra\coolify\tofu.ps1 apply                            # stage 1: creates everything, deploys without domains
.\infra\coolify\tofu.ps1 apply -var domains_enabled=true  # stage 2: web on the root, api on /api, redeploys
```

`tofu.ps1` takes the environment from `$env:TEAMMANIX_ENV` (default `staging`; for prod: `$env:TEAMMANIX_ENV = 'prod'`), selects the workspace of that environment, passes the same name to tofu as `var.environment` (`TF_VAR_environment`, no default, so the Coolify project is `teammanix-<env>`; do not put an `environment` line in the tfvars: a value in the variable file wins over `TF_VAR_environment`, so one that differs from `TEAMMANIX_ENV` would name the project after something other than the workspace), passes `secrets/<env>/secrets.json` as `TF_VAR_secrets` and `<env>.tfvars` as variable file, and forwards every other argument to tofu.

Two stages because the provider sends `docker_compose_domains` in a PATCH right after creating the application, before Coolify has loaded the compose file, and gets a 422 (the provider guide `docs/guides/common-errors.md` describes it). Stage 1 creates the application without domains and deploys it, which loads the compose file; stage 2 adds the domains. Stage 2 needs the DNS record.

After stage 2 works, add `domains_enabled = true` to `<env>.tfvars`. The variable defaults to `false` and `-var` is not remembered, so a later plain `plan` or `apply` would plan to go back to stage 1: update the application and replace the deployment, which redeploys. Until the line is in the file, pass `-var domains_enabled=true` every time. Setting it back to `false` is not a proven rollback, because nobody checked that Coolify clears the domain mapping when the domain goes null: to take the domains off, clear them in the Coolify UI.

**Read the plan before every apply, prod above all.** If a prod plan shows a replace (`-/+`) or a destroy of `coolify_database_postgresql.db`, stop: do not apply. The usual cause is a changed `server_uuid` or `destination_uuid`. Replacing the database deletes its data, and Coolify has no on-demand database backup (see "Backups, restore, rollback"). Take a dump by hand first ("Manual dump before a risky change" in "Backups, restore, rollback"), restore it into the new database afterwards through the Coolify import, and treat recovery as roll-forward: fix the input, import what exists, apply again. Never destroy to get out of a bad state in prod, or in any environment that holds data.

## Check after the first apply

- The API container starts and `https://<domain>/api/health` answers, the web opens on the root.
- `DATABASE_URL` works. If the database host does not resolve, the database and the app are on different Docker networks: set `destination_uuid` and apply again (this replaces the database: take a dump by hand first, see "Manual dump before a risky change", then restore its data; see "Read the plan before every apply" in section 5).
- Each application variable is its own resource (`coolify_environment_variable.app["KEY"]`), so a key removed from `secrets.json` is deleted from the application on the next apply. A create fails when Coolify already holds that key (it may create entries for the `${VAR:?}` names it parses from the compose file). For each key the error reports, import it and apply again. The address has quotes inside, and the two PowerShell families pass them to a native program differently. Windows PowerShell 5.1 drops them unless they are escaped; PowerShell 7.6 passes the argument as written (those two are the versions checked; other 7.x versions were not, so if the address reaches tofu without its quotes, use the other form):

  ```powershell
  # PowerShell 7.6 (the quotes arrive as written)
  .\infra\coolify\tofu.ps1 import 'coolify_environment_variable.app["KEY"]' application:<application-uuid>:<env-var-uuid>
  # Windows PowerShell 5.1
  .\infra\coolify\tofu.ps1 import 'coolify_environment_variable.app[\"KEY\"]' application:<application-uuid>:<env-var-uuid>
  ```

  The env-var uuid is in the Coolify UI or in the application's variables list. Read the plan after an import: `is_literal`, `is_build` and the other flags of an imported variable are not set from the configuration, so the plan may show an in-place update on them.
- Three things only the live apply settles, so read the stage 1 plan before applying: whether Coolify pre-creates the compose keys (above), whether `is_build` (left at the provider default) lets compose interpolation work at build time, and whether Coolify accepts the backup storage. `tofu test` mocks the provider and proves the configuration logic only (key sets, the plan-time stop, the schedule arguments).
- Coolify may create the backup storage with its `is_usable` flag false, and nothing in this configuration validates the connection. Right after stage 1 open Storages in Coolify and see whether the backup storage shows as usable. If it does not, press Validate connection there. Then check the first scheduled run (`backup_frequency`, 03:00 on the server's clock by default): the database's Backups page shows it successful and sent to S3, and the bucket holds a dump of that night. Whether a scheduled run needs a usable storage is not known.
- `NUXT_PUBLIC_API_BASE_URL` is deliberately not set: the compose default `/api` is right and it is a build argument.
- A new commit is not deployed by `tofu apply` (the deployment resource reruns only when the variables, the branch or the stage change). A push to the deploy branch deploys through the GitHub webhook (see "Continuous deployment"); the Coolify UI deploys by hand.
- The provider contract is pinned to Coolify 4.6.0, with 4.1.0 as the minimum and 4.7.0 or later recommended for writes. A resource that fails on an unknown field is a provider issue: check its releases before working around it.

## Continuous deployment (`github.tf`)

Flow: `develop` is merged into `staging` and Coolify deploys `staging`. For prod, `staging` is merged into `main`, a tag `vX.Y.Z` is pushed on `main`, and `.github/workflows/release.yml` runs CI and moves `production` to the tag; Coolify deploys `production`. The flow for people is in the main README, "Releases and CI".

Each workspace manages, for its own environment only:
- **Webhook.** A repository webhook, push events only, to `<coolify-endpoint>/webhooks/source/github/events/manual?environment=<env>`. The secret is generated (`random_password.webhook`) and set on both sides: GitHub signs each push with it and Coolify (`manual_webhook_secret_github` of the application) rejects a push whose signature does not match. Coolify then deploys the applications whose repository and branch match the push. The query string only keeps the URL unique per environment, because GitHub refuses two hooks with the same URL; with staging and prod on one Coolify, each push reaches both hooks and only the application with the matching branch and secret deploys.
- **Checks ruleset** (`teammanix-<env>-checks`): no deletion, no force push, and the CI jobs `api` and `web` (`var.required_checks`, reported by GitHub Actions) must have passed on a commit before it lands. On staging it guards `staging`; on prod it guards `release_branch` (`main`). A pull request or a push of a commit CI already checked (for example `git push origin develop:staging` after CI on `develop` is green) both pass.
- **Release ruleset** (prod only, `teammanix-prod-release`): `production` is updated only by GitHub Actions (the release workflow) and by repository admins, never force pushed or deleted.

Not managed here: the deploy branch itself. It is git history, so it is created with git and a destroy never deletes it; a plan stops if it is missing. Staging: `git push origin develop:refs/heads/staging`. Prod, before its first apply: `git push origin main:refs/heads/production`.

The GitHub token (`teammanix/github-token`) is a fine-grained token limited to this repository: Administration read and write (rulesets), Webhooks read and write, Contents and Metadata read. Create it on GitHub, Settings, Developer settings, Fine-grained tokens, with an expiry date, and store it with `credentials.ps1 set github-token` in your own terminal. Without it a plan still runs (the repository is public and is read anonymously) and an apply fails on the GitHub resources. When it expires, create a new one and set it again; nothing else changes.

Not yet proven live: that the GitHub Actions bypass on the release ruleset lets `release.yml` push `production`. The first tag settles it. If that push is refused, check the bypass list of `teammanix-prod-release` on GitHub (Settings, Rules).

## What to keep, and where

| Item | Where | Lost means |
|---|---|---|
| Coolify token | Credential Manager (`teammanix/coolify-token`) | create a new root token |
| GitHub token | Credential Manager (`teammanix/github-token`) | create a new fine-grained token, see "Continuous deployment" |
| State passphrase | Credential Manager and the password manager | the state is unreadable: delete it and re-apply (see below), the data lives in Coolify and the bucket, not in the state |
| `secrets/<env>/` (`secrets.json`, `.key` files, `deploy_key`) | password manager (attach the folder), local copy gitignored | `STORAGE_ENCRYPTION_KEY` lost = every stored file unreadable, no recovery; the others can be regenerated |
| State (`terraform.tfstate.d/<env>/`) | local, gitignored, encrypted | rebuildable: it holds ids and the generated database password, not data |
| Postgres data | the dedicated backup bucket, written by the schedule Tofu creates (its `BACKUP_S3_*` keys are in `secrets.json`) | see "Backups, restore, rollback" and the restore drill |
| Files | the S3 bucket | see the main README |

## Rebuild scenarios

**Coolify was destroyed, or a new instance replaces it.** The old state points at ids that no longer exist.
1. Install Coolify, enable the API, create a new root token, update `coolify-endpoint` and `coolify-token` with `credentials.ps1 set`.
2. Delete the old state of the environment: `terraform.tfstate.d/<env>/` in `infra/coolify` (or `tofu workspace delete -force <env>` after selecting another one).
3. Put `secrets/<env>/` back from the password manager (same `STORAGE_ENCRYPTION_KEY`, same bucket: the files stay readable). The deploy key can be reused; if it is lost, delete `deploy_key*`, remove the old deploy key from the repository settings and run `npm run coolify:secrets` again.
4. `init`, `apply`, `apply -var domains_enabled=true`. Update the DNS record if the server IP changed.
5. The new database is empty: restore the latest Postgres backup into it (main README, restore drill).

**New environment (prod, or a second staging).** Sections 3 and 4 with its own name, bucket, domain, passphrase secret (`teammanix-<env>-tofu-passphrase`) and `<env>.tfvars`, then `$env:TEAMMANIX_ENV = '<env>'` and the apply of section 5. Its state, secrets and Coolify project (`teammanix-<env>`) are separate from the others.

**New server, same Coolify.** Change `server_uuid`: Tofu replaces the database and the application on the new server (the database is empty again, restore it). Take a dump by hand first ("Manual dump before a risky change") and read the plan as section 5 says ("Read the plan before every apply"). The bucket does not move.

**Rotate the Coolify token.** Create the new token, update it with `credentials.ps1 set coolify-token`, delete the old one in Coolify.

**Destroy an environment.** `.\infra\coolify\tofu.ps1 destroy` removes the project and, with it, the database and its data. Take a backup first (a manual dump, "Manual dump before a risky change"). The dumps already in the S3 bucket survive: `delete_backups`, an attribute of `coolify_database_postgresql` and `coolify_application_private_git`, is left at its default `false` on both, and the provider deletes the backup schedule (`coolify_database_backup`) without asking Coolify to delete the S3 copies. What does go: the schedule's execution history and the dump files kept on the server. What stays behind: the dumps in the bucket are outside `backup_retention_days` from then on, because nothing prunes them any more, and the `BACKUP_S3_*` key still reads them (they hold personal data). Delete them by hand when they are no longer needed. This comes from reading the provider (0.1.34) and Coolify (v4.7.6) source, not from a destroy on a running instance.

## Backups, restore, rollback

- **Backups.** Tofu creates one backup storage on the dedicated bucket and one schedule on the database (`backup_frequency`, default `0 3 * * *`), uploading to that bucket with `backup_retention_days` of retention there and `backup_retention_days_local` on the server. The bucket needs a public S3 endpoint.
- **Restore.** Through the Coolify import of the database (`/databases/{uuid}/imports`), with a dump downloaded from the bucket. Tofu has no resource for it.
- **No on-demand backup.** Coolify has no "run now" endpoint for database backups, and `backup_now` of the provider acts only when the schedule is created. To take one before a risky change, run the dump by hand ("Manual dump before a risky change" below).
- **Rollback.** Tofu has no rollback resource. Rolling back through Tofu means changing an input that feeds `coolify_deployment.triggers` (the branch, for example) and applying. Coolify has its own `POST /applications/{uuid}/rollback`, but nobody has shown it works for a `dockercompose` application. An environment that holds data rolls forward only (fix the input, import, apply again, or restore a dump): `destroy` is a reset only for staging before it holds real data.
- **No exec.** Coolify has no endpoint to run a command in a container, so Tofu cannot run a migration or a shell step: the app does it at startup.

### Manual dump before a risky change

Status: written from the configuration and the usual Postgres tools, not yet run on a live Coolify. It is confirmed for real during the staging restore drill (gate G8 of the release plan: restore the night-1 dump on staging), and this text is corrected there if anything differs.

Needed before anything that can replace the database: a `server_uuid` or `destination_uuid` change, a prod plan with `-/+` on `coolify_database_postgresql.db` (section 5), a destroy.

**Where it runs.** On the Coolify server, over SSH, against the Postgres container Coolify created for `coolify_database_postgresql.db`. This is the one step that is not a Tofu or Coolify API call, because Coolify has no exec endpoint (see "No exec"). The database uuid is in the Coolify UI (the id in the URL of the database page). Coolify is expected to name the container after that uuid; check it:

```sh
docker ps --filter "name=<database-uuid>" --format "{{.Names}}"
```

One line must come back. If none does, list the containers with `docker ps` and pick the Postgres one of this environment's project.

**Dump.** Custom format, from inside the container, as the database user and name Tofu sets (`teammanix` and `teammanix`, `postgres_user` and `postgres_db` in `main.tf`). The single quotes make the container's own shell read `POSTGRES_PASSWORD` from its environment, so the password is never typed, printed or pasted:

```sh
docker exec <container> sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U teammanix -d teammanix -Fc' > teammanix-<env>-<yyyymmdd>.dump
```

`<container>` is the name from the previous step. If the command asks for a password, or `POSTGRES_PASSWORD` is not set in the container, stop and record it for the drill: do not look the password up and put it on a command line.

**Check the file.** Not empty, and readable by `pg_restore`:

```sh
ls -l teammanix-<env>-<yyyymmdd>.dump
docker exec -i <container> pg_restore --list < teammanix-<env>-<yyyymmdd>.dump
```

The second command prints the table of contents of the dump and must end without an error. It reads the file but restores nothing.

**Where to keep it.** Copy it off the server (`scp` to the PC), then delete the copy on the server. Keep it in an encrypted place outside the repository: never in the repo, never in `secrets/`, never next to the Tofu state. It holds personal data and certificate metadata, so it is handled like the backup bucket: delete it once the change is verified.

**Restore.** The Coolify import of the database (`/databases/{uuid}/imports`), as in the "Restore" bullet, into the new or rebuilt database. Whether the import accepts a custom-format file is not known; the drill settles it.

## Deployment status

`deploys.ps1` reads the deployments of the application `teammanix-<env>` with the Coolify API, using the same Credential Manager entries as `tofu.ps1` (`coolify-endpoint`, `coolify-token`). The token stays in the process.

```powershell
.\infra\coolify\deploys.ps1 status                    # last 5: status, commit, message, start, end, duration
.\infra\coolify\deploys.ps1 status -Take 10
.\infra\coolify\deploys.ps1 logs                      # log of the latest deployment
.\infra\coolify\deploys.ps1 logs <deployment_uuid>
$env:TEAMMANIX_ENV = 'prod'; .\infra\coolify\deploys.ps1 status    # default environment: staging
```

`status` exits with 1 when the latest deployment failed. `logs` never prints the lines Coolify marks as hidden.

## Tests

The configuration logic (the key set of the application variables, the plan-time stop on an empty backup key, the backup schedule) runs against a mocked provider: no Coolify, no token, no passphrase, no `tofu.ps1`.

```sh
cd infra/coolify && tofu init -backend=false     # once
tofu test
cd ../../apps/api && npx jest --selectProjects unit -- coolify-secrets
```

`npm test` does not run `tofu test`.

The pure functions of `deploys.ps1` (`deploys.lib.ps1`) have Pester tests, Pester 3.4 syntax as shipped with Windows PowerShell 5.1:

```powershell
Invoke-Pester -Script infra/coolify/tests/deploys.Tests.ps1
```
