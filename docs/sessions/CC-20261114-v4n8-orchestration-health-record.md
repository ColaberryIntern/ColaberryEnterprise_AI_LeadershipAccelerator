# CC-20261114-v4n8 — the capability record that described a different agent

## What happened

Quincy Ninying ran the L1 rung of `platform.orchestration_health_watch` the way the rung is
written: by hand, against the code, writing a run log. He found that the capability record and
the implementation describe two different agents, and escalated the decision rather than guessing.

He was right, and the mismatch is in four fields, not one.

| Field | What the record said | What the code does |
|---|---|---|
| `business_outcome` | the scheduler and agent layer is checked every five minutes | `generateHealthReport()` counts curriculum, prompt, skill, artifact and enrollment rows |
| `inputs` | SCHEDULE_REGISTRY, `ai_agents` rows, `ai_agent_activity_logs` | none of those three are read |
| `outputs` | "alert when degraded" | a `status_change` log event; nothing notifies a person |
| `application_pages` | `/admin/intelligence` | `/admin/orchestration` HealthDashboardTab |

The activity log is the sharpest one, and it was Quincy's catch rather than mine: the record lists
it as an **input**, and the code only ever **writes** to it — one `finding_<severity>` action per
finding, never a read.

## The decision Ali took

Both, not either. The record describes something valuable that does not exist, and the code does
something valuable that is mislabelled. Renaming alone would have quietly dropped a monitoring
requirement; building alone would have left the content scan misnamed forever.

- `platform.orchestration_health_watch` now describes what the code actually does, under the name
  **Curriculum content health scan**.
- `platform.scheduler_liveness_watch` is filed as a new `proposed_new` / `absent` capability, and
  carries the requirement the old record was falsely claiming to satisfy.

## Why the capability_id did not change

`capabilityStoryId()` builds `platform.CAP.orchestration_health_watch` from the capability id
(`agentDomainStoryTemplates.ts:453`). Quincy's live board story — the one his run log is attached
to — is keyed on it. Renaming the id would have orphaned the work he had already done against it,
so the id stays and only the descriptive fields moved. The `source` field records this explicitly
so the next reader does not "fix" the mismatch between id and name.

## What is now recorded as a real gap

`platform.scheduler_liveness_watch` is `absent`, with absence evidence rather than a promise:
nothing in `backend/src` compares a scheduled agent's `last_run_at` against its cron expression.
Its `blocked_by` names two things — Kes has no admin login, and nobody has defined what "late"
means per cadence, so the check cannot be specified until an owner sets it.

Its `exceptions` carry the idempotency requirement up front: a persistently silent agent produces
one alert, not one every five minutes.

## Verification

- `jest --testPathPattern agentDomain` — **76 suites, 1,729 tests, all passing.**
- **Positive control, free:** the suite failed immediately on the new record with eight count
  assertions (443 → 444, 48 → 49, 513 → 514, 553 → 554), proving it genuinely notices a
  population change rather than passing by default. Each was updated with its test name.
- **Mutation test:** setting `implementation_state` to `absent_TYPO` produced
  `CapabilityContractViolation: platform/platform.scheduler_liveness_watch: implementation_state
  'absent_TYPO' is not one of absent|partial|implemented|unknown`, naming the new record first.
  Restored and re-confirmed green.
- `tsc --noEmit` — **exit 0, zero errors.** Run with the backend's own TypeScript 5.9.3.
  The repo root carries 4.9.5, which cannot parse zod v4's `.d.cts` and emits parse errors from
  `node_modules` that have nothing to do with the branch; the root binary is the wrong gate.
- **Control error for tsc:** a deliberate `const __CONTROL_ERROR__: number = "..."` appended to
  `capabilityRecord.ts` produced exactly **1** error, proving tsc reaches these files. Removed,
  and `git diff` on that file confirmed byte-identical restore before committing.

## Not done here

- Doc comments across `services/agentDomain/*.ts` quote the population as 443 / 553 / 513. Most
  carry an explicit measurement date and were true when written, so they were left alone rather
  than bulk-edited into a different kind of wrong. They are comments; nothing emits them.
- The corrected record has not reached the live boards. The `#4004` prose guard in
  `agentDomainBoardReconciler.ts` preserves stored prose a planned body does not contain, and
  `narrative` is a `PROSE_FIELD`, so a regenerated body is refused. That remains unresolved.
- Nothing was said to Kesetebirhan Delele, who is the named `validation_dependency` on both
  records and is blocked by the same missing admin login.
