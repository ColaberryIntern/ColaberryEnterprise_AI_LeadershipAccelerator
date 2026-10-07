/**
 * frontendCopyBaseline — the frozen, SHRINK-ONLY high-water mark for banned-word copy in
 * `frontend/src/pages` and `frontend/src/components`.
 *
 * WHY A BASELINE AND NOT A CLEAN GATE. The rule is already being broken, 287 times across 71
 * files, and a lint that simply fails cannot be merged: it would block every unrelated pull
 * request until a 71-file copy rewrite lands, so it would be turned off instead. A baseline
 * makes the existing breach a tracked, named number and gates the only thing that can still be
 * prevented today - a NEW one.
 *
 * WHY SHRINK-ONLY AND NOT "AT MOST". The ratchet requires EXACT equality per file, in both
 * directions. Going up is a new violation. Going DOWN also fails, with the new number in the
 * message, and an entry that reaches zero must be deleted outright. That is what stops the
 * baseline from quietly becoming a permanent allowance: every improvement is forced into this
 * file, so the number here is always what is actually in the tree, and "advisory forever" is
 * structurally unavailable.
 *
 * WHAT A NUMBER COUNTS. Occurrences, not lines: `'Free Access ✓' : 'Grant Free Access'` is two.
 * The classification is `bannedCopyScanner`'s - comments, import paths, registry keys and
 * machinery attributes are excluded there and are not counted here.
 *
 * MEASURED 2026-10-06 against the worktree at `workstream/enterprise-agents`:
 *   1,059 files scanned, 436 raw occurrences of the word, classified as
 *   287 copy + 122 comment + 13 jsx-attribute + 4 url-or-path + 3 identifier
 *   + 3 claim-key + 2 dotted-key + 2 object-key = 436, nothing unclassified.
 *
 * THE RATCHET TURNING, 2026-10-07: 287 -> 246, and 71 entries -> 64. Seven files reached zero
 * and were deleted outright rather than lowered, which is the rule. Two of the 41 occurrences
 * were the shared CTA's own surface, `Layout/PublicFooter.tsx`; the other 39 were per-page copy
 * rewritten sentence by sentence. The seven, with the occurrences each gave up:
 *   Layout/PublicFooter.tsx 2, AIArchitectLandingPage 11, AdvisoryPage 8, ContactPage 9,
 *   DemoDayPage 6, ExecutiveROICalculatorPage 3, LeaderboardPage 2 = 41, and 287 - 41 = 246,
 *   which is what the suite measured. Every entry still listed below was re-measured in the
 *   same run and matched, so nothing regressed to pay for the improvement.
 * The numbers above are the ORIGINAL measurement and are left alone on purpose: they record
 * the breach this file was created to fence, not the state of the tree today.
 *
 * AND THE HOLE THAT TURN EXPOSED, which matters more than the 41. The primary CTA's label is
 * ONE string - `PRIMARY_CTA` in `frontend/src/constants/index.ts` - rendered by the navbar
 * (desktop and mobile) and the footer, which makes it the most-published copy on the public
 * site. `frontend/src/constants` is not a baseline root, and the components that render it hold
 * only `{PRIMARY_CTA.label}`, so THIS LINT CANNOT SEE IT. Proved by mutation on 2026-10-07:
 * setting that label back to the banned string and running this suite gives 14/14 PASS. The
 * same blind spot covers `frontend/src/config` (the pricing tiers' displayed names and CTA
 * labels) and `frontend/src/App.tsx`. Growing `BASELINE_SCOPE.roots` to reach them requires
 * measuring those trees and entering what is found, which is a change to this contract rather
 * than a copy fix - so it is recorded here rather than done quietly in passing.
 *
 * THE RATCHET TURNING AGAIN, 2026-10-07: 246 -> 159, and 64 entries -> 58. This turn is the
 * marketing-page copy itself rather than the shared CTA. Every "Start free" string under
 * `frontend/src/pages` is gone, rewritten sentence by sentence so the low-friction promise
 * still leads ("Explore the whole platform yourself, $0 to start"), with "No card needed" used
 * where a real price sits in the same line and two dollar figures would collide. Six more files
 * reached zero and were deleted: HomePage 23, InstructorPage 4, ProgramPage 7,
 * SponsorChallengePage 12, SponsorshipPage 6, publicV2/PricingV2 5 = 57. Three were lowered
 * rather than cleared, and what survives in each is deliberate:
 *   PricingPage 25 -> 1. The survivor is `id: 'free'`, the plan's identity in code: it keys the
 *     React list and the `pricing_free_cta` analytics event, and the scanner over-flags a lone
 *     tier value by design. The card's displayed name and its CTA label are both rewritten.
 *   publicV2/TryV2 9 -> 5, publicV2/HomeV2 5 -> 3. What is left is the product surface called
 *     the "Free Company Workspace", whose own wording is `surface.free.workspace` in
 *     `frontend/src/config/claimsRegistry.ts` and renders directly beside those CTAs. Renaming
 *     the button alone would desync the page from the claim it is attached to, so that name is
 *     a brand-governance decision rather than a copy edit. Two of TryV2's five are alt text
 *     transcribing a screenshot of the in-product banner; rewriting it would misdescribe the
 *     image, and the real fix is a new screenshot.
 * TryV2 took "No card needed" throughout instead of "$0 to start" because its own suite asserts
 * that no price of any kind renders on /try - route-scoped price claims - and "$0" is a price.
 *
 * HOW TO CHANGE IT. Fix the copy, run the suite, and paste the number the failure tells you.
 * Never raise an entry to make a build pass - raising one is the thing this file exists to
 * prevent. Approved replacements are "$0 to start" and "No card needed" (40 TAC 807.172(d)).
 */

