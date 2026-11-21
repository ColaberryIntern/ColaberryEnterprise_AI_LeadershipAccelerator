# Agentic UX and Trust Design Standard, v1.0

## What this is, and what it is not

This is a **proposed internal standard**. Colaberry wrote it, Colaberry applies it, and Colaberry
is the only body that recognizes it.

It is **not an existing industry certification**. There is no external registry, no accrediting
organization, and no audit behind a score produced by it. A number from this rubric is an
**assessment** of one design at one moment, **not conformance** to anything, and it must never be
presented to a customer, a partner or a procurement officer as though a third party had granted
it.

If that distinction ever blurs, this document has done more harm than good. Everything below is
written on the assumption that somebody will eventually quote a score from it in a sales
conversation, and the honest framing has to survive that.

The rubric is implemented in `backend/src/services/standards/agenticUxRubric.ts`. The code is the
authority on arithmetic; this document is the authority on meaning. A test asserts that the two
carry the same dimensions, weights, gates and tiers, so they cannot drift apart.

## Why it exists

An agentic product asks a person to let software act on their behalf. Every interface decision in
such a product is a trust decision, and most of them are invisible until something goes wrong.
This standard makes a specific set of them explicit and checkable before release rather than after
an incident.

## The acceptance rubric, 100 points

Each dimension is scored 0 to 5 and multiplied by its weight divided by 5. Score with evidence,
not visual impressions. The total is **computed from the weights and never populated directly**;
there is no input field for it in the implementation, which is how that rule is enforced rather
than merely stated.

| Dimension | Weight | Passing evidence |
|---|---|---|
| Outcome clarity and next best action | 12 | A first-time user identifies the current objective and the next human decision in ten seconds |
| Visual hierarchy and information architecture | 10 | Key signal discoverable, consistent components, progressive disclosure, minimal cognitive load |
| Human and agent provenance, and trust | 15 | Every material action labeled agent, human or system, with time, origin, owner, evidence and status |
| Control, approvals and reversibility | 15 | High-risk actions blocked without approval; explicit pause and cancel; reversal or a documented compensation path |
| Multi-agent orchestration visibility | 10 | Tasks, handoffs, dependencies, stalled items and the responsible party can be traced |
| Explainability, accuracy and uncertainty | 10 | Why, source and limitations are visible; uncertainty is calibrated rather than invented |
| Accessibility and responsiveness | 10 | WCAG 2.2 AA-target testing; keyboard, focus, screen reader and responsive layouts |
| Recovery, error prevention and resilience | 8 | Failures are actionable; safe retries, deduplication and escalation are demonstrated |
| Performance, technical quality and security | 5 | No critical auth or data exposure; usable response time measured; no broken controls |
| Real-user task validation | 5 | Representative users demonstrate tasks; issues logged and addressed |
| **Total** | **100** | |

### Decision thresholds

| Score | Decision | Meaning |
|---|---|---|
| 90 to 100 | `RELEASE_CANDIDATE` | Release candidate, if every hard gate passes |
| 80 to 89 | `REWORK` | Targeted rework and retest before production |
| 70 to 79 | `REDESIGN` | Substantive redesign necessary |
| Below 70 | `REJECT` | Reject the design and re-scope |
| Any hard-gate failure | `BLOCK` | Blocked regardless of the numerical score |

### A note on the arithmetic

A dimension contributes `score x weight / 5`, which is fractional for most scores: a 3 on a weight
of 12 is 7.2, and 7.2 has no exact binary floating-point representation. Summing ten such values
and comparing the result against 90 would make a release decision depend on rounding error. The
implementation therefore sums `score x weight` as an integer from 0 to 500 and compares against
thresholds multiplied by 5. The out-of-100 figure is presentation; the integer is what decides.

## The hard gates

A failure of **any one** of these blocks production regardless of the score. They are deliberately
unweighted: a weighted gate is a gate that enough points elsewhere can buy past.

An **unassessed** gate counts as a **failed** gate. Silence is not a pass, and every gate result
requires written evidence whether it passed or failed, because a bare verdict is an opinion.

