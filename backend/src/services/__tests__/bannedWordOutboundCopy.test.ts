import * as fs from 'fs';
import * as path from 'path';
import { scanSource, rawMatchCount, FREE_WORD_RULE } from '../content/bannedCopyScanner';

/**
 * COMPONENT J - the banned word "free" on the BACKEND outbound surface.
 *
 * THE RULE. 40 TAC 807.172(d) (Texas Workforce Commission): training must not be advertised
 * as "free". The house phrasings are "$0 to start" and "No card needed". Before this suite the
 * rule had ZERO code enforcement anywhere in the repo - its only artefact was a comment on one
 * React page. A sibling component built `bannedCopyScanner` and the lint over `frontend/src`;
 * this suite is the other half, over the backend.
 *
 * WHY THE SCANNER AND NOT A REGEX HERE. `bannedCopyScanner` already does the hard part with the
 * TypeScript parser, and it is reused rather than reimplemented: a second matcher would drift
 * from the first and the two would disagree about the same file. Its design note explains why a
 * regex over whole files is a trap. The one thing this suite adds is the backend's own scope and
 * the backend's own classification, because the two surfaces fail differently - `frontend/src`
 * is nearly all prose, while `backend/src` is nearly all machinery with prose hidden in it.
 *
 * ── STEP 1: WHAT WAS MEASURED (2026-10-06, worktree `workstream/enterprise-agents`) ─────────
 *
 * 4,067 non-test files under `backend/src`, 798 raw word-boundary occurrences, classified by
 * the scanner as 577 comment + 202 copy + 8 identifier + 5 url-or-path + 4 regex-literal
 * + 2 object-key = 798, with NOTHING unclassified.
 *
 * The 202 that reach the "copy" bucket are NOT 202 violations, and that distinction is the
 * whole deliverable. Classified by hand, they are:
 *
 *   ADVERTISING (the real rule breach) ... ~40, listed in ADVERTISING_STILL_OPEN below plus
 *                                          the 10 this component fixed.
 *   IDIOM .......... "free text" / "free-form" (an unconstrained input field), "feel free",
 *                    "toll-free" (telecom), "step-free" (accessibility: no stairs),
 *                    "credential-free" / "link-free" (meaning "without X").
 *   SENSE: VERB .... "free up room", "would free 60 hours/month".
 *   SENSE: VACANT .. "the next free time", "a free slug", "a free short code".
 *   THIRD PARTY .... factual pricing of someone else's product: Docker Desktop, GitHub,
 *                    VS Code, Google Colab, Anthropic's own Claude Code 101 course.
 *   INTERNAL ....... admin labels, plan display names, enum values, API route segments,
 *                    Sequelize column comments, log lines, internal reports to Ali.
 *   CURRICULUM ..... lesson prose about software economics ("Sampling calls are free",
 *                    "Delegation is not free"). Reaches students; advertises nothing.
 *   POLICY LIST .... the repo's own banned-phrase lists. `skoolQualityGateAgent` detects
 *                    'free trial'; four strategy files forbid "feel free to reach out".
 *                    REWRITING THESE WOULD DISABLE ENFORCEMENT. They are the single most
 *                    dangerous thing a careless fix could touch.
 *   RULE TEXT ...... `bannedCopyScanner` and `brandGovernanceSeed` quote 807.172(d) itself.
 *
 * That is why this suite does not simply fail on the word. Over-flagging is how a lint gets
 * switched off, and nine of the 202 are the enforcement of a neighbouring rule.
 *
 * ── STEP 3: HOW THE RATCHET WORKS ───────────────────────────────────────────────────────────
 *
 * Scope is ALL of `backend/src` except test files. Deliberately not a curated "outbound" file
 * list: a curated list has a hole the shape of the next file somebody adds, and the first draft
 * of this work proved it - a marker-derived "senders" scope returned 23 files, every one of
 * them a false positive (internal status mail to Ali, "toll-free" nine times in one Twilio
 * script) while missing `data/announcementWeek0.ts`, which says "100% Free" to prospects.
 *
 * Two gates, both exact:
 *
 *   BASELINE (shrink-only). Per file, the occurrence count must EQUAL the frozen number. Up is
 *   a new violation. DOWN also fails, naming the new number, and an entry that reaches zero
 *   must be deleted. A file absent from the baseline must have zero. So a new file is covered
 *   the moment it is written, and the baseline can only ever get smaller.
 *
 *   REGRESSION LOCK (zero tolerance). The exact advertising strings removed by this component
 *   may never return as copy anywhere in scope. The baseline alone would not stop that: a fix
 *   lowers a count, and a later re-insertion that also moved an idiom off the same file would
 *   net to the same number.
 *
 * HOW TO CHANGE THE BASELINE. Fix the copy, run the suite, paste the number it tells you.
 * Never raise an entry to make a build pass; raising one is the thing this file exists to stop.
 */

