# Gov Pursuit flow (as shipped, P0 to P7)

This is the flow the redesign actually built, step by step, with the gate or rail that
makes each step trustworthy. It supersedes the illustrative screens in `designs/` for
anything load-bearing: the screens show the shape, this file states what the code does.

There are TWO entry points onto the same delivery project:

- **Admin workspace** - `AdminGovQualificationPage` (`/admin/...`), gated by
  `requireSection('program')`. The operator drives the pursuit here.
- **Intern portal** - `GovProjectPortalPage` (`/portal/gov-projects/:projectId`), gated by
  `requireParticipant` + `requireGovProjectAccess`. An assigned intern sees only the
  student-safe projection; a non-member gets a 404 (they cannot even learn the project
  exists).

## The seven steps (admin workspace)

The step bar runs left to right; each step asks one question and shows one primary
action. Steps 5 to 7 are **locked until the pursuit is approved** - the Build step can
never show "done" before a decision.

| # | Step | Question | The gate / rail |
|---|---|---|---|
| 1 | **Snapshot** | Is it worth a look? | Advisory "what they want / what we'd build" read, grounded only in the established requirements. Changes no gate. |
| 2 | **Solicitation** | What do we submit, under what rules? | Upload the solicitation ZIP; the server stores only a hash (an **attestation**), never the bytes. Confirming candidate requirements **establishes** them (the gate-bearing set). |
| 3 | **Fit** | Can we deliver, and what would we learn? | AI capability assessment vs the service catalog (have / partial / new), write-back to Our Services. "Ask the buyer" drafts clarification questions for the vague requirements (advisory, sends nothing). |
| 4 | **Decide** | Should we bid? | The decision brief + a request/approve/send-back loop. **Separation of duties**: the establisher cannot approve their own pursuit (403 except a master-admin override), enforced at request time AND at approval time. |
| 5 | **Build the bid** | What is the product, and is the bid ready? | Deterministic countdown + on-time probability; a back-planned MVP schedule + Gantt; Draft-with-AI (gaps, never fabricated facts; a `filler` gap **blocks export** server-side); Team & access (per-member share; pricing admin-only). |
| 6 | **Submit** | Is it out the door? | Submit status tiles + the readiness checklist + export/receipt/acknowledge. **Exported is not submitted**: this app never submits to a buyer portal; the operator records the external submission themselves, and those routes stay the source of truth. |
| 7 | **Outcome** | Did we win? | Win/loss capture; a win or loss generates a PRIVATE case-study + service-capability candidate for later review (never published, never fabricated). |

## The rails that hold across the flow

- **Determinism first, AI advisory only.** Every schedule number (working-day math,
  on-time probability, the Gantt) is a pure function with `now` injected, reproducible and
  unit-tested. The AI surfaces (Snapshot read, Draft-with-AI, Ask-the-buyer) are advisory:
  they set no gate, persist as drafts, and fail soft (no key or an upstream error returns a
  clear message, never a throw).
- **The AI can ask, never answer on the firm's behalf.** Draft-with-AI leaves a typed GAP
  for any fact it would have to invent; a gap is `open` until a human answers it, and a
  `filler` placeholder blocks submission export until replaced.
- **Pricing is admin-only, enforced at the API.** The student requirement projection, the
  shared-proposal projection, and the intern submission checklist each drop pricing by the
  requirement's `kind`. An intern's payload never contains a price - the trust boundary is
  the API, not the screen.
- **Membership is the access boundary.** Every per-project portal endpoint resolves the
  actor by email to a platform identity, checks the tenant first (audited), then the
  delivery permission; a non-member is a 404.
- **No migrations for advisory state.** Share grants, proposal responses, gaps, evidence,
  and assignments use additive JSONB columns / dedicated tables added idempotently at boot.

## The intern portal (P6)

An assigned intern opens the project from the "on your profile" card on `/portal/today`
and sees: the **Build** view (their stories, each with a Claude Code prompt and a hand-in
form; a reviewer verifies, never the submitter), the **Proposal** as shared with them
(hidden entirely when their share level is `none`; comment/edit also see the open gap
questions, never the stored answers), and a **price-free Submission checklist** (what is
still owed before submit, with pricing handled by the admin and not shown).
