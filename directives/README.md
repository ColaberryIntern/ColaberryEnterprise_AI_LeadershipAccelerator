# Directives

Standard Operating Procedures. Layer 1 of the governance model: **directives say what to do; code says how it is done.**

Written so a junior developer or another AI agent can pick up the procedure and execute it correctly without asking. Local conventions: [CLAUDE.md](CLAUDE.md).

---

## Current directives

**13 directives.** Each answers the seven required sections below.

| File | Covers |
|---|---|
| [lead-ingestion.md](lead-ingestion.md) | How leads enter the system, dedupe rules, source attribution |
| [marketing-site.md](marketing-site.md) | Marketing site operations |
| [gov-bid-intake.md](gov-bid-intake.md) | Government bid intake and routing |
| [apollo-lead-reserve.md](apollo-lead-reserve.md) | Apollo lead reserve handling and credit discipline |
| [per-user-project-previews.md](per-user-project-previews.md) | Ephemeral per-user preview stacks. **Includes the sign-off for mounting the Docker socket into the backend container** — read before touching preview provisioning. |
| [launch-approval-gates.md](launch-approval-gates.md) | Approval gates on a launch |
| [pr-review-autopilot.md](pr-review-autopilot.md) | The automated PR review loop (`scripts/prReview*`) |
| [register-ticket-creating-agent.md](register-ticket-creating-agent.md) | Registering an agent allowed to create tickets |
| [resolve-inbox-case.md](resolve-inbox-case.md) | Working an inbox case to resolution |
| [rotate-jwt-secret.md](rotate-jwt-secret.md) | JWT secret rotation |
| [govern-curriculum-video-sources.md](govern-curriculum-video-sources.md) | Curriculum video source governance and provenance |
| [run-open-house-live-experience.md](run-open-house-live-experience.md) | Running the live Open House experience |
| [cora-knowledge-base-gaps.md](cora-knowledge-base-gaps.md) | Closing Cora knowledge base gaps |

Several pair with automation: `pr-review-autopilot.md` with `scripts/prReviewState.js` and friends, `rotate-jwt-secret.md` with the secret-scan guards, `per-user-project-previews.md` with `backend/src/services/previewStackService.ts`.

## Required sections

Every directive answers all seven, in order:

1. **Purpose** — one paragraph on the business outcome.
2. **Inputs** — concrete file paths, env vars, expected upstream events.
3. **Steps** — numbered. One action per step, each with an observable success signal.
4. **Outputs** — files, side effects, downstream events, log lines.
5. **Verification** — how to confirm success. **"Looks right" is not verification.** A specific log line, a database row, a `curl` that returns 200, an artifact at a known path.
6. **Edge cases and failure modes** — what goes wrong and what to do about it.
7. **Safety constraints** — production-write rules, rate limits, idempotency guarantees, secret handling.

Section 5 is the one that gets skipped and the one that matters most. A directive without testable verification is a wish.

---

## What does not belong here

- **Business logic.** Implementation goes in `backend/src/services/` or `backend/src/scripts/`. A directive may show a 5-line snippet for clarity; it never ships as the implementation.
- **Transient state.** If it changes weekly it is project state, not a directive. That goes in the session log.
- **One-offs.** Write a script with a thorough header comment instead. Do not pollute this directory with single-use procedures.

## Naming

`<verb-object>.md` — `deploy-to-production.md`, `rotate-basecamp-token.md`, `audit-tracker-installs.md`.

If you cannot name it as verb-object, it is probably not a directive. `notes.md`, `misc.md`, and `readme.md` are not directive names.

## When to write one

- A procedure has been run manually 3+ times and the steps have stabilized.
- A procedure touches production in a way that benefits from explicit safety checks.
- Onboarding or an intern scenario needs a self-contained reference.

## Relationship to CLAUDE.md

When a directive supersedes ad-hoc instructions in `CLAUDE.md`, replace that section with a one-line pointer: *"See `directives/<file>.md`."* This is what keeps the root contract from growing without bound.

---

## Related

Some procedures live as Claude Code skills in `.claude/skills/` rather than as directives here — `monthly-commission`, `story-build`, `screenshot-review`, `build-curriculum-type`, and others. The distinction: **a skill is a procedure an agent invokes; a directive is a procedure a person follows.** Several exist in both forms where a human needs to be able to run it without an agent.