const SRC = path.resolve(__dirname, '../..');

/**
 * The frozen high-water mark: repo-relative path (forward slashes, from `backend/src`) to
 * [occurrence count, why those occurrences are there].
 *
 * The reason is not decoration. It is the record of the Step 1 classification, and it is what
 * a reviewer checks a proposed change against: an entry whose reason says "free text" and
 * whose count went up is not the same event as one whose reason says ADVERTISING.
 */
const BASELINE = {
  // ── ADVERTISING, still open. Outside this component's ownership (see ADVERTISING_STILL_OPEN).
  'controllers/enrollmentController.ts': [4, 'ADVERTISING: two signup-response messages say "your free account"; plus a lead-source label and a log line'],
  'controllers/salesHubCoryController.ts': [1, 'ADVERTISING: "free Open House" in the fact sheet Cory writes sales replies from'],
  'data/announcementWeek0.ts': [5, 'ADVERTISING: the Week 0 lead-magnet card, including the chip "100% Free"'],
  'data/claudeStudios/weeks00to04.ts': [2, 'ADVERTISING: week_theme "Free AI Preview" and "the free-preview week"'],
  'data/weekBlueprints.ts': [3, 'ADVERTISING: week title "Free AI Preview"; two internal tier notes'],
  'seeds/seedColdOutboundCampaign.ts': [1, 'ADVERTISING: "a free, no-commitment tool" in cold-outbound generation instructions'],
  'seeds/seedColdOutboundPhases.ts': [1, 'ADVERTISING: "is a free tool" in phase generation instructions'],
  'seeds/seedKbData.ts': [4, 'ADVERTISING: answer_template "completely free"; plus inbound match keywords and third-party tool pricing'],
  'seeds/seedOfferCampaigns.ts': [3, 'ADVERTISING: "a free 5-minute tool" in three offer-campaign prompts'],
  'seeds/seedOpenHouseCampaigns.ts': [6, 'ADVERTISING: "FREE ... Open House", "Reserve your free seat", four more in the Cory system prompt'],
  'seeds/seedPilotProgramCampaigns.ts': [10, 'ADVERTISING: "Free 14-day build", "First system free", eight more in pilot email instructions'],

  // ── Advertising-adjacent but genuinely ambiguous: a third party's price, not our training.
  'data/claudeCode101Card.ts': [2, "THIRD PARTY: Anthropic's own Claude Code 101 course"],
  'data/selfStudyWeek1.ts': [3, 'THIRD PARTY: VS Code and the Anthropic course; one "to free up room"'],
  'services/intel/sources/ai_tool_of_the_day.ts': [2, 'THIRD PARTY: Google AI Studio and Google Colab pricing in a news card'],
  'services/sbp/commandCenterStory.ts': [2, 'THIRD PARTY: GitHub Pages hosts the Command Center at no charge'],
  'services/sbp/docsBundle.ts': [1, 'THIRD PARTY: GitHub Pages hosting, in the student docs bundle'],
  'services/classroom/rails/certPrepRail.ts': [1, 'AMBIGUOUS: "Free to repeat" on an in-product rail for an enrolled student, not an offer'],

  // ── The repo's own enforcement of a neighbouring rule. Rewriting these disables it.
  'services/agents/openclaw/openclawContentResponseAgent.ts': [1, 'POLICY LIST: forbids "feel free to reach out" in generated comments'],
  'services/agents/openclaw/openclawPlatformStrategy.ts': [2, 'POLICY LIST: forbids "Feel free to reach out" on two platform strategies'],
  'services/agents/skool/skoolPlatformStrategy.ts': [4, 'POLICY LIST: forbids "feel free to reach out" in four Skool rule blocks'],
  'services/agents/skool/skoolQualityGateAgent.ts': [1, "POLICY LIST: 'free trial' is a DETECTED banned phrase here"],
  'services/content/bannedCopyScanner.ts': [3, 'RULE TEXT: the scanner declares the word and quotes 807.172(d)'],
  'services/content/brandGovernanceSeed.ts': [3, 'RULE TEXT: the brand rule quotes 807.172(d) and names the approved phrasings'],

  // ── Curriculum: lesson prose about software economics. Reaches students, advertises nothing.
  'data/architectMindsetWeeks/weeks02to04.ts': [1, "CURRICULUM: quiz option id 'free'"],
  'data/architectMindsetWeeks/weeks05to07.ts': [2, "CURRICULUM: quiz option id 'free' and a distractor about storage cost"],
  'data/certBlueprints/items/d2ToolsAndMcp.ts': [6, 'CURRICULUM: exam items about free-text tool arguments'],
  'data/certBlueprints/items/d4PromptEngineering.ts': [2, 'CURRICULUM: exam distractors about free-text fields and apparent speed'],
  'data/classSessionPlan.ts': [2, 'CURRICULUM: the internship lane in a session plan; a slide title on cost at point of use'],
  'data/classTeachWeek3Thursday.ts': [1, 'CURRICULUM: comparing a free-text field in a grader'],
  'data/classTeachWeeks.ts': [10, 'CURRICULUM: credential-free servers, free-text output, side-effect free resources'],
  'data/claudeCodeWorkshopWeek1.ts': [1, 'CURRICULUM: "while changing it is still free" - cost of a late decision'],
  'data/claudeStudios/weeks09to12.ts': [1, 'CURRICULUM: "free recall" in a study technique'],
  'data/weeks/week1.ts': [1, 'CURRICULUM: changing your mind at the approval gate'],
  'data/weeks/week10.ts': [2, 'CURRICULUM: a policy walk costs no tokens'],
  'data/weeks/week4.ts': [2, 'CURRICULUM: comparing structured fields instead of free text'],
  'data/weeks/week5.ts': [2, 'CURRICULUM: side-effect free resources; a boundary-free tool'],
  'data/weeks/week6.ts': [3, 'CURRICULUM: credential-free servers; "Sampling calls are free" as a quiz option'],
  'data/weeks/week7.ts': [3, 'CURRICULUM: "Delegation is not free" - the cost of a subagent'],
  'data/weeks/week8.ts': [2, 'CURRICULUM: judgment learned in class; automation inherited with the repo'],
  'scripts/session-decks/session12-week6-monday.js': [3, 'PRESENTER NOTE: credential-free servers, sampling cost'],
  'scripts/session-decks/session16-week8-monday.js': [3, 'PRESENTER NOTE: the cost slide and the judgment beat'],
  'scripts/session-decks/week1-notes.js': [1, 'PRESENTER NOTE: changing your mind at the approval gate'],
  'scripts/session-decks/week23-notes.js': [2, 'PRESENTER NOTE: "free at the point of use" - the first-cost beat'],

  // ── Internal: reports, briefs and tickets addressed to staff, never to a prospect.
  'scripts/addMissingUpstreamTasks.js': [1, 'INTERNAL: memo objective about Anthropic-supplied CCA-F vouchers'],
  'scripts/backfillMissedBcAttachments.js': [1, 'INTERNAL: free-text widget in a review-tool description'],
  'scripts/buildAliPersonalSalesRepLists.js': [4, 'INTERNAL: the advertorial NRECA gives Colaberry, in Basecamp todo copy'],
  'scripts/closeEngineCronInstall.js': [2, 'INTERNAL: "free-form inbound questions" in a build-status table to Ali'],
  'scripts/generateAiArchitectRubricsSpreadsheet.js': [1, 'INTERNAL: "feel free to change the spread" in a note to Ali'],
  'scripts/pointsEarnSmoke.js': [1, 'INTERNAL: "free-signup" in a smoke-test failure message'],
  'scripts/runContextualSuggestionDemo.js': [3, 'INTERNAL: a cached re-run costs nothing, in a demo report to Ali'],
  'scripts/sendAleemBrandDesignBrief.js': [1, 'INTERNAL: the funnel name, in a design brief to a contractor'],
  'scripts/sendAliAdMockupReviewV2.js': [2, 'INTERNAL: "Unsplash, free commercial use" in a mockup review to Ali'],
  'scripts/sendAliBackfillAndAdReplyUpdate.js': [1, 'INTERNAL: free-text feedback widget, in a status mail to Ali'],
  'scripts/sendAliBcLoopStoryV2Email.js': [1, 'INTERNAL: "a free feedback loop" in a story mail to Ali'],
  'scripts/sendAliGaiInsightsVisualBrief.js': [1, 'INTERNAL: a brief to Ali on manager visibility'],
  'scripts/sendDavidAdCritiqueRefreshedV2.js': [1, 'INTERNAL: free-text widget, in an ad critique to a contractor'],
  'scripts/sendDavidM4EditsAppliedV4.js': [1, 'INTERNAL: tile overlap options, in an edit round to a contractor'],
  'scripts/sendDecisionQueue.js': [1, 'INTERNAL: "gates free CCA-F access" in the decision queue to Ali'],
  'scripts/sendTwilioVerificationActionEmail.js': [10, 'IDIOM: "toll-free" - the telecom term, ten times in one Twilio status mail'],
  'scripts/setupStudentPlatformBacklog.js': [1, 'INTERNAL: "MCP-free" describing the advisor repo, in a backlog item'],
  'controllers/synthflowWebhookController.ts': [1, 'IDIOM: "Feel free to reply here" - politeness, not a price claim'],
  'db/ensureLandingPageSchema.ts': [1, 'INTERNAL: "free-text destinations" in a column comment'],
  'models/GrowthJourneyContentRule.ts': [2, "INTERNAL: enum value 'free' and a free-preview note, in a column comment"],
  'routes/admin/acceleratorRoutes.ts': [2, 'INTERNAL: the /free-access admin route path'],
  'routes/admin/communityMemberRoutes.ts': [4, 'INTERNAL: the /free-access admin route path and its log lines'],
  'server.ts': [1, 'INTERNAL: "free-tier schema stmt skipped" log line'],
  'seeds/claudeStudioFormat.ts': [3, 'INTERNAL: the cs-free CSS class and the free_response field name'],
  'seeds/seedClaudeStudioCards.ts': [1, 'INTERNAL: "free-response reflection" in a seed validation message'],
  'seeds/seedComponentAuthoring.ts': [5, 'INTERNAL: the free-response field, in authoring instructions for the generator'],
  'seeds/seedDepartments.ts': [2, 'SENSE: VERB - "free analyst bandwidth", "would free 60 hours/month" in demo seed data'],
  'seeds/seedLeadSources.ts': [3, 'INTERNAL: the "Free Training Interest" lead source; form_name is a GHL join key'],
  'seeds/explorerGrowth/explorerSequenceDefinitions.ts': [1, 'INTERNAL: "created a free account" describes account state to an agent'],
  'seeds/growthJourney/journeyProgramDefinitions.ts': [2, 'INTERNAL: policy text on which pathways a program may activate'],
  'seeds/growthJourney/offerPolicyDefinitions.ts': [1, 'INTERNAL: offer-policy note on permitted pathways'],
  'services/agentRegistrySeed.ts': [2, 'SENSE: VERB - "to free resources"; plus third-party RSS feeds'],
  'services/classKit/kitDeckStyles.ts': [1, 'INTERNAL: a CSS comment inside a style template literal'],
  'services/classKit/runOfShow.ts': [1, 'INTERNAL: "the free entry point" in a production note for the class host'],
  'services/cpn/scholarshipInterviewService.ts': [1, 'INTERNAL: an interviewer prompt asking whether they started the training'],
  'services/delivery/websiteDesignGenerator.ts': [2, 'IDIOM: "Step-free routes" - accessibility copy in a generated client demo site'],
  'services/growthJourney/classification/aiClassifier.ts': [1, 'IDIOM: "(no free text)" in a classifier prompt'],
  'services/growthJourney/classification/classify.ts': [2, 'IDIOM: "no free text to read" in two trace reasons'],
  'services/growthJourney/scoring/dimensions.ts': [1, 'IDIOM: "unparsed free text" in a scoring-dimension note'],
  'services/inbox/calendarIntelligenceService.ts': [1, "IDIOM: 'when are you free' is an INBOUND phrase this service detects"],
  'services/leads/prospectAccount.ts': [1, 'INTERNAL: "could not create the free account" error log'],
  'services/lifecycle/generation/effortMeasures.ts': [1, 'IDIOM: "frequency is free text" in a measurement warning'],
  'services/marketing/marketingTaxonomyService.ts': [1, 'SENSE: VACANT - "could not find a free slug"'],
  'services/marketing/trackedLinkService.ts': [1, 'SENSE: VACANT - "could not find a free short code"'],
  'services/paymentReconciliationService.ts': [1, 'INTERNAL: reconciliation reason naming a free Open House enrollment'],
  'services/personHistoryService.ts': [1, 'INTERNAL: "Registered as Explorer (free)" on the admin history drawer'],
  'services/presentation/presentationCapacityService.ts': [2, 'SENSE: VACANT - "the next free time", "nothing is free in the next two days"'],
  'services/progression/bandLadder.ts': [2, "INTERNAL: access: 'free' band enum on two ladder rows"],
  'services/subscriptionAnalyticsService.ts': [1, "INTERNAL: the 'Free Access' comp plan label on an admin revenue surface"],
  'services/subscriptionService.ts': [1, "INTERNAL: the 'Free Access' comp plan display name"],
  'services/timeline/feedControlService.ts': [1, 'INTERNAL: the " · Free" suffix on an admin feed-control label'],
};

