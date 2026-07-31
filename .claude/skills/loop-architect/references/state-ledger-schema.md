# State ledger - schema and resume behavior

One run = one directory `.loop-architect/runs/<timestamp>-<task-slug>/` containing:

```text
request.md              # the original ask, verbatim
execution-contract.md   # Phase C output (see references/execution-contract.md)
plan.md                 # Phase D output, updated through Phase F
state-ledger.json        # machine-readable mirror of plan.md's status, below
verification-log.md      # every plan-auditor and task-verifier pass, in order
deployment-log.md        # Phase H record
handoff.md                # Phase J output
```

## `state-ledger.json` schema

```json
{
  "run_id": "20260731-143000-add-onboarding-portal",
  "request_hash": "<sha256 of request.md content, for resume matching>",
  "status": "preflight|planning|executing|quality-gate|deploying|verifying-production|complete|blocked",
  "started_at": "2026-07-31T14:30:00Z",
  "updated_at": "2026-07-31T15:12:00Z",
  "current_task_id": "T004",
  "next_task_id": "T005",
  "plan_approval": { "status": "APPROVED", "score": 19, "cycles": 1 },
  "tasks": [
    {
      "id": "T001",
      "status": "pending|in_progress|passed|failed|blocked|skipped",
      "attempts": 0,
      "verifier_score": 0,
      "evidence": [],
      "last_error": ""
    }
  ],
  "deployment": { "status": "", "environment": "", "release_id": "", "url": "" },
  "stop_reason": "",
  "dashboards_emitted": []
}
```

`dashboards_emitted` holds milestone slugs already fired (`"kickoff"`, `"halfway"`,
`"shipping"`, `"live"`, `"blocked"` - see `references/milestone-dashboard.md`). Check
this array before writing a new dashboard file: never re-emit one already present, and
never emit more than the fixed set of 5. On resume, a milestone whose condition was
already true before the interruption should NOT re-fire just because the run restarted.

Update this file atomically (write to a temp file in the same directory, then rename)
after every status change - a run that crashes mid-write must never leave a
half-written ledger the resume logic can't parse.

## Resume behavior

On invocation, before creating a new run:

1. List `.loop-architect/runs/*/state-ledger.json` where `status` is not `complete`.
2. For each candidate, compare its `request_hash` (or a human-obvious match on
   `request.md`'s content) against the current ask. If it's the same request, resume
   it instead of starting fresh.
3. Confirm repository state still matches what the run's `execution-contract.md`
   recorded as "Repository facts" - if `main` has moved in a way that invalidates a
   `passed` task's evidence (the file it touched changed upstream), mark that task's
   evidence stale and re-verify it before trusting the cursor.
4. Resume from the first task that is not `passed` and whose dependencies are all
   `passed` (i.e. `next_task_id`, re-validated against current dependency state, not
   blindly trusted).
5. Never redo a `passed` task whose evidence is still fresh. Never re-run Phase E
   (plan audit) if `plan_approval.status` is already `APPROVED` and the plan hasn't
   changed since.
6. If the ledger's `status` is `blocked`, resuming means addressing `stop_reason`
   first - report it before touching any task.

## Concurrent-run safety

Two runs must never share a run directory. If two requests could plausibly map to the
same run (near-identical `request_hash`), treat them as the same run rather than
forking silently - ask, don't guess, when the collision is ambiguous.
