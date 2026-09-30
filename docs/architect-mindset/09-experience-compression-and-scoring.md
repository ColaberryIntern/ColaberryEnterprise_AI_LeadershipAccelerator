# Experience Compression and Architect Mindset Score

> **Status:** Phase 1 (Documentation + Design). Conforms to `00-canonical-decisions.md` (source of truth, sections 8 and 9).
> **Session:** CC-20260720-am01 · **Date:** 2026-07-20 · **DRI:** Ali Muwwakkil (ali@colaberry.com)
> Slug: `architect_mindset`. Student-facing name: **The Architect Time Machine**.

This document defines two mechanisms: the **Experience Compression Model** (Part A), which describes
how the product communicates the depth of a scenario, and the **Architect Mindset Score** (Part B),
which describes how the product measures and explains a student's architectural reasoning. Every
constant, weight, stage, and receipt figure here is quoted from the canonical file and must not
diverge from it.

---

## PART A: Experience Compression Model

### A.1 What this model is (and is not)

The Experience Compression Model is a **curriculum estimation method**. Its only purpose is to let the
product describe, consistently across weeks, how much professional pattern-exposure a scenario
represents. It is a communication device. **It is not presented as scientific fact, it is not a
measurement of experience the student has acquired, and it never asserts competence or job readiness.**
The ethics gate on this model is binding at the generation layer, the renderer layer, and the
marketing layer (see canonical section 8 and `01-product-specification.md`, section 6).

### A.2 Estimation rubric dimensions

An experience is characterized along six exposure dimensions. Each dimension maps to a single
represented-hours constant, so that any two authors estimate the same scenario the same way.

| Rubric dimension | What it captures | Maps to constant |
|---|---|---|
| Project exposure | Full delivery cycles the scenario represents. | Major project cycle |
| Incident / failure exposure | Production incidents or failures the scenario walks through. | Major incident |
| Cross-role exposure | Distinct professional perspectives the student must adopt or account for. | Distinct role perspective |
| Decision complexity | Significant architectural tradeoffs the student must weigh. | Significant architectural tradeoff |
| Lifecycle exposure | Distinct lifecycle stages the scenario touches (creation through deletion). | Lifecycle stage |
| Rework exposure | Major redesigns or re-architectures the scenario forces. | Major redesign |

### A.3 Internal calculation constants (canonical section 8)

| Constant | Represented hours |
|---|---|
| Major project cycle | 600 |
| Major incident | 120 |
| Distinct role perspective | 80 |
| Significant architectural tradeoff | 50 |
| Lifecycle stage | 100 |
| Major redesign | 400 |

These constants are fixed in the canonical file. Changing a constant is a canonical-file change first,
then a propagation, never a local edit here.

### A.4 Experience Compression Ratio

The Experience Compression Ratio expresses how much represented depth is packed into the lesson's
running time. It is a ratio, and it is always shown with the qualification block in A.5.

```
Experience Compression Ratio = patterns-represented hours ÷ lesson duration (hours)
```

**Worked example (Week 1):**

```
patterns-represented hours = 3,200
lesson duration            = 25 minutes = 25 / 60 hours ≈ 0.4167 hours
ratio = 3,200 ÷ (25 / 60) ≈ 7,680 : 1
```

The ratio is read as "this scenario represents roughly 7,680 hours of pattern-exposure for every hour
spent in the experience." It is not read as "the student gained 7,680 hours of experience." That
reading is prohibited (see A.5).

> Note: the registered `est_minutes` for Weeks 1 to 12 is 28 (canonical section 2). The 25-minute
> figure is the canonical illustrative duration used for the ratio worked example (canonical section
> 8). Displays should compute the ratio from the actual lesson duration and treat the result as
> illustrative regardless.

### A.5 Mandatory qualification language (verbatim reusable block)

The following block is the single source of qualification copy. It is reused verbatim wherever an
Experience Receipt, a represented-hours figure, or a compression ratio appears. Do not paraphrase it.

> **This is an illustrative, scenario-based estimate of the patterns represented in this experience.
> It is not employment experience earned, and it is not a guarantee of competence or job readiness.**
>
> This simulation exposes you to patterns, decisions, consequences, and professional perspectives that
> were traditionally distributed across approximately **X collective project hours**.
>
> *This represents patterns studied, not employment experience earned.*

Every estimate is additionally tagged with all five labels, shown next to the number:

- Illustrative
- Scenario-based
- An estimate of patterns represented
- Not employment experience earned
- Not a guarantee of competence or job readiness

### A.6 Worked receipt: Week 0 (baseline, free preview)

Week 0 is the free-preview tier and is authored (not generated). Its receipt is a curated,
introductory estimate representing partial exposure, which is why its represented-hours figure is
modest relative to a full scored week.

| Receipt component | Count |
|---|---|
| Request | 1 |
| Roles | 8 |
| Information classes | 10 |
| Decision categories | 6 |
| Architectural concerns | 7 |
| Strategies | 4 |
| Hidden assumptions | 12 |
| Perspectives | 5 |
| Phases | 2 |

