# Session CC-20261109-k2w7 — one Maya, governed, with outbound held for approval

**Decision this implements.** Ali, 2026-11-13, answering a four-option question:
*"On, outbound held for your approval."* Build everything and switch her on, her in-product
surfaces live, and every message she composes for a real person lands in a review queue where
nothing leaves until he approves it individually. SMS and voice stay refused by name.

**Branch:** `workstream/chapter-quality-and-worker` · **Governance model:**
[`docs/maya/MAYA_GOVERNANCE.md`](../maya/MAYA_GOVERNANCE.md)

`PROGRESS.md` is sealed, so this file is the log of record for the run.

---

## What was true before

Measured read-only against production on 2026-11-13.

| | |
|---|---|
| Two Mayas | site chat (`mayaActionService.ts`, 11 tools, gated only by `ENABLE_CHAT`) and portal (`maya/*`, 5 capabilities, governed) |
| `ai_agents` Maya row | `enabled=false`, `status=idle` |
| `maya_capability_promotions` | 0 rows |
| `agent_domain_tool_grants` | **0 rows across all 31 agents** |
| V2 public site | did not mount her widget, so she was absent from every page since 3 Sep 2026 |
| Admin console for any of this | did not exist |

---

## What changed

### The governance spine (T1–T8)

| Change | Where |
|---|---|
| The frozen tool→capability map over both belts, 16 tools, pure data | `services/maya/mayaToolGovernance.ts` |
| The four-mode dial (`off`/`shadow`/`review`/`live`), which splits COMPOSE from DELIVER | `services/maya/mayaPromotion.ts` |
| Refused-by-name set, enforced three ways including a type-level `Exclude` | same |
| The approval-queue table, with `chk_moa_decider_is_a_person` rejecting any `system:` decider | `db/ensureMayaOutboundApprovalSchema.ts` |
| The queue service: enqueue, approve, reject, withdraw, list. No bulk approve, no timer | `services/maya/mayaOutboundQueue.ts` |
| The expiry sweep, which can write only `expired` and is deliberately not boot-wired | `services/maya/mayaOutboundExpiry.ts` |
| THE SEAM: every person-reaching effect resolves its own capability in one place | `services/maya/deliverOrQueue.ts` |
| `sendEmail` moved `shadow` → `review`, in the same change that taught the email service what `review` means | `services/maya/mayaEmailService.ts` + `mayaPromotion.ts` |

### Registration and grants (T9–T12)

Both belts registered in `agentDomain/registeredTools.ts`; 12 lines added to
`capabilities/admissions.json`; `scripts/fileMayaToolGrantRequests.ts` files nine requests through
the existing change-request spine and approves nothing.

### The surfaces (T13–T16)

| Surface | Where |
|---|---|
| `GET/POST /api/admin/maya/outbound` — list, read one, approve, reject | `routes/admin/mayaOutboundRoutes.ts` |
| `GET /api/admin/maya/golive`, `POST /api/admin/maya/enable` | `routes/admin/mayaGoLiveRoutes.ts` |
| `/admin/maya` — the go-live console | `pages/admin/AdminMayaGoLivePage.tsx` + `components/admin/maya/` |
| `/admin/outbound-approvals` — one message at a time | `pages/admin/AdminOutboundApprovalsPage.tsx` |
| Maya mounted on the V2 public site | `components/publicV2/PublicLayoutV2.tsx` |

Authority split everywhere, matching the existing promote/revert asymmetry: **widening is Ali's or
a super_admin's; narrowing is any admin's**, because silencing her during an incident must never
wait on one person.

---

## Verification

Run on this checkout, 2026-11-15.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (backend) | clean. Verified with a planted control error as the only reported error, so the run was proven to be looking at the tree |
| `npx tsc --noEmit` (frontend) | clean, same control-error method |
| `node scripts/checkTestTypecheck.js` (`NODE_OPTIONS=--max-old-space-size=8192`) | "baseline: matched exactly, in both directions" — the new test files add no errors |
| Maya backend suites | 20 suites, 444 tests, all passing |
| New route suites | 50 tests passing |
| New frontend suites | 32 tests passing |
| Related frontend suites (publicV2, campus, nav, routes) | 50 suites, 830 tests passing |
| Full backend suite (`jest.ci.config.ts --ci`) | 2796 of 2802 suites passing; see the three pre-existing failures below |

**19 mutants planted and all 19 killed**, each one verified to have APPLIED before the suite ran,
because a mutation that silently matches nothing reads exactly like a surviving mutant:

| Group | Mutations |
|---|---|
| T13 routes | approve behind `requireAdmin`; approver read from the body; raw address returned; refusal answered 200; a bulk approve route added; enable with no Ali check; enable also writing `autonomy_level` |
| T14/T15/T16 | an approve button on a queue row; a checkbox column; the body rendered as markup; the kill-switch banner dropped; a disabled dial for a refused capability; the widget gated behind consent; attribution started without consent |
| T8 | `review` falling back to shadow; the queue write skipped on a replay; the consent gate stopped blocking; the recipient ref carrying an address; the default back to `shadow` |

