# Operational Vocabulary — Canonical Terms Reference

**Established 2026-05-16 (Semantic Coherence + Operational Wayfinding Sprint).**

Every operator-facing editorial helper across [frontend/src/utils/](../frontend/src/utils/) speaks one operational language. This document is the reference for what that language is. It is a **governance artifact**, not a build-time lint — adding new vocabulary should pass through here, and existing vocabulary should be honored, but there is no automated enforcement.

When in doubt: read this file first, then look at the helper that owns the concept.

---

## Pathway stages

The canonical operational flow is composed of four stages. Every domain belongs to exactly one stage (except `other`, which has none).

| Stage | Meaning | Domain keys |
| --- | --- | --- |
| **Entry** | First contact and onboarding into the operational system | `public_pages`, `intake` |
| **Coordination** | Routing, intelligence, and cross-domain synchronization | `lead_intelligence`, `marketing`, `ai_intelligence` |
| **Execution** | Delivery and lifecycle of the served population | `execution`, `student_lifecycle` |
| **Reporting** | Visibility, governance, and operator-facing summaries | `reporting`, `project_admin` |

Source: [pathwayStage.ts](../frontend/src/utils/pathwayStage.ts). The catch-all `other` domain returns `null` — honest silence rather than an "Other" tag.

---

## Maturity / lifecycle states

Six classifier states map to five operator-facing trust labels (Coordinated and Operational pass through unchanged because they already read clearly).

| Lifecycle state (data) | Trust label (operator sees) | Editorial meaning |
| --- | --- | --- |
| `Foundational` | **Still forming** | Exists; little is connected |
| `Emerging` | **Coordinating** | Starting to coordinate |
| `Coordinated` | Coordinated | Pieces fit together |
| `Operational` | Operational | Running reliably |
| `Scaling` | **Dependable** | Mature, expanding |
| `Stabilizing` | **Trusted** | Mature, late-stage optimization |

Source: [structuralConfidence.ts](../frontend/src/utils/structuralConfidence.ts). Raw `LifecycleState` lives on each badge's `title` attribute — visible on hover. Nothing technical is hidden.

---

## Builtness tiers (per BP)

Each BP carries one of five operator-facing words derived from its usability + pillar signals.

| Tier | When it applies |
| --- | --- |
| **Built** | `usability.usable === true` OR `is_complete === true` |
| **Wired** | Some pillar is `ready` but not yet usable |
| **Partial** | Some pillar is `partial` but no `ready` pillars |
| **Foundation** | Foundational state only |
| **Not built yet** | All pillars `n/a` or `missing` |

Source: [bpSignals.ts](../frontend/src/utils/bpSignals.ts) — `bpBuiltness()`. In the BP-row inline word, only `Usable` / `Forming` / `Early` / `Not built yet` are used (the simpler four-word vocabulary). Title-Case enum exports remain Title-Case; in-prose mentions are lowercase (`built`, `wired`, `foundation`, `not built yet`).

---

## Downstream / dependency vocabulary

All operator-facing prose uses **"downstream area(s)"** — never "downstream operational area(s)" (legacy) or "operational surface" (reserved for leverage-headline use only).

| Phrasing | Where used |
| --- | --- |
| `supports N downstream area(s)` | [scanSpeedSignals.ts](../frontend/src/utils/scanSpeedSignals.ts), [bpInheritedContext.ts](../frontend/src/utils/bpInheritedContext.ts), [operationalLeverage.ts](../frontend/src/utils/operationalLeverage.ts) |
| `N operational area(s) depend on this domain` | [BPDomainSurfaceRows.tsx](../frontend/src/components/project/BPDomainSurfaceRows.tsx) — `downstreamSummary` in the expanded operational-role block |
| `the broadest operational surface` | [operationalLeverage.ts](../frontend/src/utils/operationalLeverage.ts) — reserved for the system-leverage headline only |

The word **influence** is the canonical verb for downstream effect — "strengthening it would influence …" not "would affect" / "would impact" / "would impact downstream …".

---

## "Operational structure" vs "operational system"

All operator-facing prose uses **"operational structure"** — never "operational system" (legacy). The two were drifting across helpers; standardized 2026-05-16.

