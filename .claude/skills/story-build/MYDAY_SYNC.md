# Prompt: make "Create a project on My Day" follow the full Story-Driven Build

Paste the block below into a Claude Code session running in the **AI Project Architect &
Build Companion** repo (the advisor / FastAPI repo that owns `execution/advisory/deep_plan.py`).
It is discovery-first: it tells that session what "fully created" means and has it wire the
create-project path to reach that state, idempotently, instead of stopping halfway.

---

You are working in the AI Project Architect repo. The Basecamp side of the Story-Driven
Build already works: for recent projects a story-driven to-do list and its tasks are
already created in Basecamp. The gap is that **creating a project on My Day does not run
the whole process to completion** - it must, and it must be idempotent.

## What "fully created" means (definition of done)

A project is only fully created when ALL of these are true and verifiable:

1. **A gated plan exists.** The 6-stage pipeline (`execution/advisory/deep_plan.py`) has
   produced the plan and it passes all four gates: (a) zero no-code mentions, (b) >= 12
   stories AND >= 3 releases, (c) `trace.ok == true`, (d) strong real-code signal
   (React/Node/PostgreSQL/Docker). Claude Code / real code is assumed; no no-code tools.
2. **Basecamp reflects it.** One story-driven to-do list with per-release groups; every
   story is a to-do carrying Fulfills/Owner-agent/Gherkin/Build/Trust/Loop-stop, marked
   🤖 [AI] or 🧑 [Human], assigned to the builder; a MILESTONE APPROVALS group assigned to
   the approver (per-release or phase-gate mode); and 5 Docs & Files documents
   (Requirements, Architecture, Trust/TBI Primer, Build Guide, Traceability Matrix)
   deep-linked from every task.
3. **My Day reflects it.** The project and its tasks appear as native My Day items, the
   🤖/🧑 markers drive the My Day tier split (`task_kind`), the builder sees their build
   tasks and the approver sees their milestone gates, and the 5 documents are reachable.
4. **The state is consistent.** No task exists in Basecamp that is missing from My Day
   (or vice-versa); re-running the create/sync produces the same end state with no
   duplicates.

## Your task

1. **Map the current flow.** Find the "Create a new project" / My Day project-creation
   entry point and everything it calls: the deep_plan generator, the publisher
   (`deep_plan_publisher.py` or the pluggable-publisher path), and the sync that pushes
   into My Day / the portal (the build-sync webhook / adapter). Write a short map:
   entry point -> generate -> gate -> publish (Basecamp) -> sync (My Day) -> mark done.
   Note exactly where the chain currently stops short of the definition of done above.

2. **Make create-project run the whole chain to completion.** The create flow should
   drive: generate -> enforce the 4 gates (refuse/repair on fail, do not ship a
   half-plan) -> publish to Basecamp with the AI/Human split, builder assignment,
   approver gates, and 5 linked docs -> sync into My Day -> only then report the project
   as created. It must not mark the project created until a completion check passes.

3. **Add an explicit completion check + reconcile.** Implement a `verify_fully_created`
   (or extend the existing status) that checks all four conditions above against the live
   Basecamp list and the My Day project, returns a per-condition pass/fail, and a
   `reconcile` step that fills only the missing pieces (missing tasks, missing 🤖/🧑
   markers, missing docs, unsynced My Day items). Bound the repair loop; if it cannot
   converge, surface a clear escalation with the failing conditions rather than looping.

4. **Idempotency is non-negotiable.** Creating/syncing the same project twice must
   produce the same end state with no duplicate lists, tasks, docs, or My Day items.
   Key each side effect (Basecamp task, My Day task, doc) so re-runs upsert, never append.
   Never write to Basecamp as anyone but Ali (guard on `/my/profile.json` id 17454835, or
   the service identity the sync is supposed to use); halt if the identity is wrong.

5. **Verify and report.** Add/extend tests that assert the completion check catches each
   missing-piece case, and run the create flow against one real project end to end. Report
   the before/after map, the files changed, and a completion-check transcript proving all
   four conditions pass. Follow this repo's idempotency, failure-first, and contract rules.

Reference implementation to mirror (already proven on Detroit, Social Pilot, IPOS): the
Colaberry Accelerator skill `.claude/skills/story-build/scripts/publish_story_build.js`
shows the exact Basecamp structure, the AI/Human split rule, the builder + approver-gate
model, the 5-doc set, the 4 gates, and the identity guard. Match that structure on the
My Day side.
