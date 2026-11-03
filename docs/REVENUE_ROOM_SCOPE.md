# The Revenue Room — scope and ticket ladder

**Date:** 2026-11-03 · **Session:** CC-20261102-r7m3 · **Requested by:** Ali
**Status:** SCOPE FOR APPROVAL. No code written. No tickets worked.

---

## What Ali asked for, in one paragraph

Ram should be able to open one page, see every source of revenue Colaberry has or is
chasing, click any one of them, and get the whole story behind it — the timeline of what
has happened, every document produced on the way, the meetings held, who we are in talks
with, the deadlines ahead — and then **ask questions of it in plain English instead of
asking Ali**. It has to be live: if something happens that relates to a revenue source,
it shows up. It must work for initiatives that are still speculative as well as ones that
are mature, and it must be honest about which is which. Later the same content goes out
as an email.

The near-term goal is **not** "it is finished". It is: *here is the plan, here is what is
already real, and you can watch it fill in.*

---

## The decisive finding: most of the spine already exists

This is the part that makes the plan credible rather than aspirational. Measured
read-only against production on 2026-11-03.

| Thing we would have had to build | Status | Evidence |
|---|---|---|
| A revenue-opportunity record with evidence attached | **ALREADY SHAPED, AND ALREADY WRITTEN TO BY TWO SERVICES** | `revenue_opportunities` carries `evidence jsonb`, `attribution_chain jsonb`, `recommended_actions jsonb`, `estimated_value`, `confidence`, `deal_closed_at`, `entity_type`/`entity_id`. **0 rows** — see the correction below; the write path exists but never fires. |
| A board that refuses to fake a number | **ALREADY BUILT** | `/admin/commercialization` with a five-state provenance vocabulary (Measured / Proxy only / Measured zero / Undefined / Not yet measurable). |
| Revenue hypotheses with dated kill conditions | **ALREADY BUILT** | `hypothesisRegister.ts` — 5 bets, each with dated tripwires and a kill condition. |
| A ten-stage commercial funnel with evidenced triggers | **ALREADY BUILT** | `funnelStages.ts` — every stage names its table, column and value. |
| A government proposal pipeline | **ALREADY BUILT, AND RUNNING** | `gov_qualifications`, `gov_proposal_documents`, `gov_proposal_response`, `gov_submission`, `gov_source_bundles`, `gov_build_story_evidence`. |
| A weekly commercial report | **ALREADY BUILT** | `weeklyCommercialReport.ts`. |
| Artifact-to-entity linking | **EXISTS** | `services/commercialization/accountArtifactLinkService.ts`. |

**So this is an assembly job far more than an invention job.** The gaps are real but
narrow: nothing links evidence to initiatives, and there is no per-initiative drill-down
or Q&A.

### Correction, same day, after a full capability inventory

An initial pass of this document claimed "nothing writes `revenue_opportunities`". **That
was wrong**, and the correct version changes what R2 should do.

**Two live write paths already exist:**

- `services/reporting/revenueOpportunityService.ts` — `scanForOpportunities()` does a
  `findOrCreate` over Leads scoring ≥ 70 in late pipeline stages, driven by the cron
  wrapper `services/agents/reporting/revenueOpportunityAgent.ts`.
- `services/agents/openclaw/openclawConversionDetectionAgent.ts` — creates a row when an
  OpenClaw conversation reaches stage 6.

**The table is empty because both writers are conditional and their conditions have never
been met, not because nothing can write.** A writer that is never invoked and a writer
whose predicate never matches look identical from the table — which is the same "confident
zero" failure this project keeps running into. R2 must therefore first establish whether
the cron runs in production at all.

Four other corrections from the same inventory, now posted as comments on the tickets:

| What changed | Effect |
|---|---|
| **Email ingestion already exists and is the most mature subsystem in the repo** — `inbox_emails` plus three live transports (Gmail, MS Graph, IMAP), with scheduling, classification and scoring on top. | **R8 is a linking job, not an ingestion build. Promote it to P1.** |
| **No backend service reads the Basecamp vault.** Todos and comments are mirrored by `bcSyncService` into `ops_bc_todos`; vault upload exists only in script-land and is not callable from the API. | The PDF-artifact half of **R5 is net-new backend work**, not wiring. |
| **There is no vector retrieval on any Q&A surface.** `queryKbForCora` is `String.includes`; the only pgvector code depends on an external Python proxy and silently degrades to `ILIKE`. | **R6 must budget for building retrieval.** The agent shape is reusable; the grounding is not. |
| **`strategicAccountService.ts` has zero callers** — `promoteToStrategicAccount`, `linkLeadToAccount` and `backfillLeadOrganizations` are wired to nothing. Funnel stage 1 counts `organization_type='strategic_account'` and reads zero. | **A shipped function would populate the top of the funnel and nothing calls it.** Cheapest capability in the system to light up. |

Also worth knowing for R1: `getFunnelSnapshot()` and `buildWeeklyReport()` have **no HTTP
route**. A meaningful share of R1 is wiring existing services to routes rather than
building services.

