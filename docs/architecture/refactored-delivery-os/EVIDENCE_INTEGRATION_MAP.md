# Evidence Integration Map

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

Master plan §2.5: *"Do not create duplicate progression or duplicate evidence for the same
event."* This document establishes what evidence exists, why it cannot serve delivery
as-is, and the one-way rule that prevents duplication.

---

## 1. What exists

### `models/EvidenceRecord.ts` — the progression spine

```ts
declare enrollment_id: string;          // NOT NULL  <- the blocker
declare card_id: string | null;
declare source_type: EvidenceSource;
declare source_ref: string | null;
declare competency_weights: any;
declare builder_xp: number;
declare validated: boolean;
declare idempotency_key: string;        // dedup already solved
```

```ts
export type EvidenceSource =
  | 'prompt_lab' | 'github_commit' | 'github_pr' | 'artifact' | 'peer_review'
  | 'instructor_review' | 'deliverable' | 'implementation' | 'portfolio';
```

Two properties worth keeping:

- **`idempotency_key` is already there.** Master plan §15 requires "same execution
  callback ⇒ no duplicate evidence." That is solved, and the delivery table should copy
  the pattern verbatim rather than invent a second one.
- **`competency_weights` + `builder_xp`** are the progression currency. This is what
  Gate 11's Experience Ledger must feed, and why delivery evidence cannot simply be a
  separate island.

### `models/EvidenceArtifact.ts` — the binary/attachment side

```ts
type EvidenceArtifactType = 'screenshot' | 'log' | 'diff' | 'receipt' | 'other';
declare ticket_id: string | null;       // ops-ticket scoped
declare storage_ref | dom_snapshot_id | visual_review_session_id | source_event_id
```

Notable: `dom_snapshot_id` and `visual_review_session_id` already exist, which means the
platform has some notion of captured DOM and visual review sessions — relevant to Gate 6's
Visual Contract and Gate 9's visual diff.

### Others present

`EvidenceLink.ts`, `StudentSkillEvidence.ts`, `ArchitectureSkillEvidenceBandWeights.ts`,
`PortfolioArtifact.ts`, `ProjectArtifact.ts`, `ShowcaseArtifact.ts`, `Artifact.ts`,
`ArtifactDefinition.ts`, `ArtifactRelationship.ts`, `QAHistory.ts`,
`db/ensureEvidenceSchema.ts`, `services/portfolioGenerationService.ts`,
`portfolioShareService.ts`, `portfolioEnhancementService.ts`,
`showcaseArtifactService.ts`, `runtime/buildArtifactService.ts`.

---

## 2. Why it cannot serve delivery as-is

| Requirement | Blocker |
|---|---|
| Evidence on a client project | `EvidenceRecord.enrollment_id` is NOT NULL; a client project has no enrollment |
| Evidence on an ops ticket vs a delivery story | `EvidenceArtifact.ticket_id` is the wrong parent |
| Gate 9 evidence types | `EvidenceSource` is a closed 9-value union; none of `test_run`, `browser_run`, `visual_diff`, `security_scan`, `accessibility_scan`, `AI_eval`, `architecture_review`, `design_approval`, `client_acceptance`, `deployment_verification`, `operational_metric` exist |
| Release gating | Nothing reads evidence to block a release today |

Widening `EvidenceSource` and relaxing `enrollment_id` would push a delivery concern into
the student progression path — the exact coupling master plan §24 lists as a stop
condition ("student `Project` behavior regresses").

---

## 3. The design: `delivery_evidence`, with a one-way projection

```
delivery_evidence
  id
  delivery_project_id      -> delivery_projects.id   (NOT NULL)
  story_id                 -> delivery_stories.id    (nullable)
  release_id               -> delivery_releases.id   (nullable)
  execution_run_id         -> delivery_execution_runs.id (nullable)
  evidence_type            (see vocabulary below)
  outcome                  'pass' | 'fail' | 'partial' | 'not_run'
  source_ref               commit SHA, PR URL, run id, storage key
  payload                  jsonb — normalized summary, never raw secrets
  recorded_by_identity_id
  idempotency_key          UNIQUE   <- same pattern as evidence_records
  created_at
```

### Evidence type vocabulary (master plan §Gate 9)

```
commit · pull_request · test_run · browser_run · screenshot · visual_diff
security_scan · accessibility_scan · ai_eval · architecture_review
design_approval · client_acceptance · deployment_verification · operational_metric
```

### The one-way rule

```
delivery_evidence  ──(builder credit only, when the builder holds an enrollment)──▶  evidence_records
```

- The projection runs **only** for builder-credit events (Gate 11), never for every piece
  of delivery evidence.
- It reuses the **same `idempotency_key`**, so a replayed execution callback produces at
  most one row on each side.
- It never runs in reverse. Student evidence does not become delivery evidence.
- A client-project builder without an enrollment simply produces no projected row — that
  is a supported outcome, not an error.

This satisfies §2.5 literally: one event, one delivery row, and at most one derived
progression row that is explicitly derived rather than independently authored.

---

## 4. Release gating — evidence read as a gate

Gate 9's question is *"do we have enough evidence to trust this story/release?"*

```
required_evidence(release) = union of
      story.evidence_requirements  for every story in the release
    + delivery_profile.required_evidence          (Gate 13)
    + trust_requirements of every production-bound agent   (Gate 5)

gate(release) = every required type present AND outcome = 'pass'
```

**Fails closed.** Missing evidence blocks. `not_run` is not `pass` — this is the specific
mistake the short-form-video protocol in root `CLAUDE.md` warns about in another context
("the delivered file's duration must be measured, never computed"): an absent measurement
must never read as a passing one.

Master plan §24 stop condition: *"release passes without required evidence."* The gate is
the control that makes that unreachable.

---

## 5. Reuse rather than rebuild

| Need | Existing asset |
|---|---|
| Screenshot capture with safe-width downscaling | `scripts/captureHelpers.js` (1800px ceiling), `.claude/skills/screenshot-review` |
| Playwright harness | `tests/systemV2` |
| Secret scanning | `.github/workflows/secret-scan.yml` |
| Security agents | `services/agents/security/dependencySecurityAgent.ts`, `scanners/codeSecurityScan.ts` |
| Accessibility rules | `.claude/skills/fixing-accessibility` (skill — needs a service wrapper to emit evidence) |
| DOM snapshot / visual review session | referenced by `EvidenceArtifact` — to be traced at Gate 9 |
| Artifact storage | `Artifact.ts` / `ArtifactDefinition.ts` / `ArtifactRelationship.ts` |

Accessibility is the notable gap: it exists as a **skill Claude invokes**, not as a
service that can emit an evidence row. Gate 13's government profile makes accessibility a
mandatory release gate, so Gate 9 must turn it into a runnable check with a recorded
outcome. A skill cannot gate a release.

---

## 6. Retention

Master plan §13 requires these be defined separately. Initial position, to be confirmed at
Gate 13:

| Class | Retention |
|---|---|
| Raw worker event stream | Short — days. High volume, low durable value |
| Normalized execution summary | Life of the project |
| Test logs | 90 days, or life of the release if it gated one |
| Screenshots / visual diffs | Life of the release they evidence |
| Approvals, acceptances, decisions | **Permanent.** These are the contract record |
| Audits (`tenant_access_audits`) | Permanent, append-only |

Durable proof outlives ephemeral execution logs. A client acceptance must still be
readable long after the workspace, the run and its logs are gone.
