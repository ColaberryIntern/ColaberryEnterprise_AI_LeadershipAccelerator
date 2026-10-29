# AF3.3 — The consolidation map, and the reconciliation of 246 against the registry

Ticket: https://app.basecamp.com/3945211/buckets/7463955/todos/10406234458
Session: CC-20261028-w7k5 · all figures measured 2026-10-28, read-only

**What this document settles:** every legacy agent is accounted for, the gap between 246 and the
live registry count is named rather than hand-waved, and the 21 undomained rows carry the measured
evidence an owner needs.

**What it does NOT settle:** the disposition of those 21. That is **AF6.1**, it is Ali's decision,
and `_unresolved.json` still reads `needs_owner_decision: true` with every disposition left at
`unresolved`. A test pins both, deliberately.

---

## 1. The number reconciliation

Four different counts have circulated. Here is what each one is, and why they differ.

| Count | What it actually is |
|---|---|
| **217** | The figure quoted on the 14 Oct call. **Not reproducible** — AF3.2 established this and said so. |
| **257** | Also quoted. Not reproducible either; AF3.2's conclusion was *"the claim should be 152, not 257."* |
| **246** | Rows in `LEGACY_AGENT_CLASSIFICATION.csv`. This is the classified population and the one that reconciles. |
| **269** | `ai_agents` rows in production, measured 2026-10-28. 177 of them enabled. |

**246 and 269 reconcile exactly, with nothing left over:**

```
  246  classified legacy names (the CSV)
+  23  registry rows created AFTER the classification was cut
= 269  ai_agents rows in production on 2026-10-28
```

Checked both directions, which matters: **all 246 CSV names are present in the registry (0
missing)**, and **23 registry rows are absent from the CSV**. Neither set has a stray.

Those 23 are not unclassified legacy agents. They are:

- **9 `*DomainAgent` rows**, all created 2026-10-18 — the new ten-domain employees. Admissions,
  Executive, Internship, LearnerSuccess, Marketing, Platform, ProductExperience, Sales, Website.
- **`Dara`**, created 2026-09-16 — the **tenth** domain employee. Curriculum has no `*DomainAgent`
  row because `agent_domain_projects.curriculum.agent_id` already pointed at the existing Dara
  row, which is also why `DOMAIN_AGENT_ENTRIES` carries no curriculum entry. So the ten are nine
  plus Dara.
- **13 newer agents and sweeps** created between 2026-09-16 and 2026-10-29, after the CSV was
  cut: `ApprovalRequestTimeoutSweep` (3,686 runs), `DaraPresenceHeartbeat` (61,194),
  `CommercializationWeeklyReport`, `CurriculumVideoLinkHealth`, `DeptCampaignPerformanceAgent`,
  `ExplorerDraftRender`, the four `GrowthJourney*` rows, `ProgressionLadderSweep`,
  `ReeseTicketFollowUpSweep`, and **`Maya`** (created 2026-10-27, disabled, 0 runs).

`Maya` is worth a note beyond this ticket: it is the name the admissions builder chose for her
agent, and the row predates her choosing it by a day. See AF10.6.

**So "we are going to take these 217 agents and knock it down to 10" is better stated as: 246
classified legacy rows consolidate onto 10 domain employees, 225 of them already mapped.** The
217 and 257 figures should stop being quoted; AF3.2 already retired them and this reconciliation
is consistent with that.

---

## 2. The map: 225 of 246 onto the ten domains

From `proposed_owner_domain` in the CSV. The per-agent detail is the CSV itself and the ten
`capabilities/*.json` files; this is the shape of it.

| Target domain | Legacy rows inherited |
|---|---|
| Executive Intelligence & Governance | 75 |
| Marketing Intelligence & Brand | 40 |
| Platform Automation & Reliability | 38 |
| Admissions & Applicant Experience | 28 |
| Sales, Enrollment & Subscriptions | 16 |
| Learner Success (Reese) | 11 |
| Curriculum, Learning & Certification | 8 |
| Website Portfolio & Conversion | 8 |
| Internship & Career Readiness | 1 |
| **Domained total** | **225** |
| *(undomained, section 3)* | *21* |
| **Total** | **246** |

