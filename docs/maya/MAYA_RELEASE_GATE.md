# Maya release gate: the ordered ladder that actually turns her on

**Ticket:** MR5 (`Design Explorer Growth`, todo 10503714732) | **Owner of every rung marked ALI:** Ali
**Companion document:** [`MAYA_PROMOTION_CHECKLIST.md`](./MAYA_PROMOTION_CHECKLIST.md) — the
per-capability promotion layer. This document does **not** repeat it.

NOTHING SENDS is the standing rule of this workstream. This ladder is the only sanctioned way to
stop that rule applying, one rung at a time, each with evidence before the next.

---

## Read this first: what this document is and is not

Maya's release is not one switch. It is **fifteen rungs** — eleven on the engine and four on Maya
herself — spread across env flags, database rows, agent records and promotion records, held by
different people. **Thirteen of them are actions. Two of them are reading what the previous rung
produced**, and those two are the ones most likely to be skipped. The last rung cannot be undone
quietly, because by then a message will have reached a person.

| | |
|---|---|
| **This document covers** | the whole cross-layer ladder: classification, the journey engine, the agent rows, the env flags, the rollout control, and Maya's own grants |
| **The promotion checklist covers** | how one capability moves shadow → live, who may do it, and the four verify/revert cycles |
| **Neither covers** | anything not yet built. Where a rung depends on unfinished work, it says so |

**Climb in order.** The order is not a preference; rungs 1-3 are prerequisites that make rungs
4-11 produce visible output instead of silence.

---

## The correction that changes where you start

**The advice "turn on `GROWTH_JOURNEY_EXECUTION_ENABLED` and see what happens" is wrong, and it
was my advice until 2026-11-12.** Here is why.

The decision engine's input is **`growth_journey_classifications`**, grouped by `subject_ref`
(`decisionService.ts:437-442`). It is **not** `growth_journey_enrollments`. Measured in production
on 2026-11-12:

| Table | Rows |
|---|---|
| `growth_journey_enrollments` | **220** (all enrolled 2026-09-11) |
| `growth_journey_classifications` | **0** |
| `growth_journey_decisions` | 0 |
| `growth_journey_executions` | 0 |
| `growth_journey_execution_controls` | 0 |
| `journey_programs` | 4, **all `draft`** |

With classifications at zero, the engine produces **zero decisions** no matter what else is true:
every flag on, every agent enabled, a programme activated, a rollout control in place. Starting at
the execution flag therefore produces **silence that looks like a broken deploy**, and the
reasonable response to that is to start turning more things on — which is the worst possible
direction to be moving in.

**So the order is: classify, then decide, then permit, then execute.**

Two more facts that save a wasted step each:

- **Activating a programme is not needed for decisions.** The nightly decider accepts
  `['draft','active','paused']` (`runShadowDecisionsNightly.ts:127`). Only the *executor* requires
  `status='active'` (`runExecutor.ts:129`). So programme activation belongs on the execution half
  of the ladder, not the decision half.
- **A rollout control row DENIES by default.** This is the asymmetry that catches people:

  | Control | No row means |
  |---|---|
  | **pause** | nothing is stopped — a pause **allows** by default |
  | **rollout** | nothing is permitted live — a rollout **denies** by default |

  `resolveExecutionMode.ts:143` is literally `if (!rollout) return result('shadow','no_rollout')`.
  With `growth_journey_execution_controls` empty, **every scope is shadow** regardless of flags.
  There is deliberately no global rollout scope; the global stop is `system_kill_switch`.

---

## How to see the whole state at once, before you touch anything

Run these three. All are read-only and all are safe with every flag off.

```bash
# 1. The 22-item ordered checklist. `next_move` is the first blocked rung.
docker exec accelerator-backend node dist/scripts/growthJourneyLaunchReadiness.js

# 2. Per brand x programme x channel: the live mode answer and the reason.
docker exec accelerator-backend node dist/scripts/growthJourneyExecutionStatus.js

# 3. Every Maya capability's mode, with the promotion history.
curl -s -H "Authorization: Bearer <admin token>" \
  https://enterprise.colaberry.ai/api/admin/maya/capabilities
```

As of 2026-11-12, `next_move` from the first command is a **classification** item. If it ever
reports `execution_flag` while classifications are zero, the checklist is wrong and this document
is wrong with it.

---

## The ladder

Each rung: **who owns it**, **the evidence it worked**, **the way back**. Rungs 1-10 are
reversible and observable. **Rung 11 is the one that cannot be undone**, and it is last on purpose.

### Rung 1 — Classify the enrolled subjects · OWNER: ALI (one command)

