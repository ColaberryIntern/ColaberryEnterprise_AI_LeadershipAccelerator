# Trust Before Intelligence — Integration

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0 (closes D-04)

**Canonical source:** `https://github.com/colaberry/trust-before-intelligence-book`
*Trust Before Intelligence* by Ram Katamaraja. Read at `main`, from `manuscript/` (the
current manuscript — `archive/` holds superseded drafts and must not be used).

Chapters read: `03_chapter_2_inpact_framework.md`, `05_chapter_4_foundation_layers.md`,
`06_chapter_5_intelligence_layers.md`,
`07_chapter_6_transparency_orchestration_layers.md`,
`08_chapter_7_goals_framework.md`.

---

## The correction that matters

Master plan §Gate 5 says:

> Do not invent scores if the book/current framework does not define them.

**The book defines them precisely.** Gate 0 originally recorded D-04 as "vocabulary
unverified, do not encode." The real finding is stronger and more useful: there are
specific scales, specific maxima, a specific dependency order, and specific regulatory
thresholds — and **Gate 5 must use them exactly rather than designing its own.**

The risk was never that we would invent a score. It is that we would invent a *different*
one — a 1–5 INPACT or a 1–10 GOALS — and quietly diverge from the framework Colaberry
sells.

---

## The Trust Equation

The book states it as a formula:

> **TRUSTED AGENTS = INPACT™ (What They Need) + 7-Layer (How You Build) + GOALS™ (How You Sustain)**

> "All three must be in place. Capability without sustainability degrades. Infrastructure
> without measurement is blind. Measurement without architecture has nothing to measure."

This maps cleanly onto the delivery lifecycle, and is the reason Trust Before Intelligence
is a **release gate** rather than a document:

| Pillar | Question | Where it lives in Refactored |
|---|---|---|
| INPACT™ | What does this agent need? | Requirements + `DeliveryAgentDefinition` (Gates 4–5) |
| 7-Layer | How is it built? | Architecture decisions + Architecture-of-Trust map (Gate 5) |
| GOALS™ | How is it sustained? | Operate + release gating (Gates 9, 14) |

---

## INPACT™ — six needs, scored 1–6

Canonical, from Chapter 2 Part 3:

| | Need | Book's framing |
|---|---|---|
| **I** | Instant | Speed Builds Confidence |
| **N** | Natural | Understanding Builds Connection |
| **P** | Permitted | Authorization Builds Safety |
| **A** | Adaptive | Learning Builds Reliability |
| **C** | Contextual | Integration Builds Completeness |
| **T** | Transparent | Explainability Builds Confidence |

### Scoring — exact

> "Each dimension scored 1-6 creates 36-point maximum, converted to 100-point scale for
> executive communication."

So: **1–6 per dimension · 36 max · reported on a 100-point scale.** The worked example
(Echo Health) runs 28/100 at assessment to 86/100 after ten weeks.

**Do not store the 100-point number as truth.** Store the six raw 1–6 dimension scores;
derive the 100-point figure for display. A rounded executive number is a presentation
concern, and persisting it as the record is how the underlying assessment becomes
unauditable.

### Dependency order — this is a build constraint, not advice

From "Which Need to Fix First?":

```
Phase 1  Instant                    real-time data enables everything downstream
Phase 2  Natural + Permitted        parallel; both require real-time data
Phase 3  Contextual                 requires real-time + semantic + authorization
Phase 4  Adaptive + Transparent     build on complete infrastructure
```

> "Authorization cannot evaluate stale data. Adaptive systems cannot learn from batch
> updates."

**Consequence for Gate 7:** an AI Opportunity Map that schedules an Adaptive capability
before Instant exists is not merely ambitious, it is invalid. The story graph should
refuse the ordering the way `planGate` refuses an uncovered `must` — deterministically,
and with the dependency named.

---

## The 7-Layer Architecture — canonical names

Verified across Chapters 4, 5 and 6. The master plan's short list is correct; the book's
full names for layers 1 and 2 are longer:

```
Layer 7  Orchestration
Layer 6  Observability
Layer 5  Governance
Layer 4  Intelligence
Layer 3  Semantic
Layer 2  Real-Time Data          (plan says "Real-Time")
Layer 1  Multi-Modal Storage     (plan says "Storage")
```

Use the book's names in the schema. "Storage" and "Multi-Modal Storage" will read as the
same thing to us and as a discrepancy to a client who has read the book.

The Architecture-of-Trust map (Gate 5) links each project component to the layer(s) it
depends on, so "which layers is this agent standing on, and are they operational?" is a
query rather than an opinion.

