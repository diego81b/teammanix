# QA Plan - Coolify config aligned with provider 0.1.34 (first live staging apply)

_Manual verification and its setup. Complements the acceptance criteria of this work; it does not replace them: the `AC-n` list stays the developer's to satisfy._

## Core
**Fixes:** the first staging apply would have left a removed secret live in the API container, created no Postgres backups, and followed a README that misstates the Coolify version and token needs.
**Must hold:** 1. A key removed from `secrets.json` is gone from the application after the next apply, and no other variable changes (AC-10) · 2. A scheduled Postgres backup lands in the dedicated bucket (AC-7) · 3. The five backup values never appear among the application's variables (AC-5)
**Proved by:** MT2, MT3, MT1

## Manual Test Cases
| ID | Checks | Setup | Preconditions | Steps | Expected result |
|----|--------|-------|---------------|-------|-----------------|
| MT1 | AC-5 | PC: PowerShell with `tofu.ps1` · Coolify: its web UI · prepared by a developer, see Test Data | staging never applied; `secrets.json` filled, plus `QA_PROBE` = `probe` and `MAIL_FROM_NAME` = `Team$Manix`; domains off (stage 1) | 1. PC: run `tofu.ps1 apply`, read the printed plan, answer yes, read the final message. 2. Coolify: open the application's Environment Variables and read the key list. | after 1: plan has no `BACKUP_S3_*` variable and apply ends with no error; after 2: `QA_PROBE` listed, no key named `BACKUP_S3_*` |
| MT2 | AC-10 | PC: PowerShell with `tofu.ps1` · Coolify: its web UI | MT1 passed; the `QA_PROBE` line deleted from `secrets.json`, nothing else changed | 1. PC: run `tofu.ps1 plan` and read the actions listed. 2. PC: run `tofu.ps1 apply`, answer yes, wait for the end. 3. Coolify: open the application's Environment Variables and read the key list. | after 1: one variable destroyed, `QA_PROBE`, no other variable changed; after 3: `QA_PROBE` gone, other keys unchanged |
| MT3 | - | Coolify: its web UI · S3: console of the backup bucket's provider · repeat with: next day, one week later | MT1 passed; the night after the apply the server clock is past 03:00; schedule left at its default | 1. Coolify: open the staging database's Backups page and read the latest run. 2. S3: open the backup bucket and read the file list. | after 1: latest run is successful and went to S3; after 2: a dump of that night is in the bucket |
| MT4 | - | Web: TeamManix staging web app · Mail: inbox of the invited address | MT1 passed; stage 2 applied (`apply -var domains_enabled=true`); DNS and Brevo working; signed in as club admin | 1. Web: open Invitations and invite an address you control. 2. Mail: open the invitation and read the sender name. | sender name reads `Team$Manix` exactly, nothing missing |
| MT5 | AC-8, AC-11 to AC-14 | PC: editor on the repository · repeat with: `infra/coolify/README.md`, comments in `main.tf` and `variables.tf`, `staging.tfvars.example` | the change checked out; `01-requirements.md` open at AC-8 and AC-11 to AC-14 | 1. open the file named by the variant. 2. read each statement those criteria require and judge it for accuracy. | every required statement present and accurate, no secret value in any file, README shows the import step in both PowerShell forms |

## Expected Behaviour Changes
| What you will see | Why it is intended | Case |
|-------------------|--------------------|------|
| the plan lists one variable per key, and removing a key also re-runs the deployment | each variable is its own resource and the deployment follows the variables | MT2 |
| the plan stops with `Backup bucket keys missing or empty in secrets.json: <names>` and creates nothing | an empty backup value would otherwise fail late, after project and database exist | - |
| `npm run coolify:secrets` adds five empty `BACKUP_S3_*` entries and lists them under `Still to fill in` | the backup bucket's values live in the same file, and the app never receives them | see Regression Retests |

## Cross-Environment Verification
- live staging apply by the operator, PowerShell plus Coolify UI plus bucket console, one session - covered by MT1, MT2, MT3 and MT4
- five documents confirmed by a person reading them - covered by MT5

## Exploratory Charters
| ID | Area | Mission | What counts as a finding |
|----|------|---------|--------------------------|
| EC1 | PC: PowerShell and Coolify UI, recovery when stage 1 fails on a key Coolify already holds | only if MT1 reported such an error: follow the README import step for each reported key in the PowerShell you use (5.1 or 7.6), then apply again. If MT1 had no such error, say so and stop | the address reaches tofu without its quotes; the plan after the import shows a replace instead of an in-place update; the new apply fails again; the README names a form that does not work in your shell |

## Regression Retests
| What to re-run | Impact |
|----------------|--------|
| PC: copy `secrets.json` aside, run `npm run coolify:secrets -- staging`, check existing values are unchanged and five `BACKUP_S3_*` entries were added empty | medium |
| PC: after the apply, run `tofu.ps1 output` and check `url`, `application_uuid` and `deployment_status` are filled | low |

## Test Data & Environment
| Need |
|------|
| staging Coolify with the API on; root token, state passphrase and endpoint saved with `credentials.ps1`; server id in `staging.tfvars` (prepared by a developer) |
| a private bucket for the Postgres backups on a public S3 endpoint, with its own key; you type the five `BACKUP_S3_*` values into `secrets.json`, never into this plan |
| two harmless entries in `secrets.json`: `QA_PROBE` = `probe` and `MAIL_FROM_NAME` = `Team$Manix` |
| for MT4 only: DNS record for the staging domain, Brevo sending domain, a club admin account |
