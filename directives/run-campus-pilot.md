# Run the Colaberry Campus pilot

Owner: Ali Muwwakkil. **Allowlisting anyone, and every production step below, is Ali's call.** Claude and interns never edit
the production `.env` or run these steps on their own.

## 1. Purpose

Colaberry Campus replaces the portal's left menu with a walkable campus map: buildings that open the real portal pages, who
is online, the AI staff desks (Reese, Dara, Maya), a guided tour, today's plan as a route, levels and earned gear, and the
Game Room. It ships switched **off**. This procedure lets Ali turn it on for one cohort (or a few named learners), check
that it works for each kind of account, and switch it off again in minutes, without a code change. Turning it on for
everyone is a separate decision (Basecamp C12).

## 2. Inputs

- **The cohort id(s)** to pilot (UUIDs from `cohorts.id`), or **enrollment id(s)** for named learners
  (`enrollments.id`). Read-only lookup, for example: `SELECT id, name FROM cohorts WHERE name ILIKE '%<cohort>%';`
- **Three environment variables** in `/opt/colaberry-accelerator/.env` on the production server (read by
  `backend/src/config/env.ts`, rule in `backend/src/services/campus/campusFlag.ts`; the backend loads `.env` through
  `env_file` in `docker-compose.production.yml`):

  | Variable | Values | Meaning |
  |---|---|---|
  | `CAMPUS_ENABLED` | `off` (default), `allowlist`, `all` | Anything else, blank or unset means off. |
  | `CAMPUS_COHORT_IDS` | comma-separated cohort UUIDs | With `allowlist`: every learner in these cohorts. |
  | `CAMPUS_ENROLLMENT_IDS` | comma-separated enrollment UUIDs | With `allowlist`: these learners. |

- **Related switches, each its own decision.** The campus uses them when they are on and degrades plainly when they are
  off. None is turned on by this procedure.

  | Switch | What the campus shows when it is OFF |
  |---|---|
  | `PEOPLE_PANEL_ROLES_ENABLED` | Head counts only; no named people or person cards. |
  | `ENABLE_CHAT` | Maya's desk reads "opens soon". |
  | `GROWTH_JOURNEY_ENABLED`, `GROWTH_JOURNEY_HANDOFFS_ENABLED` | The Explorer tour's end skips the admissions hand-off and points to enrolling. |
  | `CAPE_TODAY_PLAN_ENABLED` | No plan route on the map. |
  | `BROADCAST_ENABLED` | No "On air" badge or strip. |
  | `CONTENT_PAGE_GATE_ENABLED` | Staff-role learners are treated as members by page access (the campus still knows staff by management role). |

## 3. Steps

Each step has one action and the signal that it worked.

**A. Allowlist a cohort**

1. On the server: `cd /opt/colaberry-accelerator && cp .env .env.bak-campus-$(date +%Y%m%d-%H%M)`.
   Signal: the backup file exists (`ls .env.bak-campus-*`).
2. Edit `.env` so it contains exactly:
   `CAMPUS_ENABLED=allowlist` and `CAMPUS_COHORT_IDS=<cohort uuid>` (add `CAMPUS_ENROLLMENT_IDS=` for named learners).
   Signal: `grep ^CAMPUS_ .env` prints those lines and nothing else campus-related.
3. Apply it with the documented deploy, backend only: `./scripts/deploy-prod.sh backend` (it locks, refuses a dirty tree,
   and checks the container is running). Signal: the script ends with the backend reported running.
4. Wait 60 to 90 seconds for the backend to bind (a 502 inside that window is timing, not failure).
   Signal: `docker exec accelerator-backend node -e "fetch('http://localhost:3001/health').then(r=>console.log(r.status))"`
   prints `200` (the health route is `/health` inside the container, not under `/api`).

**B. Switch it off**

1. Edit `.env`: `CAMPUS_ENABLED=off` (or delete the line). Leave the id lists; they do nothing while off.
   Signal: `grep ^CAMPUS_ENABLED .env` prints `CAMPUS_ENABLED=off` or nothing.