| Helper | Sentence shape |
| --- | --- |
| [structuralConfidence.ts](../frontend/src/utils/structuralConfidence.ts) — `systemResilienceSentence` | "The operational structure is still forming / dependable / feels stable …" |
| [operationalLeverage.ts](../frontend/src/utils/operationalLeverage.ts) — `systemEvolutionPhrase` | "Your operational structure is in early coordination / broadly coordinated / mature and stable …" |

---

## "Why this matters" sentence shape

The leverage block's "Why this matters" line composes both the priority domain's label AND its pathway-stage parenthetical, plus parentheticals on each downstream target. Single mental model end-to-end.

> *"Cory's current priority sits in AI & Intelligence (Coordination) — strengthening it would influence Lead Intelligence (Coordination) and Execution Systems (Execution)."*

Source: [coryPriorityMatcher.ts](../frontend/src/utils/coryPriorityMatcher.ts) — `whyThisMattersSentence(priorityDomain, buckets?)`. When `buckets` is omitted (test scenarios), downstream targets render without their parentheticals — graceful fallback. The catch-all `other` domain omits its parenthetical (no `(null)` artifact).

---

## Inherited domain context

Each BP-section header (above the BP list inside an expanded domain) carries a single calm italic sentence anchoring the BPs to their domain's downstream count:

> *"Each BP below sits inside Lead Intelligence — supports 3 downstream areas."*

Source: [bpInheritedContext.ts](../frontend/src/utils/bpInheritedContext.ts) — `inheritedDomainContextSentence(domainLabel, downstreamCount)`. Hidden when `downstreamCount <= 0` — honest silence, no "supports 0" filler.

> History: shipped per-row 2026-05-16 (Recovery sprint Phase 4), collapsed to section-header form 2026-05-16 (Semantic Coherence sprint Phase C). Per-row repetition shifted from anchor to boilerplate in large domains (e.g. 14 BPs).

---

## Momentum directions (Cory Home)

| Direction | Symbol | Operator-facing label |
| --- | --- | --- |
| `up` | ↑ | direction-specific clause (e.g. "readiness strengthened") |
| `down` | ↓ | direction-specific clause |
| `flat` | · | "baseline" |
| `first-visit` | · | "baseline" |

Source: [BPDomainSurfaceRows.tsx — MOMENTUM_TONE](../frontend/src/components/project/BPDomainSurfaceRows.tsx); momentum clauses in [operatorOrientationLanguage.ts](../frontend/src/utils/operatorOrientationLanguage.ts).

---

## Anti-vocabulary

Words and phrases that should **never** appear in operator-facing prose:

- **No imperatives.** Never "you should X" / "must X" / "fix X" / "address X" / "improve X" / "optimize X". Use conditional + observational framing — "strengthening this would …", "this area …".
- **No certainty words.** Never "guaranteed" / "optimal" / "perfect" / "critical" / "urgent" / "essential". Use measured framing — "increasingly", "broadly", "operationally", "reliably".
- **No exclamation marks.** Anywhere. Calm by default.
- **No KPI / dashboard vocabulary.** Never "score" / "rating" / "metric" / "telemetry" / "health score" in operator-facing prose. (Internal helper names may use technical terms; only operator-visible prose is constrained.)
- **No "Other" tag.** When a domain has no canonical stage, render nothing — silence is honest.

These guardrails are enforced by test assertions across [priorityTopology.test.ts](../frontend/src/__tests__/priorityTopology.test.ts), [operationalLeverage.test.ts](../frontend/src/__tests__/operationalLeverage.test.ts), [structuralConfidence.test.ts](../frontend/src/__tests__/structuralConfidence.test.ts), and [scanSpeedSignals.test.ts](../frontend/src/__tests__/scanSpeedSignals.test.ts).

---

## Adding new vocabulary

If a new editorial helper needs a new word or phrase for an operator-facing concept:

1. Search this document and the existing helpers — there is likely already a canonical term.
2. If genuinely new, add a row to the relevant table above with the term, its meaning, and the helper that owns it.
3. Honor the **anti-vocabulary** guardrails. If the new term reads imperative, certain, or dashboard-y, find a calmer phrasing first.
4. The PR that introduces the new term should also update the relevant `*.test.ts` calm-language assertions.

This document is the canonical source. Helpers reference it; it does not reference the helpers in any enforced way.
