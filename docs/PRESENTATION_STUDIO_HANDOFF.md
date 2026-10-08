# Project Presentation Studio — handoff

**What it is.** A six-stage workspace laid over the six demo-prep tasks (PREP-1..PREP-6)
that already existed: Learn → Prepare → Build → Practice → Present → Reflect & Share. The
PREP tasks keep their ids, their history, their points and their verified state. The
Studio is tooling around them, not a replacement for them.

**Where it is.** `https://www.refactored.ai/portal/projects/workspace/<projectId>/<PREP-n>`
and the gallery at `https://www.refactored.ai/portal/showcase`.

**Feature flag.** `PRESENTATION_STUDIO_ENABLED` on the backend container. With it off,
every Studio route returns 404 and the student sees the original `DemoEvidencePanel`.
This is the rollback — see the end of this document.

---

## Status, stated honestly

| | |
|---|---|
| Tasks in the plan | 57 |
| Verified complete and merged | 53 |
| Awaiting your deploy go-ahead | 3 — deploy, live verification, monitoring |
| **Blocked on a human** | **1 — P4-T8** |

**P4-T8 is not done and cannot be finished from a keyboard.** It requires one real Zoom
session so that a real recording flows through the pipeline. Production currently holds
**0 presentation_recordings**. Everything about the recording path is proved by unit
tests and by code being present in the running containers; none of it is proved by a
recording having actually arrived. The runbook for that session is
`directives/PRESENTATION_STUDIO_PROD_REHEARSAL.md`.

**Two other things are deliberately unfinished**, not forgotten:

- The AI coach and peer/instructor feedback services (Phase 5 T5–T7, Phase 6) have no
  routes or UI. They are tested services waiting for the surface that will call them.
- Browser upload of a recording **file** is not built. Every `/api/` upload endpoint
  needs its own nginx `client_max_body_size` location or it 413s at 1 MB, and `nginx/`
  changes are an escalation under CLAUDE.md. See "Known problem" below.

---

## Test it yourself — click by click

No development environment needed. A browser and two accounts.

**Before you start:** confirm `PRESENTATION_STUDIO_ENABLED` is on:

```
ssh root@95.216.199.47
docker exec accelerator-backend printenv PRESENTATION_STUDIO_ENABLED
```

Expect `true`. If it prints nothing, the Studio is off and steps 2–8 will show the old
panel instead.

### 1. Sign in and open a prep card

1. Go to **https://www.refactored.ai/portal/login** and sign in as a test student.
2. Go to **https://www.refactored.ai/portal/projects**.
3. Click any build project, then click the task **"Write the demo narrative"** (PREP-1).

**You should see:** a six-box strip across the top reading Learn, Prepare, Build,
Practice, Present, Reflect & Share, with one box highlighted.

### 2. Pick a presentation type and read the lesson

1. Click **STEP 1 Learn**.
2. Under **"Presentation type"**, click **"Demo Day"**.
3. Scroll down.

**You should see:** the lesson below the chooser changes to the Demo Day lesson. Under
the chooser it says the type *"drives the rest"*. The type is asked first on purpose —
it sets the checklist, the timings and the deck prompt.

### 3. Copy the generated prompt

1. Click **STEP 3 Build**.
2. Click **"Copy prompt"**.
3. Paste it into a text editor.

**You should see:** a prompt naming your actual project — its real name, your real
stories. Anything you have not filled in reads **"(not supplied)"** rather than being
invented. Paste the same prompt twice and it is byte-identical.

### 4. Launch a practice session

1. Click **STEP 4 Practice**.
2. Under **"Reserve a practice room"**, pick a time a few minutes from now and click
   **"Reserve this time"**.
3. When the time arrives, click **"Join"** and accept the recording notice.

**You should see:** a Zoom room opens. It is one of seven licensed hosts — not the
account classes run on, unless the other six are busy.

**End the meeting for everyone when you finish.** Zoom does not finalise a cloud
recording when the host merely leaves.

### 5. Confirm the recording appears on that task

Wait up to an hour, then return to **STEP 4 Practice** on the same task.

**You should see:** your take listed with its date and length. If it is not there yet,
the page says *"Nothing recorded for this task yet"* — it never silently shows an empty
list after a failure; a failed load says so and offers a retry.

### 6. Hand it in and submit for showcase

1. On PREP-2 (**"Record a first run-through"**), find **"Hand it in"**.
2. **"Use a Studio recording"** is already selected. Pick your take.
3. Click **"Submit"**.

**You should see:** *"Verified — +40 pts added to your total."* Click Submit again: it
says it is already handed in and **awards nothing further**.

### 7. Sign in as an instructor and find it

1. Sign out. Sign in at **https://www.refactored.ai/admin** as staff.
2. Open **Orchestration → Experience Studio** and scroll to
   **"🎤 Presentation Studio — instructor controls"**.
3. Choose the student's cohort, then click **"Check who has started preparing"**.

**You should see:** counts for ready / preparing / not started, with the line *"Counted
from what learners have saved, not from who opened the page."* **"Presented"** counts
only staff-verified Demo Day tasks — a join is not an attendance and an attendance is not
a presentation.

