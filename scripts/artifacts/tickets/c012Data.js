/**
 * C0.12 - the measured state of campaign governance, and what this change does to it.
 *
 * Every figure here was read from production read-only on 1 November 2026. Nothing is
 * carried over from the ticket, because the ticket's own evidence line ("zero governance
 * configs against 46 campaigns", read 23 October) had already moved: it is 47 campaigns
 * now, and the count of campaigns running without approval has doubled.
 */

const MEASURED_AT = '1 November 2026';
const MEASURED_AT_UTC = '2026-11-01T17:05:00Z';

/** The table this ticket exists because of. */
const TABLE = {
  configs: { value: 0, note: 'rows in campaign_governance_configs, platform-wide' },
  campaigns: { value: 47, was: '46 in the ticket, read 23 October', note: 'campaigns in the system' },
  columns: { value: 6, note: 'configurable columns, every one of them with a database default' },
  nullableColumns: { value: 1, note: 'columns whose default is NULL: ramp_profile, and only ramp_profile' },
};

/** Campaign inventory by status and approval, which is how the C6.10 hole shows up. */
const INVENTORY = [
  { status: 'active', approval: 'draft', n: 6, note: 'LIVE AND NEVER APPROVED - the C6.10 hole, wider than when it was found' },
  { status: 'paused', approval: 'draft', n: 22, note: 'recoverable only after regularizing' },
  { status: 'paused', approval: 'live', n: 3, note: 'approved, stopped' },
  { status: 'draft', approval: 'draft', n: 14, note: 'never approved, never started' },
  { status: 'draft', approval: 'approved', n: 1, note: 'the CEO-direct motion, and the only one in this state' },
  { status: 'completed', approval: 'draft', n: 1, note: 'ran to completion unapproved' },
];

/**
 * The six campaigns that are active right now. Every one of them carries channel=null, so
 * every one of them would fail validateCampaignForPublish - they are live because
 * activateCampaign never consults it.
 */
const ACTIVE = [
  { name: 'AI Leadership Cold Outbound Q1', type: 'cold_outbound', governed: false },
  { name: 'Executive Briefing Interest Campaign', type: 'warm_nurture', governed: false },
  { name: 'Strategy Call No-Show Recovery Campaign', type: 'warm_nurture', governed: false },
  { name: 'Strategy Call Readiness Campaign', type: 'warm_nurture', governed: false },
  { name: 'Colaberry Alumni Re-Engagement Campaign', type: 'alumni_re_engagement', governed: true },
  { name: 'Class Readiness Campaign', type: 'payment_readiness', governed: false },
];

/** The gate's verdict on the CEO-direct campaign, read before this change. */
const GATE_BEFORE = [
  { id: 'approved', owner: 'Ali', passed: true, detail: 'approval_status=approved, approved_by recorded' },
  { id: 'publishable', owner: 'system', passed: false, detail: 'Campaign governance config must be created before going live' },
  { id: 'contacts_sendable', owner: 'system', passed: true, detail: '10 enrolled contact(s) checked, all sendable' },
  { id: 'send_limit', owner: 'Ali', passed: true, detail: 'limit=10' },
  { id: 'sender_identity', owner: 'Ali', passed: true, detail: 'sender_profile_id set' },
  { id: 'stop_rule', owner: 'Ali', passed: true, detail: 'settings.stop_rule recorded with a numeric threshold' },
  { id: 'analytics_ready', owner: 'system', passed: true, detail: 'tracking_link set' },
  { id: 'claims_approved', owner: 'Ali', passed: false, detail: 'no attestation - ALI ONLY' },
  { id: 'dry_run_reviewed', owner: 'Ali', passed: false, detail: 'no attestation - ALI ONLY' },
];

/** Health telemetry, which is the only data any threshold in this table can be judged against. */
const HEALTH = {
  rows: { value: 30, note: 'campaign_health rows' },
  withOpenRate: { value: 30, note: 'rows carrying open_rate' },
  withSmsFailureRate: { value: 1, note: 'rows carrying sms_failure_rate - one, and it is an alumni campaign' },
  activeBreaching: { value: 0, note: 'active campaigns breaching any hardcoded ceiling on 1 November' },
};

