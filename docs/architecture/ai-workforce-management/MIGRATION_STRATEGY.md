# Migration Strategy (Checkpoint A proposal — not built)

Governs how the new models in `TARGET_ARCHITECTURE.md` get introduced, per CLAUDE.md's additive-migration and idempotency rules and the mission's own "no fabricated historical data" stop condition.

## Principles

1. **Additive only.** Every new table is a new table. No existing table (`AiAgent`, `ai_events`, `org_members`, etc.) is altered beyond additive nullable columns (e.g. the proposed `OrgMember.timezone`). No column is dropped or repurposed.
2. **No backfilled history that didn't happen.** `AgentOneOnOne`, `ManagerDirective`, `AgentGoal`, `AgentApprovedMemory` all start empty in production. No synthetic "here's what a 1:1 might have looked like" seed data — matches the mission's explicit stop condition and this session's own established practice (Trust Contract Phase 1 shipped with zero fabricated history).
3. **Each new table ships in the checkpoint that needs it, in its own PR**, following this session's established pipeline: worktree → migration + model (all three blocks: interface/declare/init, per backend/CLAUDE.md) → service → route → tests → `tsc --noEmit` both stacks → PR → CI → merge → deploy → production verification → `PROGRESS.md` entry. No checkpoint bundles multiple unrelated tables into one PR.
4. **Order matches the dependency graph in `TARGET_ARCHITECTURE.md`**: `requireAgentManagerOrAdmin` and `OrgMember.timezone` before anything that depends on them; `AgentRoleCharter` (Checkpoint B, no dependencies) can ship first and stand alone.
5. **Every migration is idempotent and safe to rerun**, per CLAUDE.md's Idempotency & Replayability section — matches this repo's existing `ensureWorkforceSchema`/`ensureMultiTenantSchema` pattern (idempotent schema-ensure functions, not raw one-shot migration scripts).

## Rollback

Standard for this repo: redeploy the last known-good commit SHA with the documented deploy command; `git revert` on `main` if a bad commit must not remain in history. New tables are additive, so a rollback of application code never requires a destructive down-migration — the table can simply go unused until the next fix ships.

## Staged rollout per checkpoint

| Checkpoint | What ships | Feature-gated? |
|---|---|---|
| B | `AgentRoleCharter`, `requireAgentManagerOrAdmin`, nav/tabs shell | New tab UI behind existing `requireAdmin` until `requireAgentManagerOrAdmin` is verified in production against real `org_members` data |
| C | `AgentManagerConversation/Message`, `ManagerDirective`, `AgentManagerInboxItem` | Chat/directive write paths gated on `requireAgentManagerOrAdmin`; directive application requires the runtime context-assembler prerequisite from `TARGET_ARCHITECTURE.md` to exist first, or directives are stored but not yet live-injected (explicit, logged degraded mode, not silently inert) |
| D | `OrgMember.timezone`, `AgentReportSubscription/Run`, `AgentOneOnOne/Outcome`, `AgentGoal` | Report sends real-email-only (Slack excluded per `COMMUNICATION_MAP.md`); `AgentGoal` renders `UNMEASURED` for any agent without a real backing metric |
| E | `AgentMemoryProposal/ApprovedMemory`, Trust workspace | Memory approval gate must be proven read by the runtime path (a real test, not a comment) before any proposal can reach `ApprovedMemory` |
| F | "Ask Agent About This," Chain of Command surfacing | Read-only — no new tables, reuses `ai_events` + existing reports-to data (`DOMAIN_REUSE_MAP.md`) |
| G | Skill updates (`build-platform-agent` extension, optional `manage-platform-agent`) | Docs/skill only, no schema |

## Production boundary (restated, applies to every stage above)

No production deploy, no production migration run, no real manager report/email/Slack send, no live autonomy/directive/memory/manager-relationship change until Ali separately and explicitly authorizes it — per the mission's own PRODUCTION BOUNDARY. Every checkpoint above ships to dev/staging and is verified there first.
