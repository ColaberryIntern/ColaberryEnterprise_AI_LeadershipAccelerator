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
## 2026-11-15 — folded into the agent workspace, and a gate that was not a gate

- [x] Fold Maya's two standalone pages into `/admin/agents/:id`, and close the enablement bypass
  - Date: 2026-11-15
  - Session: CC-20261109-k2w7
  - What changed: `/admin/maya` and `/admin/outbound-approvals` retired into the existing agent
    workspace — the outbound queue as a conditional 8th tab, the capability dial as a section in
    the existing Tools & access tab. Both URLs now redirect. `POST /api/admin/workforce/agents/:id/reactivate`
    gained the Ali-only check for governed agents.
  - Verification: backend and frontend `tsc --noEmit` clean, each proven by a planted control
    error being the only reported error; `checkTestTypecheck.js` at 8192MB heap matched the
    baseline exactly in both directions; all 6 CI guard scripts pass; backend suite 2812 passed /
    3 known pre-existing CRLF failures; frontend 730 passed / 1 known CRLF failure / 3 helper
    files that are not suites; `CI=true react-scripts build` exit 0. Four mutants planted against
    the new gate, all four killed, source restored byte-identical.
  - Notes: **The hole this closed is the important part.** PR #4054 put an `isCoryAuthorizedIdentity`
    check on `POST /api/admin/maya/enable` and `MAYA_GOVERNANCE.md` then stated "Turn her agent row
    ON | Ali or a super_admin" as a property of the system. It was a property of one route.
    `/api/admin/workforce/agents/:id/reactivate` has been `requireAdmin` since 2026-08-24, writes
    `enabled: true` on any agent by id, and is what the workspace's own Reactivate button calls —
    so any admin could already turn her on. The check now lives at the route that can actually
    write the column. Its tests assert the two directions that matter: it does NOT fire for an
    ungoverned agent, and it is NOT present on the deactivation path, because narrowing must stay
    open to any admin.
  - Also: the fold-in deliberately did **not** inherit the destination's gates. The Email tab's
    routes are `requireAgentManagerOrAdmin()`, two rungs wider than `requireCoryAuthorized`;
    approving an email draft there sends nothing, while approving on the Outbound tab sends. The
    new tab keeps its own routes and says the difference on screen.
  - Tab budget: the 7-tab pin in `AgentDetailLayout.test.tsx` is untouched because the new tab is
    conditional on a frozen, test-pinned agent list. Two tests added — the 8th tab for her, and a
    control that an agent not on the list still renders exactly 7.

---

## 2026-11-15 — the fold-in deployed and production-verified

- [x] Deploy PR #4067 and verify the folded surfaces in the running containers
  - Date: 2026-11-15
  - Session: CC-20261109-k2w7
  - What changed: nothing in the repo. Ali merged PR #4067; the branch was rebased onto main
    first to clear a conflict in this file (PR #4065 and PR #4067 both appended here; both
    entries were kept). Deployed with `./scripts/deploy-prod.sh backend nginx` in registry mode,
    exit 0, box at main HEAD `0e73f94ea`.
  - Verification: the fold-in commit `9164665b7` proven an ancestor of the deployed tree on the
    box; `governedEnablementAgents.js` and the refusal text `requires Ali or a super_admin` found
    inside the running backend container with a control string at 0; five strings new to this PR
    (`Outbound approvals`, `moved onto her agent workspace`, `waiting for a decision`,
    `difference between this tab and Email`, `global, not per-agent`) found in the frontend chunks
    copied out of the running nginx container, with two pre-existing tab labels as positive
    controls and a bogus string at 0; the retired page's header `Maya: go live` at 0; the carrying
    chunk served 200 over HTTPS; all three admin URLs resolve. Read-only SELECTs confirm nothing
    was switched on: `enabled=false`, 0 promotions, 0 queued messages, 0 tool grants.
  - Notes: **Two of my own checks were bad instruments and were discarded rather than reported.**
    (1) Comparing the running image to `sha-<HEAD>` returned MISSING for both services, because
    registry mode pulls `:main` and the sha tag is never pulled locally; replaced with running-id
    equals `:main`-id, on top of the registry comparison `deploy-prod.sh` had already made before
    pulling. (2) Grepping `main.<hash>.js` for the new strings returned 0 — but it also returned 0
    for `Tools & access` and `Decisions & evidence`, live for months, which is what exposed the
    instrument rather than the deploy: the admin UI is code-split across 399 chunks. Separately,
    compose again reported `Running` rather than `Recreated` with uptime unchanged, because a
    concurrent session had already pulled the same image 25 minutes earlier.
  - Gap unchanged: `agent_domain_tool_grants` is still 0 rows across all 276 agents, so her
    dashboard still reads "held without a grant". Writing those rows is a production database
    write through the change-request spine, not something any deploy performs.
