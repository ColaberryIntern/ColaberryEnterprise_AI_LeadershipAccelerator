# CC-20261120: Enterprise client intake, Phases 2 to 5 (W29 to W32)

Ali, 2026-11-20: "Take all of the outstanding task and queue them up and use loop architect to go through one at a time until done. 1 pr 1 deployment. Let me know when you are done. Don't want to go back and forth. Just tell me when to merge and show me how it works."

This followed Phase 1 (W28, PR #4250, live). The plan page is `C:\Users\ali_m\visual-decisions\2026-11-20-enterprise-client-intake-plan\plan.html`. Q4 A: Ali owns every client list.

## Tickets

| Phase | Ticket | What it does |
|---|---|---|
| 2 | W29 10533176943 | Every form opens a client list in the new Basecamp project "Colaberry Enterprise Intake" (49670056) |
| 3 | W30 10533389616 | Company research, 2-3 pilot options, draft options email; the write-up keeps what the person wrote |
| 4 | W31 10533389629 | Every email and call on the client list, the stage in the list name, the proposal |
| 5 | W32 10533389643 | Admin Enterprise Clients page, signed opens their project, client sign-in at /my-pilot |

## How it was run (loop-architect)

- One task at a time.
- Each phase was graded by an independent task verifier (the loop-task-verifier rubric) from fresh evidence. A FAIL went back for fixes and was graded again.

| Phase | First grade | Final grade | What the reviewer caught |
|---|---|---|---|
| 2 | 8/12 FAIL | 11/12 PASS | Write-up could post twice; half-built checklist never repaired; boot column-add untested |
| 3 | 7/12 FAIL | 11/12 PASS | SSRF bypass via IPv4-mapped IPv6 (proven reaching loopback and metadata); idle-only timeout; research tick dropped |
| 4 | 8/12 FAIL | 12/12 PASS | Repost loop when a Next to-do fails; substring email matching (bob@ matched jimbob@); clients past 20 starved; non-atomic sends |
| 5 | 9/12 FAIL | see PR | User enumeration by response timing; sign-in token left in the URL and recordable by analytics |

## Design decisions (and why)

- **Nothing reaches a client without Ali's click.** The options email and the proposal are AI drafts. They are sent from the admin page by `sendFirstContactAsAli`, which comes from Ali, is plain text, is BCC'd to Ali, has a kill switch and the style lint, and sends exactly once.
- **The proposal never sends without Ali's price.** The AI writes `[Ali to add the investment]`, and the send is refused while that text is still there.
- **Email sync reads only the Colaberry work mailbox** (`gmail_colaberry`). Matching is exact on parsed addresses or the whole domain. Webmail domains are never matched as a domain.
- **Once-only everywhere a side effect leaves the building**, using atomic claims and in-process guards. A failure releases the claim, so the 5-minute sweep retries.
- **The client sees only their own progress:**
  - steps with dates;
  - option titles, after the options email is sent;
  - what happens next.
  - It never sees internal data.
- **Not built, and why:**
  - **Zoom meetings:** they are not synced, because no Zoom record names who was in a meeting.
  - **The AI phone call:** it stays off until Ali creates the Synthflow Enterprise agent (Phase 1 decision A).

## Verification

- **Backend:**
  - all Enterprise intake suites pass, plus the email, controller, admin route and middleware suites;
  - the banned-word and brand-preflight gates pass;
  - tsc is clean, apart from the known local exceljs and playwright types.
- **Matching SQL:**
  - proven on Postgres (accelerator_dev1, rolled back);
  - pinned by `enterpriseIntakeSync.integration.test.ts` in the CI Postgres tier.
- **Frontend:** 739 tests in the touched areas pass, tsc is clean and the build compiles.
- **Edge, against the local build with the API faked, at 1440 and 390:**
  - the admin list and client detail render;
  - /my-pilot and /my-pilot/status render;
  - no page errors and no sideways scroll.
- **Local-only failures in the full CI-config run,** none in files this work touches:
  - missing exceljs, playwright and pdfkit;
  - CRLF line endings in two source-text tests.

## Deploy notes

- One deploy covers the backend and nginx.
- After the image is built, set `BASECAMP_ENTERPRISE_INTAKE_PROJECT_ID=49670056` in `/opt/colaberry-accelerator/.env`. Until then, every Basecamp step is a no-op.
- Boot adds the new `enterprise_intakes` columns. The change is additive only.
- When enabled, the sweep opens a list for every existing intake. Today that is one: the W28 test intake.
