# infra/coolify

OpenTofu configuration that provisions one TeamManix environment on an existing Coolify: project, environment, PostgreSQL, the compose application (`docker-compose.prod.yml`, cloned over SSH with a read only deploy key), its variables and the deployment. One tofu workspace per environment: `staging` now, `prod` later (always `prod`, never `production`: Coolify creates an environment with that name in every new project and the two would clash).

Status: validated (`tofu fmt`, `init`, `validate`) and `tofu.ps1` and `credentials.ps1` tested against the real Credential Manager with throwaway values. Not yet applied against a live Coolify: the first apply may need small fixes, see "Check after the first apply".

This guide is meant to rebuild everything from zero: a new PC, a new environment, a Coolify that was destroyed, a new server.

## What is and is not automated

| Automated here | By hand, once per environment |
|---|---|
| Coolify project, environment, PostgreSQL, compose app, variables, domain mapping, deployments | DNS record (Cloudflare) |
| Git deploy key (`npm run coolify:secrets`) | S3 bucket for the sensitive files |
| `JWT_SECRET`, `STORAGE_ENCRYPTION_KEY` (generated) | Brevo account, authenticated domain, API key |
| Encrypted state, one workspace per environment | Coolify itself: install, enable the API, create the root token |

## Tools on the PC

`tofu` (`winget install OpenTofu.Tofu`), Node 22 (for `npm run coolify:secrets`), `gh` logged in with admin rights on the repository, `ssh-keygen` (Git for Windows has it), Windows PowerShell 5.1 or later. No PowerShell module is needed.

## 1. Credentials on the PC (once per PC)

The Coolify token and the state passphrase live in the Windows Credential Manager (generic credentials named `teammanix/<name>`, visible in Control Panel, Credential Manager, Windows Credentials), never in a file or a permanent environment variable. No module to install: `credman.ps1` talks to the Windows API. `tofu.ps1` reads the entries, hands them to one tofu process and removes them from the environment when it ends. Run `credentials.ps1` in your own terminal, not through Claude Code: values are typed at a hidden prompt or generated, they never go through a command line or a file.

```powershell
.\infra\coolify\credentials.ps1 set coolify-endpoint      # https://coolify.example.com, no trailing slash
.\infra\coolify\credentials.ps1 set coolify-token         # root token, see section 2
.\infra\coolify\credentials.ps1 new-passphrase staging    # prod: new-passphrase prod
.\infra\coolify\credentials.ps1 check staging             # which entries exist, never the values
```

Windows protects the entries with the key of the current user: nothing is in plaintext on disk, but any process of your user can read them (Claude Code included, when it runs `tofu.ps1`). Keep the PC disk encrypted (BitLocker).

`new-passphrase` generates the state passphrase (24 random bytes in base64), stores it as `teammanix-<env>-tofu-passphrase` and prints it once: copy it into the password manager next to the other keys of the environment and close the terminal. It refuses to replace an existing one, because a new passphrase makes the existing state unreadable. Set it before the first apply. Without the passphrase tofu refuses to run, so the state is never written in plaintext.

## 2. Coolify (once per instance)

1. Settings: enable the API.
2. Keys & Tokens: create a token with the **root** permission. Without `root` (or `read:sensitive`) the provider cannot read the database password and `DATABASE_URL` stays empty. The token controls everything on the instance, so it is for Tofu only. Store it with `credentials.ps1 set coolify-token` (section 1).
3. Note the UUID of the server (the id in the URL of its page). It goes in `<env>.tfvars`.
4. The compose file joins the external Docker network `coolify`, which every Coolify server has. If the server has several destinations, the database must be on `coolify` too: set `destination_uuid`.

## 3. Inputs outside Coolify (once per environment)

- **DNS (Cloudflare).** An A record, for example `staging`, to the IP of the Hetzner server. The full name is the `domain` variable. Set it to **DNS only** (grey cloud): with the orange proxy the Let's Encrypt certificate may not be issued; once it works you can turn the proxy on with SSL mode "Full (strict)". A wildcard `*.example.com` to the same server already covers it. The record must exist before stage 2 of the apply, not before `plan`.
- **S3 bucket** for the sensitive files, private, one bucket per environment (see the main README: sensitive files, backups, key custody). You need endpoint, bucket, access key id and secret.
- **Brevo.** Authenticated sending domain (SPF, DKIM, DMARC records in the same Cloudflare, the DKIM CNAMEs stay DNS only; steps in the main README, "Mail domain"), an API key, and a `MAIL_FROM_EMAIL` on that domain.

## 4. Secrets and variables (once per environment)

```sh
cd apps/api && npm run coolify:secrets -- staging     # or prod
```

It works on `secrets/<env>/` (gitignored):
- `secrets.json`, flat NAME to value. It adds `JWT_SECRET` and `STORAGE_ENCRYPTION_KEY` when missing (the files of `keys:gen`, `jwt_secret.key` and `storage_enc.key`, stay the record and are reused) and adds an empty entry for every other required variable of `docker-compose.prod.yml`.
- `deploy_key` and `deploy_key.pub`: an ed25519 key, registered on the repository as a read only deploy key titled `coolify-<env>`.