**Represented total: approximately 450 collective project hours.** In-experience time: approximately
12 to 15 minutes (authored to about 13 minutes). The 450-hour figure is a curated, illustrative
estimate for the introductory tier, not a strict multiplication of the A.3 constants, and it is
displayed with the full qualification block in A.5.

### A.7 Worked receipt: Week 1 (first scored lesson)

Week 1 ("The Request Is Not the Requirement") is generated against the injected week context and
carries a full receipt. Its represented-hours figure is the sum of five exposure components.

| Exposure component | Represented hours |
|---|---|
| Discovery | 700 |
| Stakeholder | 480 |
| Failed-solution exposure | 900 |
| Workflow redesign | 600 |
| Operational measurement | 520 |
| **Total** | **3,200** |

`700 + 480 + 900 + 600 + 520 = 3,200`. Applying A.4: `3,200 ÷ (25 / 60) ≈ 7,680 : 1`. Both figures
are displayed with the qualification block in A.5.

### A.8 How to display it responsibly (UI guidance)

- **Label placement.** The five labels from A.5 sit directly adjacent to the number, in the same
  visual container, never on a separate screen or behind a tooltip that the student can miss. The
  represented-hours figure is never shown alone.
- **The always-paired clarifier.** Every represented-hours figure and every compression ratio is
  paired, in the same view, with the clarifier: *"This represents patterns studied, not employment
  experience earned."* If the number moves, the clarifier moves with it.
- **No experience-earned framing.** Copy, headings, and visuals must not use verbs like "earned,"
  "gained," "completed X hours," or "equivalent to X years." The permitted framing is exposure to
  patterns represented (see the verbatim block).
- **Consistent units.** Represented hours are labeled "collective project hours represented," never
  "your hours" or "hours of experience."

---

## PART B: Architect Mindset Score

### B.1 Principle

The Architect Mindset Score is transparent and multi-dimensional by design. **We never reduce
architectural reasoning to one opaque AI number.** A total exists for orientation, but the total is
always decomposed into eight explained dimensions, each with the evidence behind it. A student can
always see why a dimension scored the way it did and what would raise it.

### B.2 Dimensions and weights (canonical section 9)

| Dimension | Weight |
|---|---|
| System scope recognition | 20% |
| Assumption discovery | 15% |
| Stakeholder awareness | 10% |
| Tradeoff quality | 15% |
| Failure anticipation | 15% |
| Evidence & observability | 10% |
| Governance & ownership | 10% |
| Decision communication | 5% |
| **Total** | **100%** |

### B.3 Stages (canonical section 9)

| Stage | Score range |
|---|---|
| Feature Thinker | 0-29 |
| System Explorer | 30-49 |
| Tradeoff Thinker | 50-69 |
| Architecture Thinker | 70-84 |
| Architecture Leader | 85-94 |
| Systems Steward | 95-100 |

**Week 0 is baseline and unscored.** It establishes the student's starting point and demonstrates the
format without producing a score. **Week 1 is the first formally scored lesson**, and growth is
measured from Week 1 forward.

### B.4 Per-score transparency contract

For every dimension, on every scored experience, the product shows all seven of the following. A score
that cannot show all seven is incomplete and must not be presented as final.

| Element | What it answers |
|---|---|
| Dimension | Which of the eight capabilities this is. |
| Evidence used | The specific student inputs (interview answers, decisions, tradeoffs) the score drew on. |
| Strength | What the student did well in this dimension. |
| Gap | What was missing or weak. |
| Suggested improvement | The concrete next behavior that would raise the dimension. |
| Change from initial | How the student's reasoning moved from the initial decision to the revised decision (and, from Week 2 onward, week over week). |
| Evaluation limitation / confidence | How confident the evaluation is, and what it could not assess from the available evidence. |

The transparency contract is the product's answer to opacity: the number is never the message, the
explanation is.

### B.5 Worked example score card (hypothetical Week 1 student)

