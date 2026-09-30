# Colaberry AI Trust & Governance Program

### Getting every Colaberry AI process to a passing TBI score — and keeping it there

**Standard of record:** *Trust Before Intelligence* (TBI) by Ram Katamaraja — INPACT™, GOALS™, and the 7-Layer Architecture of Trust.
**Status:** Draft v1.0 — for Ali's review and sign-off
**Owner (program):** _TBD — recommend Ali as Executive Sponsor + a named AI Governance Lead_
**Last updated:** 2026-06-20

> **Mandate.** TBI is now law for building Colaberry applications whenever AI is involved. This document is the single governing program: one place that says what "compliant" means, what we must monitor, who owns it, and how we get every AI process to a passing score over time. It replaces the scattered one-off audit/phase reports with one structured operating model.

---

## 0. TL;DR (read this first)

1. **The bar.** TBI scores every AI system two ways: **INPACT™** (is it trustworthy enough to ship — 0–100%) and **GOALS™** (is it operationally healthy — 0–25). TBI's production gate is **INPACT ≥ 86%** and **GOALS ≥ 21/25**. We adopt that bar, **risk-tiered** so the full healthcare-grade bar applies to our highest-risk systems (anything public-, student-, or money-facing, or that takes action on its own) and a lighter bar applies to internal/read-only tooling.
2. **The reality.** We run **100+ AI processes** today (Maya chatbot, voice agent, curriculum/content/portfolio generation for paying students, Cory COO agent, lead scoring, inbox + PMO email automation, OpenClaw social posting, and a 135-agent registry). Most have **partial logging and no formal observability, audit trail, drift detection, or HITL policy.** None has a current evidenced INPACT/GOALS score. **We are not compliant today.**
3. **The structure.** One **AI Governance Council** owns the program, backed by one **AI System Registry** (every AI process, its owner, tier, and live score) and one **AI Trust Dashboard** (everything TBI says you must monitor, in one pane). A fixed **daily / weekly / monthly / quarterly cadence** keeps it from drifting.
4. **The "I need to see it" guarantee.** §5 lists every metric TBI mandates and the exact dashboard tile where you'll see it — latency, cost, accuracy, hallucination rate, HITL escalation, 100% audit coverage, drift, and the alert queue.
5. **The plan.** Audit-and-fix in **5 phases over ~2 quarters** (§6), front-loading the two compliance blockers TBI flags first — **Permitted** (authorization + HITL) and **Transparent** (audit + explainability) — on our Tier-1 systems, then observability, then performance/accuracy, then optimization. Each phase has a score-based exit gate.
6. **Decisions you need to make** are collected in §8.

---

## 1. Scope & what "compliant" means

**In scope:** every Colaberry process that "adds AI" — LLM calls, agents, embeddings/RAG, classification, generation, voice, and any automation whose behavior is driven by a model. Primary surface today is the **accel-repo** (Accelerator product + internal ops). Any future app inherits this program by default.

**"Compliant" = three things, together:**

| | Question it answers | Instrument |
|---|---|---|
| **Trustworthy** | Is the system good enough to be trusted in production? | **INPACT™** score (capability/trust) |
| **Operable** | Can we run it safely and sustainably? | **GOALS™** health (operations) |
| **Auditable** | Can we prove both, on demand? | **Registry + Dashboard + Audit trail** |

A system is **compliant** when it meets its tier's INPACT and GOALS bar **with evidence**, is registered with a named owner, and reports live to the dashboard. "We think it's fine" is not compliance — TBI requires **evidence-based scoring** ("'We think we're a 4' is not acceptable; 'our P95 is 2.3s per last month's dashboard' is").

---

## 2. The standard we hold (Colaberry-adapted from TBI)

### 2.1 INPACT™ — the trust score (0–100%, per system)

Six dimensions, each scored **1–6**, summed (6–36) and converted to a percentage. This is *what users need to trust an agent.*

