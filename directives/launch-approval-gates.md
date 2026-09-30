# Directive — Launch Oversight Approval Gates

**Status:** active · **Owner:** Ali (sole approver) · **System:** AI Systems Architect Accelerator launch (Basecamp project 47502609) · **Established:** 2026-06-10

## Goal
Every launch deliverable that needs Ali's oversight sign-off is gated **inside its own functional area**, by a "Review and approve X" todo bound to the task that produces the artifact. There is **no standalone "Approval Queues" list.**

## Why (background)
The PMO task generator originally emitted a separate **"Approval Queues"** area. The LLM invented approvals there independently of the real work, so that list became a pile of:
- **duplicates** of the review/approve gates that already exist inside each area,
- **orphans** with no producing task, and
- **misfiled producer tasks** ("Draft X") that are not approvals at all.

The 2026-06-10 audit found **17/17** approvals in that list had no artifact wired. It was retired wholesale; coverage was preserved because each area already carries its own bound gate.

## The model
- **Source of truth = tasks.** Approvals are derived from tasks, never maintained as a parallel list.
- **A task needs an oversight gate** when its deliverable meets one of these triggers:
  1. **External / public-facing & brand** (website, landing pages, public comms, brand/visual identity, viral content)
  2. **Financial / pricing / contractual** (pricing, SKUs, spend, vendor/partner commitments)
  3. **Compliance / legal / regulatory** (TWC, accreditation, data/privacy)
  4. **Strategic & irreversible decisions** (cohort size/cadence, curriculum scope, capstone rubric, launch go/no-go, governance)
- **Where the gate lives:** in the same area list as the producer, titled like a review/approval, with the producing task named in its Dependencies.

## Inputs / Outputs
- **Input:** the generated per-area task set (`generateLaunchTasks.js`) and the project list scaffold (`setupLaunchProject.js`).
- **Output:** each area list containing its producers plus its bound oversight gate(s). No "Approval Queues" list exists in the project.

## Safety constraints
- `setupLaunchProject.js` MUST NOT declare an "Approval Queues" todolist.
- `generateLaunchTasks.js` `AREA_CONFIG` MUST NOT contain an "Approval Queues" key.
- Deletions of Basecamp records are done by **trashing** (recoverable ~30 days), never hard delete, and only via a dry-run-first script.

## How success is verified
- **Automated guard:** `backend/src/scripts/lib/__tests__/noApprovalQueueArea.test.js` fails if either generator file re-introduces the area. Run: `npm test`.
- **Live audit (read-only):** `node backend/src/scripts/auditApprovalQueue.js --json` — must report that the "Approval Queues" list does not exist; oversight gates are visible inside their areas.
- **Cleanup (if it ever regenerates):** `node backend/src/scripts/retireApprovalQueue.js` (dry-run), then `--expect <n> --commit` to trash it again.

## Edge cases
- **An orphan oversight need surfaces** (a real decision with no producing task): create the producing task in the correct area first, then add its bound gate there — do not create a freestanding approval.
- **A regenerated list appears** after a generator run on an older revision: re-run `retireApprovalQueue.js` and confirm the generator is on the fixed revision.

## Related
- `backend/src/scripts/lib/approvalArtifactLink.js` — the readiness contract (a gate is "ready" only once its artifact marker is present; held out of the action queue until then).
- `backend/src/scripts/lib/launchPmoDailyUpdate.js` — Phase-1 readiness gate that holds artifact-less approvals out of the human action queue.