/** Repo-relative paths with forward slashes, mapped to the exact number of copy occurrences. */
export const FRONTEND_COPY_BASELINE: Readonly<Record<string, number>> = {
  'frontend/src/components/AdvisoryCTABlock.tsx': 2,
  'frontend/src/components/admin/PersonHistoryDrawer.tsx': 3,
  'frontend/src/components/admin/revenue/ExplorerRosterModal.tsx': 1,
  'frontend/src/components/admin/revenue/UpcomingPaymentsCard.tsx': 1,
  'frontend/src/components/admin/revenue/format.ts': 1,
  'frontend/src/components/explorerGrowth/ContentTab.tsx': 1,
  'frontend/src/components/growthJourney/ClassificationTab.tsx': 1,
  'frontend/src/components/growthJourney/ContentRulesTable.tsx': 1,
  'frontend/src/components/membership/MembershipLanding.tsx': 3,
  'frontend/src/components/membership/OpenHouseModal.tsx': 2,
  'frontend/src/components/membership/personaContent.ts': 13,
  'frontend/src/components/portal/lesson/ImplementationTask.tsx': 1,
  'frontend/src/components/publicV2/CtaInterrupt.tsx': 1,
  'frontend/src/components/publicV2/HeroPlatformV8.tsx': 1,
  'frontend/src/components/publicV2/HeroPricingV8.tsx': 7,
  'frontend/src/components/publicV2/HeroServicesV8.tsx': 1,
  'frontend/src/components/publicV2/HeroV8.tsx': 1,
  'frontend/src/components/publicV2/OpenPlatform.tsx': 2,
  'frontend/src/components/publicV2/PublicFooterV2.tsx': 1,
  'frontend/src/components/publicV2/PublicHeaderV2.tsx': 1,
  'frontend/src/components/timeline/ArchitectTimeMachine.tsx': 2,
  'frontend/src/components/timeline/claudeStudioParse.ts': 1,
  'frontend/src/pages/AIPilotVerticalPage.tsx': 1,
  'frontend/src/pages/AIWorkforceDesignerPage.tsx': 4,
  'frontend/src/pages/AIXceleratorLandingPage.tsx': 1,
  'frontend/src/pages/AgencyPartnerPage.tsx': 2,
  'frontend/src/pages/EnrollPage.tsx': 9,
  'frontend/src/pages/ManagementPreviewPage.tsx': 18,
  'frontend/src/pages/PilotAITeamPage.tsx': 6,
  'frontend/src/pages/PilotExclusivePage.tsx': 4,
  'frontend/src/pages/PilotZeroRiskPage.tsx': 1,
  'frontend/src/pages/PricingPage.tsx': 1,
  'frontend/src/pages/UtilityCoopLandingPage.tsx': 2,
  'frontend/src/pages/UtilityIOULandingPage.tsx': 2,
  'frontend/src/pages/admin/AdminCommunityRolesPage.tsx': 5,
  'frontend/src/pages/admin/HandoffDetailPage.tsx': 1,
  'frontend/src/pages/admin/marketing/composer/ComposerSetup.tsx': 1,
  'frontend/src/pages/admin/orchestration/FeedControlTab.tsx': 2,
  'frontend/src/pages/admin/orchestration/TimelineEditorTab.tsx': 2,
  'frontend/src/pages/admin/orchestration/studio/studioKit.tsx': 1,
  'frontend/src/pages/portal/ClassroomPage.tsx': 2,
  'frontend/src/pages/portal/certprep/CertPrepPage.tsx': 1,
  'frontend/src/pages/portal/community/CommunityPage.tsx': 1,
  'frontend/src/pages/portal/company/CompanyPage.tsx': 8,
  'frontend/src/pages/portal/path/PathPage.tsx': 1,
  'frontend/src/pages/portal/points/LevelJourney.tsx': 3,
  'frontend/src/pages/portal/projects/WorkspaceRepoPanel.tsx': 1,
  'frontend/src/pages/portal/projects/demoPrepGuide.ts': 1,
  'frontend/src/pages/portal/runtime/runtimeKit.tsx': 1,
  'frontend/src/pages/portal/settings/EnrollmentSection.tsx': 2,
  'frontend/src/pages/portal/settings/SettingsPage.tsx': 1,
  'frontend/src/pages/portal/settings/SubscriptionSection.tsx': 4,
  'frontend/src/pages/portal/settings/TeamSection.tsx': 1,
  'frontend/src/pages/portal/today/TodayShell.tsx': 7,
  'frontend/src/pages/publicV2/HomeV2.tsx': 3,
  'frontend/src/pages/publicV2/PlatformV2.tsx': 3,
  'frontend/src/pages/publicV2/SignupV2.tsx': 3,
  'frontend/src/pages/publicV2/TryV2.tsx': 5,
};