| | Dimension | What it means for us | What "5/6 production" looks like |
|---|---|---|---|
| **I** | **Instant** | Fast, fresh responses | p95 < 2s; data freshness seconds–minutes; cache hit > 60% |
| **N** | **Natural** | Understands the user's intent | ≥ 75–90% intent/answer accuracy; clarifies when unsure |
| **P** | **Permitted** | Right person, right data, right action | ABAC/authorization, HITL on high-risk, full audit trail. **Compliance blocker.** |
| **A** | **Adaptive** | Learns from feedback | Telemetry + feedback loop + drift triggers; RCA < 24h |
| **C** | **Contextual** | Complete answers across our data | Connected sources, entity resolution, >85% coverage |
| **T** | **Transparent** | We can explain every decision | 100% audit coverage, reasoning/citations, trace IDs. **Compliance blocker.** |

**Scoring scale (per dimension):** 6 Excellent · 5 Strong (production-ready) · 4 Functional (deploy *with monitoring*) · 3 Moderate (pilot only) · 2 Significant gap · 1 Critical gap. The **3→4 line is the pilot-vs-production boundary.**

**Trust bands:**

| Score | % | Band | Meaning |
|---|---|---|---|
| 31–36 | 86–100% | **High Trust** | Production-grade |
| 24–30 | 67–83% | Good Trust | Enterprise-ready, most use cases |
| 18–23 | 50–67% | Moderate | Internal tools OK, not customer-facing |
| 12–17 | 33–50% | Low | Not for production |
| 6–11 | 17–33% | Very Low | Major transformation required |

> TBI's data: orgs below **80%** "consistently experience agent failures in production"; **86%+** deploy successfully. **86% is the line.**

### 2.2 GOALS™ — the operational health score (0–25, per system/area)

Five pillars, each scored **1–5** (total /25). This is *what you maintain forever* — "building is a 90-day project; operating is forever."

| | Pillar | Covers | Validates |
|---|---|---|---|
| **G** | **Governance** | ABAC, HITL, audit trails, change/rollback approval, threat modeling, compliance certs | Permitted |
| **O** | **Observability** | Tracing, metrics, cost tracking, alerting, drift detection, explainability | Transparent |
| **A** | **Availability** | Latency < 2s, freshness < 30s, throughput, cache, **uptime 99.9%** | Instant |
| **L** | **Lexicon** | Entity resolution, terminology mapping, query interpretation accuracy | Natural + Contextual |
| **S** | **Solid** | Data accuracy/completeness/consistency, schema validation. **Foundation of all others.** | Adaptive |

**Health bands:** 21–25 **Production-grade** ✅ · 16–20 Adoption-ready (limited prod) · 11–15 Emerging (pilot only) · 5–10 Early-stage (not ready). **Production bar = 21/25, with Governance = 5/5 and O/A/L/S each ≥ 4/5.** Lowest dimension is the strongest failure predictor — **Lexicon ≤ 2 is the #1 cause of AI failure** in TBI's research.