/**
 * Advertising copy this component FIXED. These exact strings must never return as copy.
 *
 * Checked through the scanner rather than against raw text, so the code comment at
 * `emailService.ts:1807` ("free member account, magic-link style") does not trip it - that is
 * a comment, and a comment is not advertising.
 */
const REMOVED_ADVERTISING = [
  'free tool that takes your operation',
  'free advisor that walks through',
  'free tool that walks through',
  'free 5-minute AI org design tool',
  'Offer a free strategy call',
  'Offer a free resource',
  'Free to attend',
  'Activate My Free Account',
  'free builder account',
];

/**
 * Advertising the measurement found OUTSIDE this component's ownership (`backend/src/scripts`
 * and `backend/src/services`). Carried here as data so the handover is a list, not prose in a
 * report nobody opens, and asserted to still be in the baseline so it cannot be lost quietly.
 */
const ADVERTISING_STILL_OPEN = [
  'controllers/enrollmentController.ts',
  'controllers/salesHubCoryController.ts',
  'data/announcementWeek0.ts',
  'data/claudeStudios/weeks00to04.ts',
  'data/weekBlueprints.ts',
  'seeds/seedColdOutboundCampaign.ts',
  'seeds/seedColdOutboundPhases.ts',
  'seeds/seedKbData.ts',
  'seeds/seedOfferCampaigns.ts',
  'seeds/seedOpenHouseCampaigns.ts',
  'seeds/seedPilotProgramCampaigns.ts',
];

