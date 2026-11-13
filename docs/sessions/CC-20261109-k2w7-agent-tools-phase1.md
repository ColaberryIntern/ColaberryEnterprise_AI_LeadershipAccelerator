# CC-20261109-k2w7 — Agent Tools, Phase 1: the Tools & access section

**Date:** 2026-11-11
**Tickets:**
- Tools section — https://app.basecamp.com/3945211/buckets/7463955/todos/10500496471
- Backfill, every agent — https://app.basecamp.com/3945211/buckets/7463955/todos/10500496518

## What was asked

Ali: a tools section on the Agent dashboard covering request, approval and access, tracked
through to handover, so that opening Maya's account shows every tool she has and the profile
attribute each one is tied to. Every agent action to be tied to a tool.

## What the discovery changed

Three parallel read-only explorations mapped the dashboard, the capability model and the tool
execution paths before any design. The request was largely **not greenfield**:

- A complete request-to-grant spine already exists: `agent_domain_change_requests` (kind=tool),
  `agent_domain_tool_request_details`, `agent_domain_tool_request_decisions`,
  `agent_domain_tool_grants`, `agent_domain_tool_duplicate_checks`, each with a written contract
  and an approver console. The repo's own design doc says: *"There is already an approval spine.
  Do not build a second one."*
- Capabilities already carry `required_tools`: 443 records across 10 domains, 276 distinct tool
  names.
- `capability_id` is already stored on every grant row.

So the work is to connect and surface, not to rebuild.

## What is actually missing

| Gap | Evidence |
|---|---|
| `agent_domain_tool_grants` has **0 rows** | measured in production 2026-11-11 |
| 31 agents hold **136 tool entries**, none governed | `ai_agents.tools_granted` |
| Tools is not a section | a read-only sub-tab under Performance & settings |
| No UI calls the grant endpoints | `POST /api/admin/agent-tool-grants` has zero frontend callers |
| `capability_id` displayed nowhere | stored on every grant, rendered on no screen |
| No rule ties a grant to its capability's `required_tools` | absent from `agentToolGrantContract` |
| Runtime ignores grants entirely | no dispatcher checks before executing; ABAC is shadow in production |
| Only 13 of 276 named tools have a handler | vocabulary also collides, three names for one thing |

## What Phase 1 ships

A **Tools & access** tab on `/admin/agents/:id`, placed after Decisions & evidence. Per tool it
shows: held by the runtime, granted on the record, the capability it serves, who approved it and
when, and any finding.

- `backend/src/services/workforce/agentToolGovernanceService.ts` (new) — the read
- `backend/src/controllers/agentEffectiveAccessController.ts` — one handler added
- `backend/src/routes/admin/agentEffectiveAccessRoutes.ts` — `GET /api/admin/agents/:id/tool-governance`
- `frontend/src/services/agentEffectiveAccessApi.ts` — client plus mirrored types
- `frontend/src/components/admin/agentDetailV2/AgentToolsTab.tsx` (new) — the section
- `frontend/src/components/admin/agentDetailV2/AgentDetailV2Header.tsx` — the tab key
- `frontend/src/pages/admin/AgentDetailPage.tsx` — render it

### Why a new service module

`agentEffectiveAccessService.ts` is 468 lines against this repo's 500-line ceiling, and CLAUDE.md
requires the next change to split before it adds. It also answers a different question: what the
RUNTIME would do, versus what the GOVERNANCE records. Those two disagree for every agent in
production today, and a blended endpoint would hide the disagreement this section exists to show.

### What it will show on first view, deliberately

Every agent reads as "held without a grant", because the ledger is empty. The posture sentence
refuses the word "governed" whenever the grant count is zero, and a test pins that refusal. The
failure mode worth guarding against here is a dashboard that makes an ungoverned fleet look
governed.

## Enforcement posture, decided by Ali 2026-11-11

Record now, enforce later, per agent. Every action records which tool performed it; anything
untied logs a loud violation and still runs; enforcement flips one agent at a time once its map
is clean. Phase 5 builds toward this; the backfill ticket is its precondition.

## Verification

- Frontend typecheck: clean, with a planted control error caught first
- Backend typecheck, full project: **0 errors in `src/`**
- `npx jest -c jest.ci.config.ts --ci` on the new suite: **14 passed**
- Mutation A, collapsing the null capability case into false: fails exactly
  `distinguishes "no capability to check" from "capability says no"`
- Mutation B, letting the posture claim governance with zero grants: fails exactly
  `refuses to call an agent governed when nothing was ever granted`
- Both mutations confirmed applied by grep; service restored byte-identical afterwards

## Still open

1. **Phase 2**: request a tool from the agent's own dashboard, with a threaded conversation on
   the request. Filing today is keyed by `domain_key`, so there is no path from Maya's page.
2. **Phase 3**: lifecycle past `approved` to built-and-handed-over.
3. **Phase 4**: the missing refusal rule, plus reconciling the 276-name vocabulary.
4. **Phase 5**: uniform tool-identity recording across all five dispatchers.
5. The old "Tools & channels" sub-tab under Performance & settings still exists and answers the
   reads/produces question. Merging the two is a reasonable follow-up; deleting a panel while
   adding a tab was not done silently.
