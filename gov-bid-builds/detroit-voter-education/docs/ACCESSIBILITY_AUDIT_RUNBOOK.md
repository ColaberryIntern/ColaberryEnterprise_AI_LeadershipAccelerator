# Quarterly Accessibility Audit — Runbook

**Story:** STORY-021 — Quarterly Accessibility Verification
**Owner:** City content admin (per the story), operationally run by whoever holds the `ADMIN_API_KEY` for this environment.
**Cadence:** Quarterly. This is a **manual** step, not automated CI/CD — see "Why manual, not CI/CD" below.

## What this actually checks

An automated axe-core scan (STORY-020) of this app's React components, plus a
count of resident-submitted accessibility feedback (the "Accessibility
issue" option in the feedback form, STORY-005) received since the last
audit. It catches missing/invalid ARIA, missing form labels, missing
accessible names, and landmark structure problems.

**It does not certify full WCAG 2.1 AA compliance.** Color contrast is
verified separately (see `decision-record-STORY-020.md`), not by this
automated check. Screen-reader usability and keyboard-only task completion
are not verified by this check either — those require a human tester with
real assistive technology. Treat a "PASS" result as "no known automated-
detectable regressions," not "compliant."

## How to run it

1. Ensure the backend is running with a real `DATABASE_URL` and
   `ADMIN_API_KEY` set (see `.env.example`).
2. Ensure `app/client`'s devDependencies are installed (`npm install` inside
   `app/client` — the audit spawns `app/client`'s own axe-core suite as a
   subprocess).
3. Trigger the audit:
   ```
   curl -X POST http://localhost:3001/api/accessibility-audits/run \
     -H "x-admin-key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"triggeredBy": "<your name or admin id>"}'
   ```
4. Read the report:
   ```
   curl http://localhost:3001/api/accessibility-audits/<auditId>/report \
     -H "x-admin-key: $ADMIN_API_KEY"
   ```
5. Review resident-submitted accessibility feedback directly — the report
   only gives you a *count*, not the content:
   ```
   curl "http://localhost:3001/api/feedback?type=accessibility" \
     -H "x-admin-key: $ADMIN_API_KEY"
   ```

## If the audit reports FAIL

1. Run `npm test` inside `app/client/` locally and read the axe violation
   detail directly (more readable than the API's captured `raw_output`).
2. Fix the specific violation(s).
3. Re-run the audit to confirm a clean pass.

## Audit history

`GET /api/accessibility-audits` (admin-key-gated) returns the last 50 runs,
most recent first — `status`, `components_passed`, and
`accessibility_feedback_count` per run, without the full raw output.

## Why manual, not CI/CD

This story's build steps suggested scheduling the audit via a CI/CD
pipeline. This repo has no CI/CD pipeline anywhere in it — deployment is
entirely manual (SSH + `docker compose up --build`, per the root
`CLAUDE.md`). Setting up a new scheduled, automated recurring process (e.g.
a GitHub Actions workflow on a cron trigger) is a durable infrastructure
change, not a code-only fix, and was explicitly decided against for this
story in favor of keeping the audit a deliberate, on-demand runbook step
that matches this project's existing all-manual operations model. If this
platform moves toward a real launch with an actual CI/CD pipeline, revisit
automating this step then.