Nothing that exists is overwritten. Fill in the empty values (`BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; optional: `S3_REGION`, `MAIL_FROM_NAME`, `VAPID_*`; an optional entry left empty is dropped and the default of the compose file applies), then run it again: it lists what is still empty. `DATABASE_URL`, `APP_URL` and `ALLOWED_ORIGINS` are computed by Tofu and must not be in the file. A unit test keeps this list and `docker-compose.prod.yml` aligned.

Then copy `staging.tfvars.example` to `staging.tfvars` (gitignored) and fill in `server_uuid`, `domain`, `deploy_key_file`. For prod also set `git_branch = "main"` there (the default is `develop`).

## 5. Apply

```powershell
.\infra\coolify\tofu.ps1 init
.\infra\coolify\tofu.ps1 plan
.\infra\coolify\tofu.ps1 apply                            # stage 1: creates everything, deploys without domains
.\infra\coolify\tofu.ps1 apply -var domains_enabled=true  # stage 2: web on the root, api on /api, redeploys
```

`tofu.ps1` takes the environment from `$env:TEAMMANIX_ENV` (default `staging`; for prod: `$env:TEAMMANIX_ENV = 'prod'`), selects the workspace of that environment, passes `secrets/<env>/secrets.json` as `TF_VAR_secrets` and `<env>.tfvars` as variable file, and forwards every other argument to tofu.

Two stages because Coolify accepts the domain mapping of a git compose application only after a deployment has read the compose file. Stage 2 needs the DNS record.

## Check after the first apply

- The API container starts and `https://<domain>/api/health` answers, the web opens on the root.
- `DATABASE_URL` works. If the database host does not resolve, the database and the app are on different Docker networks: set `destination_uuid` and apply again (this replaces the database, restore its data).
- `coolify_envs_bulk` replaces the whole set of variables of the application. If Coolify adds its own (`SERVICE_FQDN_*`) the next plan shows drift: read it before the next apply.
- `NUXT_PUBLIC_API_BASE_URL` is deliberately not set: the compose default `/api` is right and it is a build argument.
- A new commit is not deployed by `tofu apply` (the deployment resource reruns only when the variables, the branch or the stage change). Deploy from the Coolify UI or its webhook.
- The provider is tested by its authors against Coolify 4.6.0; the instance runs newer. A resource that fails on an unknown field is a provider issue: check its releases before working around it.

## What to keep, and where

| Item | Where | Lost means |
|---|---|---|
| Coolify token | Credential Manager (`teammanix/coolify-token`) | create a new root token |
| State passphrase | Credential Manager and the password manager | the state is unreadable: delete it and re-apply (see below), the data lives in Coolify and the bucket, not in the state |
| `secrets/<env>/` (`secrets.json`, `.key` files, `deploy_key`) | password manager (attach the folder), local copy gitignored | `STORAGE_ENCRYPTION_KEY` lost = every stored file unreadable, no recovery; the others can be regenerated |
| State (`terraform.tfstate.d/<env>/`) | local, gitignored, encrypted | rebuildable: it holds ids and the generated database password, not data |
| Postgres data | Coolify scheduled backups to S3 (main README, Backups) | see the restore drill |
| Files | the S3 bucket | see the main README |

## Rebuild scenarios

**Coolify was destroyed, or a new instance replaces it.** The old state points at ids that no longer exist.
1. Install Coolify, enable the API, create a new root token, update `coolify-endpoint` and `coolify-token` with `credentials.ps1 set`.
2. Delete the old state of the environment: `terraform.tfstate.d/<env>/` in `infra/coolify` (or `tofu workspace delete -force <env>` after selecting another one).
3. Put `secrets/<env>/` back from the password manager (same `STORAGE_ENCRYPTION_KEY`, same bucket: the files stay readable). The deploy key can be reused; if it is lost, delete `deploy_key*`, remove the old deploy key from the repository settings and run `npm run coolify:secrets` again.
4. `init`, `apply`, `apply -var domains_enabled=true`. Update the DNS record if the server IP changed.
5. The new database is empty: restore the latest Postgres backup into it (main README, restore drill).

**New environment (prod, or a second staging).** Sections 3 and 4 with its own name, bucket, domain, passphrase secret (`teammanix-<env>-tofu-passphrase`) and `<env>.tfvars`, then `$env:TEAMMANIX_ENV = '<env>'` and the apply of section 5. Its state, secrets and Coolify project (`teammanix-<env>`) are separate from the others.

**New server, same Coolify.** Change `server_uuid`: Tofu replaces the database and the application on the new server (the database is empty again, restore it). The bucket does not move.

**Rotate the Coolify token.** Create the new token, update it with `credentials.ps1 set coolify-token`, delete the old one in Coolify.

**Destroy an environment.** `.\infra\coolify\tofu.ps1 destroy` removes the project and, with it, the database and its data. Take a backup first.
