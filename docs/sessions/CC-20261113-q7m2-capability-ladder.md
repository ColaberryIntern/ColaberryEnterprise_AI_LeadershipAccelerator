# CC-20261113-q7m2 — the four-step capability ladder

**Date:** 2026-11-13
**Branch:** `workstream/capability-ladder`, cut from `origin/main` at `310bc0971`
**Scope:** the seven intern agent builders

---

## Why

Ali asked for an audit of the intern agents' stories — "will it build the agent we want?" —
because the backlogs looked endless and Quincy was ~50 stories in with no working agent and no
gate ever reaching him.

Measured against production on 2026-11-13, the answer was no, and the evidence was not ambiguous:

| Measurement | Result |
|---|---|
| Tasks above R0 ever completed | **0 of 853** |
| All completions in the programme | 100, **every one at R0** |
| Governance gates ever used | **0 of 6** (authorizations, confirmations, change requests, tool requests, decisions, grants) |
| Tool requests ever filed | **0** |
| Behaviour stories mentioning doing the work by hand | **0 of 964** |
| Behaviour stories mentioning requesting a tool | **0 of 964** |
| Behaviour stories whose `description` was byte-identical to their `title` | **964 of 964**, averaging 51 characters |
| Behaviour copies per distinct behaviour | marketing 2.8, admissions 2.9, curriculum 2.9, sales 2.7 |

The backlog was a catalogue of the finished agent — every behaviour multiplied by every rung of
the autonomy ladder, including rungs R3–R9 that the platform cannot yet express — rather than a
path to one.

**The reachability check that changed the fix.** The first hypothesis was that no tool request had
ever been filed because the product offers no way to file one. That was wrong, and checking it
mattered: `AdminChangeRequestsPage.tsx` POSTs `/api/admin/agent-domain-change-requests-mine`
behind the `dashboard` section every domain builder already holds, and an admin decides it at
`.../decide`. The ladder step therefore asks for something that works today. Had the check gone
the other way, step 3 would have had to become a build story instead of an instruction — which is
exactly the failure being corrected, so it is now pinned by a test.

## What changed

**New: `backend/src/services/agentDomain/agentDomainCapabilityLadder.ts`.** The four steps, in the
only order they may happen in:

1. **do it by hand** — perform the workflow yourself; the deliverable is a run log
2. **do it in the app** — same outcome through the product, no agent; a gap found here is a result
3. **request the tool** — file it, citing the run log; a human decides; **a decline completes it**
4. **agent does it, watched** — at the capability's starting rung, every run approved by a person

Bodies are assembled from each capability's own record — `workflow[]`, `inputs`, `outputs`,
`exceptions`, `application_pages[]`, `required_tools[]`, `release_behaviour[0]` — so no two are
alike and nothing was invented. Measured: 1,210–2,035 characters per story, against 51 before.

**Changed: `agentDomainStoryTemplates.ts`.** `releaseBehaviourStories` (964 rows) is replaced by
`capabilityLadderStoriesFor`, emitted only for the capabilities a domain has **in flight**. New
`liveCapabilityIds()` defaults to exactly one per domain and is overridable per domain via
`PlanOptions`. The other 433 capabilities remain as `implementation` candidates whose body now
says plainly that they are not started and not assigned.

### Composition

| Kind | Before | After |
|---|---|---|
| implementation (candidates) | 443 | 443 |
| release_behaviour | 964 | **0** |
| capability_ladder | — | **40** |
| research | 50 | 50 |
| legacy_migration | 10 | 10 |
| command_center | 10 | 10 |
| **total** | **1,477** | **553** |

Per builder: **4 live stories**, against 136 for Quincy and 248 for marketing.

## Assumptions logged

1. **The default live capability is the first in the domain's own matrix.** A defensible seed, not
   a considered choice. It is documented as such in `liveCapabilityIds`, and swapping it costs one
   argument. Ali's stated process is that the builder proposes and the domain manager approves.
2. `release_behaviour` is kept in the `StoryKind` union although nothing emits it, because ten
   boards' worth of production rows still carry it.
3. This change alters the **generator**. The 964 rows already written to the ten live boards are
   untouched; removing them is a separate, explicitly destructive migration and was deliberately
   not smuggled into the Phase 2 migration planner.

## Verification

- `npx tsc --noEmit` from `backend/` — clean. **Positive control planted** (`const x: number =
  "s"`) and it failed at `agentDomainCapabilityLadder.ts(327,7)`, so the clean result is real.
- `node scripts/checkTestTypecheck.js` — baseline matched exactly in both directions (399 errors /
  140 files); no new test type errors.
- `jest -c jest.ci.config.ts --ci` full suite — **2,702 suites, 44,121 tests passed, 0 failed.**
- New `agentDomainCapabilityLadder.test.ts` — 20 tests, all passing, **and mutation-tested**:

| Mutation | Result |
|---|---|
| swap the first two steps | 1 failed |
| remove the change-request endpoint from step 3 | 1 failed |
| make two capabilities live instead of one | 4 failed |
| shrink a body to the old title-only shape | 4 failed |
| restored | 20 passed |

- Eight pre-existing tests pinned the old cross-product and were updated rather than deleted, each
  with the measurement that justified the change. One — the `story_id` truncation positive control
  — had gone quiet for a reason unrelated to safety (the new ids are shorter), so it was rewritten
  to assert what is still true and still dangerous: 33 ids overflow the old 60-character column.

## Not done

- **The live boards are unchanged.** 1,477 rows across ten projects still carry the old shape.
  Rewriting them is the next phase and needs Ali's go-ahead on destructive writes to seven real
  builders' work.
- The seven builders have not been told. No board, ticket or email was touched.
