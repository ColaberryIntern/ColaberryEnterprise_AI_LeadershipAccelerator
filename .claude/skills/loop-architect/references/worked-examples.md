# Worked examples

Three shapes this skill handles, using this repo's actual conventions. These are
illustrative task lists, not scripts to paste verbatim - DISCOVER still runs for real
each time.

## 1. Feature build

**Request:** "Use Loop Architect to build the customer onboarding portal, deploy it to
production, verify it, and teach me exactly how to test it."

- DISCOVER: classify as a finite sequence of implementation tasks. Read
  `frontend/CLAUDE.md`, `backend/CLAUDE.md`; inspect `frontend/src/pages/`,
  `frontend/src/routes/`, existing enrollment/portal flows for patterns to reuse
  (`enrollmentService.ts`, `enrollmentController.ts`) rather than inventing a new shape.
- PREFLIGHT: likely no blocking questions - deploy mechanism, gates, and branch rules
  are already known (SKILL.md "Repository facts"). If the request is silent on which
  fields the onboarding form collects, log a default set as an assumption rather than
  asking.
- PLAN tasks (illustrative): baseline verification -> Sequelize model/migration for
  onboarding state (idempotent, per CLAUDE.md) -> Zod-validated route -> service layer
  -> React page + route wiring -> unit tests (happy/failure/boundary/idempotency per
  CLAUDE.md Mandatory Test Types) -> `tsc --noEmit` both stacks -> PROGRESS.md entry ->
  deploy -> live smoke test -> `handoff.md`.
- Deploy: `docker compose -f docker-compose.production.yml up -d --build backend
  frontend` after PR merge to `main`.
- Handoff: exact URL, a test account/role to use, numbered click-by-click steps, and
  the regression check ("existing enrollment flow still works").

## 2. Migration loop

**Request:** "Rename `oldFieldName` to `newFieldName` across every service and script
that references it, keep the app working the whole time, and deploy when done."

- DISCOVER: classify as a repeated loop over a list of similar items (grep for every
  reference first - this is the "in-scope" list, fixed at PREFLIGHT time, not
  discovered incrementally task-by-task).
- Plan has one task per file/cluster (not one task per line), each with its own
  acceptance criteria: `tsc --noEmit` clean, no remaining references, existing tests
  for that module still pass.
- Verifier runs `grep -rn oldFieldName` after each task as part of "fresh evidence" -
  a leftover reference is an automatic FAIL on criterion 2.
- Quality gate at the end re-runs the full grep repo-wide (not just per-file) to catch
  cross-file misses the per-task loop couldn't see.
- Deploy + verify as in example 1; rollback note per task is trivial (revert that
  file's rename) since renames are low-blast-radius.

## 3. Outreach loop

**Request:** "Draft personalized outreach to this list of 40 leads and get them ready
to send."

- DISCOVER: classify as a repeated loop over a list of similar items, but this is
  content generation, not code - it still gets a state ledger (one entry per lead) and
  a hard cap (40, matching the list length), but the plan/task-verifier apply
  `openclaw-outreach`'s banned-phrase and byline rules instead of `tsc`/jest.
- **Default to a queue, not sending.** The execution contract's Goal must say
  "drafted and queued" unless the requester's initial ask explicitly authorizes sending
  AND a send-capable tool with test-mode support exists in this repo (Mandrill scripts
  have a test-mode flag; use it in Phase F's tests, never fire real sends there).
- No Phase H/I (there's no "production deployment" of a draft queue) - Phase J's
  `handoff.md` becomes "here are the 40 drafts, here's where they're queued, here's
  the review UI/spreadsheet, here's how to approve-and-send."
- This variant never auto-sends without the execution contract explicitly saying so -
  that's a strategic/compliance-adjacent decision (CLAUDE.md Escalation triggers), not
  an implementation detail.
