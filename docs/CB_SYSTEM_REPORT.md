# CB System - Architecture & Management Report

*Colaberry · Internal Systems · prepared for Ali Muwwakkil*

CB System is the **autonomous agent that lives inside Basecamp**. It reads
@-mentions, drafts deliverables, scores and tracks to-dos, watches itself, and
reports to you. It is the **engine** that the advisor app's `/my-day` product is
built on - it is what connects the two projects.

This report explains every moving part, how the pieces connect, what data each
produces, and how you manage it from the new **CB System Command** dashboard
(`enterprise.colaberry.ai/admin/cb-system`).

---

## 1. The big picture - engine vs. product

```mermaid
flowchart LR
  BC[("Basecamp\naccount 3945211\nprojects · to-dos · @CB mentions")]
  subgraph ENG["CB System - the ENGINE (managed in enterprise)"]
    D["Inbound dispatcher"]
    H["GPT-4o handler"]
    R["AI task runners"]
    S["BC to-do sync + scorer"]
    W["Watchdog + workers"]
  end
  MD["advisor /my-day\n(the PRODUCT, multi-user)"]
  DASH["enterprise /admin/cb-system\n(CB System Command - MANAGE the engine)"]

  BC <-->|read mentions / to-dos\nwrite replies| ENG
  ENG -->|scored, mirrored to-dos| MD
  ENG -->|health · activity · cost| DASH

  classDef eng fill:#faf5ff,stroke:#6d28d9,color:#1a202c;
  classDef prod fill:#e0f2fe,stroke:#0369a1,color:#1a202c;
  class ENG eng; class MD,DASH prod;
```

**Key point:** `/my-day` (advisor) is the product; CB System (enterprise) is the
shared engine. The enterprise "Run My Day" page was a duplicate of `/my-day` and
has been **retired** - replaced by **CB System Command**, which *manages the
engine* rather than re-implementing the product.

---

## 2. The moving parts, by layer

```mermaid
flowchart TB
  subgraph L1["1 · INPUT - senses Basecamp"]
    A1["Inbound dispatcher\nevery 3 min · catches @CB mentions"]
    A2["Context walker\n4-layer graph: todolist→todo→comments→docs"]
  end
  subgraph L2["2 · BRAIN - decides & acts"]
    B1["CB handler (GPT-4o)\ntools: reply · email Ali · queue · complete"]
    B2["Guardrails\ndrafts only · circuit breaker · audit log"]
  end
  subgraph L3["3 · PROACTIVE WORK"]
    C1["AI task runners\nnightly · draft first-pass deliverables"]
    C2["Autonomous worker\n15 min · #auto-* recipes"]
  end
  subgraph L4["4 · MIRROR & SCORING - data engine"]
    E1["BC sync\nevery 2 min · incremental"]
    E2["Priority engine\nscore 0-100 + category"]
    E3["Automation rules\nflag · tag · count"]
  end
  subgraph L5["5 · COMMS - reports out"]
    F1["Digests · reminders · backlog enforcer · reports"]
  end
  subgraph L6["6 · HEALTH & QUALITY - watches itself"]
    G1["Watchdog (daily) · coverage check · self-improve · dup cleanup"]
  end
  L1 --> L2 --> L3
  L1 --> L4 --> L5
  L4 --> L6
```

| Layer | Component | What it does | Cadence |
|---|---|---|---|
| Input | **Inbound dispatcher** | Catches @CB mentions across all projects, dedups, routes | every 3 min |
| Input | **Context walker** | Pulls full context (todolist, todo, comments, linked docs/PDFs) | on demand |
| Brain | **CB handler (GPT-4o)** | Interprets the request, calls tools (reply / email / queue / complete) | per mention |
| Brain | **Guardrails** | Drafts-only, duplicate-reply circuit breaker, JSONL audit log | always |
| Work | **AI task runners** | Auto-draft first-pass deliverables for upcoming AI-tier to-dos | nightly |
| Work | **Autonomous worker** | Runs `#auto-grep / #auto-sql / #auto-comment` recipe to-dos | every 15 min |
| Data | **BC sync** | Mirrors Basecamp to-dos into Postgres (incremental, ~2 s) | every 2 min |
| Data | **Priority engine** | Scores every to-do 0-100 + category (human-required / waiting / unscored) | every 2 min |
| Data | **Automation rules** | Deterministic actions: flag-for-archive, tag-category, count metrics | every 2 min |
| Comms | **Digests / reminders / backlog enforcer / reports** | Email summaries + nudges | scheduled |
| Health | **Watchdog / coverage check / self-improve / dup cleanup** | Detects anomalies, fixes weak answers, trims duplicates | daily + on demand |

---

## 3. What happens when you @-mention CB

