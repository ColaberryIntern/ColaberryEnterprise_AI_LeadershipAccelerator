# Platform page redesign — build spec

Working notes for porting Ali's `colaberryplatform.html` prototype into
`PlatformV2.tsx`. Written 2026-08-20, session CC-20260807-h2r6.

This exists so the build starts from verified facts. Two claims in the prototype
were already wrong when checked against source, and both would have shipped on a
page whose entire argument is *"every number has receipts."*

---

## VERIFIED — safe to ship as written

**The evidence-band weighting formula.** `services/cape/capeSeeders.ts` lines
63-66:

```
claim_weight: 0.2
knowledge_weight: 0.25
application_weight: 0.35
judgment_weight: 0.2
```

Matches the prototype exactly, and application genuinely carries the heaviest
weight — so "application carries the most weight because building is the thing
that transfers" is true, not marketing.

**Nuance to keep in the copy:** these are DEFAULTS.
`capeEvidenceBandWeightsService` supports patching them with versioning (its
test patches to `0.25/0.25/0.3/0.2`). Write them as the default model, never as
immutable constants.

**The four bands exist** as named concepts: claim, knowledge, application,
judgment. Confirmed by the weight columns and `capeCardEnrichmentService`.

---

## CORRECTED — the prototype is wrong, do not ship as drawn

### 1. Competency count

Prototype says **ten**. `capeSeeders.ts` line 4 says **"the 11 existing
promotion competencies."** Ali's call (2026-08-20): use the real ones.

### 2. Competency NAMES — the more serious one

The prototype's radar invents its categories. Real slugs found in source:

```
prompt_engineering    context_engineering   architecture
testing               deployment            github
leadership            documentation         security
communication         claude_code           agentic_loops
```

The prototype's radar shows: LLM Core, Prompting, RAG, Vectors, Agents & MCP,
Eval & Guardrails, System Design, Context Eng., Governance, Deploy & Ops.

**RAG, Vectors, LLM Core and Eval & Guardrails are not tracked competencies.**
Meanwhile testing, github, documentation, security, communication and leadership
— which ARE tracked — are missing from the radar entirely.

**Why the "Sample data" pill does not cover this.** Sample VALUES on real
categories are exactly what that pill is for. Invented CATEGORIES tell a buyer
the platform measures something it does not. That is a capability claim wearing
a sample badge, and it is the failure mode this page claims immunity from.

**Decision:** radar uses the real competency names, geometry adjusted to match.
Confirmed by Ali, option 1.

---

## STILL UNVERIFIED — check before writing these sections

- **Nine ranks** (section 2 roster, section 4 promotion gate). A text search
  returned `architect_*` noise rather than a clean ladder; needs a targeted read
  of the promotion-gate config, not a grep.
- **"At least three acceptance criteria per story", one always covering trust**
  (section 3, stage 05).
- **Verification "ignores bot-authored commits"**, and requires BOTH all
  criteria satisfied AND a commit naming the story (section 3, stage 08). The
  story-trailer mechanism itself is confirmed from earlier work this session.
- **The drill-down reaching evidence records** — org → dept → person →
  competency → evidence. This decides whether "five clicks from the executive
  dashboard to the line of code" is publishable at all. It is section 4's entire
  argument.
- **Promotion requiring human approval from Engineer upward** (section 4).

---

## PORT RULES

Agreed with Ali before starting:

1. **Replace the current hero** with the prototype's. Its OS diagram becomes
   section 1's visual.
2. **No Google Fonts.** The prototype links Roboto and Roboto Mono; use
   `--font-display` / `--font-mono` as every other page does. A duplicate icon
   font was removed from this site days ago for the same reason.
3. **Drop the prototype's header and footer.** The site has its own.
4. **Namespace everything.** The prototype uses `.card`, `.tile`, `.app`,
   `.flow`, `.pill`, `.two`, `.stg`, `.src` — all generic enough to collide with
   existing styles. `.cbv2-goal`, defined twice across two files, already
   reshaped an unrelated section once in this workstream.
5. **12-week roadmap moves to `/program`**, not deleted. `/platform` keeps only
   the condensed AI Aware → AI Organization ladder.
6. **"From idea to shipped" becomes the full treatment here**; the home page
   version shrinks to a teaser that links to it. One canonical telling.

---

## SECTION MAP

| # | Section | Blocked on |
|---|---|---|
| 1 | Hero + OS diagram | — |
| 2 | One platform, two experiences | rank ladder |
| 3 | Idea → shipped build pipeline | AC minimum, bot-commit filter |
| 4 | Every number has receipts | **drill-down depth** |
| 5 | The AI Architect experience | real competency names (resolved) |
| 6 | Capability grows because work ships | — (formula verified) |
| 7 | Human + AI governance | human-approval gate |
| 8 | AI Aware → AI Organization ladder | — |
| 9 | Open the platform CTA | — |

Sections 1, 6, 8 and 9 are unblocked and can be built first.
