# Super agent health verdicts are unfalsifiable for the departments that are broken

**Audited:** 2026-10-06 · **Session:** CC-20261006-a4k7 · **Branch:** `workstream/enterprise-agents`
**Status:** defect confirmed against production; fix in progress in this branch.

Eight super agents supervise the agent fleet. Three of them have been reporting a clean bill of
health on every single cycle for months. They are the three with nothing to supervise.

## The chain, end to end

Every one of the eight funnels through `runSuperAgentCycle()` in
`backend/src/services/agents/departments/superAgents/superAgentBase.ts`:

| # | Step | Location |
|---|---|---|
| 1 | `collectGroupStatus(group)` returns `[]` for an empty group **and** for a thrown query | `superAgentBase.ts:58-64` |
| 2 | `detectAnomalies([])` returns `[]` | `superAgentBase.ts:70` |
| 3 | `generateRecommendations([], [])` pushes `'All agents operating within normal parameters'` | `superAgentBase.ts:115` |
| 4 | `report_type: anomalies.length > 0 ? 'alert' : 'periodic'` writes `periodic` | `superAgentBase.ts:143` |
| 5 | the COO dashboard maps no-anomalies to `health: 'healthy'` as its **else branch**, and prints `agent_count` beside it | `coryBrain.ts:279-281` |
| 6 | that verdict is served to the admin UI and rendered as a department card | `coryRoutes.ts:181` -> `CoryCOOTab.tsx:125` |

Step 1 is the root: an empty department and a database outage are returned identically, so the
system cannot tell "nothing is wrong" from "I could not look".

> **Correction, 2026-10-06.** An earlier revision of this document said step 6 was the daily executive
> briefing email. That was wrong. `executiveBriefingService.ts:284` computes a `departmentReports`
> projection and **nothing renders it** - `grep "data.departmentReports"` finds only the type
> declaration, the assignment and an empty fallback, and `emailService.ts` has zero occurrences of
> "department". The verdict reaches a human through the **Cory COO dashboard**, not through email. The
> claim was made from seeing `DepartmentReport.findAll` inside the briefing service without checking
> whether the result was ever rendered, and it was caught by an adversarial grader rather than by the
> person who wrote it.

## What production says

`ENABLE_FOLLOWUP_SCHEDULER=true`. All eight are enabled and running on the half hour
(`aiOpsScheduler.ts:336-343`), staggered two minutes apart. `department_reports` holds **74,769** rows.

Registered agents per `agent_group`, against the supervisor that reads it:

| Super agent | `agent_group` | Agents | Enabled | Runs | Verdict |
|---|---|---|---|---|---|
| ContentEngine | `content_engine` | **0** | 0 | 9,265 | group does not exist |
| AnalyticsEngine | `analytics_engine` | 1 | **0** | 9,551 | sole member disabled since 2026-08-24 |
| Partnership | `partnership` | 1 | **0** | 9,146 | sole member disabled since 2026-08-24 |
| Finance | `finance` | 1 | **0** | 9,298 | sole member disabled since 2026-08-24 |
| CampaignOps | `campaign_ops` | 7 | 6 | 9,019 | real |
| LeadIntelligence | `lead_intelligence` | 7 | 5 | 9,227 | real |
| Admissions | `admissions` | 17 | 11 | 9,137 | real |
| SystemResilience | `system_resilience` | 3 | 3 | 9,547 | real |

A further **219 agents carry a NULL `agent_group`**, so they belong to no department and are
invisible to every supervisor.

Reports written in the seven days to 2026-10-06:

| Department | Reports | `metrics.total = 0` | Zero anomalies |
|---|---|---|---|
| **ContentEngine** | 335 | **335** | **335** |
| **Finance** | 336 | 0 | **336** |
| **Partnership** | 334 | 0 | **334** |
| LeadIntelligence | 336 | 0 | 0 |
| SystemResilience | 336 | 0 | 0 |
| CampaignOps | 335 | 0 | 0 |
| Admissions | 335 | 0 | 0 |
| AnalyticsEngine | 334 | 0 | 0 |

**1,005 consecutive false clean reports in one week, and a perfect inversion:** the only departments
claiming health are the broken ones. The five with real members alert on every cycle.

## Four distinct defects

**D1 — an empty group certifies health.** `ContentEngineSuperAgent` has written 9,366 `periodic`
reports and has never once produced an `alert`. A supervisor of nothing is not entitled to a verdict.

**D2 — a database failure is indistinguishable from health.** The `catch` at `superAgentBase.ts:63`
logs and returns `[]`, which flows to the same "all normal" conclusion as a genuinely healthy
department.

**D3 — disabling a broken agent silences the alarm about it.** The staleness rule at
`superAgentBase.ts:77` reads:

```ts
if (sub.enabled && sub.last_run_at && sub.last_run_at < oneHourAgo && sub.run_count > 0)
```

The `sub.enabled &&` is the defect. Finance and Partnership alerted from 2026-03-17 until
**2026-08-24** and have written only `periodic` since; 2026-08-24 is the exact date their single
subordinate last ran. The alarm went quiet because the problem got worse.

**D4 — the disabled-majority rule cannot fire for a small department.** `superAgentBase.ts:111`
requires `subordinates.length > 2`, so a department of one or two disabled agents never trips it.
Finance, Partnership and AnalyticsEngine are all departments of one.

## Why no test caught it

`generateRecommendations` and `detectAnomalies` are exported pure functions and are trivially
testable. Neither has a test. Across 159 non-test files under `backend/src/services/agents/**`,
22 are touched by any test at all; `departments/` and `reporting/` have none.

