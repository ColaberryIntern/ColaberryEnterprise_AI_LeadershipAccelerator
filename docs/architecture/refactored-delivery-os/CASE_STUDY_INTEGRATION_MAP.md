# Case Study Integration Map

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

Master plan §Gate 15 describes "Case Study OS" as a consumer of approved delivery facts.

---

## Finding: Case Study OS does not exist

| Probe | Result |
|---|---|
| `CaseStudy*` model | **none** |
| `caseStudy*` service | **none** |
| Nearest existing | `models/ShowcaseArtifact.ts` + `services/showcaseArtifactService.ts` |
| Portfolio surface | `portfolioGenerationService.ts`, `portfolioShareService.ts`, `portfolioEnhancementService.ts`, `models/PortfolioArtifact.ts` |

The master plan reads as though Case Study OS were an existing system to integrate with.
It is not. Gate 15 is therefore **an adapter plus a consumer that does not exist yet** —
and the honest sequencing is to build the adapter, prove it emits correct candidates, and
leave publication to whatever consumes it later.

There is a worktree named `casestudy-os-wt` in the local environment, which suggests work
has been scoped or started elsewhere. **Nothing of it is on `origin/main` at `d1d46d1e`.**
Before Gate 15 begins, check whether that branch has since landed; building a second Case
Study OS would violate master plan §24's duplication stop conditions.

---

## What exists and transfers

| Capability | Where | Use |
|---|---|---|
| Showcase artifacts | `showcaseArtifactService.ts` | Nearest publication surface |
| Portfolio generation + sharing | `portfolio*Service.ts` | Approved-facts-to-narrative precedent |
| Artifact model family | `Artifact.ts`, `ArtifactDefinition.ts`, `ArtifactRelationship.ts` | Storage + relationships |
| Visitor / session / page event | `modules/attribution/` | Master plan §Gate 15 reuse list |
| `Lead`, `LeadTenantContext` | `models/`, `modules/tenancy/` | Attribution, already tenant-aware |
| Executive deliverables | `services/executiveDeliverableService.ts` | Client-facing narrative precedent |

`LeadTenantContext` matters: attribution is already tenant-scoped, with a unique
constraint (`lead_tenant_contexts_lead_tenant_brand_unique`) that the multi-tenancy work
verified functionally. Case Study attribution inherits that rather than reinventing it.

---

## The adapter

```
DeliveryProject
   └─ approved facts only ──▶ CaseStudyCandidate ──(separate approval)──▶ publication
```

**Approved facts only.** The adapter reads:

- the approved `DeliveryContract` snapshot (business outcome, success measures)
- approved architecture and design decisions
- releases that passed their gate
- `client_acceptance` evidence rows
- operational outcomes recorded post-release

It does **not** read: draft decisions, superseded variants, execution logs, mentor notes,
builder assessments, defect history, or anything without an approval record behind it.

A case study assembled from unapproved facts is a claim the client never agreed to, made
in public, about work they paid for. The approval record is the whole control.

---

## The privacy boundary

Master plan §Gate 15: *"Do not put private client facts in marketing analytics payloads."*
Master plan §11: *"no client data in global analytics."*

Enforced by two mechanisms rather than by reviewer care:

1. **`data_sensitivity` on the contract** gates whether a candidate can be generated at
   all (see [DATA_OWNERSHIP_MATRIX.md](DATA_OWNERSHIP_MATRIX.md) §Data sensitivity).
   `client_confidential` requires explicit written release; `regulated` defaults to no.
2. **A projection allowlist** at the adapter — the candidate carries only fields on the
   list. A new field on `DeliveryProject` does not become publishable by existing.

Default deny in both. A field nobody has classified is not marketing copy.

---

## Publication remains separately approved

Master plan: *"Case Study publication remains separately approved."*

Generating a candidate is not publishing. The candidate is an internal artifact requiring
its own approval — from the client acceptance owner where the contract requires it, and
from Colaberry regardless. Two approvals, recorded as decisions in the ledger.

---

## Government work

Verified government delivery can become builder specialization evidence (master plan
§Gate 13). But government project facts are frequently **not publishable** — procurement
terms, security posture and records requirements often prohibit it.

Rule: government projects default `data_sensitivity = regulated`, which means no Case
Study candidate is generated unless the contract explicitly permits it. The builder still
earns the Experience Ledger credit; the marketing artifact simply does not exist.

---

## Sequencing recommendation

Gate 15 is the last gate for good reason, and its dependency list is long: it needs
approved contracts (Gate 3), approved decisions (Gate 6), passing release gates (Gate 9),
durable client acceptance (Gate 10) and operational outcomes (Gate 14).

**Recommendation:** build the *adapter and the candidate object* at Gate 15, and treat
publication as deferred work under master plan §25 until a Case Study consumer exists. It
is legitimate to ship the proof that approved facts can be consumed without also shipping
the marketing site that consumes them.
