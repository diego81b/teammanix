# QA Plan — Block overlapping seasons at creation (#49)

_Manual verification and its setup. Complements the acceptance criteria in this issue — it does not replace them: the `AC-n` list stays the developer's to satisfy._

## Core
**Fixes:** an admin could save a new season whose dates overlap another season of the same team; the form now refuses it with a message.
**Must hold:** 1. an overlapping new season is refused with a readable message in the user's language and nothing is saved (AC-1, AC-11) · 2. an overlapping clone is refused and the source season stays untouched (AC-8)
**Proved by:** MT1, MT3

## Preparation
| Need | For | Done by |
|------|-----|---------|
| a test club with two teams, A and B, each with one active season from 1 Sep 2026 to 15 Jul 2027 and no draft | MT1, MT2, MT3, MT4 | tester |
| a club admin account; the language set in the profile | MT1 | tester |
| in team A's season, an enrolled player with a suspension still running | RT1 | tester |

## Manual Test Cases
| ID | Checks | Who | Setup | Preconditions | Steps | Expected result |
|----|--------|-----|-------|---------------|-------|-----------------|
| MT1 | AC-1, AC-11 | QA | Web app, desktop browser, club admin, see Preparation · repeat with: Italian, English, French | team A has its active season and no draft | 1. Open Squadre and press the new-season action of team A. 2. Set the start date to 1 Jan 2027, save and read the message. | the form stays open with the overlap message in the chosen language, and no new season appears for team A |
| MT2 | — | QA | Web app, desktop browser, club admin, see Preparation | team A has its active season and no draft | 1. Open the new-season form of team A and read the proposed start date. 2. Save without changing anything and read the result. | after 1: start date is 16 Jul 2027; after 2: the season is created and appears as a draft of team A |
| MT3 | AC-8 | QA | Web app, desktop browser, club admin, see Preparation | team B has its active season and no draft | 1. Open the active season of team B and start the new-season wizard. 2. Set start date 1 Jan 2027, go to the summary, confirm and read the alert. 3. Open team B's season list and read the statuses. | after 2: the summary shows an alert with the overlap message; after 3: the season is still active and no new season is listed |
| MT4 | — | QA | Web app, desktop browser, club admin, see Preparation | team B as left by MT3 | 1. Start the new-season wizard from team B's active season and read the proposed start. 2. Go to the summary, confirm and read the result. | after 1: start date is 16 Jul 2027; after 2: the wizard completes with no error message |

## Expected Behaviour Changes
| What you will see | Why it is intended | Case |
|-------------------|--------------------|------|
| a new season or a clone whose dates share a day with another season of the team is refused with a message | two seasons of one team must not cover the same days | MT1 |
| the proposed start of the next season is the day after the previous one ends when that is later than 1 July | the proposed dates must not be refused | MT2 |
| a season's dates cannot be moved onto another season of the team, but no screen edits dates, so only the API shows it | same rule as on creation | — |

## Exploratory Charters
| ID | Area | Mission | What counts as a finding |
|----|------|---------|--------------------------|
| EC1 | Phone: refused period on the new-season form and the wizard summary, in French and Italian | at phone width, trigger the overlap refusal on both screens and look at the message, the buttons and the focus after the error | text cut off or overlapping, a button hidden under the tab bar, the form not scrollable, focus lost after the error, a console error |

## Regression Retests
| ID | Retest | Impact |
|----|--------|--------|
| RT1 | Web: clone team A's season with the running suspension carried over and read that the new draft shows it | medium |