This is the operating doctrine's own case: *a self-test that cannot fail is not a check.* The
supervisors' green status is unfalsifiable for any unpopulated group, so the signal carried no
information in either direction.

## Related findings from the same audit

A fleet-wide reachability sweep (independent of the above) found **134 agent modules, 74 reachable,
60 unreachable**. Relevant to this defect:

- `departments/marketing/` holds three written agents — audience segmentation, campaign performance,
  content generation — with **zero external references**. They are the missing `content_engine`
  subordinates. There is no `marketing` agent group.
- Reachability requires four hand-maintained lists to agree (the agent file, an `aiOrchestrator.ts`
  wrapper, an `agentRegistrySeed.ts` row, a `SCHEDULE_REGISTRY` entry) and **nothing fails when they
  do not**. `aiOpsScheduler.ts:163-169` carries a comment saying the registry was exported "for
  T004's registry-shape test"; no such test exists.
- A seed row advertising `trigger_type: 'cron'` with no `SCHEDULE_REGISTRY` entry produces an agent
  the admin dashboard renders as scheduled and which never runs. At least ten agents are in that
  state.

## Two further root causes, found while fixing the first four

**D5 — `content_engine` is structurally incapable of having members.** `AGENT_GROUP_MAP`
(`agentRegistrySeed.ts:3229`) lists `ContentOptimizationAgent` and `ConversationOptimizationAgent`
under **both** `campaign_ops` and `content_engine`. `assignAgentGroups` writes with the predicate:

```ts
{ where: { agent_name: name, agent_group: { [Op.eq]: null as any } } }
```

`campaign_ops` is iterated first and claims both agents. By the time the loop reaches `content_engine`
the `agent_group IS NULL` predicate no longer matches, so the update is a **silent no-op**. Because
`agent_group` is a single column, a group defined as a duplicate subset of another group can never have
members. `ContentEngineSuperAgent` has therefore supervised nothing for seven months by construction,
not by accident, and nothing failed.

**D6 — the same defect exists a second time, through `status` instead of `enabled`.** D3 above is the
`enabled` flag silencing the staleness rule. The identical shape exists on `status`:
`detectAnomalies` only ever tests `status === 'error'`, so an **enabled** agent sitting at
`status: 'paused'` is counted as not-healthy in the arithmetic yet produces no anomaly — which yields a
report whose own summary contradicts itself:

```
summary: "Finance: health HEALTHY — 0/1 healthy, 0 errored, 1 paused. 0 anomalies detected."
recommendations: ["All agents operating within normal parameters"]
```

This has **two live producers**, and neither clears `enabled`:

- `backend/src/intelligence/agents/ExecutionAgent.ts:74`, inside the `modify_agent_schedule` handler and
  gated on `params.backoff_minutes`. An automated remediation silences the alarm about the thing it just
  remediated. (An earlier revision of this document called the handler `apply_backoff`; no handler of that
  name exists. The in-source comment says "apply backoff", the handler key is `modify_agent_schedule`.)
- `backend/src/services/aiOpsService.ts:259`, `case 'pause'` - **the operator-facing pause action**. Any
  admin pausing an agent from the dashboard produced exactly the state that reported healthy.

`AiAgent.status` is `DataTypes.STRING(20)` with no enum constraint, so an out-of-union value such as
`'crashed'` takes the same path to `healthy`.

Both were found by adversarial graders re-running and mutating the first fix, not by the fix's author.

## A finding outside this subsystem, surfaced by the same work

A reconciliation test written to assert that every cron-scheduled agent has a registry row measured
**33 `instrumentCronJob()` names with no `ai_agents` row at all** — among them
`PaySimplePaymentSync`, `AppPaymentReconcile`, `AutopayDisclosure`, `BillingWatch`, `RenewalReminders`,
`SystemHealthMonitor` and `ReliabilityAlerting`. These jobs run, and `instrumentCronJob` records their
`run_count` and `error_count` against a row that does not exist, so a silent failure and a successful
run are indistinguishable. `cronInstrumentation.ts:34-38` is explicit about it:

```ts
// If agent not in registry, run untracked
if (!agent) { await traced(); return; }
```

That is billing and payment-reconciliation work running with no governance gate and no run accounting.
It is outside the scope of this fix and is recorded here so it is not lost.


## D7 - one employee, three timers, one counter

Found by the reconciliation guard while grading it, and verified directly.

`agentRegistrySeed.ts:2477` declares the Curriculum employee:

```ts
{ agent_name: 'Dara', trigger_type: 'event_driven', schedule: '' }
```

`aiOpsScheduler.ts` registers **three** `SCHEDULE_REGISTRY` entries under that same name:

| Line | Schedule | Duty |
|---|---|---|
| 356 | `10 6 * * *` | Curriculum director |
| 358 | `30 6 * * *` | Certification director |
| 364 | `15 6 * * *` | Targeted research sweep |

So three timers fire her every morning while her own row advertises no schedule at all, and the admin
dashboard renders the row. Production confirms the accounting cost: `run_count` **57**, `error_count` 0,
pooled across all three duties on one row, so a silent failure in any one of them is indistinguishable
from the other two succeeding.

Nothing asserts uniqueness of `agentName` within `SCHEDULE_REGISTRY` (the seed rows get a uniqueness
assertion; the registry rows do not), which is why a three-way duplicate is silent. By contrast `Reese`,
the reference employee the programme is modelled on, has `run_count` **0** and has never executed.
