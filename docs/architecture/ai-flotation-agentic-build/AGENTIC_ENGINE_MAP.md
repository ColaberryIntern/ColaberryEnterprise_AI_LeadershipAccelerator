# Agentic Engine Map — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

§34 warns that the fifteen agentic responsibilities are *"responsibilities, not permission
to create 14 duplicate agent tables/services"*, and §150 makes
`AIFlotationExecutionRunner duplicating ExecutionProvider` an explicit stop condition.

## The execution seam already exists

`backend/src/services/delivery/execution/`:

| File | Role |
|---|---|
| `executionProviderContract.ts` | the seam — provider-agnostic contract |
| `claudeAgentSdkProvider.ts` | the first provider behind it |
| `executionOrchestrator.ts` | drives runs |
| `executionPolicy.ts` | what a run is permitted to do |
| `executionPromptEnvelope.ts` | what a run is told |
| `executionRunState.ts` | run lifecycle state |

A contract with one provider behind it is exactly the shape §55 asks for elsewhere
(`VoiceInterviewProvider`) and §24 asks for in billing. **It is already correct here.**
AI Flotation must call this seam, not add a runner beside it.

## Responsibility → owner

Fourteen of fifteen §34 responsibilities map to existing modules; the full table is in
`REUSE_MAP.md`. Summarised:

- **Orchestration, coding workers, authority/policy** → `execution/*` + `modules/delivery/builderAuthority.ts`
- **Requirements, architecture, design, release planning, stories** → `deliveryContractService`, `deliveryDecisionService`, `deliveryDesignLoop`, `deliveryStoryContract`, `deliveryStoryGraph`
- **QA/evidence, trust, release, acceptance** → `deliveryEvidenceProjection`, `deliveryTrustGate`, `releaseGate`, `clientAcceptance`
- **Operate/improve** → `operateSignals`
- **PM copilot/capacity** → `mentorState`, `capacityOverride`, `factoryEconomics` (EXTEND)
- **Project AI** → **does not exist** (NEW)

## The one new agent

Project AI (§35–§37) is the only genuinely new agent, and it is new for a good reason: it
is the first agent that talks to a *client* rather than operating on a repository.

Its constraints are already specified and enforceable:

- **Project-scoped context only** (§36). The exclusion list — no chain-of-thought, no builder scratchpads, no other-client context, no secrets, no capacity economics, no internal risk commentary — maps directly onto `clientVisibility.ts`, which is allowlist-based and fails closed. Project AI should read through that projection rather than around it.
- **Deterministic tools** (§37). Read tools are projections; state-changing tools (`proposeChangeRequest`, `proposeDecision`, `requestPMReview`) require runtime validation, project authorization, state-transition validation, an audit event, idempotency and structured output. `DeliveryEvent` already provides the audit shape.
- **Never persist hidden reasoning** (§41).

## Decision necessity must not be the model's call

§44 is a design rule with teeth: *"Do not let the LLM alone decide whether a human is
required."* The deterministic inputs it lists — reversible, business judgment, security,
privacy, financial, data, architecture, trust, release, contractual — have existing homes
in `modules/delivery/deliveryRiskLevels.ts`, `deliveryAuthorization.ts` and
`executionPolicy.ts`.

The six outcomes (`AUTO_RECOMMEND_AND_PROCEED` … `BLOCKED`) should be computed from those,
with the model contributing a *recommendation and rationale*, never the gate itself. This
is the same separation `leadConversionPlan`/`leadConversion` uses: decide in a pure,
testable function; act in a thin one.

## Execution preconditions

§32's delivery-ready gate (`billing_active`, `project_activated`, `repo_connected`,
`required_contract_ready`, `authority_ready`) has no single owner today. `executionPolicy`
governs what a run may do; nothing yet governs whether a *project* may run at all.

That gate is real new work, and it depends on `REPO_OWNERSHIP_MAP.md`'s escalation —
`repo_connected` cannot be true for a commercial client until a repo connection can exist
without an enrollment.

## Story contract

§84's required story fields (why, requirements, acceptance criteria, architecture impact,
TBI impact, dependencies, repo, base SHA, authority, allowed context, test plan, evidence
expectation, failure paths, stop condition) should be checked field-by-field against
`deliveryStoryContract.ts` before extending it. §84's real rule — *"Do not execute from raw
client chat"* — is the one that matters, and it is why §40's confirmation step exists.
