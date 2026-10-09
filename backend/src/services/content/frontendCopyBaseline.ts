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
 * HOW TO CHANGE IT. Fix the copy, run the suite, and paste the number the failure tells you.
 * Never raise an entry to make a build pass - raising one is the thing this file exists to
 * prevent. Approved replacements are "$0 to start" and "No card needed" (40 TAC 807.172(d)).
 */

/** Repo-relative paths with forward slashes, mapped to the exact number of copy occurrences. */
export const FRONTEND_COPY_BASELINE: Readonly<Record<string, number>> = {
  'frontend/src/components/AdvisoryCTABlock.tsx': 2,
  'frontend/src/components/Layout/PublicFooter.tsx': 2,
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
  'frontend/src/pages/AIArchitectLandingPage.tsx': 11,
  'frontend/src/pages/AIPilotVerticalPage.tsx': 1,
  'frontend/src/pages/AIWorkforceDesignerPage.tsx': 4,
  'frontend/src/pages/AIXceleratorLandingPage.tsx': 1,
  'frontend/src/pages/AdvisoryPage.tsx': 8,
  'frontend/src/pages/AgencyPartnerPage.tsx': 2,
  'frontend/src/pages/ContactPage.tsx': 9,
  'frontend/src/pages/DemoDayPage.tsx': 6,
  'frontend/src/pages/EnrollPage.tsx': 9,
  'frontend/src/pages/ExecutiveROICalculatorPage.tsx': 3,
  'frontend/src/pages/HomePage.tsx': 23,
  'frontend/src/pages/InstructorPage.tsx': 4,
  'frontend/src/pages/LeaderboardPage.tsx': 2,
  'frontend/src/pages/ManagementPreviewPage.tsx': 18,
  'frontend/src/pages/PilotAITeamPage.tsx': 6,
  'frontend/src/pages/PilotExclusivePage.tsx': 4,
  'frontend/src/pages/PilotZeroRiskPage.tsx': 1,
  'frontend/src/pages/PricingPage.tsx': 25,
  'frontend/src/pages/ProgramPage.tsx': 7,
  'frontend/src/pages/SponsorChallengePage.tsx': 12,
  'frontend/src/pages/SponsorshipPage.tsx': 6,
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
  'frontend/src/pages/publicV2/HomeV2.tsx': 5,
  'frontend/src/pages/publicV2/PlatformV2.tsx': 3,
  'frontend/src/pages/publicV2/PricingV2.tsx': 5,
  'frontend/src/pages/publicV2/SignupV2.tsx': 3,
  'frontend/src/pages/publicV2/TryV2.tsx': 9,
};

/** The sum the baseline asserts, kept beside it so a careless edit to the table is visible. */
export const FRONTEND_COPY_BASELINE_TOTAL = 287;

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