### Repo pins whose subject genuinely changed, updated rather than relaxed

| Pin | What changed, and why the update is not a weakening |
|---|---|
| `calendarTarget.test.ts` | Maya no longer calls `createBooking` directly. Now asserted in TWO halves: she still passes `admissionsCalendar()`, and the seam hands that same value through and holds no calendar of its own |
| `agentChangeRequestNoTrigger.test.ts` | the go-live console is a fourth importer. Allowed on the READING side, plus a NEW assertion that it imports the listing function and nothing that decides |
| `identifierPrecedence.test.ts` (T208) | `lead:<id>` / `visitor:<id>` as a recipient handle on a queue row. CLASSIFIED in `NOT_SUBJECT_KEYS` with the reason, per that block's own rule against narrowing the pattern to dodge a match |
| `mayaPromotion.test.ts`, `mayaEmailShippedDefaultCannotSend.test.ts` | the `sendEmail` default moved to `review`. The property they defend — `sent` is unreachable — is unchanged, and the second suite gained four tests: it queues, a replay queues once, and a suppressed recipient is never queued at all |

### Three failures that are NOT from this work

They fail identically on `origin/main` for this checkout. No file this branch changes is read by
any of them, and their own test files are untouched:

- `mountLearnerPortalRoutes.test.ts` — splits a CRLF file on `\n` and compares exact lines
- `generateReeseToolInventory.test.ts`, `generateReeseBehaviourInventory.test.ts` — byte-identical
  render checks against committed docs, failing on line endings

---

## Three things the next person has to know

1. **Lead capture no longer enrols a lead in a campaign.** Five call sites reach
   `enrolLeadInCampaign` and two are inside `captureLeadDetails`, which runs on every lead she
   captures. The last campaign email actually sent was 2026-08-21 and the brand relationship gate
   has held the path shut since, so this costs nothing operationally today — but the safety was
   somebody else's gate, and this build no longer depends on it.
2. **Two effects send without a per-message approval**, under the bounded transactional receipt
   policy: `createBooking` and `sendStrategyCallConfirmation`. Both are receipts of an action the
   visitor just took, on a fixed reviewed template. A test pins that list to exactly two.
3. **Four of her tools are required by no capability record** — `send_document`,
   `draft_marketing_email`, `start_campus_tour`, `create_journey_handoff` — so they stay ungranted
   even with a capability confirmed. Closing that means authoring four capability records with
   real researched evidence. It was reported rather than invented.

## What is not done

- The PR is not open and nothing is merged or deployed. Merge is Ali's click.
- Her agent row is still `enabled=false` and no capability has been promoted in production. The
  console now exists to do both; this run did not reach into the production database to do it.
- `GROWTH_JOURNEY_EXECUTION_ENABLED` remains unset, deliberately. It is one of the switches Ali
  did not choose.

---

## 2026-11-15 — merged and deployed

- [x] Merge PR #4054 and deploy the unified governed Maya to production
  - Date: 2026-11-15
  - Session: CC-20261109-k2w7
  - What changed: Ali merged PR #4054 at 18:40 UTC (merge commit `0e10338445`); deployed to
    production with `./scripts/deploy-prod.sh backend nginx` in registry mode, exit 0, box landing
    on main HEAD `19cefbec8`.
  - Verification: merge commit proven an ancestor of the deployed commit on the box; the three
    compiled Maya markers (`body_changed_since_review`, `kill_switch_unreadable`,
    `queued_for_approval`) found **inside the running backend container** with a control string at
    0; both routers mounted at `dist/routes/adminRoutes.js:317-318` and their route tables
    introspected from the running process; `maya_outbound_approvals` live with
    `chk_moa_decider_is_a_person` and a status vocabulary containing no `auto_approved`; the live
    frontend asset `static/js/main.1be571fa.js` contains `outbound-approvals` with a control at 0.
    Full evidence in `.loop-architect/runs/20261113-maya-unified-governed/deployment-log.md`.
  - Notes: **Two deploy signals were misleading and had to be discarded.** (1) Compose reported
    `Running` rather than `Recreated` and container uptime did not reset — a concurrent session had
    already deployed the same image at 20:18, so the deploy correctly changed nothing, which from
    the exit code alone is indistinguishable from a deploy that failed to change anything. (2) An
    HTTP probe of the new admin routes returned 401, but so did `/api/admin/zzz-not-a-route`: the
    auth gate precedes routing, so 401 proves only that auth works. Both were replaced with checks
    that can fail. Separately, `maya_email_ledger` is absent from the database and that is correct
    — it is a lazy `CREATE TABLE IF NOT EXISTS` inside `mayaEmailService.ensureMayaEmailTable()`,
    created on her first compose, exactly as `maya_welcome_ledger` was.
  - **Gap carried forward:** scope part 3 asked for real `agent_domain_tool_grants` rows written
    through the change-request spine. Registration shipped and removed the `tool_not_registered`
    refusal that was the true cause of zero grants across all 31 agents, but the table is still
    empty, so her dashboard still reads "held without a grant". Writing those rows is a production
    database write and therefore a console action, not something this deploy performed.
