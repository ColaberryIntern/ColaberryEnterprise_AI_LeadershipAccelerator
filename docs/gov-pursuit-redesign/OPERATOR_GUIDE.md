# Gov Pursuit operator guide

A short runbook for running one government pursuit end to end. It assumes you have
Program access to the admin workspace. For what each step does and why, see `FLOW.md`.

## Before you start

- You need the solicitation ZIP (the posted documents) and the submission deadline.
- Nothing in this tool submits to a buyer portal. You export a package and record the
  external submission yourself; the recorded receipt is the source of truth.

## Run the pursuit (admin)

1. **Snapshot** - open the opportunity and read the advisory "what they want / what we'd
   build" summary. Decide if it is worth the next ten minutes. No commitment yet.
2. **Solicitation** - upload the solicitation ZIP. The server stores a hash, not the files.
   Review the detected requirements and **confirm** the applicable, cited ones. Confirming
   is what establishes them; nothing downstream works until requirements are established.
3. **Fit** - review the capability assessment against Our Services. Claim a new capability
   if we can do it (it writes back to the catalog). For any vague requirement (a line like
   "connect to their system" with no system named), use **Ask the buyer** to draft a
   clarification question and send it yourself during the solicitation Q&A window.
4. **Decide** - write the decision brief and **request approval from a different
   program-capable admin**. You cannot approve your own pursuit. The approver approves or
   sends it back for revision. Approval unlocks steps 5 to 7.
5. **Build the bid** - this runs for weeks:
   - Check the **countdown** and **on-time probability**, and the **MVP schedule / Gantt**
     back-planned from the deadline. Red means the build will not fit; cut scope or move the
     plan, do not raise the limit.
   - **Draft with AI** per response: it drafts and leaves a gap for anything it would have
     to invent. Answer each gap, or mark it `filler` - a filler visibly blocks export until
     you replace it.
   - **Team & access**: assign an intern and set their proposal share level (default: can
     comment). Pricing is never shared.
6. **Submit** - read the submit tiles (deadline, readiness, package, confirmation). When
   every response is approved and readiness is green, **export** the package and download it.
   Submit it on the buyer's portal yourself, then **record the external submission** (and the
   agency acknowledgement when it arrives). Exported is not submitted.
7. **Outcome** - record win or loss. A result generates a private case-study candidate for
   later review; nothing is published.

## What the intern sees (portal)

An assigned intern opens the project from the card on `/portal/today`:

- **Build** - their stories, each with a prompt to run and a hand-in form. They submit
  evidence; a reviewer (not them) verifies it.
- **Proposal** - only if you shared it with them, at the level you set (hidden otherwise).
- **Submission checklist** - what is still owed before submit. Never shows pricing.

## Guardrails you cannot override from the UI

- The establisher cannot approve their own pursuit (separation of duties; master-admin
  override only).
- A `filler` gap blocks submission export until it is replaced with a real answer.
- Pricing never reaches a non-admin (enforced in the API projections, not the screen).
- A non-member who opens a project URL gets a 404, not a 403.

## When something looks wrong

- **"Only two build stories."** Working as designed: only a requirement with a technical
  build signal becomes a build story. Administrative and compliance requirements do not.
- **On-time probability shows "-".** An input is missing (no deadline, or no build plan
  yet). It never guesses; supply the missing input.
- **Export refuses.** A response is unapproved or carries a `filler` gap. The readiness
  panel lists exactly what blocks it.