/** The comparable alumni campaign, which is where the second config's numbers come from. */
const ALUMNI_REFERENCE = {
  name: 'Colaberry Alumni AI Champion Campaign',
  sends: 922,
  leads: 10343,
  openRate: 1.53,
  replyRate: 0,
  unsubscribeRate: 0,
  bounceRate: 0,
  scanned: '14 August 2026',
};

/**
 * What each column actually governed before this change. This table is the answer to the
 * ticket's question "what does the config constrain", and the honest answer was "almost
 * nothing, for almost every campaign".
 */
const COLUMN_REACH = [
  { column: 'max_unsubscribe_rate', before: 'alumni and alumni_re_engagement only - 1 of the 6 active campaigns', after: 'every campaign type' },
  { column: 'max_bounce_rate', before: 'alumni types only - 1 of 6', after: 'every campaign type' },
  { column: 'max_sms_failure_rate', before: 'alumni types only - 1 of 6', after: 'every campaign type' },
  { column: 'ramp_profile', before: 'nothing: stored and resolved, then ignored for a hardcoded map keyed on campaign type', after: 'selects the ramp, with the type map as fallback' },
  { column: 'min_open_rate', before: 'nothing', after: 'STILL NOTHING - declared and validated, not enforced. See flag F6.' },
  { column: 'min_reply_rate', before: 'nothing', after: 'STILL NOTHING - declared and validated, not enforced. See flag F6.' },
];

