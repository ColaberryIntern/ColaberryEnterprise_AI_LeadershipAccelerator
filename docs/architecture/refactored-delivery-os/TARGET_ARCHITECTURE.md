# Target Architecture

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

The 14 diagrams required by master plan §18. These are the **target**; nothing below is
built. Where a box is already real on `origin/main` it is marked `[exists]`.

---

## 1. Tenant / organization / engagement / project

```mermaid
graph TD
  T["Tenant [exists]"] --> B["Brand [exists]"]
  B --> BD["BrandDomain [exists]"]
  B --> SP["SenderProfile [exists]"]
  B --> O["Organization [exists — C-02 blocks client orgs]"]
  O --> DE["DeliveryEngagement (new)"]
  DE --> DP["DeliveryProject (new)"]
  DP --> DPM["DeliveryProjectMember (new)"]
  DP --> DC["DeliveryContract (new)"]
  DP --> SL["DeliveryProjectSourceLink (new)"]
  SL -.optional link.-> PRJ["Project [exists — student, unchanged]"]

  style O fill:#fde8e8,stroke:#c0392b
  style PRJ fill:#e8f4fd,stroke:#2980b9
```

`Organization` is red: it cannot hold a client company until C-02 is resolved, and its
services carry no tenant filter today.

---

## 2. Identity + tenant membership + project membership

```mermaid
graph LR
  PI["PlatformIdentity [exists]"] --> PIL["PlatformIdentityLink [exists]"]
  PIL --> ENR["Enrollment [exists]"]
  PIL --> ADM["AdminUser [exists]"]
  PIL -.->|"open question — Gate 2"| EXT["External client reviewer<br/>(no enrollment, no admin user)"]

  PI --> TM["TenantMembership [exists]"]
  TM --> TR["tenantRoles.ts [exists]<br/>5 roles · 16 permissions"]

  PI --> DPM["DeliveryProjectMember (new)"]
  DPM --> DR["deliveryRoles.ts (new)<br/>13 roles · 28 permissions"]

  subgraph GATE["allow() — both must pass, in this order"]
    G1["1. tenantGuard — fail closed, audited"]
    G2["2. deliveryGuard — fail closed"]
    G1 --> G2
  end

  TR --> G1
  DR --> G2
  style EXT fill:#fff4e0,stroke:#e67e22
```

Tenant first, so a foreign caller is denied before the delivery layer discloses whether
the project exists.

---

## 3. Student Project bridge

```mermaid
graph LR
  subgraph STUDENT["Student world — UNCHANGED"]
    E["Enrollment"] --> P["Project<br/>enrollment_id NOT NULL<br/>program_id NOT NULL"]
    P --> SBP["SBP plan + tasks"]
    P --> ER["EvidenceRecord<br/>enrollment_id NOT NULL"]
  end

  subgraph DELIVERY["Delivery world — new"]
    DP["DeliveryProject<br/>no enrollment"]
    DP --> DEV["DeliveryEvidence"]
  end

  DP -->|"DeliveryProjectSourceLink<br/>(nullable, additive)"| P
  DEV -->|"builder credit ONLY<br/>one-way · shared idempotency_key"| ER

  style P fill:#e8f4fd,stroke:#2980b9
  style ER fill:#e8f4fd,stroke:#2980b9
```

The link is optional and additive. No column is added to `projects`. Evidence flows one
way only.

---

## 4. Project graph

```mermaid
graph TD
  C["DeliveryContract"] --> R["Requirement"]
  R --> AD["ArchitectureDecision"]
  R --> DD["DesignDecision"]
  R --> AG["AgentDefinition"]
  AD --> REL["Release"]
  DD --> REL
  AG --> REL
  REL --> S["Story"]
  S --> XR["ExecutionRun"]
  XR --> EV["Evidence"]
  EV --> CA["ClientAcceptance"]
  CA --> DEP["Deployment"]
  DEP --> OS["OperationalSignal"]
  OS --> BO["BusinessOutcome"]
  BO -.->|"candidate, never automatic"| R

  DL[("Decision Ledger<br/>append-only, supersession")]
  C -.-> DL
  AD -.-> DL
  DD -.-> DL
  AG -.-> DL
  CA -.-> DL
```

