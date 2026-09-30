# Milestone dashboards (visual, non-blocking, auto-opened)

This loop does not pause mid-run to narrate progress in chat. Instead, at a small,
fixed set of milestones it writes a single self-contained HTML dashboard into the run
directory. Because `.claude/hooks/open-html.sh` already auto-opens any `.html` file
Claude writes or edits (PostToolUse hook, fire-and-forget `Start-Process`), simply
writing the file is enough - no extra "open browser" step is needed or should be added.

**This replaces text-only progress narration at these checkpoints, not the actual
governance stops.** A genuine hard-stop (Escalation Protocol, 3-attempt task failure,
2-cycle production failure, etc.) still halts the run for real - it just also gets a
dashboard instead of a wall of text, per the "Blocked" variant below.

## The fixed milestone set (cap: 5, matches CLAUDE.md's bias against notification noise)

| # | Milestone | Fires when | File name |
|---|---|---|---|
| 1 | Kickoff | Plan auditor PASS (Phase E), before Phase F begins | `dashboard-01-kickoff.html` |
| 2 | Halfway | First time `passed task count / total task count >= 0.5` during Phase F | `dashboard-02-halfway.html` |
| 3 | Shipping | Quality gate (Phase G) green, immediately before Phase H deploy | `dashboard-03-shipping.html` |
| 4 | Live | Production verification (Phase I) PASS, `handoff.md` written | `dashboard-04-live.html` |
| 5 | Blocked (conditional, replaces #2-4 if it fires first) | Any hard-stop condition | `dashboard-05-blocked.html` |

Each fires **once** per run. Record fired milestones in `state-ledger.json`'s
`dashboards_emitted` array (see `references/state-ledger-schema.md`) so a resumed run
never re-opens one that already fired, and a run that never reaches "Halfway" (e.g. a
2-task plan that goes straight from 0% to 100%) simply skips it rather than forcing it.

## What every dashboard must show, above the fold

1. **Progress bar** - `<n> of <total> tasks complete (<pct>%)`, current phase name.
2. **ETA** - `elapsed_time / tasks_done * tasks_remaining`, labeled "estimated" (it's a
   linear extrapolation, not a promise). If `tasks_done == 0` (Kickoff), show "not yet
   estimable - first task in progress" instead of dividing by zero.
3. **Confidence** - blend of the plan-audit score (`score/20`) and the running average
   of task-verifier scores (`avg_score/12`), mapped to CLAUDE.md's own tiers:
   - `>= 0.80` -> **High** (green)
   - `0.65-0.80` -> **Medium** (amber) - "proceeding, assumptions logged"
   - `< 0.65` -> **Low** (red) - "per CLAUDE.md this would normally enter Diagnostic
     Mode; note what's being watched"
4. **What's next** - the next task's objective in one sentence, or (Shipping) "deploying
   to `<environment>`", or (Live) "handoff guide is ready below".

## Screenshots / visual evidence (required, not optional - below the fold)

The person reading this dashboard has no way to tell what was actually built from a
progress bar and a task list alone. Every dashboard from Halfway onward must show
**something visual that proves the state of the build**, not just stats and prose.

- **UI-facing work:** capture a real screenshot, never a mockup or a description of
  one. Reuse the repo's existing capture protocol - `/screenshot-review`'s
  `scripts/captureHelpers.js` safe-width downscaling (1800px ceiling) - the same
  mechanism `screenshot-review` uses for sprint review docs. Halfway/Shipping capture
  the local/dev render of the surface just built; Live **must** capture the actual
  production page via `scripts/captureProductionScreenshots.js` (or the equivalent
  live capture step) - this is also what proves Phase I's "primary user journey works"
  check wasn't just asserted. Save captured images under
  `.loop-architect/runs/<run-id>/screenshots/` and embed them with plain `<img
  src="screenshots/....png" style="max-width:100%">` (relative path, no external
  hosting, no base64 bloat unless the file is trivially small).
- **Backend-only/non-UI work:** there is no screenshot to take, but the dashboard still
  needs a visual, not a wall of text. Use one of: a small Mermaid diagram (inline
  `<script>` from a CDN is fine here - this is a local run artifact, not a strict-CSP
  Artifact) showing the changed data/service flow, or a styled "evidence card"
  (monospace block, terminal-window chrome) showing the actual command and output that
  proves the task works (e.g. a real `curl` response, a passing test run). Never a
  plain paragraph where a table, badge row, or diagram would show the same fact faster.
- **Never fabricate.** If UI work exists at a milestone but capture tooling isn't
  reachable (e.g. dev server not up, prod not yet deployed), say so explicitly in the
  dashboard ("screenshot pending - dev server not running") rather than omitting the
  section silently or describing what the screenshot would show.

## House style (reuse, don't reinvent - see `/baseline-ui` and `docs/POST_DEPLOY_WALKTHROUGH.html`)

Self-contained HTML, Bootstrap 5 via CDN link (same as `POST_DEPLOY_WALKTHROUGH.html`),
inline `<style>` using the repo's actual tokens:

```css
:root {
  --color-primary: #1a365d; --color-primary-light: #2b6cb0;
  --color-accent: #38a169; --color-secondary: #e53e3e;
  --color-bg: #ffffff; --color-bg-alt: #f7fafc;
  --color-text: #2d3748; --color-text-light: #718096; --color-border: #e2e8f0;
}
```

Structure per page (mirrors `.doc-header` / `.summary-bar` / `.stop` in
`POST_DEPLOY_WALKTHROUGH.html`):

- **Hero header** (`.doc-header`, navy-to-blue gradient): run name, milestone name,
  timestamp, session ID as a meta chip.
- **Summary bar** (`.summary-bar`, white card, big-number stats): progress %, tasks
  done/total, ETA, confidence badge (green/amber/red).
- **Body**: one card per relevant section - completed tasks (badges: `bg-success`
  "passed"), the screenshots/visual-evidence card (above), what's next, and
  (Shipping/Live only) the quality-gate or production-verification results table. Keep
  it to what changed since the last dashboard - don't repeat the full task list every time.
- **Blocked variant only**: red-accented hero (`--color-secondary`), exact stop reason,
  completed/verified work, current task, failed evidence, what's required to resume,
  and the exact resume command - i.e. the hard-stop report from SKILL.md, laid out
  visually instead of as prose.

Tone: enterprise, calm, factual - per CLAUDE.md's "Bloomberg meets Salesforce" target
audience. No filler, no false urgency, no emoji.

## What this section does NOT change

- Hard-stop conditions, retry caps, and the escalation protocol are unchanged - see
  `execution-contract.md`. A dashboard reports a stop; it never substitutes for one.
- The end-of-run **Final report** (SKILL.md) is still produced in chat - the Live/Blocked
  dashboard is a companion artifact, not a replacement for that text summary.
- `handoff.md` (Phase J) remains the durable, git-committable-if-wanted testing guide;
  the Live dashboard links to it rather than duplicating its full content.
