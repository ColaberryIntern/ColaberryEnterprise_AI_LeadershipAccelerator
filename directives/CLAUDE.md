# directives/CLAUDE.md
**Local conventions for SOPs and runbooks.** Root rules in `/CLAUDE.md` apply.

## What this directory is
Directives = Standard Operating Procedures for the system. Step-by-step, human-readable, written so a junior developer (or another AI agent) can pick up the procedure and execute it correctly.

## What does NOT belong here
- **Business logic.** Directives say WHAT to do, not HOW the code implements it. Code lives in `/backend` or `/frontend`.
- **Inline executable code blocks beyond examples.** A directive may show a 5-line snippet for clarity, but cannot ship as the actual implementation. The implementation goes in a script under `backend/src/scripts/` or a service under `backend/src/services/`.
- **Transient state.** If something changes weekly, it's not a directive; it's project state. Track in PROGRESS.md.

## Required sections per directive file
Each directive should answer:
1. **Purpose.** One paragraph: what business outcome this procedure delivers.
2. **Inputs.** Concrete: file paths, env vars, env state, expected upstream events.
3. **Steps.** Numbered. Each step has a single action and an observable success signal.
4. **Outputs.** What this directive produces (files, side effects, downstream events, log lines).
5. **Verification.** How to confirm success. Cannot be "looks right." Must be testable: a specific log line, a database row, a curl that returns 200, an artifact at a known path.
6. **Edge cases / failure modes.** What can go wrong, what to do when it does.
7. **Safety constraints.** Any production-write rules, rate limits, idempotency guarantees, secret-handling rules.

## File naming
- `<verb-object>.md` — e.g., `deploy-to-production.md`, `rotate-basecamp-token.md`, `audit-tracker-installs.md`.
- Avoid `notes.md`, `readme.md`, `misc.md`. If you can't name it as verb-object, it isn't a directive.

## Linking from CLAUDE.md
When a directive supersedes ad-hoc instructions in CLAUDE.md, the CLAUDE.md section should be replaced with a one-line link: "See `directives/<file>.md`." This keeps root CLAUDE.md lean.

## When to write a new directive
- A procedure has been executed manually 3+ times and the steps are stable.
- A procedure touches production in a way that benefits from explicit safety checks.
- An onboarding/intern scenario requires a self-contained reference.

If the procedure is one-off, write a script with a thorough header comment instead. Don't pollute `directives/` with one-shots.