Nothing downstream produces output until this is non-zero.

- **Do:** run the classification pass for one brand.
  `docker exec accelerator-backend node dist/scripts/growthJourneyClassifyDryRun.js` first, to see
  what it would write.
- **Evidence:** `SELECT count(*) FROM growth_journey_classifications;` is greater than zero, and
  the readiness checklist's `classifications_present` item flips to ready.
- **Rollback:** `DELETE FROM growth_journey_classifications WHERE brand_id = '<brand>';` —
  classifications are derived, so deleting them loses nothing a re-run cannot rebuild.
- **Stop if:** the count stays zero after a successful run. That means the subjects are not
  resolving, and no later rung will help.

### Rung 2 — `GROWTH_JOURNEY_ENABLED=true` · OWNER: ALI (env, needs a deploy)

The master. While it is off, every journey admin route answers **404** and every capability is
off regardless of its own flag.

- **Evidence:** `growthJourneyLaunchReadiness` shows `master_flag` ready; the journey admin routes
  stop 404ing.
- **Rollback:** unset it and redeploy. Nothing persists from this rung.
- **Note:** only the exact string `true` enables it. `TRUE`, `1`, `yes` and `on` are all off.

### Rung 3 — `GROWTH_JOURNEY_DECISIONS_ENABLED=true` · OWNER: ALI (env, needs a deploy)

Decides and records. **Contacts nobody.** The flags module says so itself, and three separate
places enforce the separation.

- **Evidence:** the ladder answers `shadow` with reason `flag_execution_off` rather than `observe`
  with `flag_decisions_off`.
- **Rollback:** unset and redeploy.

### Rung 4 — Enable the `GrowthJourneyShadowDecisions` agent row · OWNER: ALI (one UPDATE)

The cron exists and fires; `instrumentCronJob` skips the run while `enabled=false`.

- **Do:** set `enabled=true` on that `ai_agents` row.
- **Evidence:** `last_run_at` becomes non-null after the next scheduled run, and
  `growth_journey_decisions` starts filling.
- **Rollback:** set `enabled=false`. Durable — the seed's `enabled: false` is honoured on first
  creation only, so it will not revert itself.
- **Stop if:** `last_run_at` moves but no decision rows appear. Go back to rung 1.

### Rung 5 — READ THE DECISIONS. · OWNER: ALI (judgement, not a switch)

**This is the rung the whole ladder exists to make possible, and it is the one most likely to be
skipped.** Every row is shadow: a record of what she *would* have done, delivered to nobody.

- **Do:**
  ```bash
  docker exec accelerator-backend node dist/scripts/growthJourneyDecideDryRun.js \
    --lead <id> --brand <brand uuid> --no-persist --sentence
  ```
  `--sentence` prints one plain sentence per decision instead of a thirty-field JSON document. A
  shadow decision reads *"X would be contacted ... only if this were live"* — the conditional
  grammar is deliberate, so a dry run can never be mistaken for a log of sent messages.
- **Evidence:** you have read enough of them to say whether the engine is choosing sensibly, for
  whom, on what channel, and why.
- **Rollback:** none needed. Nothing happened.
- **Stop if:** a decision names somebody who should not be contacted, or a channel that does not
  make sense for them. Fix the rules and re-decide. **Do not proceed to rung 6 to see if it looks
  better live.**

### Rung 6 — Write the first rollout control row · OWNER: ALI (one POST)

Until this row exists, every scope is `shadow/no_rollout`. **One brand, one programme, one
channel, under a daily cap.**

- **Do:** see the row first, without writing it:
  ```bash
  docker exec accelerator-backend node dist/scripts/growthJourneyExecutionStatus.js \
    --plan-rollout '<brand uuid>|<programme uuid>|in_app'
  ```
  then `POST /api/admin/growth-journey/execution/rollouts` with that scope.
- **Mode `review`, not `limited`.** `review` files a proposal and claims nothing; `limited`
  executes under a cap. Start where the output is something to read rather than something to undo.
- **Evidence:** `growthJourneyExecutionStatus` shows that one scope at `review` with the control
  row covering it; every other scope still `shadow/no_rollout`.
- **Rollback:** `POST .../rollouts/:id/clear`. Rows are written once and cleared, never edited, and
  only `cleared_at IS NULL` rows count — so clearing is complete and immediate.

### Rung 7 — Activate ONE journey programme · OWNER: ALI (one UPDATE)

Execution only. The decider already accepted `draft`.

