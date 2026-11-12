# CC-20261109-k2w7 — MR2: Maya gets an email capability, and it starts in shadow

**Date:** 2026-11-12
**Branch:** `workstream/mr4-maya-welcome-audience-and-delivery` off `origin/main` @ `031db3b5c`
**Ticket:** MR2, https://3.basecamp.com/3945211/buckets/7463955/todos/10503714629
**Run:** `.loop-architect/runs/20261112-maya-release-ladder/` (gitignored)

## The thing the ticket exists to say

"Release Maya on email" reads like a flag flip and is not one. **There was no Maya email capability
to flip.** Her governed capability set was exactly four — `respondToExplorerDm`,
`sendInAppWelcome`, `createJourneyHandoff`, `readPerson360` — and none of them is email. A test at
`mayaCapabilityRoutes.access.test.ts:68` even asserted `sendEmail` was an *unknown* capability and
must be rejected with a 400. That rejection was the proof it did not exist.

## T005 — declaring the capability

A Maya capability is four edits keyed on one string literal, and `mayaEnablement.ts:29-30` states
the design rule explicitly: adding one adds **no new flag**. The resolver composes gates that
already exist, so there is no second flag registry and no second kill switch.

| Edit | File |
|---|---|
| Union member | `backend/src/services/mayaEnablement.ts` `MayaCapability` |
| Gate mapping | `backend/src/services/mayaEnablement.ts` `MAYA_CAPABILITY_GATES` |
| Promotion default | `backend/src/services/maya/mayaPromotion.ts` `DEFAULT_STATES` |
| Proactive set | `backend/src/services/maya/mayaPromotion.ts` `NEEDS_M29_FOR_LIVE` |

### The gate decision, which is the reviewable part

`sendEmail: { growth: 'journeyExecution' }` — **no Explorer gate.**

Every other outbound capability pairs `journeyExecution` with the Explorer flag for its channel,
because `inAppNudge` gates the in-product surface. Email has no such flag. The Explorer feature
union is `signalIngest`, `journeyIntelligence`, `journeyGovernor`, `draftRender`, `commercial`,
`aliOutreach`, `sms`, `autoDial`, `inAppNudge`, `aiRanking` — and none of them is an email channel.
`draftRender` gates *rendering* a draft, not sending one; borrowing it would make the gate read as
something it is not.

Fewer gates is the uncomfortable direction, so it is worth being explicit about what still stands
between this capability and a real inbox. Six independent things, all of them off or absent in
production today:

1. the promotion record (`system_settings` key `maya_capability_promotions` — **no Maya promotion
   records exist**),
2. `GROWTH_JOURNEY_EXECUTION_ENABLED` (**unset**),
3. Maya's `ai_agents` row (**`enabled=false`**),
4. her `send_email` grant (`agentRegistrySeed.ts:3326` records it as deliberately absent),
5. a brand scope (`agentEmailTool.ts` drafts rather than sends without a campaign),
6. `evaluateSend`, the consent chokepoint.

This flag is one of six, not the only one.

### `DEFAULT_STATES.sendEmail = 'shadow'`

There is no argument for a different default. `respondToExplorerDm` is `live` only because she had
been answering portal DMs since C121 and starting it in shadow would have silenced her on deploy.
**Nothing has ever sent an email as Maya**, so there is no existing behavior for a shadow default
to interrupt.

### The test that had to be inverted

`mayaCapabilityRoutes.access.test.ts` asserted `sendEmail` → 400. It now returns 200, and that flip
is the proof the registry picked the capability up. The unknown-capability probe moved to
`notACapability`, a name nothing will ever register — otherwise the next capability to ship would
silently turn that assertion into a test of its own existence rather than of the rejection. Two
cases were added alongside it: `sendEmail` promote is **200 for Ali** and **403 for any other
admin**, because the capability that can reach a stranger's inbox must not be promotable by
whoever happens to be signed in.

## Verification

- **66 tests pass** across `mayaEnablement.test.ts`, `mayaPromotion.test.ts` and
  `mayaCapabilityRoutes.access.test.ts`. The first two suites are enumeration-driven over
  `MAYA_CAPABILITIES`, so the new capability is automatically carried through every default-off,
  kill-switch and flag case; the added blocks pin only what is true of `sendEmail` and nothing
  else.
- The load-bearing new assertion: **a promotion alone does not make it live.** Promoting with M29
  off resolves `shadow` with reason `m29:growth_flag_off:journeyExecution`. If that ever resolves
  `live`, one signature has become enough to mail a stranger.
- **Mutation tested, both directions:**
  - dropping `sendEmail` from `NEEDS_M29_FOR_LIVE` → the promotion-alone test fails (1 test).
  - borrowing `inAppNudge` as its Explorer gate → the no-explorer-gate test fails (1 test).
  - restored: 55 pass.
- `tsc --noEmit`: 0 errors. Proven real earlier in this run by a planted control error reported at
  `mayaToolsService.ts(1049,7)`.
- `growthJourneyFlags.test.ts` and `explorerGrowthFlags.test.ts` still pass — these are raw text
  scans that fail the build on any dotted sub-flag read outside the flags module, **including
  inside a comment**, and the new docblock names flags in prose without dotted reads.

## Not done here, deliberately

Granting `send_email` in `agentRegistrySeed.ts` and giving Maya a brand scope are listed under
MR2's "what to do", but they are promotion-ladder rungs: they are what makes a send *possible* once
the capability exists. Both are documented as rungs in the MR5 release-gate runbook. No capability
was promoted. No flag was flipped.
