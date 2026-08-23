# Rotate the production `JWT_SECRET`

## Purpose

`JWT_SECRET` signs and verifies every session token the platform issues: admin
logins, participant magic links, alumni sessions, class-kit tokens, attachment
URLs and inbox digest action links. Anyone holding it can mint a valid session
for any user, including an admin, with no password.

This directive rotates it in one pass. It exists because the key was published:
`backend/src/scripts/verifyInboxCosDigestFlow.js` carried the live value as a
string literal from 2026-06-01 in a **public** repo with **two forks**. Removing
the literal (this PR) stops the repo re-publishing it. It does **not** undo the
exposure — the value remains in git history and in both forks. Rotation is the
only remedy.

**Read the whole directive before starting.** It takes about 15 minutes.

## Inputs

- SSH to `root@95.216.199.47`; stack at `/opt/colaberry-accelerator`.
- A new secret, generated **on the box** so it never transits a terminal you
  do not control: `openssl rand -hex 64` (128 hex chars, matching the current
  length and the `.env.example` convention).
- A quiet deploy window. See Safety constraints.

## Rotation surface

Established by direct inspection on 2026-08-23. The current value's SHA-256
begins `ef27e427ba59` (length 128) — used below to tell old from new without
ever printing either.

| Location | Action | Why |
|---|---|---|
| `/opt/colaberry-accelerator/.env` → `JWT_SECRET=` | **EDIT** | The single source of truth. This is the only place the production value is authored. |
| `docker-compose.production.yml` | **No edit** | Never names `JWT_SECRET`. The `backend` service takes it via `env_file: .env`. |
| `accelerator-backend` container env | **Automatic on recreate** | Compose re-reads `.env` when the container is recreated. A bare `docker restart` does **not** re-read it — see Edge cases. |
| All signing/verifying code | **Automatic** | Everything resolves through `backend/src/config/env.ts` → `env.jwtSecret`, read once at process start. Recreating the backend is sufficient. |
| `scripts/cron-env-wrapper.sh` whitelist | **No edit** | Its `grep -E "^(...)="` allow-list does **not** include `JWT_SECRET`, so host cron jobs never receive it. Nothing to update. Whatever *is* whitelisted is re-read from the live container every tick, so it is automatically fresh. |
| Cron lines using `docker exec accelerator-backend ...` | **Automatic** | They exec into the running container and inherit its new env. |
| `/mnt/HC_Volume_105361916/send-runtime/dist` | **No edit** | The compiled copy is stale (2026-08-19) and does not update on container rebuild, but it bakes **no** secret: it reads `process.env.JWT_SECRET`, and `run.sh` pipes the **live** container env into it (`docker exec accelerator-backend node -e '...JSON.stringify(process.env)'`). Stale code, fresh env. |
| `accelerator-dev-backend` (dev stack) | **EDIT — separate value** | Currently shares the **exact same** secret as production. Give dev its own new value; a shared secret means a dev-minted token is valid in production. |
| 17 × `/opt/acc-*/.env` (per-user preview stacks) | **EDIT or retire** | Every one carries the same leaked 128-char value. |
| 16 × `/opt/colaberry-accelerator/.env.bak*` | **No runtime edit** | Not read at runtime, but they still contain the leaked value on disk. Clean up separately. |
| Repo `.env*.example` files | **No edit** | Placeholders only (`CHANGE_ME...`, `<random-64-char-hex>`). |
| Other apps on the host (Opportunity Pulse, Landjet, agent-foundry, optisight, ROI_Architect) | **No edit** | Each has its own distinct `JWT_SECRET`. Unaffected. |

## Steps

Production only. Do the dev stack and the `acc-*` previews afterwards, as a
separate pass, using the same shape.

**1. Confirm nobody else is mid-deploy.**

```sh
ps -ef | grep -E "[d]ocker compose.*up" ; uptime
```

Expect no compose process and a load average in normal range. If a deploy is
running or load is high, stop and wait. Note `pgrep -f "compose.*up"` matches
its own command line — use the bracket form above.

**2. Back up the current `.env`.**

```sh
cd /opt/colaberry-accelerator
cp -a .env .env.bak-pre-jwt-rotation-$(date +%Y%m%d-%H%M%S)
ls -la .env.bak-pre-jwt-rotation-*
```

*Consequence: this file is your rollback. Without it there is no way back.*

**3. Record the current secret's fingerprint.**

```sh
docker exec accelerator-backend sh -c 'printf %s "$JWT_SECRET" | sha256sum' | cut -c1-12
```

Expect `ef27e427ba59`. Write it down. Never print the value itself.

**4. Generate the new secret and write it into `.env`, in place.**

```sh
NEW=$(openssl rand -hex 64)
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW}|" .env
grep -c "^JWT_SECRET=" .env          # must print exactly 1
printf %s "$NEW" | sha256sum | cut -c1-12   # the NEW fingerprint - write it down
unset NEW
```

*Consequence: nothing yet. The running container still holds the old secret and
the app keeps working normally until step 5.*

**5. Recreate the backend so it picks up the new value.**

```sh
docker compose -f docker-compose.production.yml up -d --force-recreate --no-deps backend
```

*Consequence: **this is the moment of rotation.** Every signed-in user is
logged out and must request a new link. For the current cohort that is an
inconvenience, not an outage. Also invalidated: in-flight inbox digest email
action links, class-kit tokens (12h), attachment URLs, and alumni referral
links. Nothing is lost — all are re-issuable.*

