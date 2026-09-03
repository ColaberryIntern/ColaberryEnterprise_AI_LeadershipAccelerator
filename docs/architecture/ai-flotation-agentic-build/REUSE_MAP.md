# AI Flotation Agentic Build — Gate 0 Reuse Map

- Date: 2026-09-03
- Session: CC-20260902-m8q4
- Base: `e99fdb35`

§34 lists fifteen agentic responsibilities and warns they are *"responsibilities, not
permission to create 14 duplicate agent tables/services."* This maps each one, plus the
platform concerns around them, to what already exists.

**Verdict key**

- **REUSE** — exists and fits; extend in place, add nothing
- **EXTEND** — exists but is missing a dimension this product needs
- **NEW** — genuinely absent, and building it does not duplicate anything
- **ESCALATE** — cannot be decided inside implementation

---

## Agentic responsibilities (§34)

| Responsibility | Existing system | Verdict |
|---|---|---|
| Execution orchestration | `services/delivery/execution/executionOrchestrator.ts` | REUSE |
| Coding workers | `execution/claudeAgentSdkProvider.ts` behind `executionProviderContract.ts` | REUSE |
| Execution authority / policy | `execution/executionPolicy.ts`, `modules/delivery/builderAuthority.ts` | REUSE |
| Release planning / stories | `services/delivery/deliveryStoryContract.ts`, `deliveryStoryGraph.ts` | REUSE |
| QA / evidence | `services/delivery/deliveryEvidenceProjection.ts`, `modules/delivery/deliveryEvidence.ts` | REUSE |
| Security / trust evaluation | `services/delivery/deliveryTrustGate.ts` + `modules/delivery/inpact.ts` | REUSE |
| Release | `services/delivery/releaseGate.ts`, `modules/delivery/releaseChecks.ts` | REUSE |
| Client acceptance | `services/delivery/clientAcceptance.ts` + `clientAcceptanceService.ts` | REUSE |
| Requirements | `services/delivery/deliveryContractService.ts` | REUSE |
| Architecture decisions | `services/delivery/deliveryDecisionService.ts` | REUSE |
| UX / design loop | `services/delivery/deliveryDesignLoop.ts` | REUSE |
| Opportunity mapping | `services/delivery/deliveryOpportunityMap.ts` | REUSE |
| Operate / improvement | `services/delivery/operateSignals.ts` | REUSE |
| PM copilot / capacity | `services/delivery/mentorState.ts`, `capacityOverride.ts`, `factoryEconomics.ts` | EXTEND |
| **Project AI (client-facing)** | no project-scoped conversational agent exists | **NEW** |

Fourteen of fifteen already exist. The one genuinely new agent is the one the customer
actually talks to.

---

## Platform concerns

| Concern | Existing system | Verdict | Note |
|---|---|---|---|
| Identity | `models/PlatformIdentity.ts` | REUSE | §150 stop condition if duplicated |
| Client auth | `modules/delivery/clientAuth.ts`, `clientMagicLink.ts` | REUSE | sign-in ≠ access |
| Client-safe projection | `modules/delivery/clientVisibility.ts` | REUSE | allowlist per object kind, fail-closed |
| Authorization | `modules/delivery/deliveryAuthorization.ts`, `deliveryRoles.ts` | REUSE | §54 labels map onto these, no parallel roles |
| Tenancy | `modules/tenancy/*` | REUSE | |
| Lead → delivery activation | `services/delivery/leadConversion.ts` | EXTEND | chain done; needs free-blueprint import + PM assignment |
| CRM / attribution | `Visitor`, `PageEvent`, `Lead`, `LeadSource`, `LeadTenantContext` | REUSE | §76 forbids a second CRM |
| Brand theming | `frontend/src/theme/deliveryBrandThemes.ts` | REUSE | keyed on `brands.default_theme_key` |
| Repo connect | `models/GitHubConnection.ts` + `REPO_CONNECT_CONTRACT.md` | EXTEND | needs the delivery-ready gate (§32) |
| Preview hosting | `services/previewStackService.ts` + reaper | EXTEND | free concepts need synthetic-data isolation (§101) |
| Email sending | `services/emailService.ts` + `models/SenderProfile.ts` | REUSE | AI Flotation sender identity, not Colaberry (§63) |
| Notification preferences | `models/CommunicationPreference.ts` | EXTEND | needs delivery event types (§61) |
| Free intake contracts | `services/sbp/*` | EXTEND | built around enrollment; needs an enrollment-free path |
| **Lead-ingest notification** | `controllers/leadIngestionController.ts` | **NEW** | stores and tells nobody — live defect |
| **Project Room messaging** | `ChatConversation` is visitor-scoped | **NEW** | see CURRENT_STATE §1.5 |
| **Subscription billing** | PaySimple = one-time links only | **ESCALATE** | ESCALATION-1 |
| **Voice intake** | Synthflow configured, 3 agents | **ESCALATE** | ESCALATION-2 — reuse or add a 4th agent |

---

## What this means for the gate order

The plan's 21 gates assume more greenfield than exists. Re-scoped:

- **Gates 15–17** (agentic execution, design→code, release/acceptance) are integration
  and proof work over systems that already run, not construction.
- **Gate 8** (activation) is mostly done; the remaining piece is importing free project
  truth into the activated project.
- **Gate 19** (TBI productization) is projection work — the scoring already gates releases.
- **Gates 2, 10** (Project AI, Project Room) are the real build.
- **Gate 7** (billing) is blocked on ESCALATION-1 and cannot start.
- **Gate 3** (voice) is blocked on ESCALATION-2 and is smaller than planned.

The honest shape: **this is less construction and more assembly**, with two decisions
outside implementation and one live defect that should be fixed before any of it.
