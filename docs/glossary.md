# Glossary (IT → EN)

Code is in English. Italian stays only in user-facing texts (i18n locales, emails, legal pages) and in the specs (`ANALISI.md`, `mockup/`). This table maps domain terms used in the specs to the names used in code, API routes, DB schema and error codes.

| Italiano | English (code) | Note |
|---|---|---|
| società | club | table `clubs`, route `/club` |
| settore | section | optional grouping of teams, route `/sections` |
| squadra | team | carries the sport profile; for some disciplines the word is "gruppo" (`group`), see unit term |
| squadra o gruppo | unit term | `unitTerm` of the sport profile, `team` or `group` (fencing); the frontend picks the word |
| stagione | season | status `draft`, `active`, `closed` |
| persona | person | table `people`; registry record, distinct from `User` |
| utente | user | account |
| iscrizione | enrollment | person in a team season |
| rosa | roster | |
| tesserato | registered member | |
| appartenenza | membership | user in a club |
| ruolo di accesso | access role | scope `club`, `section`, `team` |
| ruolo staff | staff role | catalog of the club (`StaffRole`, route `/staff-roles`), permission model `policyModel`, flag `mustBeAvailable`; a role in use is archived, not deleted |
| ruoli staff suggeriti | suggested staff roles | `suggestedStaffRoles` of the sport profile, added to the catalog only when the admin chooses |
| ambito | scope | |
| permessi | permissions | policy keys like `callups.manage` |
| invito | invitation | |
| certificato medico | medical certificate | health data (GDPR art. 9) |
| scadenza | expiry | |
| convocazione | callup | |
| convocabile | callable | not yet called up, no blocking reason |
| non convocabile | not callable | has at least one blocking reason (hard or confirm) |
| titolare / panchina | starter / bench | `Placement`, only for sports with `starterBench` |
| presenza | attendance | |
| squalifica | suspension | |
| sanzione | sanction | |
| classifica | standings | |
| avversario | opponent | |
| impianto | venue | |
| evento | event | |
| serie (di allenamenti) | series | weekly rule that creates real events; `occurrenceDate` is the slot of an event in it |
| eccezione | exception | event of a series edited by hand, skipped by "all future ones" |
| tutore | guardian | |
| scheda | record | person record to complete |
| tema, lingua | theme, language | |
| titolare / panchina | starter / bench | |
| distacco | detachment | |
| bozza | draft | |
| profilo sport | sport profile | seed holds codes only |
| assenza | absence | declared period, dates only, no reason |

## Position codes (football)

`goalkeeper`, `defender`, `midfielder`, `forward`.

## Rules

- A new error code is an uppercase English literal (`code: 'INVALID_DATA'`), translated in the three locales under `errors.codes.<CODE>`.
- Routes are English and plural for collections (`/sections`, `/seasons`, `/people`).
- DB tables are plural snake_case, columns snake_case.
- Web URLs are English (`/people`, `/seasons`, `/verify-email`).
- Comments, test titles, commit messages, issues and PRs are English.
