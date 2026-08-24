# TARGET_ARCHITECTURE (Gate 0 → Gate 8)

## Governing decision

> The Career Studio is a **read-only projection** assembled on request from systems that
> already own their data. It adds no tables, no columns, and no migrations.

Every alternative considered required duplicating either resume truth, skill evidence, or XP —
each of which is an explicit stop condition in plan §71.

## 1. Person-level CareerProfile sources

```mermaid
flowchart LR
  subgraph Existing["Existing systems (owners of truth)"]
    E[Enrollment<br/>name · email · avatar · payment_status]
    OP[OnboardingProfile<br/>resume · linkedin · extracted]
    CAPE[(student_skill_evidence<br/>append-only ledger)]
    SAS[student_architecture_skill<br/>derived cache]
    PA[(runtime_portfolio_artifacts)]
    PRJ[(projects)]
    GH[(github_connections<br/>student_github_activity)]
  end

  subgraph New["New — this build"]
    AD[careerEvidenceAdapters.ts<br/>read-only]
    SVC[careerProfileService.ts<br/>assemble + readiness]
    API[/GET /api/portal/career/profile/]
    UI[Career Studio<br/>/portal/portfolio]
  end

  E --> AD
  OP --> AD
  CAPE --> SAS --> AD
  PA --> AD
  PRJ --> AD
  GH --> AD
  AD --> SVC --> API --> UI

  style New fill:#eef4ff,stroke:#2f5fd0
  style Existing fill:#f6f7f9,stroke:#8a94a6
```

Note the arrow direction: **nothing points back into the existing systems.** The Studio is a
pure sink.

## 2. Skill provenance — how a capability earns its level

```mermaid
flowchart TD
  R[Resume upload] --> RC[capeResumeClaimService<br/>persistResumeSkillClaims]
  RC --> L
  C[Classroom / timeline<br/>qualifying activity] --> EL[capeEvidenceLedgerService<br/>recordSkillEvidence]
  D[Diagnostic / test-out] --> EL
  EL --> L[(student_skill_evidence<br/>band · credit · source · idempotency_key)]

  L --> RE[recomputeStudentArchitectureSkill<br/>FULL REPLACE from 100% of rows]
  RE --> S[student_architecture_skill<br/>claim / knowledge / application / judgment]

  S --> DL{deriveEvidenceLevel}
  DL -->|only claim band| RL[resume]
  DL -->|any knowledge/application/judgment| CV[colaberry_verified]
  DL -->|delivery ledger — NO SOURCE YET| DV[delivery_verified]

  style DV stroke-dasharray: 5 5,stroke:#b0561a
```

`delivery_verified` is drawn dashed because it is contractually present and empty — see
`REFACTORED_INTEGRATION_MAP.md`.

## 3. Access state machine (Gate 1)

```mermaid
stateDiagram-v2
  [*] --> Unpaid
  Unpaid --> Paywall: PageGate / 402 content_requires_paid
  Unpaid --> NoResume: payment clears

  NoResume --> Prerequisite: state = needs_resume\n(NO career data returned)
  Prerequisite --> Ready: resume uploaded via existing\n/api/portal/settings/resume

  Ready --> Studio: state = ready · visibility PRIVATE
  Studio --> Published: DEFERRED — Gate 10
  note right of Published
    Not reachable in this increment.
    Nothing publishes.
  end note
```

## 4. Classroom → portfolio growth

```mermaid
sequenceDiagram
  participant S as Student
  participant RT as Runtime
  participant PA as PortfolioArtifact
  participant EL as CAPE ledger
  participant ST as Career Studio

  S->>RT: completes qualifying activity
  RT->>PA: generateArtifact() (existing, unchanged)
  RT->>EL: recordSkillEvidence() (existing, unchanged)
  Note over PA,EL: both idempotency-guarded upstream
  S->>ST: opens /portal/portfolio
  ST->>PA: read
  ST->>EL: read (via recomputed profile)
  ST-->>S: private portfolio reflects new work immediately
  Note over ST: no published snapshot exists,<br/>so nothing public can silently change
```

Plan §18's invariant — *private portfolio updates automatically, published snapshot does not
silently change* — holds trivially here: there is no published snapshot.

## 5. Privacy boundary

```mermaid
flowchart LR
  Caller[Authenticated participant] -->|session JWT| MW[requireParticipant]
  MW --> ENT[requireContentEntitlement 'portfolio']
  ENT -->|402 if gated| X[blocked]
  ENT --> CTL[careerPortfolioController]
  CTL -->|eid = req.participant.sub ONLY| SVC[careerProfileService]

  note1[No route accepts an enrollment id,<br/>slug, or user id as a parameter.<br/>Cross-tenant read is unrepresentable.]
  CTL -.- note1
```

## Module inventory

| File | Lines (target) | Responsibility |
|---|---|---|
| `backend/src/services/career/careerEvidenceAdapters.ts` | <300 | Read-only adapters over the six existing sources |
| `backend/src/services/career/careerReadiness.ts` | <150 | Configurable readiness policy + computation |
| `backend/src/services/career/careerProfileService.ts` | <260 | Access state machine + assembly |
| `backend/src/schemas/careerPortfolioSchema.ts` | <130 | Zod response contract |
| `backend/src/controllers/careerPortfolioController.ts` | <80 | HTTP + dev contract validation |
| `backend/src/routes/careerPortfolioRoutes.ts` | <30 | Route wiring + entitlement |
| `frontend/src/services/careerApi.ts` | <120 | Typed client mirroring the Zod schema |
| `frontend/src/pages/portal/portfolio/*` | <300 each | Career Studio sections |

All within the root CLAUDE.md size targets (~300 soft / 500 hard per file).

## Deferred diagrams

Plan §68 lists 15 diagrams. The seven above cover every subsystem this increment builds. The
remaining eight (multi-repo analysis, team contribution, readiness→review→publication,
versioned snapshots, recruiter portfolio, talent network, employer analytics loop, legacy
migration) describe gates 5, 6, 9b, 10–14 and are deliberately not drawn — drawing an
architecture for code that does not exist would misrepresent what shipped.