### The active proposals — and why the system cannot identify its own pipeline

**Corrected 2026-11-03.** An earlier pass of this document claimed there were "exactly
two" bids at `decision = approved_bid_pursuit` AND `status = active`, and "eight more" at
`needs_evidence`. **Both numbers were wrong.** Measured across all 166 rows of
`gov_qualifications`:

| `decision` + `status` | Rows |
|---|---|
| `pending_review` / `superseded` | 85 |
| `pending_review` / **active** | 21 |
| `needs_evidence` / `superseded` | 19 |
| `needs_evidence` / **active** | **18** (claimed: 8) |
| **`approved_bid_pursuit` / active** | **12** (claimed: 2) |
| `approved_bid_pursuit` / `superseded` | 11 |

The error came from reading the top of a 20-row `ORDER BY updated_at DESC` listing and
treating it as the filtered set. The two originally named are simply the two most recently
created (both 2026-11-02), which is why they surfaced first.

**And the 12 are not twelve clean pursuits.** Three have no `delivery_project_id` at all.
One is named *"Snow College Adult Learner - T8 test"*. And *"RFP — Enterprise Work Order
Management System"* appears **twice**, under two different project ids, created 2026-10-27
and 2026-11-02.

So **a status flag cannot be the Room's definition of a live proposal.** The strongest
corroborating signal is whether a proposal document exists, and only three projects have
any:

| Project | `delivery_project_id` | Proposal docs | Submissions |
|---|---|---|---|
| Statewide Victim-Centered Information System | `c38e6fc4` | **5** | 0 |
| 2026 Saratoga Springs Municipal Asset Management and Permitting Software Solution RFP | `3867b241` | 3 | 0 |
| RFP — Enterprise Work Order Management System | `80b35be2` | 1 | 0 |
| RFP — Enterprise Work Order Management System | `13ec298d` | **0** | 0 |

That is three distinct projects; Ali said two; and **the one with the most documents is the
one he did not name.** No code change resolves that — it needs Ali to confirm which are
genuinely live. Hence R2 now leads with a confirmation report rather than a write.

**A further correction inside the duplicate pair.** This document previously recorded
`13ec298d` as *the* live Enterprise Work Order bid. That copy has **no proposal document**;
its twin `80b35be2` holds the one document. If the bid is live, the copy carrying the work
product is likely the one to keep — but the rows do not settle that, so it is Ali's call.

**And the second tier cannot be rendered yet.** All **18** `needs_evidence`/active rows have
a null `delivery_project_id`. There is no name to display and no project to attach evidence
to, so the earlier recommendation to show them as visible pipeline-behind-pipeline stands in
principle but cannot be executed as described. Linking them is its own piece of work.

Confirmation report: `docs/REVENUE_ROOM_R2_BID_CONFIRMATION.html`.

Context that still holds:

- **`gov_submission` holds zero rows.** Nothing has been submitted, so no bid may be
  reported as "submitted". They are *in pursuit*.
- **`accepted_at` is null on every proposal document.** Drafted, not accepted.
- **No bid carries a dollar value anywhere in the system** — and `gov_qualifications` has
  no column for a due date, deadline, close date, submission date, or value at all. **So
  the estimated value must come from Ali**; inventing one would breach the Claim Registry
  rule (C0.6: no row, no claim). This also leaves R9's "next deadline" with nothing to
  read for gov bids.

---

## Architecture: four layers

The design principle is inherited from the commercialization board and is not negotiable
here either: **an initiative with no evidence says so, rather than rendering as empty.**

```
  4. ASK            "Ask this initiative" — grounded Q&A, citations only from layer 1
       |
  3. SURFACE        Revenue Room (card grid)  ->  drill-down (timeline + documents)
       |
  2. LINK           evidence_links: any artifact  ->  any revenue initiative
       |
  1. INGEST         Basecamp (todos, comments, vault) · email threads · meetings
                    · gov proposal docs · PRs & session logs · funnel events
```

### Layer 1 — Ingest
Pull from where the work already happens. Ali's words: *"All the details are in BC and my
email and get put all in BC."* Basecamp is therefore the primary spine, email second.

### Layer 2 — Link
One join table, `evidence_links`, mapping `(source_system, source_id)` to
`(initiative_type, initiative_key)` with a `relation` and an `observed_at`. Every surface
above reads only this. **This is the keystone — build it before anything above it.**

### Layer 3 — Surface
- **Revenue Room** — one card per revenue source. Status, owner, next deadline, provenance
  chip, last activity. Cards are clickable.
- **Drill-down** — per-initiative page: a chronological timeline of everything that
  happened, a documents panel, the deadlines, the people, and the open questions.

### Layer 4 — Ask
Q&A scoped to **one initiative's linked evidence only**, answering with citations back to
the source document. It must refuse when it has no evidence rather than generalize — the
same discipline as the board. A confident answer with nothing behind it is the failure
this whole system exists to prevent.

---

## The ticket ladder

Prefix **R** for Revenue Room. Priority reflects two things: what Ram can see soonest,
and what everything else depends on.