The following illustrates a plausible first scored result for a student completing Week 1 ("The Request
Is Not the Requirement"). The student is moving out of Feature Thinker: they eventually discovered the
underlying outcome behind the request, but they under-weighted failure and governance.

**Numeric summary**

| Dimension | Weight | Score (revised) | Change from initial |
|---|---|---|---|
| System scope recognition | 20% | 62 | +24 (initially answered only the literal request) |
| Assumption discovery | 15% | 55 | +18 (named 3 hidden assumptions after the zoom-out) |
| Stakeholder awareness | 10% | 48 | +12 (identified the outcome owner, missed downstream operators) |
| Tradeoff quality | 15% | 40 | +8 (named one tradeoff, did not weigh the alternative) |
| Failure anticipation | 15% | 35 | +5 (added one failure risk only after the consequence reveal) |
| Evidence & observability | 10% | 45 | +10 (asked for evidence, did not define how success would be measured) |
| Governance & ownership | 10% | 30 | +4 (did not address who operates or owns the result) |
| Decision communication | 5% | 58 | +9 (explained the choice clearly, in mostly technical terms) |

**Weighted total: 47 of 100. Stage: System Explorer (30-49).**

Calculation: `(62 x .20) + (55 x .15) + (48 x .10) + (40 x .15) + (35 x .15) + (45 x .10) + (30 x .10)
+ (58 x .05) = 12.4 + 8.25 + 4.8 + 6.0 + 5.25 + 4.5 + 3.0 + 2.9 = 47.1`, rounded to 47.

**Per-dimension detail (the transparency contract in full)**

- **System scope recognition (62).**
  - *Evidence used:* the revised decision and the Part 2 interview, where the student described the
    workflow around the request, not only the requested feature.
  - *Strength:* recognized that the request touched an upstream intake step and a downstream report.
  - *Gap:* did not trace the data past the report into retention and audit.
  - *Suggested improvement:* before deciding, list every system the request reads from or writes to.
  - *Change from initial:* +24. The initial decision addressed only the literal feature.
  - *Limitation / confidence:* medium-high confidence; the revised answer gave clear scope evidence.

- **Assumption discovery (55).**
  - *Evidence used:* Part 1 and Part 2 interview answers about what the requester took for granted.
  - *Strength:* surfaced three hidden assumptions after the zoom-out (data is clean, one requester
    speaks for all, volume stays flat).
  - *Gap:* did not question the assumption that the current process is the right process.
  - *Suggested improvement:* for each requirement, ask "what must be true for this to hold," and write
    it down.
  - *Change from initial:* +18. Zero assumptions were named before the zoom-out.
  - *Limitation / confidence:* medium confidence; some assumptions may have been intuited but not
    stated, and the evaluation scores only stated evidence.

- **Stakeholder awareness (48).**
  - *Evidence used:* the stakeholder list in the interview and the revised decision.
  - *Strength:* correctly separated the requester from the owner of the business outcome.
  - *Gap:* omitted the operators who would run the result day to day.
  - *Suggested improvement:* name who requests, who owns the outcome, and who operates the system, as
    three distinct roles.
  - *Change from initial:* +12.
  - *Limitation / confidence:* medium confidence.

- **Tradeoff quality (40).**
  - *Evidence used:* the revised architecture selection and its written justification.
  - *Strength:* identified one real tradeoff (speed of delivery against future change cost).
  - *Gap:* did not weigh the alternative or explain why the chosen side fit this context.
  - *Suggested improvement:* for each tradeoff, state both options and why the chosen one fits the
    current constraints.
  - *Change from initial:* +8.
  - *Limitation / confidence:* medium confidence; only one tradeoff was made explicit.

- **Failure anticipation (35).**
  - *Evidence used:* the failure risks listed before and after the consequence reveal.
  - *Strength:* added a duplicate-processing risk after seeing the consequence.
  - *Gap:* designed for the happy path first; did not consider timeout, partial failure, or retry.
  - *Suggested improvement:* design the failure path before the success path (what happens when the
    dependency is down, slow, or returns the wrong shape).
  - *Change from initial:* +5. Most of the movement came only after the consequence was shown.
  - *Limitation / confidence:* high confidence that this is the weakest dimension for this student.

- **Evidence & observability (45).**
  - *Evidence used:* the interview answers on how the student would know the system worked.
  - *Strength:* asked the requester for evidence of the underlying problem.
  - *Gap:* did not define how success or failure would be measured in operation.
  - *Suggested improvement:* for every decision, state what signal proves it worked and where that
    signal is visible.
  - *Change from initial:* +10.
  - *Limitation / confidence:* medium confidence.

- **Governance & ownership (30).**
  - *Evidence used:* the revised decision and the project-transfer reflection.
  - *Strength:* acknowledged that someone would need to maintain the result.
  - *Gap:* did not name an owner, an operating responsibility, or a data-retention concern.
  - *Suggested improvement:* for the chosen design, name who owns it, who operates it, and what
    governance (retention, access, audit) applies.
  - *Change from initial:* +4. This dimension barely moved.
  - *Limitation / confidence:* high confidence that this is a genuine gap, not a scoring artifact.

- **Decision communication (58).**
  - *Evidence used:* the written justification and the project-transfer reflection.
  - *Strength:* explained the decision clearly and in a logical order.
  - *Gap:* framed it in mostly technical terms, without a non-technical stakeholder version.
  - *Suggested improvement:* add a two-sentence explanation a non-technical owner could act on.
  - *Change from initial:* +9.
  - *Limitation / confidence:* medium-high confidence.

**Reading of this card.** The student has clearly left pure Feature Thinking (the initial decision
answered only the literal request) and is now a System Explorer: they see the surrounding system and
surface assumptions, but they do not yet reason deliberately about failure, governance, and ownership.
The two dimensions to target next are failure anticipation and governance and ownership, which is
exactly what Weeks 3 ("Design for Failure Before Success"), 6 ("Security Is a System Property"), and 10
("Systems Live Longer Than Their Builders") are built to strengthen. The score is a starting point for
that growth, not a verdict, and never a single opaque number.
