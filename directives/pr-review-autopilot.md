# Directive: PR Approval Autopilot

**Owner:** Ali Muwwakkil · **Status:** built, pending go-live · **Mode:** recommend-only (never approves or merges)

A multi-agent system that validates and verifies open GitHub PRs against this repo's
merge-readiness rules and CLAUDE.md governance, then recommends an action. A human
performs every approval and merge. Built 2026-06-22 (Session CC-20260622-p9x4).

---

## What it does

For each PR it fans out **5 parallel reviewers**, adversarially verifies every
blocker/major finding against the real diff, then synthesizes one verdict:

| Reviewer | Validates |
|---|---|
| merge-readiness | mergeable/conflicts (re-checked with `git merge-tree`), base==main, draft, required approvals, self-approval block, CI rollup |
| correctness | real bugs/logic errors/regressions in the diff |
| governance | PROGRESS.md hard gate (Session ID + verification evidence), idempotency, secrets, tests-for-logic, Zod/contract validation, file-size ceilings, em-dash/style |
| tests | happy + failure + boundary + idempotency coverage |
| security | input validation, secrets, route auth, injection, unbounded external calls |

**Verdict:** `APPROVE` / `APPROVE_WITH_NITS` / `REQUEST_CHANGES` / `BLOCK`, with confidence,
merge-ready flag, blockers/majors/nits, rationale, and the exact next step for the human.

---

## Components (all in this repo)

| File | Role |
|---|---|
| `.claude/workflows/pr-approval-review.js` | The multi-agent engine (Workflow). `args`: omit for all open non-draft PRs, or `{prs:[51,48]}` to target. Returns `{prs, verdicts}`. |
| `scripts/prReviewState.js` | State tracker. `diff` = which PRs are new/changed since last review; `record <verdicts.json>` = persist head-SHA + verdict. State: `.claude/pr-review-state.json` (env `PR_REVIEW_STATE`). |
| `scripts/renderPrReviewReport.js` | `verdicts.json` → styled `PR_REVIEW.html`. |
| `scripts/sendPrReviewDigest.js` | Branded Mandrill digest to ali@colaberry.com. Em-dash preflight, send-dedup on `(pr#, head-SHA, recommendation)` (log: env `PR_DIGEST_SENT_LOG`). |
| `scripts/prReviewEmailCron.sh` | VPS email-half entrypoint (pulls Mandrill creds from container, syncs `bot/pr-reviews`, emails new digests). |

## Manual run (any Claude Code session)

```
# review the whole open queue:           invoke the pr-approval-review workflow (no args)
# review specific PRs:                    invoke it with args {"prs":[43,47]}
node scripts/renderPrReviewReport.js <verdicts.json> <out.html>   # render
```

---

## Autopilot — split topology (cloud reviews, VPS emails)

The review needs Claude Code (cloud); the branded email needs Mandrill creds (VPS
container only). They are decoupled through the **`bot/pr-reviews`** branch.

### Half A — Anthropic cloud routine (every 3h, e.g. `7 */3 * * *`)

Runs this prompt. It persists review state on `bot/pr-reviews` so the stateless
cloud run only reviews genuinely new/changed PRs.

> You are the PR Approval Autopilot for `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`. Recommend-only: never approve or merge.
> 1. `git fetch origin bot/pr-reviews && git checkout bot/pr-reviews && git reset --hard origin/bot/pr-reviews`
> 2. `node scripts/prReviewState.js diff`. If `toReview` is empty, STOP — do not commit, do not email.
> 3. Take at most the first 6 numbers of `toReview` (log any skipped).
> 4. Invoke the `pr-approval-review` workflow (`.claude/workflows/pr-approval-review.js`) with `args = {"prs": <those numbers>}`.
> 5. Write the workflow result to `docs/pr-reviews/<UTC-date>/verdicts.json` and `docs/pr-reviews/latest/verdicts.json`.
> 6. `node scripts/renderPrReviewReport.js docs/pr-reviews/latest/verdicts.json docs/pr-reviews/latest/PR_REVIEW.html` (copy to the dated dir too).
> 7. `node scripts/prReviewState.js record docs/pr-reviews/latest/verdicts.json`.
> 8. Commit `.claude/pr-review-state.json` + `docs/pr-reviews/**` and push to `bot/pr-reviews`. Message: `pr-autopilot: reviewed <prs> [A x / C y / B z]`.
> 9. Do NOT email — the VPS cron does that. If the workflow failed or returned no verdicts, log it and exit without committing.

