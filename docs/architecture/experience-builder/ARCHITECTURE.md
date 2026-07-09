# Experience Studio — Architecture & Diagrams

**Status:** implemented. **Session:** CC-20260708-q7m3. **Date:** 2026-07-09.

The Experience Studio is the AI-native Component Platform: every `curriculum_type_definition` is a **versioned, prompt-driven AI Component** that authors *design* (not fill out as a form). This document is the visual reference — 10 Mermaid diagrams covering system layers, the runtime, the prompt pipeline, the renderer engine, the lifecycle, capabilities, dependencies, AI generation, cost estimation, and versioning.

> All diagrams are Mermaid. GitHub renders them inline; in VS Code use the Markdown Preview Mermaid extension.

---

## 1. System architecture (layers)

How the browser Studio, the admin HTTP boundary, the component services, the AI/instrumentation layer, and Postgres relate.

```mermaid
flowchart TB
  subgraph Browser["Frontend — /admin/orchestration › Experience Studio"]
    Tab["ExperienceStudioTab"]
    Kit["studioKit (design system)"]
    RE["RendererEngine"]
    SB["Sandbox"]
    LC["LifecycleStepper"]
    VC["VersionCompare"]
    Tab --> Kit & RE & SB & LC & VC
  end
  subgraph API["Admin HTTP boundary (requireAdmin + Zod)"]
    Ctrl["componentController"]
    Routes["componentRoutes"]
    Routes --> Ctrl
  end
  subgraph Svc["components/ services"]
    CS["componentService"]
    RS["rendererService"]
    LS["lifecycleService"]
    AI["componentAiService"]
    AN["componentAnalyticsService"]
    DEP["dependencyService"]
    VD["versionDiffService"]
    CE["costEstimationService"]
    PT["promptTesterService"]
    TH["thumbnailService"]
    CAP["capabilityRegistry"]
    REC["recipeRegistry"]
    BF["componentBackfill"]
  end
  subgraph Data["PostgreSQL"]
    CTD[("curriculum_type_definitions")]
    CV[("component_versions")]
    CA[("component_analytics")]
  end
  OpenAI["OpenAI (gpt-4o-mini)\nvia getInstrumentedOpenAI"]

  Browser -->|axios| Routes
  Ctrl --> CS & RS & LS & AI & AN & DEP & VD & CE & PT & TH & CAP & REC & BF
  CS --> CTD & CV
  RS --> CTD
  LS --> CTD & CA
  AN --> CA & CTD
  DEP & VD --> CTD & CV
  AI & RS & PT --> OpenAI
  CE -.pure, no I/O.-> Ctrl
```

---

## 2. Component runtime (a student session)

What happens when a student opens a component-backed card. The generation prompt produces the experience; the renderer surfaces it; analytics records the run.

```mermaid
sequenceDiagram
  actor S as Student
  participant Feed as Timeline Feed
  participant RS as rendererService
  participant AI as componentAiService
  participant LLM as gpt-4o-mini
  participant AN as componentAnalyticsService
  S->>Feed: open card
  Feed->>RS: renderSurface(slug, "runtime", vars)
  RS->>LLM: resolved renderer prompt
  LLM-->>RS: surface HTML
  RS-->>Feed: {html, cost, runtime_ms}
  Feed->>AI: generate student experience (if interactive)
  AI->>LLM: generation prompt (json mode)
  LLM-->>AI: {title, body_html, questions, reflection...}
  AI-->>Feed: experience
  S->>Feed: submit evidence
  Feed->>AN: recordRuntime(slug, ms, cost, completed)
  AN-->>Feed: metrics updated
```

---

## 3. Prompt pipeline (7 authoring stages)

Each component owns a bundle of 7 prompts. The Studio pipeline editor walks them in order; each is independently testable.

```mermaid
flowchart LR
  D["0 · Design\nshape the experience"] --> G["1 · Generation\nproduce content"]
  G --> R["2 · Renderer\ncontent → card HTML"]
  R --> E["3 · Evaluation\nscore submission"]
  E --> Rf["4 · Reflection\nprompt reflection"]
  Rf --> Gh["5 · GitHub\nanalyze repo evidence"]
  Gh --> I["6 · Improvement\nself-improve"]
  I -.feeds back into.-> D
```

---

## 4. Renderer Engine (8 surfaces)

The Renderer Definition: one prompt per surface. The component defines *how it renders itself* on every surface — nothing is hardcoded.

```mermaid
flowchart TB
  C["AI Component"] --> RD["Renderer Definition\n(renderers JSONB)"]
  RD --> T["thumbnail"] & TL["timeline"] & EX["expanded"] & RT["runtime"]
  RD --> ST["student"] & MO["mobile"] & TA["tablet"] & DE["desktop"]
  subgraph Render["renderSurface(slug, surface, vars)"]
    P["resolve prompt {{vars}}"] --> L["gpt-4o-mini"] --> H["strip fences → HTML"]
  end
  T & TL & EX & RT & ST & MO & TA & DE --> Render
  H --> Frame["sandboxed iframe (srcDoc, no network)"]
```

---

## 5. Runtime lifecycle (10 states)

Authoring states (`draft → generated → validated → published`) are settable with transition validation; runtime states (`student_opened → generated_runtime → completed → evaluated`) are *observed* from analytics. `archived` and `version_locked` are terminal-ish.

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> generated: AI generate
  generated --> validated: review
  validated --> published: publish
  draft --> published: publish
  published --> student_opened: student opens (observed)
  student_opened --> generated_runtime: runtime generated (observed)
  generated_runtime --> completed: completion (observed)
  completed --> evaluated: scored (observed)
  published --> version_locked: lock
  version_locked --> published: unlock
  published --> archived: archive
  archived --> draft: revive