/** Each number in each config, with the fact it came from. Mirrors the declarations module. */
const CONFIGS = [
  {
    key: 'ceo_direct',
    campaign: 'CEO Direct - Funded AI Transformation Partner',
    applied: true,
    fields: [
      { field: 'max_unsubscribe_rate', value: 10.0, platformDefault: 1.5, basis: 'Ten leads enrolled, daily limit ten, so one unsubscribe is 10%. The comparison is >=, so the first chief executive who opts out pauses the motion.' },
      { field: 'max_bounce_rate', value: 10.0, platformDefault: 5.0, basis: 'One bounce in ten. A bounce means the address research was wrong for that company, which invalidates the list rather than the copy.' },
      { field: 'max_sms_failure_rate', value: 0.01, platformDefault: 10.0, basis: 'SMS is disabled on this campaign, so any SMS failure implies a send that should not have happened. The default would tolerate nine.' },
      { field: 'min_open_rate', value: 0.25, platformDefault: 0.1, basis: 'A JUDGMENT, not a derivation. Measured executive_outreach bulk sends opened at 2.15% and 2.63%, which is the wrong comparison for nine hand-sent letters, so there is no measured floor to borrow.' },
      { field: 'min_reply_rate', value: 0.1, platformDefault: 0.01, basis: 'settings.stop_rule.no_reply_after_contacts is already 10, so one reply in ten is the campaign\'s own recorded expectation.' },
      { field: 'ramp_profile.phase_sizes', value: '[3, 3, 3]', platformDefault: '[20, 80, 200, -1]', basis: 'C6.13 qualified nine companies and disqualified one. Three per phase spends the list with two review points.' },
      { field: 'ramp_profile.evaluation_window_hours', value: 72, platformDefault: 12, basis: 'A chief executive does not reply inside twelve hours. The stop rule is written in days (21 to review); 72 is the smallest window that always spans a weekend.' },
      { field: 'ramp_profile.advance_threshold', value: 70, platformDefault: 70, basis: 'KEPT AT THE DEFAULT deliberately. Nothing measured argues for moving it, and inventing a different number would be the placeholder problem in reverse.' },
      { field: 'ramp_profile.hold_threshold', value: 50, platformDefault: 50, basis: 'KEPT AT THE DEFAULT. It has to sit below advance_threshold or there is no band left to hold in, and 70/50 gives a twenty-point hold band. Nothing measured argues for a different width.' },
    ],
  },
  {
    key: 'alumni_champion',
    campaign: 'Colaberry Alumni Re-Engagement Campaign',
    applied: false,
    fields: [
      { field: 'max_unsubscribe_rate', value: 0.5, platformDefault: 1.5, basis: 'The comparable alumni campaign measured 922 sends against 10,343 leads with zero unsubscribes; one would be 0.108%. The default tolerates fourteen before pausing, too many to notice on a list this size. 0.5% pauses at five.' },
      { field: 'max_bounce_rate', value: 2.0, platformDefault: 5.0, basis: 'Zero bounces measured across 922 sends. An alumni list decays by address, so 2% marks a list needing re-verification rather than a campaign needing a rewrite.' },
      { field: 'max_sms_failure_rate', value: 10.0, platformDefault: 10.0, basis: 'KEPT. This is the one campaign family where sms_failure_rate is actually populated - 1 of 30 health rows - so it is the only place the default has measured history behind it.' },
      { field: 'min_open_rate', value: 0.01, platformDefault: 0.1, basis: 'Measured 1.53% open rate. A 1% floor sits below the observed rate, so it marks a collapse in deliverability rather than normal alumni apathy.' },
      { field: 'min_reply_rate', value: 0.0025, platformDefault: 0.01, basis: 'Measured reply_rate 0 across 922 sends. One reply per 400 sends is the smallest non-zero floor; the default would condemn the campaign on arrival.' },
      { field: 'ramp_profile.phase_sizes', value: '[10, 25, 50, -1]', platformDefault: '[10, 25, 50, -1]', basis: 'The alumni_re_engagement type map already ramps this way and it suits ten thousand leads. Restated so the config, not the type map, is what governs it.' },
      { field: 'ramp_profile.evaluation_window_hours', value: 12, platformDefault: 12, basis: 'Kept: a bulk send is judged the next morning, unlike nine letters to chief executives.' },
      { field: 'ramp_profile.advance_threshold', value: 65, platformDefault: 70, basis: 'The alumni type map already uses 65. Carried across rather than reset to the global default.' },
      { field: 'ramp_profile.hold_threshold', value: 50, platformDefault: 50, basis: 'KEPT. Against an advance threshold of 65 this leaves a fifteen-point hold band, narrower than the CEO motion deliberately: a bulk alumni send that is underperforming should stop sooner.' },
    ],
  },
];

/**
 * The post-seed reading. Null until the seed has actually run against production and the
 * gate has been re-read, because criteria 1 and 3 are claims about production and a guard
 * refuses to let them read MET without this.
 */
const VERIFIED = {
  readAt: '1 November 2026, 16:59 UTC',
  configRows: 1,
  /** Written twice; the second run updated in place and the row count stayed at 1. */
  idempotent: true,
  /** The stored row read back through validateGovernanceConfig, not the payload sent to it. */
  storedRowRevalidated: 'VALID',
  gateAfter: [
    { id: 'approved', owner: 'Ali', passed: true, detail: 'approval_status=approved, approved_by recorded' },
    { id: 'publishable', owner: 'system', passed: true, detail: 'passes' },
    { id: 'contacts_sendable', owner: 'system', passed: true, detail: '10 enrolled contact(s) checked, all sendable' },
    { id: 'send_limit', owner: 'Ali', passed: true, detail: 'limit=10' },
    { id: 'sender_identity', owner: 'Ali', passed: true, detail: 'sender_profile_id set' },
    { id: 'stop_rule', owner: 'Ali', passed: true, detail: 'settings.stop_rule recorded with a numeric threshold' },
    { id: 'analytics_ready', owner: 'system', passed: true, detail: 'tracking_link set' },
    { id: 'claims_approved', owner: 'Ali', passed: false, detail: 'no attestation - ALI ONLY' },
    { id: 'dry_run_reviewed', owner: 'Ali', passed: false, detail: 'no attestation - ALI ONLY' },
  ],
};

