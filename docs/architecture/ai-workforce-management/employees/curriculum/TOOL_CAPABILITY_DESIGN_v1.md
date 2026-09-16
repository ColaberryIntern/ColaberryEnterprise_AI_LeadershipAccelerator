# Curriculum, Learning & Certification (Dara) — Capability & Tool Design (Phase 3, draft v1)

**Session:** CC-20260915-q9k4 (continuing CC-20260915-a1x7) · **Date:** 2026-09-15 · **Status:** proposed for Ali's Phase 3 approval. Design only — no code written, no schema changed, no registry entry added. Covers plan.md tasks B3.1 (tool map), B3.2 (structured tool layer), B3.3 (new-tool specs), B3.4 (presence heartbeat).

## B3.1 — Responsibility → tool/behavior → implementation path

Every row traces to the approved coverage contract (`COVERAGE_CONTRACT.md` §1) and the charter's `responsibilities[]` (`ROLE_CHARTER_v1.md`). "Behavior" = an owned scheduled/triggered process Dara does not decide to invoke turn-by-turn (matches the mission's Section 7 taxonomy). "Tool" = a callable capability Dara's own reasoning can invoke.

| Responsibility | Kind | Name | Real implementation path | Status |
|---|---|---|---|---|
| Flag curriculum content gaps daily | Behavior (cron) | `WorkforceCurriculumDirector` | `workforce/directorActions.ts:41-68` (`runDomainFlag`) → `workforceAgentRuntime.ts:141-198` (`runDirectorWrite`) → `ops/directors.ts:52-54` (rule) | **EXISTS.** Needs re-pointing only: `parent_agent_id` = Dara's id, `reports_to` fixed (Risk R1), wrapped in `instrumentCronJob` (Risk R6, currently runs bare). No new code. |
| Flag certification readiness daily | Behavior (cron) | `WorkforceCertificationDirector` | Same shape, `ops/directors.ts:45-46` | **EXISTS.** Same re-pointing only. |
| Curriculum integrity scan | Tool (callable) | `scan_curriculum_integrity` | `agents/curriculumQAAgent.ts:19-148` | **EXISTS but wrong output contract** — today it opens `bug` tickets at `PlatformFixAgent` (mis-routed, and blocked by F1 regardless). **GAP**: needs a real "return findings" interface — see B3.3, the one genuinely new tool this release builds. |
| Monitor curriculum video-link health | Behavior (cron, env-gated) | `CurriculumVideoLinkHealth` | `schedulerService.ts:2541-2560` → `curriculumHealth/videoLinkHealthService.ts` | **EXISTS, unregistered.** GAP is a missing `AGENT_REGISTRY` row only (the `ReesePresenceHeartbeat` precedent per `build-platform-agent/SKILL.md`'s own worked example) — zero behavior change, `parent_agent_id` = Dara's id. |

**Net new implementation work this release: one tool** (`scan_curriculum_integrity`'s return-findings contract). Everything else is identity re-pointing on code that already runs correctly. This is deliberately honest, not padded — Phase 3's job is to design the minimum real work needed, and for a first release absorbing dormant, low-risk behaviors, that minimum is small.

## B3.2 — Structured tool layer (extends the 3 existing registries, replaces none)

Per `REESE_STANDARD_AUDIT.md` gap 12: Reese's own build left `read_attachments` granted in `agentToolRegistry.ts` but absent from `tools_granted` — the classifier and transparency page never saw it. Dara's build must not repeat this. Every capability below is added to all three real registries together, in the same PR:

| Registry | File | What Dara's entry adds |
|---|---|---|
| `tools_granted` (DB, `AiAgent.tools_granted` JSONB) | Set on the `AGENT_REGISTRY` entry, `agentRegistrySeed.ts` | `['flag_curriculum_content_gaps', 'flag_certification_readiness', 'scan_curriculum_integrity', 'monitor_curriculum_video_health']` |
| `TOOL_CAPABILITIES` (reads/produces, transparency page) | `backend/src/services/reese/agentToolCapabilities.ts` | 4 new entries, one per tool above, each with real `reads`/`produces` strings grounded in the actual implementation (not invented prose) — see B3.3 for `scan_curriculum_integrity`'s; the other 3 reuse the Directors'/video-health's real read/write facts already documented in `DISCOVERY_2026-09-15.md`. |
| `agentToolRegistry.ts` GRANTS | `backend/src/services/agents/tools/agentToolRegistry.ts` | No entry needed — that registry is specifically for real LLM function-calling tools (e.g. Reese's `read_attachments` vision tool). Dara has zero LLM calls this release (charter Boundaries §2), so nothing belongs here. Noted explicitly so a later reviewer doesn't read the omission as an oversight. |

**Autonomy classification check (real, not asserted):** running `classifyAgentAutonomyLevel()`'s real keyword tiers (`agentCapabilityClassifier.ts:43-76`) against the proposed `tools_granted` array above: `flag_` is an `act_audited`-tier keyword (`:60-64`); `scan_` and `monitor_` are both `observe`-tier (`:70-75`). Max across all four = **`act_audited`**. This is the correct, honest autonomy level for Dara at launch — real audited writes, zero LLM, zero outbound — and it falls out of the real classifier without any special-casing, the same way Reese's `communicate` level does for her real `respond_to_dm` grant.

## B3.3 — New tool specification: `scan_curriculum_integrity`

The one genuinely new implementation surface this release needs (Section 8's 15-point list, applied honestly — the other 3 items are re-pointing, not new tools, so this is the only one that gets the full spec):

1. **Stable id / name:** `scan_curriculum_integrity` — "Curriculum Integrity Scan."
2. **Business purpose:** Walk modules → lessons → artifacts/mini-sections and report real structural/content issues (missing artifacts, broken internal references, stale mini-sections) as findings Dara can surface directly — not, as today, mis-routed `bug` tickets at a different domain's agent.
3. **Owning employee / allowed additional employees:** Owned by Dara. No other employee has a reason to call it (curriculum-specific).
4. **Input/output schema:** Input: optional `moduleId` (scope to one module) or none (full scan). Output: `{ findings: Array<{ severity: 'info'|'warn'; location: string; description: string; evidence: Record<string, unknown> }> }` — a real typed array, not a free-text string, so the caller (Talk tab, or a future scheduled digest) can render it structurally.
5. **Real implementation path:** `services/agents/curriculumQAAgent.ts:27-37` loads the module/lesson/artifact tree; the walk itself is `:41-95`; both re-derived to return the array above instead of calling `createTicket` at `:111-122`.
6. **Data sources / freshness:** Reads `curriculum_modules`/`curriculum_lessons`/`artifact_definitions`/mini-sections directly — always current-as-of-call, no caching, matching the existing implementation's own freshness (none needed; it's a live query).
7. **Read/write/external-side-effect classification:** **Read-only (R0)** in its new form — the current `bug`-ticket write is removed, not preserved. This is a real reduction in risk tier from today's code (R1, because of the ticket write), not just a relabeling.
8. **Risk tier:** R0 (read_only, `deliveryRiskLevels.ts`).
9. **Authorization policy:** None required for a pure read — matches the platform's own R0 convention (no chokepoint needed when nothing is written).
10. **Approval/HITL behavior:** N/A — read-only.
11. **Idempotency/dedup:** N/A — a read has no side effect to duplicate. Running it twice returns the same findings (assuming no underlying data changed), which is the correct, trivial idempotency property for a query.
12. **Timeout/retry:** Same as any DB read on this platform — no new timeout policy needed; a failed query surfaces as an error to the caller, not a silent empty result.
13. **Audit/activity/cost/ticket emission:** `logAgentActivity` (`agentBlueprint/agentActivityLogService.ts`) on both success and failure, so the scan itself is visible in Dara's activity log even though it writes nothing else. No ticket (deliberately — that was the bug being fixed). No LLM cost (no LLM call).
14. **Tests:** happy path (real findings returned for known-bad fixture data), failure path (a DB error surfaces, not swallowed), boundary (zero findings on clean data returns `{ findings: [] }`, not null/undefined), and a regression test asserting `createTicket` is never called from this path (guards against the exact F1/mis-routing bug recurring).
15. **Transparency-page documentation:** `TOOL_CAPABILITIES` entry (B3.2) states plainly: reads curriculum structure, produces a findings list, creates no tickets — an explicit, checkable contrast with the tool's own pre-Phase-3 behavior.

## B3.4 — Generic presence heartbeat (platform-level, not Dara-specific)

Per plan.md B3.4 and `REESE_STANDARD_AUDIT.md` gap 10: `reesePresenceHeartbeat.ts:2,22` hardcodes `REESE_EMAIL` — there is no generic `runAgentPresenceHeartbeat(email)` any future employee (Dara included) can reuse. This is explicitly a **platform-wide fix**, not something built twice per employee.

**Design:** extract a generic function, keyed on `AdminUser.is_ai_operated` identities (matching the existing `AdminUser` linkage every employee already has via `agentIdentitySeed.ts`):

```ts
export async function runAgentPresenceHeartbeat(email: string): Promise<void> {
  // touches CommunityMember.last_active_at for the AdminUser at `email`,
  // same real write reesePresenceHeartbeat.ts already makes — generalized,
  // not reimplemented.
}
```

`reesePresenceHeartbeat.ts` becomes a one-line wrapper calling this with `REESE_EMAIL`; Dara's own registry entry gets an equivalent one-line cron wrapper calling it with Dara's email. **Truthfulness gap not fixed here** (per the audit: no "current activity" text is ever written — presence reads online whether or not real work is happening) — that remains an open Reese-hardening item, explicitly not silently inherited as "done" by Dara; Dara's own heartbeat has the same honest limitation as Reese's until that separate hardening work lands.

## Explicitly out of scope for Phase 3

Building the persona/system-prompt assembly, the actual registry entry, or any schema migration — those are Phase 4 (build). This document designs; it does not implement.