### Half B — VPS node cron (every 3h, offset, e.g. `40 */3 * * *`)

```
40 */3 * * * /opt/colaberry-accelerator/scripts/prReviewEmailCron.sh >> /var/log/pr-review-email.log 2>&1
```

Pulls Mandrill creds from the container, syncs `bot/pr-reviews`, emails any
not-yet-sent digest. Idempotent (content-dedup), never touches the deploy checkout.

---

## Go-live checklist (one-time)

1. [ ] Merge the autopilot code to `main` (additive tooling, no runtime change). *After-hours per deploy rule.*
2. [ ] `git fetch origin && git branch bot/pr-reviews origin/main && git push origin bot/pr-reviews` — then commit the seeded `.claude/pr-review-state.json` (today's 9 verdicts) + `docs/pr-reviews/latest/` onto it so the first cloud run starts warm.
3. [ ] Create the cloud routine (Half A) via `/schedule` with the prompt above, cron `7 */3 * * *`.
4. [ ] On the VPS: `cd /opt/colaberry-accelerator && git pull origin main`, then add the Half-B crontab line.
5. [ ] First run: confirm the cloud routine commits to `bot/pr-reviews` and you receive one branded email.

## Failure modes

- **Cloud run errors / 0 verdicts** → no commit, no email; next tick retries.
- **`bot/pr-reviews` not published** → VPS cron exits 0 quietly.
- **Mandrill creds missing** → VPS cron aborts loud (exit 1), logged; no email.
- **Runaway queue** → capped at 6 PRs/run, skipped ones logged and picked up next tick.
- **Self-approval** → flagged in `suggestedAction`; the human (Ali) admin-merges or routes to a second reviewer.

---

## Autonomous merge policy (the standing loop's "approve + merge" step)

`scripts/prAutoMerge.js` is the closed-loop merge step. Given a verdicts JSON it merges
the ELIGIBLE PRs into main serially and FLAGS the rest. A truly autonomous system still
refuses to merge what it shouldn't.

**A PR is auto-merged only if ALL hold:**
1. verdict is `APPROVE` or `APPROVE_WITH_NITS` (never `BLOCK` / `REQUEST_CHANGES`),
2. `mergeReady === true`,
3. it touches NO guardrail path, and
4. the diff is not oversized (> 40 files or > 1500 changed lines).

**Guardrail paths always route to a human, even when the gate is green** (a wrong
auto-merge there sends real money/comms, leaks secrets, or corrupts schema):
`stripe | paysimple | billing | enrollment | payment | webhook | auth | token |
password | secret | credential | models/index | migration | *.sql | seeds/`.

**Serial merge queue.** PRs are merged one at a time, re-syncing main between each, so the
PROGRESS.md union driver resolves cleanly and concurrent PRs don't thrash. (Merging in
parallel cascades conflicts — observed 2026-06-24 when 9 merges put every in-flight PR
into conflict.) A merge that hits a non-PROGRESS code conflict is aborted and flagged.

**Standing loop (cloud routine, every 3h):**
`prReviewState.js diff` → `pr-approval-review` (check) → `remediate-pr` on REQUEST_CHANGES
(improve) → `prAutoMerge.js --execute` (approve + merge eligible, flag the rest) →
`sendPrReviewDigest.js` (VPS, email what merged + what was flagged).

**Kill switch / dry-run.** `prAutoMerge.js` defaults to dry-run (prints the plan, merges
nothing); only `--execute` merges. Run without `--execute` to audit the plan anytime.
