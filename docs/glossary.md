# Glossary (IT → EN)

Code is in English. Italian stays only in user-facing texts (i18n locales, emails, legal pages) and in the specs (`ANALISI.md`, `mockup/`). This table maps domain terms used in the specs to the names used in code, API routes, DB schema and error codes.

| Italiano | English (code) | Note |
|---|---|---|
| società | club | table `clubs`, route `/club` |
| attività | activity | route `/activities` |
| squadra | team | |
| stagione | season | status `draft`, `active`, `closed` |
| persona | person | table `people`; registry record, distinct from `User` |
| utente | user | account |
| iscrizione | enrollment | person in a team season |
| rosa | roster | |
| tesserato | registered member | |
| appartenenza | membership | user in a club |
| ruolo di accesso | access role | scope `club`, `activity`, `team` |
| ambito | scope | |
| permessi | permissions | policy keys like `callups.manage` |
| invito | invitation | |
| certificato medico | medical certificate | health data (GDPR art. 9) |
| scadenza | expiry | |
| convocazione | callup | |
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

## Position codes (football)

`goalkeeper`, `defender`, `midfielder`, `forward`.

## Rules

- A new error code is an uppercase English literal (`code: 'INVALID_DATA'`), translated in the three locales under `errors.codes.<CODE>`.
- Routes are English and plural for collections (`/activities`, `/seasons`, `/people`).
- DB tables are plural snake_case, columns snake_case.
- Web URLs are English (`/people`, `/seasons`, `/verify-email`).
- Comments, test titles, commit messages, issues and PRs are English.
