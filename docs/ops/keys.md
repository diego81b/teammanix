# Server secrets: loss, rotation, key custody

Which secrets the production API holds, where each one lives, what happens when it is lost or replaced, and how. Behavior is read from the code unless marked **verified** (observed on a running stack); nothing here is verified yet, so run the restore drill in `README.md` before relying on it.

## Inventory

| Secret | Protects | Where it lives | If missing in production | Lost or replaced |
|---|---|---|---|---|
| `JWT_SECRET` (at least 32 characters) | Signs the 24 hour access tokens, no refresh | Coolify variable, copy in the password manager | The API does not start | Every session ends, users sign in again. Nothing else is lost |
| `STORAGE_ENCRYPTION_KEY` (32 bytes, base64) | AES-256-GCM encryption of every stored file (medical certificates) | Coolify variable, copy in the password manager, emergency copy offline | The API does not start | **Every stored file becomes unreadable, no recovery** |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Access to the file bucket | Coolify variable | The API does not start | Issue a new pair in the provider, replace both, redeploy. Files are untouched |
| `BREVO_API_KEY` | Sending transactional mail | Coolify variable | The API does not start | Create a new key in Brevo, replace, redeploy. Mail queued in between is lost |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push | Coolify variable, optional | Push is off | Replacing the pair drops every registered device, users re-enable notifications |
| `DATABASE_URL` | Database access | Coolify resource | The API does not start | Follows the Postgres resource credentials |

Outside production, if `STORAGE_ENCRYPTION_KEY` is unset it is derived from `JWT_SECRET`. In production it is required and independent, so replacing `JWT_SECRET` never touches the files.

Generate the first two with `cd apps/api && npm run keys:gen -- prod`. The command writes `secrets/prod/` (gitignored) and a `coolify-env.txt` to paste into Coolify. Delete that file once the values are in the password manager and Coolify.

Keep the current production and staging values in the company password manager, in a vault shared by at least two people, and an offline emergency copy of `STORAGE_ENCRYPTION_KEY` in a sealed envelope. Never store the key next to a bucket backup. Of everything above, losing `STORAGE_ENCRYPTION_KEY` is the only loss with no way back.

## `JWT_SECRET`

### Planned rotation, or suspected leak

A leaked secret lets anyone mint a token for any user and any club until it is replaced.

1. Generate a new value: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. (`keys:gen` refuses to overwrite and would also touch the storage key, so do not use it for this.)
2. Set `JWT_SECRET` in Coolify and redeploy.
3. Check: `/api/health` is up and a login works.
4. Store the new value in the password manager and remove the old one.

Effect for users: every access token fails verification, the web app clears the session on the `401` and sends the user to `/login`. No data is lost.

### Forcing everyone out without a rotation

Tokens carry a version (`tv`) compared with `User.tokenValidFrom` on every request, which is how a password change invalidates old tokens. To end the sessions of one user, set their `tokenValidFrom` to now. To end everyone's, rotate `JWT_SECRET`.

### Lost secret

Generate a new one and deploy. Same effect as a rotation, nothing to recover.

## `STORAGE_ENCRYPTION_KEY`

### What a wrong or missing key does

A missing key stops the API at boot. A wrong key does not stop it: the key is only checked when a file is read, and AES-GCM authentication fails with `Unsupported state or unable to authenticate data`, so a certificate download returns an error while everything else works. This is why a restore drill must download a file, not only open the app.

### Rotation

There is no non-destructive rotation today: the stored format is IV, tag and ciphertext, with no key identifier, and nothing re-encrypts existing objects (follow-up #41). Changing the key has the same effect as losing it. Rotate only on a believed compromise, and only after the re-encryption tool exists, in a maintenance window: stop writes, re-encrypt every object, verify a sample, set the new key, restart.

A leaked key alone gives an attacker nothing without the bucket. With both, they read every certificate file, so treat a leak of the key together with a bucket backup as a personal data breach (GDPR art. 33, health data art. 9).

### Loss

If the password manager and the emergency copy are both gone, the files cannot be recovered. What survives: the database, which holds only type, issue and expiry of each certificate. Recovery steps:

1. Generate a new key, set it, redeploy.
2. Delete the unreadable objects and their `Document` rows, or leave them and expect an error on download.
3. Tell the clubs which certificate files must be uploaded again. The certificate record itself (type and dates) is intact.
4. Record the incident and assess whether it must be reported as a breach.

## Other secrets

Replace `S3_*`, `BREVO_API_KEY` and `VAPID_*` in the provider, update Coolify, redeploy, then store the new values in the password manager. None of them protects data at rest.

## Rotation log

| Date | Secret | Reason | Who |
|---|---|---|---|
| (to fill in) | | | |
