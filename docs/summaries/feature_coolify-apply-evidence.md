# Coolify provisioning aligned with verified behavior (infra/coolify)

Run date: 2026-11-24. Size M, medium effort, all areas ran. Nothing in this change has been applied to a live Coolify yet.

## What the issue asked

The OpenTofu configuration in `infra/coolify` and the secrets script in `apps/api/src/dev` were written against assumptions that later evidence disproved or never checked. Before the first staging apply, the issue asked to align them with the verified behavior of Coolify and of provider `coolify-terraform/coolify` 0.1.34. Left as it was, the first apply would have kept a removed secret live in the API container, created no Postgres backups although the README promised them, and followed a README that misstated the Coolify version and token requirements.

## What was decided and why

Decisions that changed scope came first.

- Postgres backups go to a dedicated bucket with its own keys, not to the app's file bucket. The backup keys never reach the API container environment. One list of key names in `main.tf` both filters them out of the app variables and feeds the backup storage, and the same names are exported from `coolify-secrets.ts`, with a test that fails if the two lists differ.
- The bulk environment resource (`coolify_envs_bulk`) only upserts and never deletes, so a removed key would have stayed in Coolify. It is replaced by one `coolify_environment_variable` per key, which deletes a removed key for real.
- A plan-time check stops the apply and names any absent or empty backup key. Without it, an empty key would fail late with an opaque API error after the project, database and app already exist.
- The two-stage apply stays. The provider sends the domain settings right after creating the application, before Coolify has loaded the compose file, and Coolify answers 422. Domains therefore wait for stage 2, and the README now says why.
- The README states rollback precisely. Tofu has no rollback resource and rolls back by changing an input that feeds the deployment trigger. Coolify has its own rollback endpoint, but nobody has shown it works for a `dockercompose` application.
- The README documents the recovery when the per-key create fails because Coolify already holds that key: import the existing variable into the state, then apply again. The design phase first dropped this procedure, and the human restored it at the architecture gate.
- Local retention of backup dumps became an input (`backup_retention_days_local`, default 7).
- `environment` now comes from `TEAMMANIX_ENV` through `tofu.ps1`, has no default, and the later environment is named `prod` everywhere. This closed a gap the release plan found: following the old README would have created a prod environment labelled staging.
- Rollout: staging is the canary, because provisioning is all-or-nothing per environment and no traffic split exists. Staging soaks for one week, then prod is applied once in the same two stages. Destroy is accepted only on staging before it holds real data. Once an environment holds data, recovery rolls forward.
- Out of scope: the live apply itself, `delete_backups = true` (needs Coolify 4.8.0 or later), attributes that depend on the unconfirmed Coolify version, and an on-demand database backup, which Coolify does not offer.

## What was built

Infrastructure (`infra/coolify`)
- `versions.tf` and `.terraform.lock.hcl`: provider pinned to exactly 0.1.34.
- `main.tf`: the backup key list, the backup storage and the daily backup schedule on the Postgres database, per-key environment variables with the deployment waiting on them, and the plan-time check with its error text in a local.
- `variables.tf`, `staging.tfvars.example`: backup frequency and retention inputs with defaults, and `environment` without a default.
- `tofu.ps1`: passes the environment of the workspace to tofu.
- `README.md`: Coolify version support, token requirements, the reason for two stages, the backup bucket, restore, rollback, no exec endpoint, destroy behavior, and the import recovery in two quoting forms for Windows PowerShell 5.1 and 7.6.
- `tests/coolify.tftest.hcl` and a placeholder key fixture: `tofu test` runs with a mocked provider, needing no Coolify, token or passphrase.

Secrets script (`apps/api/src/dev`)
- `coolify-secrets.ts`: the exported backup key list and pure helpers, including one that strips HCL comments for the wiring checks.
- `coolify-secrets.cli.ts`: adds empty backup entries to `secrets.json` and lists them while empty.
- `coolify-secrets.spec.ts`: unit and wiring tests.

Documentation (written after approval)
- `infra/coolify/README.md`: the prod stop rule (a plan that replaces or destroys the Postgres database stops the apply), what survives a destroy, adding `domains_enabled = true` after stage 2, a check of the backup storage after stage 1, and a warning against an `environment` line in the tfvars.
- `CLAUDE.md`: one Italian sentence in the Provisioning Coolify bullet repeating the prod stop rule.
- The project has no CHANGELOG, so none was created.

## How it was verified

The final state passes 25 jest cases on `coolify-secrets` and 8 `tofu test` runs, with `tofu fmt`, `tofu validate` and the API typecheck clean. Coverage on `coolify-secrets.ts` is 100 percent for lines, branches and functions. Each fix pass showed a failing test first, and the test verifier reproduced the claims by mutation, restoring every file afterward. No full-suite run is on record, as the project rules require.

- Code review: ready on the first pass and on every recheck. The last recheck left one low issue, that a tfvars `environment` line still overrides the value from `TEAMMANIX_ENV`; the README now warns against it.
- Security review: secure on the first pass and on every recheck, with two low findings accepted and nothing above low. The checks covered credential exposure in the container environment, plan output, state and the test fixture, and README steps that could expose secrets.
- Test verification: ready, 0 issues, 0 acceptance-criteria gaps.
- QA plan: 5 manual cases, 1 exploratory charter and 2 retests, for the live apply.
- Release plan: runbook with gates G0 to G8 and a prod promotion gate.

Of the 14 acceptance criteria, those about `.tf` behavior (empty backup key, backup keys kept out of the app, per-key variables, a removed key deleting only itself) are checked by `tofu test`, and the secrets script and key-list match by jest. Criteria about prose (README facts, comments, tfvars example) need a person to read them (C6). The live outcome needs the operator (C3).

## Still open

- Whether a scheduled backup runs when Coolify creates the backup storage with its usable flag false, and nothing in the configuration validates the connection. Check the Storages page right after stage 1, then the first scheduled run (03:00 server time by default). If the storage is unusable, press Validate connection in Coolify and repeat the run, then ask for a config change before prod.
- Live checks that only the operator can run (C3): a removed key gone from the container, a scheduled backup in the dedicated bucket, no backup key in the container, then the same backup check one week later. Prod promotion waits on these.
- A person reading the five documents (README, the tfvars example, comments in `main.tf` and `variables.tf`) to confirm the prose facts (C6). This is a hard gate before any apply.
- Documentation gaps: three low gaps were found and closed after the run. The README now has the manual Postgres dump procedure that the prod stop rule requires (to be confirmed in the staging restore drill), the tfvars example carries reminder comments for `domains_enabled` and against an `environment` line, and the release plan now matches the README.

## Risks accepted for shipping

- The first per-key create may fail on a variable Coolify already created from the compose file. The README gives the import recovery.
- Coolify may expand a `$` inside a secret value because the per-key resource keeps `is_literal` false. A staging check with a `$` in a value gates prod, and a config change follows if it fails.
- The stage 1 deployment may fail or time out if compose interpolation at build time does not work with the default build flag. The deployment log is the first thing to read.
- Local state lives on one PC. The operator copies the encrypted state aside after every apply and keeps the passphrase in the password manager.
- After stage 2, a plain `plan` or `apply` without `domains_enabled = true` plans to go back to stage 1 and redeploys.
- Nothing alerts on a missed backup. The operator checks the Backups page daily in week one, then weekly.
- After a destroy, the dumps stay in the bucket outside the retention window, and the backup key can still read them. The operator deletes them by hand.

## Areas that did not run

None. All areas ran. The live apply was out of scope and remains an operator action.