```mermaid
sequenceDiagram
  participant Ali
  participant BC as Basecamp
  participant DSP as Dispatcher (3-min)
  participant CTX as Context walker
  participant LLM as GPT-4o handler
  participant LOG as Audit log

  Ali->>BC: comment "@CB System draft the reply…"
  DSP->>BC: poll new comments
  BC-->>DSP: new @CB mention
  DSP->>DSP: dedup + allowed-requester + not-an-agent-card check
  DSP->>CTX: gather thread context
  CTX->>BC: todolist + todo + comments + linked docs
  BC-->>CTX: full context
  CTX-->>LLM: context bundle
  LLM->>LLM: decide + draft (circuit breaker: max 2 replies/comment)
  LLM->>BC: post reply (draft) / queue follow-up
  LLM->>LOG: record invocation (who · tools · outcome)
```

The **circuit breaker** caps replies per comment so a bug can never spam a
thread again. The **audit log** (`cb-handler-log.jsonl`) is what powers the
dashboard's Activity feed.

---

## 4. The data CB System produces (the dashboard's fuel)

```mermaid
flowchart LR
  subgraph PG["Postgres (ops_* tables)"]
    T1["ops_bc_todos\nmirror + score + category"]
    T2["ops_ai_assessments\nscore history + cost"]
    T3["ops_metrics_daily\napprovals · automations · cost"]
  end
  subgraph FILES["Host files (mounted read-only)"]
    F1["cb-handler-log.jsonl\nevery @CB invocation"]
    F2["inbound-state.json\nprocessed + circuit-breaker"]
    F3["cb-inbound.log\ntick health · errors"]
  end
  PG --> API["/api/admin/cb-system/*"]
  FILES --> API
  API --> DASH["CB System Command dashboard"]
```

| Source | Holds | Feeds |
|---|---|---|
| `ops_bc_todos` | every tracked to-do + urgency score + category | per-project pane |
| `ops_ai_assessments` | score history, model, token cost | throughput/cost pane |
| `ops_metrics_daily` | approvals, automations fired, agent cost | throughput pane |
| `cb-handler-log.jsonl` | every @CB invocation: requester, tools, outcome | activity + exceptions panes |
| `inbound-state.json` | processed comments + circuit-breaker trips | health + exceptions panes |
| `cb-inbound.log` | dispatcher tick health, errors | health pane |

---

## 5. How you manage it - the CB System Command dashboard

`enterprise.colaberry.ai/admin/cb-system` - six panes, fed entirely by the data
above (no new instrumentation):

1. **Health** - one GREEN / YELLOW / RED light: is it running, catching mentions, erroring, or tripping its safety breaker.
2. **Throughput & cost** - chart of requests handled and agent cost over time.
3. **Per-project** - which projects it's working, open to-dos, mentions answered.
4. **Activity feed** - live list of what CB just did (who asked, what, outcome).
5. **Exceptions & quality** - errors and quality flags; the "needs a human look" list.
6. **Subsystems** - each component's status + a "Run sync now" control.

The mirror that the priority engine reads now tracks **only real work** (~1.6k
to-dos) after excluding the high-volume **Center of Excellence** (student) and
**RMG Mortgage** (bulk) projects.

---

## 6. Reliability work done (June 2026)

This is the engine as hardened during the June 15-17 incident sweep:

```mermaid
flowchart TB
  P0["Symptom: CB posting duplicate comments;\nops mirror not updating"]
  P1["Dispatcher loop fixed\n(incremental state save)"]
  P2["Duplicate-reply circuit breaker\n+ real-time alarm"]
  P3["Activity-scoped scan\n(64-project walk -> recordings feed, ~38x)"]
  P4["AI-runner idempotency\n(stop duplicate deliverables) + 249 dupes cleaned"]
  P5["Basecamp token auto-refresh from CCPP\n(no more 401 on rotation)"]
  P6["Rate-limit handling\n(pacing + backoff + single-flight)"]
  P7["Incremental + filtered sync\n~20 min -> ~3 s; 30k -> 1.6k to-dos"]
  P8["Automated-agent-card guard\n(stop runaway agent feedback loop)"]
  P0 --> P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7 --> P8
```

| Fix | Before | After |
|---|---|---|
| Dispatcher duplicate-reply loop | ~25 dupes/comment, ran for hours | incremental save + circuit breaker (max 2) |
| Dispatcher scan speed | re-walks 64 projects each tick | account-wide recordings feed (~38× faster) |
| AI runner | re-posts deliverables on every run | idempotent (skips already-drafted); 249 dupes cleaned |
| Basecamp token | 401 on 2-week rotation, manual fix | auto-refreshes from CCPP in-app |
| OpsBcSync rate limits | 227-348 `429` errors/run | pacing + backoff + single-flight, 0 errors |
| OpsBcSync speed/volume | ~20 min, 30k to-dos (86% student data) | ~3 s incremental, 1.6k real to-dos |
| Agent-card feedback loop | 19 → 53 comments, self-feeding | dispatcher skips automated-agent cards |

---

*Generated by Claude Code for the CB System Command initiative. Live dashboard:
`enterprise.colaberry.ai/admin/cb-system`. Visual one-pager: `docs/CB_SYSTEM_OVERVIEW.html`.*