Relational, not a graph database — master plan §Gate 3, and no evidence was found that
relational modelling is inadequate.

---

## 5. Client conversation → decision → story

```mermaid
sequenceDiagram
  participant CL as Client
  participant PAI as Project AI (client-scoped)
  participant DL as Decision Ledger
  participant IMP as Impact Analyzer
  participant SG as Story Graph
  participant EX as Execution

  CL->>PAI: "can we add X?"
  Note over PAI: reads APPROVED truth only<br/>no scratchpad, no mentor notes
  PAI->>IMP: compute impact of X
  IMP-->>PAI: requirements/design/stories/agents affected
  PAI-->>CL: ChangeRequest + impact — NOT a build
  CL->>DL: approve
  DL->>SG: story becomes ready
  SG->>EX: execute (only if authority + gates pass)
  Note over CL,EX: client conversation NEVER<br/>reaches Execution directly
```

Master plan §5.1. The gap between the client's sentence and a commit is the product.

---

## 6. Design loop

```mermaid
graph TD
  PP["1 Product Personality"] --> DNA["2 Design System / DNA"]
  DNA --> PF["3 Page Families"]
  PF --> CW["4 Critical Workflows"]
  CW --> EXC["5 Exceptions"]

  CW --> V["2-4 interactive variants"]
  V --> CMP{"Client: compare · comment ·<br/>request change · combine ·<br/>mobile/desktop"}
  CMP -->|approve| VC["Visual Contract<br/>regions · actions · hierarchy ·<br/>responsive · a11y · reference snapshot ·<br/>acceptable variance"]
  CMP -->|change| V
  VC --> ST["Stories"]
  VC --> QA["Gate 9: visual_diff evidence"]

  APPR["Approved decisions are versioned<br/>supersession is explicit, never silent"] -.-> VC
```

Master plan §24 stop condition: *"design approval can be silently overwritten."*
Supersession is a recorded decision, not an UPDATE.

---

## 7. Trust Before Intelligence

```mermaid
graph TD
  subgraph INPACT["INPACT™ — what each agent needs"]
    I["Instant"]; N["Natural"]; PM["Permitted"]
    A["Adaptive"]; CX["Contextual"]; TR["Transparent"]
  end

  subgraph L7["7-Layer Architecture (canonical names)"]
    L1["1 Multi-Modal Storage"] --> L2["2 Real-Time Data"] --> L3["3 Semantic"]
    L3 --> L4["4 Intelligence"] --> L5["5 Governance"]
    L5 --> L6["6 Observability"] --> L7X["7 Orchestration"]
  end

  subgraph GOALS["GOALS™ — operating contract"]
    G["Governance"]; O["Observability"]; AV["Availability"]
    LX["Lexicon"]; S["Solid"]
  end

  AGD["DeliveryAgentDefinition"] --> INPACT
  AGD --> L7
  AGD --> GOALS
  INPACT --> EVAL["Per dimension, scored 1-6:<br/>requirement · implementation evidence ·<br/>evaluation · owner · status"]
  EVAL --> RG["Release gate — fails closed"]
  GOALS --> OPS["Continuous measurement<br/>5 scores stored separately, never averaged"]
  DEP["INPACT dependency order is a BUILD CONSTRAINT:<br/>1 Instant → 2 Natural+Permitted → 3 Contextual → 4 Adaptive+Transparent"]
  DEP --> RG

  BOOK["✅ verified against trust-before-intelligence-book<br/>manuscript/ @ main — D-04 closed"]
  style BOOK fill:#e8f8ee,stroke:#27ae60
```