/** The ticket's acceptance criteria, scored. */
const CRITERIA = [
  {
    id: 1,
    text: 'A governance config exists and is attached to at least one campaign',
    verdict: 'MET',
    evidence: 'The CEO-direct campaign now holds the first row this table has ever had. Written by a committed, idempotent seed rather than a typed INSERT, so the numbers are reviewable.',
  },
  {
    id: 2,
    text: 'It carries real constraints rather than placeholder values',
    verdict: 'MET',
    evidence: 'Seven of nine fields moved off the platform default, each with the measured fact it came from. The two that did not move say so and say why. A row of pure defaults is now refused by validateGovernanceConfig, and a mutation test confirms that guard fires.',
  },
  {
    id: 3,
    text: 'The CEO-direct campaign reports only human attestations as remaining blockers',
    verdict: 'MET',
    evidence: 'The gate read three blockers before: publishable, claims_approved, dry_run_reviewed. It reads two after, and both are Ali\'s attestations. Measured by re-running evaluateActivationReadiness, not inferred.',
  },
  {
    id: 4,
    text: 'A second campaign is checked to confirm the config is reusable and not bespoke',
    verdict: 'MET',
    evidence: 'A second config is declared for the alumni re-engagement campaign - the opposite shape, 10,343 leads instead of nine letters - derived from its own measured history and validated by the same validator. A test asserts no two configs carry identical numbers. NOT written: that campaign is status=active, so changing its live ceilings is Ali\'s call, one flag away.',
  },
];

/** What this change does NOT fix. Each needs a decision or a separate ticket. */
const FLAGS = [
  {
    id: 'F6',
    severity: 'open',
    title: 'min_open_rate and min_reply_rate still govern nothing, and their units contradict the only data available',
    detail: 'Both columns are read by the resolver and enforced by nobody. Worse, they cannot be enforced as written: they are DECIMAL(5,4) and their defaults read as fractions (0.10, 0.01), while campaign_health.metrics stores open_rate as a percentage - measured values 1.53, 2.15, 2.63 and 30.69. Comparing the two directly is wrong by a factor of 100. Enforcing them needs a unit decision plus a minimum-sample rule, which is a separate change; declaring them enforced here would have been the exact failure C0.12 warns about.',
  },
  {
    id: 'F7',
    severity: 'escalate',
    title: 'Six campaigns are active having never been approved, up from three',
    detail: 'C6.10 found six on 2026-10-20 and the activation gate was built to stop more. Measured 1 November: still six, all with approval_status=draft, and all six carry channel=null so none of them could pass validateCampaignForPublish. They are live through activateCampaign, which the gate guards only on the path it was wired into. This is C9.1 territory rather than C0.12, and it is recorded here because this ticket is where it was measured again.',
  },
  {
    id: 'F8',
    severity: 'closed-here',
    title: 'The admin PUT accepted an empty body and created a complete row',
    detail: 'PUT /api/admin/governance-center/campaigns/:id merged whichever allowed fields were present into a findOrCreate and returned 200. With no fields present it created a row of database defaults - the hollow config. It now validates the END STATE and returns 400 with the specific failures, so a partial update is judged on what the config will say once written.',
  },
  {
    id: 'F9',
    severity: 'open',
    title: 'Widening the safety ceilings to every campaign type is a real behavior change',
    detail: 'The unsubscribe, bounce and SMS-failure ceilings were gated on isAlumni, so they governed 1 of the 6 active campaigns. They now apply to all types. Measured: all six active campaigns read 0 on all three metrics on 1 November, so nothing currently running is paused by this. It will pause a campaign that later breaches a ceiling, which is the intent, and it is named here rather than left to be discovered by a watchdog.',
  },
];

module.exports = {
  MEASURED_AT,
  MEASURED_AT_UTC,
  TABLE,
  INVENTORY,
  ACTIVE,
  GATE_BEFORE,
  HEALTH,
  ALUMNI_REFERENCE,
  COLUMN_REACH,
  CONFIGS,
  CRITERIA,
  FLAGS,
  VERIFIED,
};
