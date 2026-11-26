# QA Plan — Use the page width and rebalance spacing and text size (#58)

_Manual verification and its setup. Complements the acceptance criteria in this issue — it does not replace them: the `AC-n` list stays the developer's to satisfy._

## Core
**Fixes:** On a desktop the content sat in a narrow band with small text and tight spacing while both sides of the screen stayed empty; the pages now use the screen width with larger, evenly spaced text, and still fit a phone.
**Must hold:** 1. On a wide screen the menu sits at the left edge and the content is centered in the rest, up to 1280 px (AC-1, AC-2) · 2. On a phone nothing is cut off and the larger text does not leave rows sparse or broken (AC-5, AC-12) · 3. The Invia convocazione button is not hidden under the tab bar on a phone (AC-6)
**Proved by:** MT1, MT2, MT3

## Manual Test Cases
| ID | Checks | Setup | Preconditions | Steps | Expected result |
|----|--------|-------|---------------|-------|-----------------|
| MT1 | AC-12 | PC: issue #58 on GitHub in a browser · prepared by a developer, see Test Data | The ten before and ten after images are attached to the issue, one pair per page and width. | 1. Open the 1920-wide before and after images of Squadre and compare them. 2. Do the same for Persone, a season and its Rosa della squadra. 3. Open the phone-width pairs, Convocazione page included, and compare them. | after 2: menu at left edge, content centered, text larger than before; after 3: nothing cut off, rows still easy to read |
| MT2 | — | PC: web app, desktop browser 1920 wide, admin account · prepared by a developer, see Test Data · repeat with: Phone | Signed in as the club admin of the test club. | 1. Open Squadre and read the margins either side of the content and the title. 2. Open a season, then its Rosa della squadra, and read the rows and the spacing. 3. Open Persone and read the names and the spacing between blocks. | after 1: even space either side, nothing cut off; after 3: names in rows as large as the text around them, no overlap |
| MT3 | — | Phone: web app in a real phone's browser, admin account · prepared by a developer, see Test Data | An event with one callup not yet sent, in the test club; signed in as the club admin. | 1. Open the event's Convocazione page. 2. Scroll to the bottom and read where Invia convocazione sits against the tab bar. 3. Press Invia convocazione and read the message. | after 2: the whole button is visible above the tab bar and can be pressed; after 3: the message Convocazione inviata appears with a number |
| MT4 | — | Phone: web app, player account · prepared by a developer, see Test Data · repeat with: PC 1920 wide | An event where this player is called up and the callup was already sent, so the answer buttons show. | 1. Open the event's Convocazione page and read the section titles and the answer buttons. 2. Open the same event's Presenze page and read the section title. 3. Open Calendario and read the title and the event rows. | after 2: titles sit a little closer to the block above than elsewhere, text readable, nothing overlaps; after 3: event rows readable, nothing cut off |

## Expected Behaviour Changes
| What you will see | Why it is intended | Case |
|-------------------|--------------------|------|
| menu at the left edge, content centered in the rest of a wide screen, larger text, longer pages on a phone | the issue asks to use the page width and rebalance text size | MT2 |
| the Invia convocazione bar sits above the tab bar on a phone | the tab bar used to cover the button | MT3 |
| in the player views, section titles sit closer to the block above than on other pages | accepted design call for the player sections | MT4 |

## Cross-Environment Verification
The admin and non-admin walk on a phone and on a wide screen is covered by MT1 (images), MT2 (admin, PC then phone), MT3 (real phone, callup bar) and MT4 (player, phone then PC); the Chrome DevTools MCP run and the console read are done by a developer, not in these cases.

## Exploratory Charters
| ID | Area | Mission | What counts as a finding |
|----|------|---------|--------------------------|
| EC1 | dialogs and forms opened from the pages | PC and Phone, as admin, 30 minutes: open every dialog reachable from Squadre, Persone, a season, Calendario and Inviti e ruoli, and fill it in | text smaller than the page behind it, a field or button cut off or hidden on the phone, a dialog that scrolls sideways, a button too short to press |

## Test Data & Environment
| Need |
|------|
| ten before and ten after images attached to issue #58, prepared by a developer |
| a test club served by the dev web server and API: one team, an active season with players, an event with one callup not yet sent, a second event where a player with a valid medical certificate is called up and the callup is sent, an admin account and a player account linked to that person, prepared by a developer |
| a real phone whose browser reaches that dev web server and API over the local network, prepared by a developer |