**Fix order when resources are limited (TBI's rule):** **O → S → G → L → A.** You can't improve what you can't measure, so Observability first; then Solid (bad data breaks everything).

### 2.3 The 7-Layer Architecture (where our controls live)

Every system is built on / audited against seven layers. Our current stack mapping:

| Layer | Name | Our reality today |
|---|---|---|
| 1 | Multi-Modal Storage | Postgres + **pgvector** |
| 2 | Real-Time Data Fabric | Mostly batch/event; little CDC |
| 3 | Universal Semantic Layer | Ad-hoc; no shared business glossary |
| 4 | Intelligence Orchestration & Retrieval | OpenAI GPT-4o/4o-mini, Intelligence OS embeddings, RAG via vectorMemory |
| 5 | **Agent-Aware Governance** | **Gap** — no ABAC for agents, partial HITL, no central audit |
| 6 | **Observability & Feedback** | **Gap** — scattered logs (ContentGenerationLog, llmCallWrapper), no tracing/drift/cost dashboard |
| 7 | Self-Service Data Products | Portal + MCP servers + agent registry |

**Layers 5 and 6 are our biggest gaps — and they are exactly the two that carry Permitted/Transparent and the monitoring mandate.** They are the spine of this plan.

### 2.4 Risk tiering — the bar each system must clear

TBI ties its strictest bar to patient-facing/clinical systems. We aren't healthcare, so we translate "patient-facing/clinical" → **public-, student-, or money-facing, or autonomously acting.** Three tiers:

| Tier | Definition | Examples (from our inventory) | **Passing bar** |
|---|---|---|---|
| **Tier 1 — Critical** | Public/student/prospect-facing, **or** takes an external action on its own (publishes, emails out, calls, charges, delivers paid content) | Maya chatbot, Synthflow voice agent, OpenClaw social posting, outbound Mandrill automation, curriculum/content/portfolio/artifact generation for enrolled students, session chat mentor | **INPACT ≥ 86%** (P & T each ≥ 5/6) · **GOALS ≥ 21/25** (G = 5/5) |
| **Tier 2 — High** | Internal decisions that materially affect people/ops/spend; human is in or near the loop | Cory COO agent, lead scoring, inbox classification, opportunity scoring, campaign self-healing, executive briefing, PMO daily email, content optimization | **INPACT ≥ 67%** (P & T each ≥ 4/6) · **GOALS ≥ 16/25** (G ≥ 4/5) |
| **Tier 3 — Standard** | Read-only, internal analytics, or dev tooling; no autonomous external effect | MCP servers, Intelligence OS embeddings/forecasting, Anthropic content watcher, prompt lab | **INPACT ≥ 50%** (T ≥ 4/6) · **GOALS ≥ 11/25** |

**Hard floor for every tier (non-negotiable):** a **named owner**, **registered**, **100% audit/logging coverage**, and a documented **HITL autonomy level** (§3.3). A system with no owner or no logs is non-compliant regardless of score.

> ⚠️ **Privacy override:** any system touching student records, personal contact data, or behavioral tracking is treated as **at least Tier 2** for the Permitted/Transparent dimensions even if otherwise read-only (e.g., behavioral tracking, lead enrichment).

### 2.5 What we must monitor (the mandate, summarized)

TBI's non-optional production metrics. Full target/threshold table and dashboard placement is in **§5**.

- **Availability:** uptime 99.5%+, p95 latency, data freshness, cache hit rate
- **Accuracy/quality:** factual accuracy > 95%, hallucination < 2%, weekly validation testing
- **Permitted:** HITL escalation rate < 10–15%, human-review SLA, ABAC eval latency
- **Transparent:** **100% audit coverage (hard gate)**, trace completeness, 7-yr retention where applicable
- **Cost:** LLM spend per query / per day, by model, with cache status
- **Drift:** statistical drift detection (KS/PSI), MTTD < 24h, "zero incidents from undetected drift"
- **Incidents:** alert queue (P0–P3), MTTD < 5 min, MTTR, post-mortems

---

## 3. Governance structure (the "not all over the place" part)

### 3.1 Bodies & roles

| Role | Who | Responsibility |
|---|---|---|
| **Executive Sponsor** | Ali | Owns the mandate; chairs monthly review; final risk-acceptance authority |
| **AI Governance Lead** | _TBD (assign)_ | Runs the program day-to-day; owns the Registry, Dashboard, and this document; convenes the cadence |
| **System Owners** | One named engineer per AI system | Accountable for their system's score, monitoring, and remediation |
| **Security/Compliance reviewer** | _TBD_ | Reviews Permitted/Transparent evidence; owns compliance calendar (certs, audits) |
| **AI Governance Council** | Sponsor + Lead + Owners + Security | Standing forum; approves go-live, tier changes, and risk acceptances |

> Start lean: Ali + one Governance Lead + Security reviewer is enough to run the whole program. Owners are existing engineers who already build each system.

### 3.2 The three artifacts everything hangs on

1. **AI System Registry** (`ai-systems-registry.csv`) — every AI process, its tier, owner, data sensitivity, current vs. target INPACT/GOALS, and remediation phase. The single source of truth. Nothing ships AI without a registry row.
2. **AI Trust Dashboard** (§5) — live operational view; the answer to "if TBI says monitor it, I want to see it."
3. **This program document** — the standard, cadence, and roadmap.

### 3.3 Decision rights — the HITL Autonomy Spectrum

Every AI action is assigned one level. This is a **mandatory field in the registry.**

| Level | Pattern | Use for | Example in our stack |
|---|---|---|---|
| 1 | **Full autonomy** | Routine, low-risk, reversible | Lead scoring, content caching |
| 2 | **Conditional autonomy** | Auto unless a trigger fires | Inbox routing (escalate on low confidence) |
| 3 | **Human-in-the-loop** (approve before) | Irreversible / external / high-stakes | **OpenClaw social posts, outbound emails, voice call initiation** |
| 4 | **Human-on-the-loop** (monitor, can override) | Recommendations to humans | Cory plans, PMO action queue |
| 5 | **Full manual** (informs only) | Highest stakes | Anything touching contracts, pricing, legal |

**Rule:** any Tier-1 system that takes an external action must be **Level 3 or lower-autonomy** until it scores ≥ 86% INPACT with Permitted ≥ 5/6. (OpenClaw already has a human-review gate — good; formalize it.)

### 3.4 Change & release gates

- **No AI feature goes to production** without: a registry row, a tier, an owner, a HITL level, logging to the dashboard, and a baseline INPACT/GOALS score.
- **Model/prompt changes** follow TBI's review tiers: PATCH = 1 reviewer; MINOR = 2; MAJOR = 2 + domain sign-off. Prompt changes run against a **regression suite** (golden + edge + adversarial queries — extend the existing `promptLabService`).
- **Tested rollback** required: revert a bad model/prompt in **< 15 min** (Tier 1) — feature flags already exist (`ENABLE_*`, safe mode); wire them as kill-switches.

### 3.5 Operating cadence (TBI's rhythm)

| Cadence | What happens | Forum |
|---|---|---|
| **Daily** | Dashboard glance: alert queue triage, P0/P1 incidents, pipelines green | Owners / standup |
| **Weekly** | Governance-health review; 100-query accuracy sampling; feedback patterns; confidence calibration | Governance Lead + Owners |
| **Monthly** | Trend review across all systems; **policy updates**; tier/score review; stakeholder report | Council (Ali chairs) |
| **Quarterly** | Full re-assessment (re-score INPACT + GOALS for every system); compliance audit; prune stale alerts | Council + Security |

"Governance isn't a one-time implementation but a continuous practice." The quarterly re-score is how we prove we're *staying* compliant, not just reaching it once.

---

## 4. The audit (assessment process)

### 4.1 How we score a system (repeatable SOP)

1. **Register** it (row in the registry, tier, owner, HITL level, data sensitivity).
2. **Convene** the right people — engineering + security + the business owner (TBI requires cross-functional scoring; engineers over-rate capability, security under-rates governance).
3. **Score each INPACT dimension 1–6 and each GOALS pillar 1–5, citing evidence** (a dashboard number, a log, a policy doc). When torn between two scores, **take the lower.**
4. **Compute** INPACT % and GOALS /25; record band.
5. **Gap analysis:** flag any dimension averaging < 3, any single 1, and dependency violations (weak I/C drags N/P/A/T). Map weakest dimensions → layers → remediation phase.
6. **Assign** target score (the tier bar) and the phase to close the gap.
7. **Re-score quarterly.**

### 4.2 Baseline read (provisional — to be confirmed with evidence)

This is a **desk estimate** from the inventory to prioritize work, **not** an official score. Real scores come from the §4.1 process with evidence.

| System | Tier | Provisional read | Biggest gaps |
|---|---|---|---|
| Maya chatbot (public) | 1 | Likely **Moderate/Low** | T (no full audit/citations), P (authz/consent), drift |
| Synthflow voice agent | 1 | Likely **Low** | P (consent/recording), T (transcript audit), HITL on initiation |
| OpenClaw social posting | 1 | Moderate (has review gate) | T (audit trail), formalize HITL, drift on brand |
| Outbound email automation (Mandrill+LLM) | 1 | Likely **Low/Moderate** | P (acts on Ali's behalf), T (audit), HITL level |
| Curriculum/content/portfolio/artifact gen | 1 | Moderate | T (citations/lineage to students), S (data quality), accuracy validation |
| Session chat mentor | 1 | Moderate | T, accuracy sampling |
| Cory COO agent | 2 | Moderate | T (decision audit), A (feedback loop) |
| Lead scoring / opportunity scoring | 2 | Moderate | P (PII), T (explainability) |
| Inbox classification | 2 | Moderate | T (audit of routing decisions) |
| PMO daily email / exec briefing | 2 | Good-ish | A/O (drift, validation) |
| Campaign self-healing | 2 | Moderate | P (autonomy bounds), T |
| MCP servers / Intelligence OS / prompt lab | 3 | Adoption-ready | O (logging), routine audit |

**Common cross-cutting gaps (true for nearly everything):** no unified **trace IDs**, no **LLM cost/quality dashboard**, no **central audit log**, no **drift detection**, no **documented HITL levels**, no **accuracy validation harness**. These are platform fixes (§6, Phases 1–2) that lift *every* system at once.

### 4.3 Existing material to fold in (don't redo)

`docs/AI_AGENT_AUDIT.md`, `docs/AI_CAMPAIGN_SYSTEM_AUDIT.md`, `docs/INBOX_COS_AUDIT_REPORT.md`, and the various `PHASE_*_GOVERNANCE_*_VALIDATION_REPORT.md` are prior inputs. Phase 0 includes harvesting them into the registry and **retiring them as standalone docs** so this program is the one source.

---

## 5. Monitoring & visibility — "if TBI says monitor it, I see it"

**Design decision:** don't buy a heavyweight stack first. **Make every LLM call route through the existing `llmCallWrapper`** (it already captures tokens, duration, cache hits) and emit a **trace ID + cost + outcome** to one store; surface it by extending the existing portal **SystemStateEngine / telemetry** into an **AI Trust Dashboard**. Add a dedicated **tracing tool** (LangSmith — which TBI references — or self-hosted Langfuse) for span-level agent traces. This reuses what we have and closes Layer 6.

### 5.1 The AI Trust Dashboard — required tiles (maps to TBI's mandated metrics)

| Tile | Metric | Target / alert | Cadence | TBI source |
|---|---|---|---|---|
| **Scorecard** | INPACT % + GOALS /25 per system, with trend (RAG) | Tier bar (§2.4) | Quarterly score, live trend | INPACT/GOALS |
| **Latency** | p95 response time | < 2s; P3 >5s, P2 >7s, P1 >10s | Real-time | Availability / Instant |
| **Errors** | error rate | < 1%; page > 5% | Real-time | Observability |
| **Cost** | LLM spend/day + per query, by model, cache status | alert > daily budget (e.g. >120% baseline) | Real-time + weekly review | Observability |
| **Cache** | hit rate | > 60% | Real-time | Availability |
| **Accuracy** | factual accuracy, hallucination rate | > 95% / < 2% | **Weekly 100-query sampling** | Output validation |
| **HITL** | escalation rate + human-review SLA | < 10–15%; review < 30s–2min | Daily | Permitted |
| **Audit** | audit coverage | **100% (hard gate)**; any gap = P1 | Real-time | Transparent |
| **Trace** | trace completeness | > 99% | Real-time | Observability |
| **Drift** | KS/PSI drift status per model | detect > 90%, MTTD < 24h | Daily/weekly | Adaptive |
| **Alert queue** | open P0–P3 alerts | P0 < 5min, P1 < 30min response | Real-time | Incident ops |
| **Incident log** | incidents + RCA | post-mortem < 48h (P0/P1) | Per incident | Incident ops |
| **Compliance calendar** | upcoming audits, cert renewals, BAAs | no lapse | Monthly | Governance |
| **Risk/blocker log** | open risks by severity + owner | — | Weekly | Risk mgmt |

### 5.2 The tracker workbook (TBI's 7 tabs → our living system)

TBI ships a 7-tab tracker; we operationalize it as the registry + dashboard:

1. Weekly progress · 2. **INPACT progress** · 3. **GOALS health** · 4. **7-Layer build status** · 5. **Risk/blocker log** · 6. Stakeholder comms · 7. Budget. Tabs 2–5 become dashboard tiles; the registry CSV is the durable backing store.

### 5.3 Alert priorities (wire these to PagerDuty/Slack)

**P0** (all agents down / data breach) → respond < 5 min · **P1** (major INPACT degradation, e.g. accuracy < 80%, audit gap) → < 30 min · **P2** (single system, e.g. CDC lag) → < 4 h · **P3** (no user impact) → next day. On-call only needs staffing for Tier-1 systems initially.

---

## 6. The remediation roadmap (audit-and-fix over time)

Phased, with **score-based exit gates**. Front-loads TBI's "compliance blockers first" (Permitted, Transparent) and "Observability first" (O→S→G→L→A) rules. Indicative timing assumes part-time effort across existing owners; compress with more hands.

### Phase 0 — Stand up governance (≈ weeks 1–3)
**Goal: structure exists; nothing is unaccounted-for.**
- Appoint Governance Lead + Security reviewer; ratify this document and the tier bars.
- Build the **AI System Registry**; create a row for every system in §4.2; assign owner, tier, HITL level, data sensitivity.
- Harvest existing audit/phase docs into the registry; retire them.
- Stand up a **skeleton dashboard** (even a read-only page over existing logs) so every system reports *something*.
- **Exit:** 100% of AI systems registered with owner + tier + HITL level; this program signed off.

### Phase 1 — Close the compliance blockers on Tier 1 (≈ weeks 3–8)
**Goal: Permitted + Transparent ≥ baseline on every Tier-1 system. This is the "must be in compliance" core.**
- **Audit trail (T):** central audit log; **100% coverage** of Tier-1 LLM decisions (who/what/why, model, prompt version, output). Route all calls through `llmCallWrapper`.
- **Authorization (P):** apply ABAC/consent checks where AI touches student/personal data; document the "Five W's" per Tier-1 system.
- **HITL gates (P):** formalize Level-3 approval on OpenClaw posts, outbound email, voice initiation; add kill-switches via existing feature flags.
- **Citations/lineage (T):** student-facing generation cites sources / shows reasoning.
- **Exit:** every Tier-1 system Permitted ≥ 4/6 and Transparent ≥ 4/6, audit coverage = 100%, HITL level enforced.

### Phase 2 — Observability + data quality (≈ weeks 6–12, overlaps Phase 1)
**Goal: we can measure everything (O), on a solid data base (S).**
- Add **tracing** (trace IDs end-to-end; LangSmith/Langfuse for spans).
- Light up the **AI Trust Dashboard** tiles in §5.1 with real data.
- Add **cost tracking** per query/model and daily-budget alerts.
- Add **drift detection** (KS/PSI) on the highest-volume models.
- Add **weekly accuracy sampling** harness (extend `promptLabService` into a 100-query golden+edge+adversarial suite).
- **Data quality gates (S):** validation on inputs feeding generation/RAG.
- **Exit:** every Tier-1 system Observability ≥ 4/5 and Solid ≥ 4/5; dashboard live; drift + cost + accuracy visible.

### Phase 3 — Adoption (Instant / Natural / Contextual) (≈ weeks 10–16)
**Goal: the things users feel.**
- Latency/caching to p95 < 2s on Tier-1; semantic cache.
- Accuracy: business glossary / semantic layer for our domain; clarification-on-low-confidence loop.
- Contextual: connect the data sources each agent needs; entity resolution where it matters.
- **Exit:** Tier-1 systems reach **INPACT ≥ 86%** (all dims ≥ 4, P & T ≥ 5).

### Phase 4 — Adaptive + operate forever (ongoing from week 14)
**Goal: it improves itself and the cadence runs on rails.**
- Close feedback loops (corrections → retraining triggers); A/B where useful.
- Lock in the daily/weekly/monthly/quarterly cadence; first **quarterly full re-score**.
- Pull Tier-2/Tier-3 systems up to their bars on the same playbook.
- **Exit / steady state:** all Tier-1 at/above bar with GOALS ≥ 21/25; Tier-2 ≥ 16/25; quarterly re-score is routine; zero unregistered AI in production.

### Roadmap at a glance

| Phase | Theme | TBI dimensions | Exit gate |
|---|---|---|---|
| 0 | Govern | Structure | All systems registered + owned + tiered |
| 1 | Compliance blockers | **P, T** | Tier-1 P,T ≥ 4/6; audit 100% |
| 2 | Observability + data | **O, S** | Tier-1 O,S ≥ 4/5; dashboard live |
| 3 | Adoption | **I, N, C** | Tier-1 INPACT ≥ 86% |
| 4 | Adaptive + operate | **A** + cadence | GOALS ≥ 21/25; quarterly re-score routine |

---

## 7. Compliance & regulatory mapping

TBI is built on recognized standards — useful when an auditor or partner (incl. the Anthropic Partner Network track) asks how we govern AI:

- **NIST AI RMF (Govern/Map/Measure/Manage)** — our Council + Registry + Dashboard + cadence is a direct implementation.
- **EU AI Act Art. 13/14** — transparency + human oversight → our Transparent dimension + HITL spectrum.
- **ISO 27001 / SOC 2** — organizational controls, audit trails, change management → Governance pillar.
- **Data protection** — student records and personal/behavioral data require consent, minimization ("minimum necessary" / minimum-necessary access), and retention limits. Map each Tier-1/2 system's data handling in the registry.
- **Sector note:** voice calls (Synthflow) and outbound email carry consent/recording/CAN-SPAM obligations — flag in the registry as Permitted requirements.
- **Existing Colaberry compliance** (TWC/COA work) is separate but should reference this program for the "how we govern AI" answer.

The **compliance calendar** tile (§5.1) tracks cert renewals, BAAs, and audit dates so nothing lapses.

---

## 8. Decisions for Ali (to finalize this plan)

1. **The bar.** Adopt the **risk-tiered** bar in §2.4 (recommended), or hold full healthcare-grade 86% / 21-25 on *every* AI system (stricter, slower)?
2. **Governance Lead.** Who owns this day-to-day? (Recommend naming one person + a Security reviewer this week.)
3. **Monitoring approach.** Extend the existing portal SystemStateEngine + add LangSmith/Langfuse for tracing (recommended, reuses our stack), or stand up a separate observability stack (Datadog/Grafana)?
4. **Pace.** ~2-quarter timeline as written, or compress Phase 1 (compliance blockers) with dedicated effort?
5. **Tier-1 list.** Confirm the §2.4 Tier-1 set — especially whether **voice** and **outbound email automation** stay Level-3 (human-approve) until scored.

---

## Appendix A — INPACT & GOALS quick-reference

**INPACT production gate:** ≥ 31/36 (86%), Permitted & Transparent ≥ 5/6.
**GOALS production gate:** ≥ 21/25, Governance = 5/5, others ≥ 4/5.
**Per-dimension floor for "production" (4/6 INPACT, 4/5 GOALS):** deploy *with monitoring*. Below that = pilot or remediate.

## Appendix B — Mandatory monitoring thresholds (cheat sheet)

uptime 99.5%+ · p95 < 2s (alert >5/7/10s) · accuracy > 95% (P1 <80%) · hallucination < 2% · HITL < 10–15% · audit **100%** · trace > 99% · cache > 60% · drift MTTD < 24h · cost alert > daily budget · MTTD < 5 min · post-mortem < 48h (P0/P1) · rollback < 15 min (Tier 1).

## Appendix C — Source

Standard of record: `github.com/colaberry/trust-before-intelligence-book` — Ch. 2 (INPACT), Ch. 7 (GOALS), Ch. 4–6 (7-Layer), Ch. 9 (assessment), Ch. 12 (operations), Appendices DA-2/DA-5/DA-6/DA-7, and the 90-Day Tracker. Colaberry AI inventory: `accel-repo` (backend services, agent catalog, intelligence engine), 2026-06-20.
