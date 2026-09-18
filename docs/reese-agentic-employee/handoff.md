# Reese Product Phase 1: handoff

For anyone checking this live, not just Ali, and not requiring any code knowledge.

## What to check, step by step

1. **Open Reese's Agent Detail page**: log into the admin portal, go to Agents, click Reese, or
   go directly to `https://www.refactored.ai/admin/agents/97dfbdf4-0e5b-4d86-b060-f4087b61f311`.
   Click the "Overview" tab.

2. **Find "Employee facts"** — a card on the right side of the page, below "Role charter." You
   should see:
   - **Availability**: a green "Available" pill.
   - **Work state**: "Working" with an open-ticket count, or "idle" if she has none right now.
   - **Last meaningful action**: a real time ("X minutes/hours ago") and a short description of
     her actual last DM or ticket activity — never a generic "online" status.
   - **What would be wrong:** if this says "Unavailable" while you know she's supposed to be
     live, or if "Last meaningful action" says "No recorded activity yet" while you know she has
     been messaging students, something is broken — that's not supposed to happen while she's
     enabled and active.

3. **Find "Charter version"** in the same card — it should say **"v2"** with a real date next to
   it (2026-09-18). If it says "Unversioned," the version 2 charter did not apply and needs
   re-running (`applyReeseCharterV2.ts --apply` on the production host).

4. **Find "Manager chain"** in the same card — it should say **"Reports to: Ali Muwwakkil."**
   If it names anyone or anything else (especially "workforce_intelligence_engine"), the
   manager-chain fix did not take and needs re-running
   (`reassignReeseToAli20260918.ts --commit`).

5. **Find each behaviour and its switch**, listed below the manager chain: Reactive DM reply,
   Autonomous outreach sweep, Outreach follow-ups, Welcome DMs, Student support supersession
   resolver, Presence heartbeat, Health assessment. Each shows a green "On" or a red "Off" pill.
   Today, every one except "Student support supersession resolver" should read On (that one is
   intentionally seeded Off in code — if you see it On in production, that's a known, disclosed
   drift from before this phase, not something this phase caused, and worth asking about).

6. **Compare "Last meaningful action" against Reese's real recent messages.** If you know Reese
   replied to a student 5 minutes ago but this field still says "2 hours ago" or shows nothing,
   the page is stale — refresh it. If it stays wrong after a refresh, that's a real bug to
   report.

7. **Scroll to "Role charter"** (just above Employee facts): the title should still read
   **"AI Mentor — Student Success & Retention"** with the em dash intact, and the mission
   paragraph should be exactly as Ali wrote it on 2026-09-10 — this phase deliberately did not
   change a word of it (see the report's item 16 for the one open decision about it).
   **Known issue, not a bug:** that mission paragraph still says Reese reports through
   `workforce_intelligence_engine` to Kes. That sentence is stale — the "Reports to" panel and
   the real database fields are correctly Ali — and it is also baked into Reese's own live
   conversation prompt, so she would currently describe her own chain incorrectly if asked. This
   is expected until Ali answers item 16, not something to try to fix on this page yourself.

## If something looks wrong

- **The page won't load, or looks broken/blank:** that's a real production problem — say so and
  stop; don't try to fix it yourself.
- **Any of the four checks above (availability, charter version, manager chain, behaviour
  switches) shows the wrong value:** note exactly which one and what it showed, and flag it —
  don't guess at a fix.
- **Everything above looks right, but something Reese does with a real student seems off**
  (a wrong reply, a missed message, a duplicate welcome): that is a behaviour question, not a
  Phase 1 verification question — Phase 1 changed no student-facing behaviour, so anything wrong
  there predates this deploy and should be reported separately.

## Rollback, if needed

Three independent undo paths exist, none require touching code:
1. **Charter:** run `activateCharterVersion(reese, 1)` to restore Ali's original charter exactly.
2. **Manager chain:** run `reassignReeseToAli20260918.js --revert
   /opt/colaberry-accelerator/undo-logs/reassign-reese-to-ali-undo-log-1789744581803.json`.
3. **Code:** revert PR #2703 and redeploy.

None of these three are connected — rolling back one does not require rolling back the others.