That 225 + 21 = 246 identity is enforced by `capabilityRecord.test.ts`, with a positive control
asserting the CSV really holds 246 rows and another proving the reconciliation can fail.

Two things the distribution says out loud. **Executive carries a third of the estate** (75 of
246), so whoever owns that domain inherits the largest capability surface by a wide margin. And
**Internship inherits exactly one legacy row**, so that domain is almost entirely new build
rather than consolidation.

---

## 3. The 21 undomained rows — measured, and ready for AF6.1

### The correction

`_unresolved.json`'s comment said **"Five of these are live production rows."** Measured against
production on 2026-10-28, **thirteen of the 21 are enabled**, and between them they have run
**1,491,129 times**.

Five is the count of rows whose *proposed kind* is `unresolved`. It was being read as the count of
live rows. The decision is two and a half times larger than the record implied, and
`unresolvedBucketMeasured.test.ts` now pins the real figure so the sentence cannot rot back.

### What the 21 actually look like

| Proposed kind | Rows | Enabled | Runs between the enabled ones |
|---|---|---|---|
| **retire** | 8 | **0** | **0** |
| **behavior** | 8 | **8** | 178,937 |
| **unresolved** | 5 | **5** | 1,312,192 |

**The eight proposed for retirement are all dark — disabled, zero runs, every one.** That is the
single most useful fact in this document: retiring them risks nothing, and it is the cheapest
third of the decision.

`Alumni_Outreach_Agent`, `Alumni_Reengagement_Agent`, `Alumni_Referral_Agent`,
`Corporate_Training_Agent`, `Employer_Relationship_Agent`, `Enterprise_Partnership_Agent`,
`Opportunity_Detection_Agent`, `Trend_Detection_Agent`.

**The eight behaviors are all live**, so none can be dropped quietly:

| Agent | Runs |
|---|---|
| SessionLifecycle | 65,323 |
| BehavioralSignalDetector | 32,623 |
| BehavioralTriggerEvaluator | 32,516 |
| IntentScoreRecomputer | 21,399 |
| OpportunityScoreRecomputer | 15,837 |
| SessionReminders | 10,886 |
| ICPInsightComputer | 228 |
| PortfolioGitHubSyncAgent | 125 |

**The five genuinely unresolved are also all live, and one of them dominates the estate:**

| Agent | Runs |
|---|---|
| **visitor_tracker** | **1,300,725** |
| forecast_engine | 9,351 |
| intent_scorer | 1,954 |
| revenue_aggregator | 150 |
| calendar_intent_booster | 12 |

`visitor_tracker` alone is 87% of all runs across the undomained set. Whatever domain takes it
inherits the busiest agent in this bucket by three orders of magnitude.

### Why these 21 resist a domain

Each row's `reason` field carries the measured answer with a file and line. The recurring pattern
is genuine dual ownership rather than missing information — `BehavioralSignalDetector`'s reason is
representative: *"visitor intent scoring serves both marketing and sales; not assigned."* These
are not unclassified through neglect; they are unclassified because a single owner is not
obviously correct, which is exactly why AF6.1 is an owner decision and not a cleanup task.

---

## 4. What is needed from Ali (AF6.1)

Three decisions, in increasing difficulty:

1. **Confirm the eight retirements.** All dark, zero runs. Lowest-risk item in the Agent Factory.
2. **Assign a domain to each of the eight live behaviors.** Mostly the marketing-versus-sales
   split on intent scoring.
3. **Decide the five unresolved**, `visitor_tracker` first, because it is the one with real
   volume behind it.

Nothing is retired, disabled or reassigned by this document. It records and measures; AF6.1
decides. This ticket also unblocks **AF7.1**, which needs to know what each of the ten agents is
responsible for.

---

## Provenance

- Registry figures: read-only `SELECT` against production `ai_agents`, 2026-10-28, pool closed.
- Classified population: `docs/architecture/ai-workforce-management/LEGACY_AGENT_CLASSIFICATION.csv`.
- The 21 and their reasons: `backend/src/services/agentDomain/capabilities/_unresolved.json`,
  now also carrying a `measured` block per row.
- Enforced by `capabilityRecord.test.ts` (the 225 + 21 = 246 reconciliation) and
  `unresolvedBucketMeasured.test.ts` (the measured evidence and the thirteen-not-five correction).