```

---

## 6. Capability composition

A component composes reusable Capability Modules (25 of them). The 5 legacy boolean flags map onto module ids for back-compat, so nothing breaks.

```mermaid
flowchart LR
  subgraph Legacy["legacy flags"]
    F1["evidence_required"] --> M1
    F2["github_required"] --> M2
    F3["ai_evaluation"] --> M3
    F4["portfolio_eligible"] --> M4
    F5["instructor_review"] --> M5
  end
  subgraph Reg["capabilityRegistry (25 modules)"]
    M1["evidence"] & M2["github"] & M3["evaluation"] & M4["portfolio"] & M5["mentor_review"]
    Mx["…transcript · ai_chat · reflection · quiz · rubric · retry · scoring…"]
  end
  Reg --> Comp["component.capabilities: string[]"]
  Comp --> UI["capability chips + contracts + renderer hints"]
```

---

## 7. Dependencies + cycle prevention

Components can require other components. `setDependencies` runs a pure DFS (graph coloring) that rejects any edge which would create a cycle.

```mermaid
flowchart TB
  A["prompt-lab"] --> B["context-primer"]
  A --> C["rubric-base"]
  B --> C
  D["capstone"] --> A
  D --> B
  X["✗ rejected: C → D would close a cycle\nD → A → B → C → D"]:::bad
  classDef bad fill:#FCEDED,stroke:#C20E1E,color:#C20E1E
```

```mermaid
flowchart LR
  New["add edge X → Y"] --> DFS{"createsCycle?\nDFS from Y, can we reach X?"}
  DFS -->|yes| Rej["reject (400)"]
  DFS -->|no| Save["persist dependencies"]
```

---

## 8. AI generation (text → component)

`generateComponent("Create a Prompt Lab that teaches Context Engineering", recipe)` designs a full component draft; the author reviews then creates it (slug de-duped).

```mermaid
sequenceDiagram
  actor A as Author
  participant Tab as Studio
  participant Ctrl as componentController
  participant AI as componentAiService
  participant LLM as gpt-4o-mini
  participant CS as componentService
  A->>Tab: describe + pick recipe
  Tab->>Ctrl: POST /components/generate
  Ctrl->>AI: generateComponent(desc, recipe)
  AI->>LLM: design prompt (json mode) + recipe bias
  LLM-->>AI: draft {metadata, 7 prompts, vars, caps, objectives}
  AI-->>Tab: draft
  A->>Tab: accept
  Tab->>Ctrl: POST /components (create)
  Ctrl->>CS: createComponent(draft)
  CS-->>Tab: new component (slug de-duped, v1)
```

---

## 9. Cost estimation (pure, table-driven)

`costEstimationService` has zero I/O. Every prompt's tokens (~4 chars/token), price (`MODEL_PRICING` per 1M), and runtime (base latency + decode rate) are pure functions — identical across preview, admin, and runtime.

```mermaid
flowchart LR
  Cmp["component prompts + difficulty"] --> Tok["estimateTokens\n~4 chars/token"]
  Tok --> Price["MODEL_PRICING[model]\ninput/output per 1M"]
  Price --> Cost["est_cost_usd"]
  Tok --> RT["base latency + decode rate"] --> Ms["est_runtime_ms"]
  Cost & Ms --> Persist["persisted on every save/backfill"]
  note["Pure: same inputs → same outputs → unit-tested"]:::n
  classDef n fill:#EDF3F5,stroke:#367895,color:#367895
```

---

## 10. Versioning (snapshot · restore · compare)

Every edit snapshots the prior state into `component_versions` (append-only) and bumps `component_version`. Restore applies an old snapshot as a *new* version — never destructive. Compare diffs any two snapshots field-by-field.

```mermaid
flowchart TB
  Edit["author edits component"] --> Snap["snapshot current → component_versions (v)"]
  Snap --> Bump["apply patch + bump to v+1"]
  Bump --> Est["refresh estimates"]
  subgraph History["component_versions (append-only)"]
    V1["v1"] --> V2["v2"] --> V3["v3 = current"]
  end
  Restore["restore v1"] --> NewV["writes v4 = copy of v1\n(non-destructive)"]
  Compare["compareVersions(a,b)"] --> Diff["diffSnapshots → changed / added / removed"]
```

---

## Module map (source of truth)

| Concern | File |
|---|---|
| Registry service (CRUD, versions, export/import) | `backend/src/services/components/componentService.ts` |
| Renderer Engine (8 surfaces) | `backend/src/services/components/rendererService.ts` |
| Lifecycle (10 states) | `backend/src/services/components/lifecycleService.ts` |
| AI (generate · co-design · runtime preview) | `backend/src/services/components/componentAiService.ts` |
| Analytics (seeded deterministic) | `backend/src/services/components/componentAnalyticsService.ts` |
| Dependencies + cycle prevention | `backend/src/services/components/dependencyService.ts` |
| Version diff | `backend/src/services/components/versionDiffService.ts` |
| Cost estimation (pure) | `backend/src/services/components/costEstimationService.ts` |
| Prompt tester (live) | `backend/src/services/components/promptTesterService.ts` |
| Thumbnails (SVG data-URI) | `backend/src/services/components/thumbnailService.ts` |
| Capability / Recipe registries | `backend/src/services/components/{capabilityRegistry,recipeRegistry}.ts` |
| Backfill | `backend/src/services/components/componentBackfill.ts` |
| HTTP boundary | `backend/src/controllers/componentController.ts` · `backend/src/routes/admin/componentRoutes.ts` |
| Studio UI | `frontend/src/pages/admin/orchestration/ExperienceStudioTab.tsx` + `studio/*` |
| Design system | `frontend/src/pages/admin/orchestration/studio/studioKit.tsx` |