### 8. Confirm a second student cannot see the first one's practice

1. Sign out. Sign in as a **different** student, not in the same cohort.
2. Go to **https://www.refactored.ai/portal/showcase**.

**You should see:** the first student's private practice is **absent**. Not greyed out —
absent. Search for their project name: still nothing. Private is enforced on the server
for every surface, including search, thumbnails, transcripts and downloads.

---

## What the system will not do, on purpose

- **It will not let a student present a number they did not supply.** Any figure in a
  generated deck that appears in nothing they wrote is flagged above the deck, with the
  sentence it came from. It is flagged, never silently deleted.
- **It will not show speaker notes to an audience.** In audience view the notes are not
  hidden by CSS — they are absent from the markup entirely.
- **It will not comment on what it could not see.** An audio-only rehearsal gets no
  feedback about slides or eye contact, and the review says which parts were not
  assessed, so silence is never read as approval.
- **It will not let an AI review be a grade.** Every AI review is private and a draft.
  Only a published instructor review grades.
- **It will not let a replaced recording inherit an old approval.** Swap the take and the
  approval goes stale; it must be approved again.
- **It will not mark PREP-6 for a student.** Demo Day is staff-verified. Nobody vouches
  for their own presentation.

## Known problem, not caused by this build

**Build-lab recording uploads are rejected at 1 MB in production.**
`POST /api/portal/runtime/cards/:cardId/build-artifact` accepts 100 MB in code, but the
container nginx has no `client_max_body_size` for that path and falls back to nginx's
1 MB default. Verified against the running container, not the repo. Weeks 5 and 7 ask
students for a screen recording; no recording is under 1 MB, so that feature cannot work
today. The fix is one location block matching two that already exist in
`nginx/nginx.conf`. It is unmade because `nginx/` is escalation territory.

## Rollback

**One command disables the whole Studio**, leaving every PREP task exactly as it was:

```
ssh root@95.216.199.47
cd /opt/colaberry-accelerator
sed -i 's/^PRESENTATION_STUDIO_ENABLED=.*/PRESENTATION_STUDIO_ENABLED=false/' .env
docker compose -f docker-compose.production.yml up -d backend
```

Every Studio route then returns 404 and students see the original evidence panel. **No
data is deleted and no completion is reverted** — the tables stay, the 29 completed PREP
tasks stay complete, and their points stay awarded.

To roll the code back instead, redeploy the previous commit with the normal command:

```
cd /opt/colaberry-accelerator && git checkout <previous-sha> && \
  bash ./scripts/deploy-prod.sh backend nginx
```

**Migrations do not need rolling back.** They are idempotent and additive — every column
arrives via `ADD COLUMN IF NOT EXISTS`, every index via `CREATE INDEX IF NOT EXISTS`.
Proved on production 2026-10-08: re-running all three schema modules against real data
left the column fingerprint (`56b2a98a…`) and index fingerprint (`45ed40e6…`) byte-
identical, and the 29 completions, 29 points rows, 1160 points and 997 evidence records
unchanged.

## Quality gate, 2026-10-08

Run on the release head. Stated as measured, including what is wrong and not mine.

| Check | Result |
|---|---|
| backend `tsc --noEmit` | **0** |
| frontend `tsc --noEmit` | **0** |
| backend suite, locally | **29,530 passing**, 24 failing across 15 suites |
| frontend suite, locally | 5 suites failing in the full run |
| **backend suite, on CI** | **green** |
| **frontend suite, on CI** | **green** (full suite; CI excludes only the helper dir) |
| Presentation Studio suites | **1332 passing, 0 failing** |

**Every local failure above is environmental, and CI is what proves it** rather than an
assumption about which failures "look flaky". Both full suites ran green on this exact
tree on Ubuntu. The local set is the long-standing Windows collection: CRLF byte-compares
that pass on an LF checkout, plus suites that only fail under parallel load.

That includes `AdminGovQualificationPage.test.tsx`, which failed in a crowded local run
and which I first read as a genuine break. Re-run on a quiet machine it is **45 passed, 45
total**, and CI runs it green. It is a load flake, not a defect — worth saying plainly,
because a false bug report costs somebody a day.

**And none of it comes from this work regardless:** the release branch carries no code diff
against `main`.

## Baselines, for spotting drift after a deploy

Captured from production 2026-10-08, before the Phase 7 release:

| Metric | Value |
|---|---|
| PREP tasks complete | 29 |
| PREP tasks total | 276 |
| Points rows (demo + presentation) | 29 |
| Points awarded | 1160 |
| Evidence records | 997 |
| Presentation assignments | 24 |
| Presentation attempts | 1 |
| **Presentation recordings** | **0** |
| Showcases | 0 |
| Zoom practice hosts ready | 7 |

**The 29 / 29 / 1160 relationship is the one to watch.** One completion, one points row.
If completions and points rows ever diverge, something is double-awarding or failing to
award, and that is worth stopping for.