Note `--no-deps` so postgres and intelligence are untouched, and **no
`--build`**: this is an env change, not a code change, and a rebuild would be
both slow and a chance to ship someone else's half-finished tree.

**6. Wait for the backend to bind — 60 to 90 seconds.** A 502 before then is
timing, not failure.

```sh
docker exec accelerator-backend node -e "fetch('http://localhost:3001/api/health').then(r=>console.log('health',r.status)).catch(e=>console.log('not up yet'))"
```

Repeat until it prints `health 200`. Port 3001 is not published on the host, and
the image has no `wget` — use this form.

## Verification

**V1 — the container really has the new value.**

```sh
docker exec accelerator-backend sh -c 'printf %s "$JWT_SECRET" | sha256sum' | cut -c1-12
```

Must equal the NEW fingerprint from step 4, and must **not** be `ef27e427ba59`.

**V2 — signing and verification both work, round trip, inside the container.**
The secret never leaves the container process and never reaches your terminal.

```sh
docker exec accelerator-backend node -e "
const jwt=require('jsonwebtoken');
const s=process.env.JWT_SECRET;
if(!s){console.log('FAIL: no JWT_SECRET');process.exit(1);}
const t=jwt.sign({sub:'rotation-check'},s,{expiresIn:'60s'});
const p=jwt.verify(t,s);
console.log('sign+verify OK', p.sub);
"
```

Expect `sign+verify OK rotation-check`. If this fails, the app cannot issue
sessions — roll back.

**V3 — a token signed with the OLD secret is now rejected.** This is the check
that proves the exposure is actually closed. Paste the old value only inside the
container, via stdin, never as a shell argument:

```sh
docker exec -i accelerator-backend node -e "
let old='';process.stdin.on('data',d=>old+=d).on('end',()=>{
const jwt=require('jsonwebtoken');
const t=jwt.sign({sub:'x'},old.trim(),{expiresIn:'60s'});
try{jwt.verify(t,process.env.JWT_SECRET);console.log('FAIL: old secret still accepted');}
catch(e){console.log('OK: old secret rejected ('+e.message+')');}
});" < /path/to/old-secret-file
```

Expect `OK: old secret rejected (invalid signature)`. Delete the temp file with
`shred -u` afterwards. If you would rather not handle the old value at all, skip
V3 — V1 already proves the value changed.

**V4 — a real login works end to end.** Log in to
`https://enterprise.colaberry.ai/login` in a private window. Expect to be logged
out of any existing session and to be able to sign in fresh.

**V5 — the nightly jobs did not quietly die.** The morning after, check that the
cron logs are still moving:

```sh
tail -3 /var/log/reporting-audit.log /var/log/cb-worker.log /var/log/turn-watcher.log
```

A previous key rotation on this project broke a nightly job silently because the
cron definitions were missed. In this case the wrapper never carried
`JWT_SECRET` at all, so no cron job should be affected — this step confirms it.

## Outputs

- `/opt/colaberry-accelerator/.env` with a new `JWT_SECRET`.
- A timestamped `.env.bak-pre-jwt-rotation-*` rollback file.
- A recreated `accelerator-backend` container.
- Every previously issued token invalid.

## Edge cases / failure modes

- **`docker restart accelerator-backend` does not work.** Restart reuses the
  existing container's environment. The change only lands on *recreate*. If V1
  still shows the old fingerprint, this is why.
- **Two `sed` matches in step 4.** If `grep -c` prints more than 1, a duplicate
  `JWT_SECRET=` line exists and the last one wins. Fix by hand before step 5.
- **Backend fails to boot after rotation.** `config/env.ts` throws at boot if
  `JWT_SECRET` is empty or unset in production. If the `sed` produced an empty
  value the container will crash-loop. Check `docker logs accelerator-backend
  --tail 50` for `JWT_SECRET must be set in production`. Roll back.
- **Users report being logged out.** Expected. This is the rotation working.
- **Dev stack still holds the old secret.** Until the dev stack is rotated
  separately, the leaked value stays live *there*. It cannot mint a production
  session after this rotation, but treat dev as compromised until done.

## Rollback

```sh
cd /opt/colaberry-accelerator
cp -a .env.bak-pre-jwt-rotation-<timestamp> .env
docker compose -f docker-compose.production.yml up -d --force-recreate --no-deps backend
```

Then re-run V1 — the fingerprint should be back to `ef27e427ba59`. Rollback
logs everyone out a second time. It restores the **leaked** key, so treat it as
a temporary measure to restore service, not an end state: fix the cause and
rotate forward again.

## Safety constraints

- **Treat this with the same concurrency care as a deploy.** Several sessions
  deploy daily; one recently drove load average to 168 and its rebuild killed a
  12-hour job. Step 1 is not optional. Deploy after hours where possible.
- **Never print the secret value** — not in a shell, a log, a commit, a
  Basecamp comment or an email. Compare SHA-256 prefixes instead. Generate it on
  the box with `openssl rand -hex 64` so it is never in your local scrollback.
- **Never commit the new value.** It belongs only in `/opt/colaberry-accelerator/.env`.
- Rotation is **not** idempotent in the sense of producing the same value twice —
  each run mints a new key and logs everyone out. Run it deliberately, once.
- The `.env.bak*` files and the 17 `/opt/acc-*/.env` files still contain the old
  leaked value after this procedure. Clean them up as a follow-up.
