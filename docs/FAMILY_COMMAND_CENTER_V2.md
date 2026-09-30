# Family Command Center — V2 (data-driven briefing)

A daily 6 AM CT email to Ali + Addie summarizing the family's day/week from **live data**.
V1 re-sent a static hand-authored snapshot; V2 compiles every section from real sources,
so nothing is baked in and a stale day can never masquerade as fresh.

Owner: Ali Muwwakkil. Session of record: `CC-20260610-k7m2` (2026-06-10).

---

## How it runs

- **Cron (host crontab on the VPS):**
  - `0 11 * * *` (6 AM CT daily) → `cron-env-wrapper.sh sendFamilyCommandCenterDaily.js`
    → email to Ali (To), Addie (Cc), alimuwwakkil@gmail.com (Bcc).
  - `0 13 * * 1` (8 AM CT Mon) → `… --weekly` → status comment on the Basecamp Message Board.
- The scripts run **host-side** (raw `.js`, not in the container image). `cron-env-wrapper.sh`
  pulls the container env (BC token, Mandrill, OpenAI, DB creds), refreshes a stale Basecamp
  token from CCPP, then `exec node`. Google + family-calendar creds come from
  `/opt/colaberry-accelerator/.env` via dotenv.
- Idempotency: a date-keyed lock (`/tmp/family-command-center/daily-<date>.lock`) prevents
  double-sends.

### Modes
- (default) — daily briefing email.
- `--weekly` — Monday status comment.
- `--test` — render + send to **Ali only** (no Addie); used to preview in a real inbox.
- `--preview` — compile live + write the rendered HTML to `/tmp/...preview-<date>.html`, **no send**.
- `--dry-run` — log only.

---

## Data sources

| Source | Auth | Feeds |
|---|---|---|
| **Google Calendar (Family)** `family09501381979624914501@group.calendar.google.com` | service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`) with domain-wide delegation, impersonating `ali@colaberry.com`; scope **`https://www.googleapis.com/auth/calendar`** (the readonly scope is NOT allowlisted in Workspace Admin) | today's snapshot, week grid, travel cards, weekly recap, flashback "moments", Creed conflicts |
| **Work calendar** `GOOGLE_CALENDAR_ID` (ali@colaberry.com) | same service account | conflict detection ONLY (never shown as rows) |
| **`inbox_emails` DB table** (synced from gmail_colaberry + gmail_personal + hotmail by `inboxSyncService`) | queried host-side via `docker exec accelerator-db psql` (DB port isn't host-published) | "New Since Yesterday", Procare/school + travel emails for extraction |
| **OpenAI `gpt-4o-mini`** `OPENAI_API_KEY` | — | extracts Procare announcements (Creed) and travel itineraries into tasks + dated grid items |

The **Family calendar is owned by Addie on alimuwwakkil@gmail.com** and shared with
`ali@colaberry.com` (See all event details), which is how the impersonated service account
reads it. To re-discover the id: `node backend/src/scripts/discoverFamilyCalendar.js`.

---

## Per-child model

- **Addison, Jayse** → calendar only.
- **Creed** → calendar **+ Procare** (mostly Procare; the Office Chat / daily-summary emails are
  ~1 paragraph that the LLM extracts into tasks).
- Colors (match the Section 2 legend everywhere): Creed = blue, Addison = purple, Jayse = green,
  Parents = orange, Travel = teal, Conflict = red.

## Conflict rule (important)

A work-schedule overlap is a **family conflict only when it's Creed's event** (the young one Ali
must cover). Addison/Jayse overlapping Ali's work is NOT flagged. Pure work events never appear in
the report — a Creed conflict only adds a "you'll need coverage" note on Creed's row.

---

## Sections (and their data)

1. **Today's Snapshot** — every family item today (calendar + today's Procare/travel), **sorted by
   time**; no-time items render as "Daily". Creed conflicts get a coverage note. No work rows.
2. **Upcoming Week** — 7-day grid with a color legend. Calendar events + dated extras (Procare
   announcements, travel flights, conflict markers) placed on their day.
