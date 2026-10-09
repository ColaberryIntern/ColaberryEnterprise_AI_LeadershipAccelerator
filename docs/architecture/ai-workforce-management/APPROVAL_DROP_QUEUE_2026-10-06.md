# Approved actions are marked performed when they were not

**Found:** 2026-10-06 · **Session:** CC-20261006-a4k7 · **Status:** verified against production
**Scope:** real but narrower than the first draft of this document claimed. See the correction below.

> ## Correction, 2026-10-07
>
> The first revision of this document said Reese "has never completed a single governed action" and
> that "106 real actions were lost." **Both were wrong, and I wrote them before measuring the
> underlying work tables.**
>
> Reese has done substantial real work: **125 welcome messages sent** (65 student, 60 account, every
> one carrying a `message_id`, most recently 2026-10-02) and **51 autonomous outreach records, all of
> which were actually contacted** across 123 attempts. She is not blocked and never was.
>
> And the 106 approval rows are **not 106 distinct actions.** They are 106 evaluations of roughly
> **41 underlying work items** — one approval row per ledger event, several events per ticket.
>
> What is genuinely broken is the **follow-through tier**, and it is recent. The defect below is real;
> its blast radius is tens of items, not hundreds, and the first-contact tier is unaffected.

## The defect

`approvalRequestReplayService.ts` claims the row before it knows whether it can act on it:

```ts
const [claimedCount] = await ApprovalRequest.update(
  { replayed_at: new Date() },                              // claims the row
  { where: { id: row.id, replayed_at: null } as any },
);
if (claimedCount === 0) return { replayed: false, reason: 'already_replayed' };

if (row.action !== 'reese_autonomous_outreach') {           // only now checks
  return { replayed: false, reason: 'unrecognized_action_type' };
}
```

Because the claim predicate is `replayed_at: null`, a row taking the second branch is claimed
**permanently** and can never be retried by anything. It is recorded as replayed, having done nothing.

## What production says

```
approval requests ............... 106
auto-approved by timeout ........ 106      (decided_by has exactly ONE distinct value:
stamped replayed_at ............. 106       system:auto_approve_timeout)
of the one replayable type ......   0
```

| Action | Approval rows | Distinct tickets | Replayable |
|---|---|---|---|
| `reese_ticket_followup` | 47 | 12 | no |
| `reese_outreach_followup` | 39 | 15 | no |
| `reese_outreach_escalated` | 10 | 4 | no |
| `reese_welcome_student` | 6 | — | no |
| `reese_welcome_account` | 4 | — | no |
| `reese_autonomous_outreach` | **0** | — | yes |

**Not one row is of the only type the replay can perform.** All 106 were claimed and dropped.

## The real harm, measured in the work tables

| Tier | State | Verdict |
|---|---|---|
| First-contact outreach | 51 records, **all contacted**, 123 attempts, newest 2026-10-01 | **working** |
| Welcome messages | **125 sent** with message ids, newest 2026-10-02 | **working** |
| Welcome messages | **10 held** (6 student, 4 account), no message id, dated 2026-10-06 | **held** |
| Ticket follow-ups | 12 rows, all `active`, `attempt_count` 0, **never once fired** | **never fired** |
| Outreach follow-ups | 15 tickets held | **held** |
| Escalations | 4 tickets held, and 24 outreach rows sitting `escalated` | **held, and escalation reaches nobody** |

So the honest statement: **first contact works, follow-through does not.** Roughly 41 work items are
affected, and 10 students are waiting on a welcome that was composed and held.

## Two tables disagree, and the governance one is wrong

This is the part worth keeping.

- `reese_welcomes` records the truth: `outcome = 'held'`, 10 rows, no `message_id`.
- `approval_requests` records a falsehood: `status = 'approved'`, `replayed_at` set, for the same work.

The domain table is honest and the governance table is not. Anyone auditing governance sees 106 green
rows; anyone reading the welcome table sees 10 holds. The system of record for authorization is the one
that cannot be trusted.

Compounding it, `AiAgentActivityLog` defines `result: 'skipped'` and **nothing in the codebase writes
it** (0 writers outside tests). Reese's activity log holds **30 rows, every one `success`** — no
`failed`, no `skipped`, no `pending`. A log that can only record success.

## The human in the loop is a timer

`decided_by` has one distinct value across all 106 rows: `system:auto_approve_timeout`. **No human has
ever decided an approval request.** Reese is the only agent fleet-wide with
`abac_mode_override = 'enforce'`, every Reese path declares `R3`, and `agentAutonomy.ts:80,111` force
approval for `R3`/`R4` unconditionally — so the gate is a 4.25-hour delay followed by an automatic yes.

Note the model's own header is stale here: it states `status` is never set to anything but
`shadow_logged`, and production shows all 106 as `approved`. The bridge's header is stale in the same
direction, claiming only two send paths branch on `allowed`; the `held` rows in `reese_welcomes` prove
the welcome path branches on it too.

## What to do, and in what order

**Do not fix the replay first.** Right now the drop is the only thing preventing unreviewed outbound:
every one of these actions is approved by a timer no human reads. Making the replay work would convert
a silent hold into a silent **send**, to real students, on a four-hour clock. Order matters more than
speed here.

1. **Make the governance record honest** (safe, no policy needed). Move the stamp after the type check
   so an unhandled action stays unclaimed and visible; make an unknown action type fail loudly instead
   of returning a quiet `unrecognized_action_type`. A queue that cannot perform an action must not be
   able to mark it done. This makes the backlog appear — it does not send anything.
2. **Write `result: 'skipped'`** on the authorization-held path, so a held action stops looking like
   nothing happening.
3. **Do not replay the 106.** They are weeks old; the newest holds are 2026-10-06 but the follow-ups
   reference tickets whose state has moved. Mark them abandoned with a reason and count them as loss.
   Replaying a stale welcome is worse than having held it.
4. **Then decide the policy** (DRI): is `R3` on every action right, given it forces approval
   unconditionally? And is an auto-approve timeout a human in the loop? If yes, the gate is a delay and
   should be described as one. If no, it needs to reach a person, and
   `agentBlueprint/daraHandoffService.ts` is the only mechanism in the fleet that currently does.
5. **Only then** wire the remaining action types into the replay.

**For the employee programme:** employee #3 launches with `abac_mode_override` NULL and the gate
correctly written from the first commit, as Dara did. That is why Dara has 57 completed runs. Flipping
to enforce then becomes a decision, not a send freeze discovered in production.
