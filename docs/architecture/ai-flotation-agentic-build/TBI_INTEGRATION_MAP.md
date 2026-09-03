# Trust Before Intelligence Integration Map — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

Gate 0 question 20: *which TBI scores and evidence are currently wired at runtime versus
only in architecture documents?*

## Answer: INPACT gates releases today

`backend/src/modules/delivery/inpact.ts` is runtime code, not documentation. It exports:

```
InpactDimension          the six canonical dimensions
INPACT_DIMENSIONS        the ordered list
INPACT_MEANINGS          what each dimension means
INPACT_MIN_SCORE = 1
INPACT_MAX_SCORE = 6
INPACT_MAX_TOTAL         dimensions × max
InpactScores             Partial<Record<InpactDimension, number>>
isValidInpactScore()
```

Consumed by four non-test modules:

| Consumer | Role |
|---|---|
| `services/delivery/deliveryTrustGate.ts` | trust gate |
| `services/delivery/releaseGate.ts` | **release gating** |
| `services/delivery/deliveryStoryContract.ts` | story-level trust impact |
| `services/delivery/deliveryOpportunityMap.ts` | opportunity mapping |

Plus `seeds/seedProgramCurriculum.ts` on the education side.

**Consequence:** §153's stop condition — *"scores are invented"* / *"TBI is not tied to
requirements, evidence and gates"* — is already satisfied by the platform. Any new AI
Flotation trust score would diverge from a working one, which §150 also forbids.

Related runtime pieces: `modules/delivery/releaseChecks.ts`,
`modules/delivery/deliveryEvidence.ts`, `modules/delivery/deliveryRiskLevels.ts`,
`modules/delivery/deliveryProfiles.ts`.

## What Gate 19 actually is

Not "productize TBI". **Project it.** The scoring, gating and evidence already exist
internally; what does not exist is the client-facing view of them (§64–§67).

That makes Gate 19 mostly a `CLIENT_VISIBILITY_MAP` problem: decide which trust facts are
client-safe, add them to the allowlist, and render them.

## The pre-production honesty rule

§19, §65 and §67 are emphatic, and the platform already agrees with them:

- do not show operational GOALS maturity for a system that has not been built or measured
- pre-build states are `Required`, `Planned`, `Needs decision`, `Not yet measurable`
- do not average away a weak dimension for gating

This matches the discipline seen elsewhere in the codebase — `not_run != pass`,
`waived != pass`, and `factoryEconomics`'s refusal to publish an unvalidated ratio. The
client trust view must inherit it rather than restate it.

## Canonical terminology

§6 fixes the vocabulary and §153 makes divergence a stop condition:

- **INPACT™** — Instant, Natural, Permitted, Adaptive, Contextual, Transparent
- **7-Layer Architecture** — Multi-Modal Storage, Real-Time Data, Semantic, Intelligence, Governance, Observability, Orchestration
- **GOALS™** — Governance, Observability, Availability, Lexicon, Solid

`inpact.ts` is the in-repo authority for the six INPACT dimensions and their meanings; the
book repository (`colaberry/trust-before-intelligence-book`, current `manuscript/`) is the
authority for the framework overall.

**Verification still owed:** the six dimension strings in `inpact.ts` have not been diffed
against the current manuscript in this session. §153 requires that check before any public
TBI copy ships. Recorded as an outstanding Gate 19 task rather than claimed as done.

## Where the 7 layers and GOALS live

INPACT is wired. **No equivalent runtime module was found for the 7-Layer Architecture or
GOALS** — they appear in course and curriculum data (`data/canonicalCourse.ts`,
`data/classSessionPlan.ts`, `data/weekBlueprints.ts`), which is teaching material, not
delivery gating.

So the honest current state is: **one of three TBI pillars gates delivery; the other two
are taught but not measured.** §67's rule — do not show operational maturity before
evidence exists — is therefore not merely a UI guideline here, it is a statement of fact
about what the system can currently support.