- **Do:** set `status='active'` on one `journey_programs` row. **One**, not four.
- **Evidence:** readiness shows `programmes_active` at 1 of 4; the executor's plan stage stops
  iterating nothing.
- **Rollback:** set it back to `draft`. The executor stops finding it on the next run.

### Rung 8 — Enable the `GrowthJourneyExecutor` agent row · OWNER: ALI (one UPDATE)

Still cannot contact anybody: rung 9 is a separate switch.

- **Evidence:** `last_run_at` moves; `growth_journey_executions` may gain `approved` rows, which
  are proposals rather than sends.
- **Rollback:** `enabled=false`.

### Rung 9 — The Explorer channel flag for the channel you chose · OWNER: ALI (env, needs a deploy)

`EXPLORER_GROWTH_OS_ENABLED` is already `true`. Then **one** of:

| Channel | Flag |
|---|---|
| `in_app` | `EXPLORER_IN_APP_NUDGE_ENABLED` |
| `ali_outreach` | `EXPLORER_ALI_OUTREACH_ENABLED` |
| `email` | **none** — email is not gated by the Explorer family at all |

- **Evidence:** readiness shows `explorer_channel_flags` reporting that channel open.
- **Rollback:** unset and redeploy.

### Rung 10 — Review what the executor proposed · OWNER: ALI (judgement, not a switch)

In `review` mode each execution is a proposal. Read them before rung 11.

- **Evidence:** `growth_journey_executions` holds rows at `pending_review`, and you have read them.
- **Rollback:** none needed. Nothing has been sent.

### Rung 11 — `GROWTH_JOURNEY_EXECUTION_ENABLED=true` · OWNER: ALI · **IRREVERSIBLE IN EFFECT**

`growthJourneyFlags.ts:77` calls this *the only flag that can cause a person to be contacted*. The
flag itself unsets cleanly. **A message that has reached somebody does not.**

- **Before you flip it, all of these should be true:**
  - rungs 1-10 complete, with rungs 5 and 10 actually read rather than skipped;
  - exactly one rollout control row exists, at `review`, with a daily cap;
  - exactly one programme is active;
  - `system_kill_switch` exists and is `false` (an absent row reads as off, but off and never-set
    are indistinguishable until the row exists);
  - you know which people are in scope, by name, from rung 5.
- **Evidence:** `growth_journey_executions` gains rows that move past `approved`, and the people
  named in rung 5 can confirm receipt.
- **Rollback:** unset the flag and redeploy **and**, for an immediate stop with no deploy,
  `POST /api/admin/system/kill-switch {"activate": true, "reason": "..."}`. The kill switch stops
  every outbound agent and campaign on the platform within one run, and `{"activate": false}`
  restores exactly the promoted states.

---

## Maya's own rungs, which are separate from the engine's

The engine decides *what* to send. These control whether **Maya** is the one who sends it. They can
be climbed in parallel with rungs 1-10, and **rung M4 must not precede rung 11**.

### M1 — Enable Maya's `ai_agents` row · OWNER: ALI

`enabled=false` today, `status` idle, `last_run_at` **NULL** — she has never run as a scheduled
agent. `readAgentGate` refuses any granted tool while this is false.

- **Rollback:** `enabled=false`.

### M2 — Grant `send_email` in the registry · OWNER: ALI (code + deploy)

`agentRegistrySeed.ts:3326` records it as **deliberately absent**. `ai_agents.tools_granted` is
read by `readAgentGate`, so this grant is load-bearing rather than documentary.

- **Evidence:** `tools_granted` contains `send_email`; `readAgentGate` stops answering
  `tool_not_granted`.
- **Rollback:** remove the grant.

### M3 — Give her a brand scope · OWNER: ALI

Without a `campaignId` the brand and consent checks do not run, so `agentEmailTool` short-circuits
to `no_brand_scope` and **drafts instead of sending**. That is correct behaviour, not a bug.

- **Rollback:** remove the scope; she returns to drafting.

### M4 — Promote a capability shadow → live · OWNER: ALI or a super_admin only

Follow [`MAYA_PROMOTION_CHECKLIST.md`](./MAYA_PROMOTION_CHECKLIST.md). It has the routes, the
authorization rules, the per-capability preconditions and the promote → verify → revert → verify
cycle. **Not repeated here.**

Her five capabilities and their current state:

| Capability | Default | Also needs |
|---|---|---|
| `respondToExplorerDm` | **live** | `ENABLE_CHAT` |
| `sendInAppWelcome` | shadow | execution flag **and** `EXPLORER_IN_APP_NUDGE_ENABLED` |
| `createJourneyHandoff` | shadow | `GROWTH_JOURNEY_HANDOFFS_ENABLED` |
| `readPerson360` | shadow | `GROWTH_JOURNEY_DECISIONS_ENABLED` |
| `sendEmail` | shadow | **the execution flag** — see the checklist's `sendEmail` section |

