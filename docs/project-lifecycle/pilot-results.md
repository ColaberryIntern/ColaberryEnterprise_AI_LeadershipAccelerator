# Project lifecycle pilot results

**Measured on 2026-10-17.** Every figure below carries its denominator. Figures
without one are not in this document; dimensions that could not be measured are listed
as unmeasured with the reason, rather than estimated.

**There are no comparison percentages in this report, and that is enforced rather
than intended:** `comparisonClaimViolations` fails a test on any percent sign within
40 characters of a comparison word. The words it knows are listed in
`COMPARISON_WORDS`. The check has its own positive control, so it is known to be
capable of failing, and its known bypasses are documented in that module rather than
left for a reader to discover.

## 1. Completeness

Requirement blocks covered by a derived enumeration, per fixture. Not a share: the
covered count and the total are both printed.

| Fixture | Shape | Blocks covered | Blocks total | Uncovered |
|---|---|---|---|---|
| A-government | government contract, proposal + solution tracks | 2 | 2 | 0 |
| B-human-heavy | human-heavy workflow, below the automation target by design | 1 | 1 | 0 |
| C-ordinary | ordinary AI service application | 1 | 1 | 0 |
| D-manual-only | manual-only workflow, zero automation as a recorded decision | 2 | 2 | 0 |

Story coverage is **not assessable at this tier** for any fixture: stories do not exist
until the planning stage, which is database-backed and not driven by this pilot. It is
reported as unmeasured rather than as zero gaps, because an empty gap list would read as
"measured, nothing missing" for data nobody measured.

## 2. Page consolidation

Workspace states each composed blueprint resolves to, per fixture.

| Fixture | Consolidated workspaces |
|---|---|
| A-government | 2 |
| B-human-heavy | 2 |
| C-ordinary | 2 |
| D-manual-only | 2 |

No comparison against the existing path is reported, because measuring it needs the same
live model calls named in section 4.

## 3. Approval effort

Of 15 stages in the corpus ladder, every one of the 4 fixtures drove 10 and did not reach 5.

The stages not reached are the database-backed ones, and **two of those five are the
approval gates themselves** (`awaiting_blueprint_approval` and `blueprint_approved`).
So **the number of human approval decisions this pilot observed is zero** — not a small
number, zero — and that is a consequence of which stages a generation-tier pilot can
reach, rather than a claim about how much approval effort the system needs.

| Fixture | Stages driven | Stages not reached | Refusals |
|---|---|---|---|
| A-government | 10 of 15 | 5 | 0 |
| B-human-heavy | 10 of 15 | 5 | 0 |
| C-ordinary | 10 of 15 | 5 | 0 |
| D-manual-only | 10 of 15 | 5 | 0 |

## 4. Generation time and cost

| Fixture | Effort bases | AI minutes | Total minutes | Below target |
|---|---|---|---|---|
| A-government | ESTIMATED | 240 | 360 | yes |
| B-human-heavy | MEASURED | 200 | 1280 | yes |
| C-ordinary | ESTIMATED+MEASURED | 800 | 1200 | yes |
| D-manual-only | MEASURED | 0 | 210 | yes |

**Compose wall time is NOT published here, and the reason is the point.** It was
observed in the single-digit-millisecond range, dominated by module load on whichever
fixture runs first: the same fixture was observed at three different values across three
consecutive runs, while later fixtures sat near the bottom of the range. A per-fixture
millisecond would therefore be unreproducible AND would invite exactly the cost
comparison this section cannot support. It is recorded as an observation in the session
log and left out of the published tables.

AI minutes are printed as a numerator and a denominator, never divided.
4 of the 4 fixtures are below the automation target, which
is a recorded decision for the manual-only and human-heavy shapes rather than a
shortfall.

## 5. Failure recovery

**Outcomes observed, not a reliability rate.** A rate over a hand-built case set would be
a statistic about the fixtures dressed as a statistic about the system.

| Replay case | Observed |
|---|---|
| Crash/restart mid-generation | the review hold survives in the stored row; a resumed build does not publish |
| Duplicate start | one intake row; the database refuses the second, not the application |
| Concurrent revisions | the loser retries on a recomputed revision and lands; the bound is three |
| Concurrent approval | exactly one approval; the unique index is the backstop, and the compare-and-swap is bypassed under a true race |
| Partial provider failure | the draft survives and nothing is published; the stage does not advance |
| Publish / repo-write failure | the approved version is not lost; the intake does not reach published and no tasks are written |
| Expired lease | a second worker reclaims and completes; the side effect happens once across the handover |

## What this pilot could not measure

- **Model generation cost** — every generation path requires a live model call, so there is no token count to report. No model was invoked, and spending to produce a pilot figure is outside this packet.
- **The existing path on the same inputs** — the existing generation path is model-driven for both student and delivery projects, so a same-inputs comparison needs the same live calls. Without it, any comparative claim here would be invented, which is exactly what the check in this report refuses.
- **Story coverage** — stories are created at the planning stage, which is database-backed and not driven at this tier. Reported as unmeasured rather than as zero gaps.
- **Approval effort in human terms** — the approval gates are among the stages this pilot does not reach, so no human decision was observed. The count of decisions observed is zero.