---

## GOALS™ — five dimensions, scored 1–5

Canonical, from Chapter 7 Table 1:

| | Dimension | Full name | Covers |
|---|---|---|---|
| **G** | Governance | Security, Compliance & Control | ABAC, HITL workflows, audit trails, change management, model versioning with rollback |
| **O** | Observability | Monitoring, Cost & Maintainability | APM, distributed tracing, LLM cost tracking, alerting, drift detection, explainability |
| **A** | Availability | Speed, Freshness & Scale | Sub-2-second response, sub-30-second freshness, 10x scalability, 99.9%+ uptime |
| **L** | Lexicon | Semantic Understanding & Accuracy | Entity resolution, terminology mapping, query interpretation, ontology, disambiguation |
| **S** | Solid | Data Quality & Integrity | Accuracy, completeness, consistency, timeliness, schema validation |

### The maturity scale — exact

```
1/5  Absent       No formal capability
2/5  Basic        Minimal implementation, reactive
3/5  Developing   Structured but incomplete
4/5  Proficient   Comprehensive, mostly automated
5/5  Advanced     Full automation with continuous improvement
```

**5 dimensions × 5 points = 25 max.** The book's worked target is 21/25.

> "Operational excellence isn't binary. You don't just 'have' governance or not."

### Interdependence

> "These aren't five independent dimensions — they're interconnected like vital organs.
> Weakness in one cascades to the others."

So a GOALS assessment must be stored as five scores, never averaged into one number for
gating. An average hides exactly the single-dimension collapse the framework exists to
catch.

---

## Regulatory thresholds — directly relevant to Gate 13

The book ties minimum scores to regulation:

> "Healthcare specifically requires 4/5 minimum in all dimensions and 5/5 in Governance
> for clinical AI. These aren't arbitrary thresholds — they're mandated by regulation."

Named instruments: **EU AI Act (Regulation 2024/1689), Articles 9–15** — risk management,
data governance, transparency, human oversight, continuous monitoring; and **NIST AI Risk
Management Framework** — GOVERN, MAP, MEASURE, MANAGE.

**This is the shape `DeliveryProfile` should take.** A profile is, concretely, a set of
minimum GOALS scores plus required INPACT dimensions plus required evidence:

```
government_public_sector:  min GOALS 4/5 all dimensions, 5/5 Governance
                           + accessibility / records / auditability evidence
commercial_standard:       min GOALS 3/5, 4/5 Governance
internal_tool:             min GOALS 2/5
```

The exact numbers are a Gate 13 decision with Ali and Ram, not Claude's to set. What Gate 0
establishes is that the **mechanism** already exists in the framework and should not be
invented: profiles gate on GOALS thresholds.

Master plan §Gate 13's "do not claim universal compliance" still holds. Meeting a GOALS
threshold is not a compliance certification and must never be presented as one.

---

## What this means for the gates

| Gate | Requirement from the book |
|---|---|
| 4 | The AI Opportunity Map's "trust requirement" column is an INPACT dimension reference, not free text |
| 5 | `DeliveryAgentDefinition` stores **six INPACT scores (1–6)**, each with requirement · implementation evidence · evaluation · owner · status. Architecture-of-Trust map links components to the seven layers by their canonical names |
| 7 | Story ordering must respect the INPACT dependency phases; violations fail the traceability gate |
| 9 | "Trust Before Intelligence coverage" resolves to: every production-bound agent has all six dimensions addressed, with evidence |
| 13 | `DeliveryProfile` = minimum GOALS thresholds + required evidence. Regulated profiles cite EU AI Act / NIST AI RMF rather than claiming compliance |
| 14 | GOALS reassessed continuously — **five scores stored separately**, never averaged for gating |

---

## Open items for Gate 5

1. **Assessment methodology.** The book points to `colaberry.ai/assessment` and
   "Appendix DA-1" for the full diagnostic. Not read. Before building the assessment UI,
   read `manuscript/14_appendices.md` and the appendix INPACT scoring-methodology files
   so our questions match the published instrument.
2. **Chapter 9** (`10_chapter_9_measuring_agent_readiness.md`) was not read — the fetch
   timed out. It is the "measuring agent readiness" chapter and likely contains the
   assessment mechanics. Read before Gate 5.
3. **Ram is the author.** Scoring semantics are a product decision with him, not an
   implementation detail.

D-04 is otherwise **closed**: the vocabulary is verified, the scales are exact, and
nothing in these documents now rests on the master plan's paraphrase.