Verified against the canonical book. **INPACT is scored 1–6 per dimension** (36 max,
reported on a 100-point scale); **GOALS is scored 1–5 per dimension** (25 max). The
dependency order is a build constraint, not guidance — a story graph that schedules
Adaptive before Instant is invalid. See
[TRUST_BEFORE_INTELLIGENCE_INTEGRATION.md](TRUST_BEFORE_INTELLIGENCE_INTEGRATION.md).

---

## 8. Execution / sandbox / GitHub

```mermaid
graph LR
  UI["Refactored UI"] --> ORCH["Execution Orchestrator"]
  ORCH --> SC["Story Contract"]
  ORCH --> AUTH{"authority + risk gate<br/>humans AND agents"}
  AUTH -->|deny| WFH["waiting_for_human"]
  AUTH -->|allow| WP["WorkspaceProvider<br/>(adapt previewStackService [exists])"]

  GH[("Customer GitHub<br/>canonical source")] -->|clone @ base SHA| WS["Ephemeral Workspace<br/>ISOLATED"]
  WP --> WS
  WS --> EP["ExecutionProvider = claude_code<br/>⚠ E-01: SDK not installed"]
  EP --> TESTS["tests · browser · security"]
  TESTS --> RP["RepositoryProvider<br/>branch · commit · PR<br/>(extend repoWriter [exists])"]
  RP -->|PR| GH
  TESTS --> EVID["Evidence"]
  WS -->|destroyed| X["∅"]

  DENY["default deny: prod deploy · prod DB · DNS ·<br/>live email · cloud deletion · push to main ·<br/>unbounded network · secret exfiltration"]
  EP -.-> DENY

  S01["⚠ S-01: docker.sock mounted into<br/>internet-facing backend container"]
  style S01 fill:#fde8e8,stroke:#c0392b
  style EP fill:#fff4e0,stroke:#e67e22
```

Source custody never moves. Refactored holds pointers and evidence.

---

## 9. Quality OS

```mermaid
graph TD
  subgraph DIM["Evidence dimensions"]
    D1["requirements coverage"]; D2["acceptance coverage"]
    D3["unit"]; D4["integration"]; D5["browser"]
    D6["visual contract"]; D7["security"]; D8["accessibility"]
    D9["AI evals"]; D10["Trust coverage"]; D11["architecture drift"]
    D12["defects"]; D13["client acceptance"]; D14["production reliability"]
  end

  DIM --> Q{"Do we have enough evidence<br/>to trust this story/release?"}
  Q -->|"any required type missing<br/>or outcome ≠ pass"| BLOCK["BLOCKED — fails closed"]
  Q -->|all present and passing| PASS["Release gate open"]

  NR["not_run ≠ pass"] -.-> BLOCK
  PROF["DeliveryProfile decides<br/>which are mandatory"] --> Q
  style BLOCK fill:#fde8e8,stroke:#c0392b
```

---

## 10. Client acceptance

```mermaid
sequenceDiagram
  participant B as Builder
  participant G as Release Gate
  participant CR as Client Review Room
  participant CO as Client Acceptance Owner
  participant L as Ledger

  B->>G: request release
  G->>G: evaluate required evidence
  alt evidence missing
    G-->>B: BLOCKED + what is missing
  else complete
    G->>CR: publish preview + evidence summary
    CR->>CO: what was promised · what to look at · what supports it
    alt accept
      CO->>L: ClientAcceptance (durable, permanent)
    else accept with exceptions
      CO->>L: ClientAcceptance + exceptions
    else reject
      CO->>L: rejection + comments -> new stories
    end
  end
```

Accept-with-exceptions is a first-class outcome, not a rejection.

---

## 11. Builder / mentor / capacity