**No Maya promotion record exists in `system_settings` today.** The only Maya keys are
`ai_maya_auto_popup` and `ai_maya_visitor_delay_seconds`, so every governed capability sits at its
compiled default.

---

## The stop condition

**Halt the ladder and un-flip the last rung if any of these is observed.** No judgement call
required; each is a fact.

1. A person reports receiving something they did not expect, or that is wrong.
2. A decision in rung 5 or a proposal in rung 10 names somebody who should not be contacted.
3. A ledger or receipt count rises faster than the daily cap allows.
4. `growth_journey_executions` gains a row with no matching provider id — meaning something
   reported a send that cannot be traced to a delivery.
5. A `maya_email_ledger` row shows `delivered_at` set while the matching `email_send_ledger` row
   is not `sent`.
6. Anything at all that you cannot explain within five minutes.

**How to stop:** `POST /api/admin/system/kill-switch {"activate": true, "reason": "..."}`. It takes
effect on the next run, needs no deploy, and loses nothing. Then un-flip the last rung properly
before clearing the switch.

---

## Rollback, and the part people get wrong

**Production deploys are `registry` mode.** `scripts/deploy-prod.sh` verifies the published image
matches the exact `HEAD` commit and **refuses** otherwise. The consequence:

> **You cannot roll back by redeploying an older SHA.** There is no published image for an
> arbitrary earlier commit under this mode.

So a code rollback is **revert-forward**: `git revert` the merge commit on `main`, wait for CI's
"Build images" workflow to publish an image for the revert commit, then deploy. Alternatively use
`DEPLOY_MODE=build` to build on the host, which is slower and is the largest memory spike
available on that box.

**Flag and row rungs do not need a deploy to reverse** when they live in the database — the agent
rows, the programme status, the rollout control, the promotion records and the kill switch. Only
the env-var rungs (2, 3, 9, 11) and M2 need one.

**The email capability's own rollback:** `DROP TABLE IF EXISTS maya_email_ledger;`. Nothing else
in the codebase reads that table, and it holds a recipient, a subject and a full composed body —
so dropping it is both the rollback for the capability and the retention action once a promotion
decision has been made.

---

## Two things on the site chat, which is a different surface

The public site chat is not governed by the journey ladder above. Two notes so nobody looks for a
switch that does not exist:

**Voice calling is OFF at the feature flag.** `ENABLE_VOICE_CALLS` is `false` in production, while
`SYNTHFLOW_API_KEY` and `SYNTHFLOW_INTEREST_AGENT_ID` are both present — so the path is fully
configured and switched off.

> An earlier version of the MR1 ticket named `SYNTHFLOW_ASSISTANT_ID`. **That variable does not
> exist anywhere in the codebase.** The real switches are `ENABLE_VOICE_CALLS`
> (`config/env.ts:90`) and `SYNTHFLOW_INTEREST_AGENT_ID` (`config/env.ts:186`).

Until 2026-11-12 every "call me" produced a *success* envelope carrying `skipped: true`, and Maya
told the visitor a call was coming. Two real people were told that, on 2026-10-24 and 2026-11-06,
and no call was ever placed. That is fixed: the tools now report what the provider actually did,
both route through `evaluateSend`, and the prompt no longer scripts the claim before the tool has
answered. **Turning `ENABLE_VOICE_CALLS` on is a product decision and is not on this ladder.**

**The SMS tool has no idempotency key.** N tool calls produce N GoHighLevel field writes and
therefore N workflow fires. The email path has `sendOnce` and `email_send_ledger`; there is no SMS
equivalent. **Build one before SMS volume goes up**, and treat that as a rung on whatever ladder
covers SMS.

---

## What is not built, and therefore not on this ladder

Stated so that an absence is never mistaken for a rung somebody forgot:

- **R1** (todo 10455593417) decides whether Maya may contact the ad cohort at all, and on which
  channels. MR2 was built in shadow regardless, because R1 governs promotion rather than
  construction — but **M4 for `sendEmail` should wait for R1**.
- **No Playwright coverage** exists for any surface in this document. Every claim here rests on
  unit tests plus read-only production reads, and the three read-only commands above.
- `GROWTH_JOURNEY_SIGNAL_INGEST_ENABLED` is declared, parsed and **consumed nowhere**. It is
  inert; flipping it does nothing.