| Id | Gate |
|---|---|
| GATE-001 | No unapproved high-risk or irreversible side effects. |
| GATE-002 | Every material action has an accountable actor, a traceable state transition, and an evidence or provenance reference, or an explicit 'evidence unavailable'. |
| GATE-003 | No false claims of actions completed; proposed, queued, executing, succeeded, failed, canceled and reverted are distinguished. |
| GATE-004 | Restricted data is not exposed in screens, logs, previews or sample payloads. |
| GATE-005 | Safe interrupt and kill capability for agents within scope, with auditable outcomes. |
| GATE-006 | Critical workflows are keyboard-operable and independently accessibility-tested against the applicable WCAG 2.2 AA criteria. |
| GATE-007 | No fake metrics presented as live data; demos are clearly labeled and isolated. |
| GATE-008 | No broken user-facing primary workflows; error and recovery paths have been exercised. |

## Autonomy tiers

Autonomy attaches to **capabilities and actions**, never to an agent as a whole. One agent may be
A3 for reading and triage while being A2 for sending customer communications or touching financial
records. A product that labels an agent "autonomous" without saying autonomous *at what* has not
used this vocabulary, it has decorated with it.

| Tier | Label | Meaning |
|---|---|---|
| A0 | Observe | Read-only; no external state changes. |
| A1 | Draft | Propose artifacts or changes, but never apply externally. |
| A2 | Approve | Prepare actions and await explicit human authorization. |
| A3 | Bounded execute | Execute preapproved low-risk actions inside explicit scope, budget and rate limits; escalate exceptions. |
| A4 | Delegated autonomous | Multi-step execution within a narrow, revocable policy envelope; requires monitoring and post-action review. |

## The event contract

Every material action emits one event. The schema is implemented in
`backend/src/services/sbp/demoSpec/contract.ts` and is what the Connected Demo's trust timeline
renders.

| Field | Why it is required |
|---|---|
| `event_id`, `occurred_at` | Identity and ordering |
| `work_id`, `trace_id`, `parent_event_id` | Causality: one action can be followed to the work it belongs to |
| `actor` | Structured, not a flat label: `type` (agent, human, system), a stable `id`, a display `label`, and `verified` |
| `human_owner_id` | The accountable person. Required even when the actor IS a human, so accountability is never ambiguous |
| `action`, `status` | What, and which of the seven lifecycle states it is actually in |
| `risk_level`, `autonomy_tier` | How much was at stake and how much autonomy applied |
| `reason_summary` | Why, in one line. Narrative, and explicitly not the audit record on its own |
| `evidence_refs`, `policy_refs` | What backs it. An empty list is stated out loud rather than left blank |
| `approval` | Whether a person was required, and what they decided |
| `side_effects`, `reversible`, `recovery_ref` | What it touched and whether it can be undone |
| `environment` | `demo`, `sandbox` or `simulation`. `production` is deliberately absent from the union |

### `verified` is the field people skip

A demo can verify nothing. An interface that renders an asserted identity as a confirmed one is
making a guarantee the system does not have, which is the exact failure GATE-002 exists to catch.
The Connected Demo engine renders an unverified actor as "identity asserted, not verified", in a
tone a reader notices.

## How a design is scored

1. One reviewer scores all ten dimensions with written evidence per dimension.
2. The eight hard gates are assessed separately, each with evidence, pass or fail.
3. The total is computed. Nobody writes a total down.
4. The decision follows the table above, with any gate failure overriding the score.
5. An accountable human signs off by name before production. A score does not sign anything.

A design that reaches `RELEASE_CANDIDATE` has an assessment, not an approval, and not a
certification.

## What this standard does not cover

- Model quality, prompt design, or evaluation of an agent's outputs for correctness.
- Commercial claims. Those are governed by the Claim Registry, not by this document.
- Security review beyond the surface the interface exposes. GATE-004 and the technical-quality
  dimension are interface-level checks, not a penetration test.
- Legal or regulatory conformance of any kind.

## Applying it to the Connected Demo

The Connected Demo engine was built against this standard, and the relationship is deliberate:
GATE-003 is the reason the engine's status table grants a completed state to exactly one value and
resolves an unrecognized status to "Unrecognized state" rather than to anything that reads as
success. GATE-007 is the reason every demo carries a persistent "Simulated, not live" banner on
the working page, on the error page, in the tab title, and before JavaScript runs. GATE-004 is the
reason a demo spec is content-checked at the write boundary rather than the response boundary.

An initial score for that work is an assessment of it, not conformance certification, and should
be recorded with the reviewer's name and the date.