```mermaid
graph TD
  BAP["Builder Authority Profile<br/>evidence-backed, never time-in-program"] --> CAP{"capacity + risk model"}
  EXP["Experience Ledger<br/>(from DeliveryEvidence)"] --> BAP
  CAP --> P1["Project 1"]; CAP --> P2["Project 2"]; CAP --> P3["Project 3"]
  CAP -->|over max_parallel_projects| OVL["overload guard"]
  OVL --> M["Mentor exception queue"]

  M --> E1["failed trust/security gate"]
  M --> E2["first client review"]
  M --> E3["builder overloaded"]
  M --> E4["high rework"]
  M --> E5["architecture concern"]
  M --> E6["release ready"]

  MODE{"Learn Mode vs Delivery Mode"} --> SAME["same project truth,<br/>different support level"]
  NOTE["metric: verified throughput / human judgment effort<br/>internal only — not surveillance, not marketed"]
```

---

## 12. Government profile

```mermaid
graph TD
  DPF["DeliveryProfile (versioned)"] --> CS["commercial_standard"]
  DPF --> IT["internal_tool"]
  DPF --> GOV["government_public_sector"]

  GOV --> REQ["required requirement categories:<br/>accessibility · security · privacy ·<br/>records/retention · identity/authz · auditability ·<br/>AI transparency · human oversight · data handling ·<br/>availability · documentation · procurement/hosting"]
  GOV --> REV["required reviewers"]
  GOV --> EVD["required evidence"]
  GOV --> GATE["release gates"]

  EVD --> CHK{"all present?"}
  CHK -->|"missing a11y / security / trust"| BLK["RELEASE BLOCKED"]
  CHK -->|complete| OK["release may proceed"]

  WARN["never claim universal compliance;<br/>contract-specific requirements override/add"]
  DEF["regulated ⇒ no Case Study candidate by default"]
  style BLK fill:#fde8e8,stroke:#c0392b
```

---

## 13. Operate / GOALS feedback

```mermaid
graph LR
  PROD["Production (safe signals only)"] --> SIG["availability · errors · latency ·<br/>agent success · AI evals · cost ·<br/>usage · security findings ·<br/>data quality · business KPIs"]
  SIG --> GOALS["GOALS assessment<br/>is it still trustworthy?"]
  GOALS --> CAND["Candidate work:<br/>defect · optimization · new requirement ·<br/>agent tuning · architecture change"]
  CAND --> HUM{"human review"}
  HUM -->|approve| STORY["Story"]
  HUM -->|reject| DROP["closed with reason"]

  NEVER["a production signal NEVER<br/>mutates production directly"]
  style NEVER fill:#fde8e8,stroke:#c0392b
```

---

## 14. Case Study flow

```mermaid
graph LR
  DP["DeliveryProject"] --> AF{"APPROVED facts only"}
  AF --> F1["approved contract snapshot"]
  AF --> F2["approved decisions"]
  AF --> F3["gated releases"]
  AF --> F4["client acceptance"]
  AF --> F5["operational outcomes"]

  F1 & F2 & F3 & F4 & F5 --> ADPT["Case Study Adapter<br/>projection ALLOWLIST"]
  SENS{"data_sensitivity"} --> ADPT
  ADPT --> CAND["CaseStudyCandidate"]
  CAND --> APPR2{"separate approval<br/>client + Colaberry"}
  APPR2 --> PUB["Publication (does not exist yet)"]

  EXCL["excluded: drafts · superseded variants ·<br/>execution logs · mentor notes ·<br/>builder assessments · defects"]
  ATTR["reuse Visitor · VisitorSession ·<br/>PageEvent · Lead · LeadTenantContext [exists]"]
  NOPII["no client facts in marketing analytics payloads"]
```

---

## Layering summary

```mermaid
graph TD
  L1["1 Directives — /directives"] --> L2["2 Orchestration — Claude"]
  L2 --> L3["3 Execution — backend/frontend/scripts"]
  L3 --> L4["4 Verification — /tests, tsc"]
  L4 -.evidence.-> L2

  NOTE["Claude plans, validates and hardens.<br/>Claude is never the runtime executor."]
```

Consistent with root `CLAUDE.md`. The Execution Plane at Gate 8 is a **layer-3
deterministic service** that invokes a coding agent under contract — not Claude Code
acting as the runtime of the business.