// ─── scanning ────────────────────────────────────────────────────────────────────────────────

function sourceFiles(dir, out) {
  const acc = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name === 'dist') continue;
      sourceFiles(p, acc);
    } else if (/\.(ts|js)$/.test(e.name) && !/\.test\.(ts|js)$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

/** One pass over the tree, memoised: the scan is the expensive part of this suite. */
let scanned = null;
function scan() {
  if (scanned) return scanned;
  const counts = {};
  const violations = [];
  const unclassified = [];
  let rawTotal = 0;
  let fileCount = 0;

  for (const abs of sourceFiles(SRC).sort()) {
    const src = fs.readFileSync(abs, 'utf8');
    fileCount += 1;
    const raw = rawMatchCount(src);
    rawTotal += raw;
    // Only files that contain the word are parsed. `rawMatchCount` is a plain regex and does
    // not need the parser; a file with zero occurrences has nothing to classify, so parsing it
    // could not change any number below. This is what keeps the suite at a few seconds instead
    // of 73 - parsing all 4,067 files to classify 94 of them is work with no result attached.
    if (raw === 0) continue;
    const rel = path.relative(SRC, abs).split(path.sep).join('/');
    const result = scanSource(abs, src);
    for (const u of result.unclassified) unclassified.push(`${rel}:${u.line}`);
    if (result.violations.length === 0) continue;
    counts[rel] = result.violations.length;
    const lines = src.split('\n');
    for (const v of result.violations) {
      violations.push({ file: rel, line: v.line, text: lines[v.line - 1] || '' });
    }
  }
  scanned = { counts, violations, unclassified, rawTotal, fileCount };
  return scanned;
}

/**
 * The ratchet comparison, as a PURE function so it can be driven with synthetic inputs.
 *
 * A test whose assertion cannot fail is worse than none, and the real tree is clean by
 * construction the moment the baseline is pasted in - so proving THIS can fail needs inputs
 * the tree cannot supply. Hence: pure function, controlled both ways, then applied to the tree.
 */
function ratchetFailures(counts, baseline) {
  const failures = [];
  for (const file of Object.keys(counts).sort()) {
    if (!Object.prototype.hasOwnProperty.call(baseline, file)) {
      failures.push(`${file}: NEW file with ${counts[file]} banned-word occurrence(s) in copy. Rewrite the copy; the approved phrasings are "$0 to start" and "No card needed".`);
    }
  }
  for (const file of Object.keys(baseline).sort()) {
    const frozen = baseline[file][0];
    const actual = counts[file] || 0;
    if (actual > frozen) {
      failures.push(`${file}: ${actual} occurrence(s), baseline ${frozen}. A NEW one landed. Do not raise the baseline.`);
    } else if (actual === 0) {
      failures.push(`${file}: 0 occurrence(s), baseline ${frozen}. Fixed - DELETE this baseline entry.`);
    } else if (actual < frozen) {
      failures.push(`${file}: ${actual} occurrence(s), baseline ${frozen}. Improved - lower the baseline entry to ${actual}.`);
    }
  }
  return failures;
}

/** Pure, for the same reason: the lock is satisfied by the tree, so it is controlled here. */
function lockFailures(violations, phrases) {
  const failures = [];
  for (const v of violations) {
    for (const phrase of phrases) {
      if (v.text.indexOf(phrase) !== -1) {
        failures.push(`${v.file}:${v.line} reintroduces removed advertising copy "${phrase}".`);
      }
    }
  }
  return failures;
}

// ─── the matcher itself ──────────────────────────────────────────────────────────────────────

describe('the banned-word matcher fires on advertising and not on innocent text', () => {
  function copyHits(source) {
    return scanSource('probe.ts', source).violations.length;
  }

  // POSITIVE CONTROLS. If these ever return 0 the whole suite is theatre.
  it('fires on advertising copy', () => {
    expect(copyHits("const a = 'Start your free trial today';")).toBe(1);
    expect(copyHits("const b = 'Start free, upgrade later';")).toBe(1);
    expect(copyHits("const c = 'Reserve your free seat';")).toBe(1);
    expect(copyHits("const d = '100% Free';")).toBe(1);
  });

  // NEGATIVE CONTROLS. Each of these exists in this repo and must never be flagged.
  it('does not fire on a longer word that merely starts with it', () => {
    expect(copyHits("const a = 'freedom to choose the model';")).toBe(0);
    expect(copyHits("const b = 'the agent acts freely';")).toBe(0);
    expect(copyHits("const c = 'a freeform intake field';")).toBe(0);
    expect(copyHits("const d = 'freelance reviewers';")).toBe(0);
  });

  it('does not fire on an identifier or a snake_case key', () => {
    expect(copyHits('const isFree = plan.price === 0;')).toBe(0);
    expect(copyHits("const k = 'free_text';")).toBe(0);
    expect(copyHits('const freeTier = true;')).toBe(0);
  });

  it('does not fire on a comment that discusses the rule itself', () => {
    expect(copyHits('// the word free must never be advertised: 40 TAC 807.172(d)\nconst x = 1;')).toBe(0);
    expect(copyHits('/**\n * Never advertise the word free. Say "$0 to start".\n */\nconst y = 2;')).toBe(0);
  });

  it('declares the rule and its approved phrasings', () => {
    expect(FREE_WORD_RULE.word).toBe('free');
    expect(FREE_WORD_RULE.reason).toContain('807.172(d)');
    expect(FREE_WORD_RULE.approvedAlternatives).toEqual(['$0 to start', 'No card needed']);
  });
});

// ─── the ratchet comparison, controlled both ways ────────────────────────────────────────────

describe('the ratchet can actually fail', () => {
  const baseline = { 'a.ts': [2, 'idiom: free text'] };

  it('passes when the tree matches the baseline exactly', () => {
    expect(ratchetFailures({ 'a.ts': 2 }, baseline)).toEqual([]);
  });

  it('fails on a new occurrence in a baselined file', () => {
    const f = ratchetFailures({ 'a.ts': 3 }, baseline);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('A NEW one landed');
  });

  it('fails on a violation in a file that is not baselined', () => {
    const f = ratchetFailures({ 'a.ts': 2, 'b.ts': 1 }, baseline);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('NEW file');
  });

  it('fails when a baseline entry has stopped violating, so it cannot be padded', () => {
    const f = ratchetFailures({}, baseline);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('DELETE this baseline entry');
  });

  it('fails when an entry improved but was not lowered, so the number stays true', () => {
    const f = ratchetFailures({ 'a.ts': 1 }, baseline);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('lower the baseline entry to 1');
  });
});

describe('the regression lock can actually fail', () => {
  it('fires on a reintroduced phrase', () => {
    const v = [{ file: 'x.ts', line: 7, text: "  const s = 'We built a free tool that walks through this';" }];
    expect(lockFailures(v, REMOVED_ADVERTISING)).toHaveLength(1);
  });

  it('does not fire on innocent copy', () => {
    const v = [{ file: 'x.ts', line: 7, text: "  const s = 'unparsed free text';" }];
    expect(lockFailures(v, REMOVED_ADVERTISING)).toEqual([]);
  });
});

// ─── applied to the tree ─────────────────────────────────────────────────────────────────────

describe('backend/src outbound copy', () => {
  it('is fully classified by the scanner, with nothing unplaced', () => {
    const { unclassified, fileCount, rawTotal } = scan();
    // Non-empty means the SCANNER is wrong, not that the tree is clean.
    expect(unclassified).toEqual([]);
    // Guards against the walk silently matching nothing, which would make every count 0.
    expect(fileCount).toBeGreaterThan(3000);
    expect(rawTotal).toBeGreaterThan(500);
  });

  it('matches the frozen baseline exactly, in both directions', () => {
    expect(ratchetFailures(scan().counts, BASELINE)).toEqual([]);
  });

  it('has not reintroduced any advertising copy this component removed', () => {
    expect(lockFailures(scan().violations, REMOVED_ADVERTISING)).toEqual([]);
  });

  it('still carries every known open advertising site in the baseline', () => {
    // If one of these is fixed, the baseline entry changes and that test fails first, which is
    // the prompt to take the path off this list. It cannot be dropped silently.
    const missing = ADVERTISING_STILL_OPEN.filter(
      (p) => !Object.prototype.hasOwnProperty.call(BASELINE, p),
    );
    expect(missing).toEqual([]);
  });

  it('every baseline entry carries a reason', () => {
    const bad = Object.keys(BASELINE).filter((k) => {
      const entry = BASELINE[k];
      return !(entry[0] > 0) || typeof entry[1] !== 'string' || entry[1].trim().length < 15;
    });
    expect(bad).toEqual([]);
  });
});