/** The sum the baseline asserts, kept beside it so a careless edit to the table is visible. */
export const FRONTEND_COPY_BASELINE_TOTAL = 159;

/**
 * The scope the baseline was measured over. Anything outside it is NOT covered, and the
 * exclusions are stated here rather than buried in a walk function so the hole is on the record:
 *
 *   - `.ts` and `.tsx` only. A `.css` file can render copy through `content:`, and none of the
 *     11 occurrences in frontend CSS today is one - all 11 sit in CSS comments, checked on
 *     2026-10-06. If that changes, this scope has to grow.
 *   - Test files are out. They assert ABOUT copy ("expect(text).toContain('Free')"), so the
 *     word appearing in them is evidence, not advertising.
 *   - `frontend/src/pages` and `frontend/src/components` only. Other trees under
 *     `frontend/src` were not measured and are not claimed.
 */
export const BASELINE_SCOPE = {
  roots: ['frontend/src/pages', 'frontend/src/components'],
  extensions: ['.ts', '.tsx'],
  excludeDirectories: ['__tests__', 'testEnv'],
  excludeFilePatterns: ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.d.ts'],
} as const;

/**
 * Is this repo-relative path (forward slashes) inside the measured scope?
 *
 * THE SINGLE AUTHORITY on scope, deliberately. The lint's directory walk asks this and nothing
 * else, so there is one place where the question is answered and one place to test. The earlier
 * shape - a walk that pruned directories itself and separately filtered file names - had two
 * answers to one question, and an attempt to break the directory rule left the suite GREEN:
 * every file inside a frontend `__tests__` directory today also ends in `.test.tsx`, so the
 * file-name rule was quietly doing all the work and the directory rule was excluding nothing.
 * It is kept because `__tests__/helpers.ts` is a perfectly ordinary file to add tomorrow, and
 * it is now asserted directly rather than inferred from a tree that happens not to contain one.
 */
export function isInScope(relativePath: string): boolean {
  if (!BASELINE_SCOPE.roots.some((r) => relativePath.startsWith(`${r}/`))) return false;
  const segments = relativePath.split('/');
  const name = segments[segments.length - 1];
  if (segments.slice(0, -1).some((s) => (BASELINE_SCOPE.excludeDirectories as readonly string[]).includes(s))) return false;
  if (BASELINE_SCOPE.excludeFilePatterns.some((p) => name.endsWith(p))) return false;
  return BASELINE_SCOPE.extensions.some((e) => name.endsWith(e));
}