2. `./scripts/deploy-prod.sh backend`, then wait 60 to 90 seconds. Signal: the health check in A4 prints `200`.
3. Run the flag-off check in Verification.

**C. Undo a bad edit fast**: `cp .env.bak-campus-<stamp> .env && ./scripts/deploy-prod.sh backend`.

## 4. Outputs

- For allowlisted learners, the portal opens on the campus: the campus map in the left column (phones: a Map tab), a banner
  with "Campus > Building > Room" on every portal page, and a **Use classic menu** link that switches that learner back.
- Learners outside the allowlist see no change at all.
- Three tables are created on first use, empty until then, never touched while the campus is off: `campus_presence`
  (who is in which building, short-lived), `campus_looks` (each learner's chosen gear), `game_scores` (Game Room runs and
  the 15-minute daily cap). Games never change learning points.
- No email, no notification, no data change for anyone outside the pilot.

## 5. Verification

Testable checks, in this order. All must pass before telling the cohort.

1. **The flag answers.** Signed in as a pilot learner, `GET /api/portal/campus/flags` returns `{"campus":true}`; as a
   learner outside the pilot it returns `{"campus":false}`.
2. **Each kind of account** (use real accounts in the pilot cohort; view-as is read-only and cannot record presence):
   - member: the campus map shows; every building in the left column opens its page with the banner; Take the tour runs
     to "That's the tour".
   - Explorer: the Main Gate is on the map with Maya's desk; the tour ends on the sign-up view.
   - business (an org manager): the career building reads Partner Office and opens the company page.
   - staff: the career building reads Staff Office; its links open the Management Portal in a new tab; no tour is offered.
3. **People and desks.** Opening the Community Lounge shows Reese's desk; "Who's here" lists only people the people panel
   would show.
4. **Game Room.** It shows minutes left today; after 15 minutes of play it says "Back tomorrow" with the reset time in
   Central.
5. **Settings.** In the map bar (phones: More), Settings turns on Workplace names and Reduce motion; Use classic menu
   brings the classic portal back and "Switch to campus map" returns.
6. **Flag off.** After step B, the same pilot learner gets `{"campus":false}` and the classic portal with no campus links.

The same checks run automatically against a local stack in `tests/systemV2/campus.e2e.js` (set-up in
`tests/systemV2/campus-stack.md`). That is the pre-flight; this section is the production check.

## 6. Edge cases and failure modes

- **A typo in `CAMPUS_ENABLED`** (for example `alllowlist`) means off, never on. If the pilot does not see the campus,
  check the spelling first.
- **A learner in two cohorts**: the campus follows the enrollment the learner is signed in with.
- **An id with spaces or a trailing comma** is tolerated (trimmed, blanks dropped). A wrong id silently admits nobody:
  confirm with check 1.
- **The backend did not pick up the change**: the deploy script recreates the container when `.env` changes; if check 1
  still says false, confirm `docker exec accelerator-backend printenv CAMPUS_ENABLED`.
- **A related switch is off** (section 2): the campus shows its plain fallback. That is expected, not a failure.
- **Admin "view as"** sessions are read-only: they see the campus but never record presence or save gear.
- **Two deploys at once** are prevented by the deploy script's lock; never run `docker compose` by hand alongside it.

## 7. Safety constraints

- **Ali only.** Allowlisting is a business decision: who sees a new navigation, and when.
- **No production data writes** are part of this procedure. The three campus tables fill only from learners' own use.
- **Always back up `.env` first** (step A1); never paste `.env` contents into chat, tickets or logs (it holds secrets).
- **Rollback** is switching off (B). A code rollback is reverting the campus PRs and redeploying; the three tables may stay,
  unused, or be dropped by Ali.
- **Idempotent**: re-applying the same `.env` and deploy changes nothing.
- **Never point the e2e at production**: `campus.e2e.js` and its seed refuse any non-local address.