3. **Travel on the Horizon** — upcoming multi-day calendar trips.
4. **Family Action Items** — Creed conflicts + extracted Procare tasks + travel tasks (color-coded).
5. **New Since Yesterday** — last ~30h of school/Procare + travel mail from `inbox_emails`, tags
   colored by category; quotes cleaned of CSS/`****`/boilerplate; marketing travel filtered out.
6. **Weekly Recap** — derived from the last 7 days of family-calendar events.
7. **Flashback** — Creed's 15 Primrose graduation photos (curated static Drive thumbnails) +
   "other moments" derived from the past-60-day calendar.
8. **Upcoming Costs** — curated Procare ~$330 projection, **labeled** "not live receipts" (school
   charges aren't reliably in email yet).
9. **Parent Risk & Blockers** — Creed conflicts + AI-flagged items.

---

## Files

| File | Role |
|---|---|
| `backend/src/scripts/sendFamilyCommandCenterDaily.js` | orchestrator: compile → render → send; `--preview`/`--test`; safety guard |
| `backend/src/scripts/lib/compileFamilyBriefingData.js` | the compiler — all live data → `briefingData` object |
| `backend/src/scripts/lib/compileFamilyBriefingData.test.js` | 35 unit tests (`node` runs it; no network) |
| `backend/src/scripts/lib/renderFamilyBriefingEmail.js` | email-safe table HTML renderer (Outlook-friendly) |
| `backend/src/scripts/discoverFamilyCalendar.js` | one-off: list calendars to find the Family id |

## Env vars

`GOOGLE_FAMILY_CALENDAR_ID`, `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_OWNER_EMAIL`, `OPENAI_API_KEY`, plus DB (`PROD_DB_*` /
`accelerator-db` container) and the wrapper's BC/Mandrill vars. Optional knobs:
`FAMILY_DB_CONTAINER` (default `accelerator-db`), `FAMILY_NEWSINCE_HOURS` (default 30).

---

## Failure-first behavior

- Each source is independently try/caught; a failure records the source in `meta.degraded` and that
  section renders empty (or is omitted). Nothing is baked in, so stale content is impossible.
- **Safety guard:** if the **family-calendar** source is degraded, the daily script BLOCKS the send
  (no email) rather than sending a hollow briefing — so a misconfig (e.g. unset
  `GOOGLE_FAMILY_CALENDAR_ID`) skips cleanly with a log instead of emailing junk.
- `googleapis` is required lazily; OpenAI calls retry once (20s timeout) then fall back to a
  deterministic heuristic that still cleans titles and places Procare items on the grid by parsing
  the day. Gmail is no longer hit live (DB-sourced), avoiding the shared-cred rate limit.

## Runbook

- **Preview a real render:** `node backend/src/scripts/sendFamilyCommandCenterDaily.js --preview`
  then open `/tmp/family-command-center/preview-<date>.html`.
- **Send a test to Ali only:** via the wrapper so the BC token refreshes —
  `bash scripts/cron-env-wrapper.sh backend/src/scripts/sendFamilyCommandCenterDaily.js --test`.
- **Disarm:** remove `GOOGLE_FAMILY_CALENDAR_ID` from `/opt/colaberry-accelerator/.env` (the guard
  then blocks every send). **Re-arm:** add it back.
- **Change a calendar id:** re-run `discoverFamilyCalendar.js`, update `.env`, `--preview` to confirm.

## Known limitations / next steps

- **Costs** is the one curated/projection block — wire real Procare/Paysimple receipts when parseable.
- **LLM = OpenAI** because no Anthropic key is provisioned; provisioning `ANTHROPIC_API_KEY` lets the
  extraction move to `claude-haiku-4-5` (CLAUDE.md's preferred default).
- **Phase 2 (Ali's idea):** a calendar-sync worker using Google's incremental `syncToken` →
  `family_calendar_events` table, so the briefing reads from the DB and computes deltas ("calendar
  changes since yesterday") instead of re-pulling each run. The inbox half already works this way.
- **Flashback photos** are a static curated set until Google Photos is wired in.