### P0 — the first thing Ram opens

**R1 · The Revenue Room shell**
One page listing every revenue source as a card: the 5 hypotheses, the 2 active bids, the
8 qualifying bids, membership, self-paced. Each card: name, type, status, owner, next
deadline, last activity, provenance chip. Real data where it exists; the five-state
vocabulary where it does not. Cards are clickable but the drill-down may stub initially.
*This is the artifact Ali shows Ram.*

**R2 · The active proposals as recorded pipeline**
**Revised 2026-11-03 after the diagnosis below.** Step 1 is a confirmation report listing
all 12 `approved_bid_pursuit`/active bids with their document and submission evidence,
duplicates and test rows marked, so Ali names the genuinely live ones and supplies a value
for each. Step 2 is an idempotent sync that writes `revenue_opportunities` rows for *only*
the confirmed bids, keyed on `delivery_project_id`, through the existing service rather
than a third code path. That lights up three tiles on the existing commercialization board
(qualified pipeline, proposal value out, and the win-rate denominator), so it part-pays
C8.4 as a side effect.

**Do not resurrect the lead scanner inside this ticket.** A government bid is not a scored
Lead and will never satisfy its predicate. See R11.

**R3 · The evidence spine (`evidence_links`)**
The join every surface reads. Additive schema, one table, no rewrite of anything existing.
Blocks R4 through R9.

### P1 — the thing that makes it worth opening twice

**R4 · Drill-down: timeline and documents per initiative**
The page behind each card. v1 sources: Basecamp todos and comments, `gov_proposal_documents`,
PRs, session logs.

**R5 · Basecamp ingestion**
Scheduled pull of todos, comments and vault documents (including the PDF artifacts already
produced by the ticket process) into the evidence spine. Idempotent, keyed on Basecamp id.

**R6 · "Ask this initiative"**
Grounded Q&A per initiative over its linked evidence, with citations and an explicit
refusal path.

**R8 · Email ingestion** — *promoted from P2 on 2026-11-03, approved by Ali*
Thread-to-initiative linking so the correspondence behind a deal is part of its record.
Promoted because the mail is **already mirrored**: `inbox_emails` is fed by three live
transports (Gmail, Microsoft Graph, IMAP). This is a linking job, not an ingestion build —
cheaper than R7 and higher value, since correspondence is where a deal actually moves.

### P2 — live-ness

**R7 · Meetings and "in talks with"**
Calendar events and `interaction_outcomes` as timeline entries, so a conversation in
progress is visible before it produces a document.

**R9 · Deadlines and monitoring**
Per-initiative next deadline, hypothesis tripwire dates, overdue flags, and a change feed —
the half Ram actually monitors rather than reads.

### P3 — distribution

**R10 · The email edition**
Weekly Revenue Room digest to Ram, same content, same honesty rules. Extends
`weeklyCommercialReport.ts` rather than starting a second reporting path.

### Split out of R2 by the 2026-11-03 diagnosis

**R11 · Fix the revenue-opportunity lead scanner** — *P1, due 2026-11-12*
`scanForOpportunities()` cannot run (module never imported), its `ai_agents` row advertises
a cron that has never fired, two of its three stage literals are not values of the column,
and the high-score and late-stage populations are near-disjoint. **1,100 high-intent leads
are invisible to it.** Kept out of R2 on purpose: a government bid is not a scored Lead and
would never satisfy that predicate, so entangling them would hide both problems.
https://app.basecamp.com/3945211/buckets/7463955/todos/10472280542

**R12 · Link the 18 orphan gov qualification rows** — *P2, due 2026-11-19*
All 18 active `needs_evidence` rows have a null `delivery_project_id`, as do 3 of the 12
`approved_bid_pursuit` rows. Until they are linked there is no name to display, so the
second tier cannot be rendered as named pipeline.
https://app.basecamp.com/3945211/buckets/7463955/todos/10472280590

---

## What I need from Ali

1. **A dollar value and confidence for each of the two active proposals.** Not in the
   system and not inferable. Without it R2 records them with value `null`, which is honest
   but much less useful to Ram.
2. **Whether the eight `needs_evidence` bids appear in the Room.** Recommend yes, visibly
   separated — they are the top of the gov funnel and hiding them makes the pipeline look
   thinner than it is.
3. **Who Ram is, in the access model.** He will need to open admin surfaces. Recommend an
   admin account rather than a new role, since ESC-002 already shows the tenancy filter is
   a no-op and inventing a role now would be a boundary with nothing behind it.

---

## What I am deliberately not promising

- **Not real-time.** Scheduled ingestion, minutes to hours behind. Ali's word was "live";
  what this delivers is *current*, not streaming, and the pages will say when they last
  synced.
- **Not automatic linkage for everything.** Some evidence will need a human to say which
  initiative it belongs to. The design makes that one click rather than a data-entry job,
  but it is not zero.
- **Not a dollar figure nobody measured.** Where value is unknown the Room will say
  unknown. That is the rule that makes everything else on the page trustworthy.
