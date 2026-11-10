## Manual QA tests
Setup common to all rows: API with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` set (pair from `npx web-push generate-vapid-keys`) and, for the email rows, a real `BREVO_API_KEY`. Push needs HTTPS or localhost.

| # | Setup | Steps | Expected |
|---|-------|-------|----------|
| QA1 | Player on a phone with the installed web app, coach on a desktop browser, same team and event | Coach sends a call-up while the app is closed on the phone | The phone shows a push notification and opening it lands on the event |
| QA2 | Player, browser that has never been asked for notifications | Profile, "Notifiche su questo dispositivo", tap "Attiva", allow in the browser prompt | The prompt appears only after the tap. The page says push is on for this device and offers "Disattiva" |
| QA3 | As QA2 | Deny the prompt | The page says notifications are blocked and points to the browser settings. There is no button that asks again |
| QA4 | iPhone, web app not added to the Home Screen, then added | Open Profile in each case | Not installed: the page explains that push needs the app on the Home Screen. Installed: push can be turned on |
| QA5 | Server without VAPID keys | Open Profile | The push section says device notifications are not available yet. Nothing breaks, in-app and email keep working |
| QA6 | Player in two clubs (A active, B not), push on | Coach of club B sends a call-up. Tap the push on the phone | The app switches to club B and opens the event, with no `?club=` left in the address |
| QA7 | Player, real mailbox, `BREVO_API_KEY` set, language set to Italian, then English, then French | Coach sends a call-up each time | The email arrives in the inbox, not in spam, in the person's language. The link opens the app on the event |
| QA8 | Player in the profile of a club | Turn email off, coach sends a call-up | In-app notification and push arrive, no email |
| QA9 | As QA8 | Turn push off for the club, coach sends a call-up | In-app and email arrive, no push on the phone |
| QA10 | Player | Choose Dark in Profile, close the app completely, reopen it. Then choose Automatic and switch the phone between light and dark | Dark is still active after reopening. With Automatic the app follows the phone |
| QA11 | Player with a certificate expiring in 30 days, coach with the certificates permission, the cron job or the daily run executed | Check the player's notifications, run the job again | The player has one certificate alert, no duplicate on the second run. The coach has one summary with counts only |
| QA12 | Same club | Look at the coach's push and email of the certificate summary on the lock screen | Counts only, no player name, no health data, no free text |
| QA13 | Player with a pending call-up | Admin disables the person, coach changes the event. Then admin re-enables the person | While disabled nothing arrives on any channel. After re-enabling, new notifications arrive again |
| QA14 | Player with push on | Log out, then coach sends a call-up for that player | The phone shows no push for the logged-out account |
| QA15 | Break the mail provider (wrong key) and the push keys | Coach sends a call-up | The call-up is sent and saved, the coach sees no error, the player still sees it in the center |
| QA16 | A speaker of Italian and one of French | Read the title and body of every notification type in the center, in email and in push | The texts read naturally and name the club in the title. Wording is approved by the speaker |

_Manual verification and its setup. It complements the acceptance criteria, it does not replace them._
