/**
 * C6.14 - the CEO outreach copy, and the evidence every sentence of it stands on.
 *
 * ## The premise this ticket was written on is not true, and that is the first finding
 *
 * C6.14 says "Three message variants are drafted" and names reusing them as the capability to
 * lean on rather than rebuild. They do not exist. `campaign_variants` holds zero rows for this
 * campaign in production, nothing in the repository carries them, and C6.13's eight comments do
 * not either. So they are written here, from scratch, which is a different job from approving
 * something already drafted and is worth saying out loud before Ali reads a word of copy.
 *
 * ## Why every figure was re-measured instead of carried over
 *
 * Two sources were in front of me and they disagreed in both value and window. This ticket's own
 * evidence line records "266 agents and 765,305 executions in 30 days, read on 21 October". The
 * C3.2 bundle records 151 agents and 168,619 executions over 7 days, read on 16 October. Both
 * were stale on 1 November, and CLM-002 says in its own prohibited_wording that an undated figure
 * "becomes wrong by sitting still". Re-running the registry's SQL is the registry's instruction.
 *
 * Doing it turned up the thing most likely to be probed in the room: 266 was never a count of
 * agents. It is the size of the agent REGISTRY, which CLM-005 explicitly says is not a count of
 * operating agents. Today the registry holds 269 rows and 152 agents have actually run.
 *
 * ## What may appear in outbound copy, and what may not
 *
 * The C0.6 registry governs anything leaving the building, and it holds NO row for a learner
 * count, a placement rate or any employment outcome. CLM-029 prohibits any figure without a named
 * registry source. That rules out the 30-day execution figure as well, because CLM-006 is defined
 * on a SEVEN-day window: the 30-day number is measured and true and still has no row to stand on.
 * The copy below therefore uses the 7-day figure.
 */

/** Everything below was read from production on this date by re-running the registry's queries. */
const MEASURED_AT = '1 November 2026';
const MEASURED_AT_UTC = '2026-11-01T11:05:33Z';

/**
 * Figures as production answered them, each tied to the registry row that authorizes its use.
 * `clm: null` means measured but UNUSABLE in outbound copy - recorded so the gap is visible
 * rather than discovered by someone reaching for the number later.
 */
const MEASURED = {
  agentsEverRun: { value: 152, clm: 'CLM-005', was: '151 on 16 Oct',
    text: 'AI agents have run in production',
    sql: 'ai_agents where last_run_at is not null' },
  agents24h: { value: 105, clm: 'CLM-005', was: '123 on 16 Oct',
    text: 'agents ran in the last 24 hours',
    sql: "ai_agents where last_run_at > now() - interval '24 hours'" },
  agents30d: { value: 128, clm: 'CLM-005', was: 'not previously recorded',
    text: 'agents ran in the last 30 days',
    sql: "ai_agents where last_run_at > now() - interval '30 days'" },
  registrySize: { value: 269, clm: null, was: '257 on 16 Oct',
    text: 'rows in the agent registry. NOT a count of agents, and the source of the "266" error',
    sql: 'count(*) from ai_agents' },
  executions7d: { value: 215515, clm: 'CLM-006', was: '168,619 on 16 Oct',
    text: 'agent executions in the seven days to ' + MEASURED_AT,
    sql: "sum(execution_count) from agent_performance_metrics, 7 days" },
  failures7d: { value: 53, clm: 'CLM-006', was: '60 on 16 Oct',
    text: 'failures across those executions',
    sql: "sum(failure_count) from agent_performance_metrics, 7 days" },
  agentsInMetrics7d: { value: 126, clm: 'CLM-006', was: 'not previously recorded',
    text: 'distinct agents contributing to that 7-day total',
    sql: 'count(distinct agent_id), 7 days' },
  executions30d: { value: 808202, clm: null, was: "765,305 in this ticket's own evidence line",
    text: 'executions in 30 days. NO REGISTRY ROW: CLM-006 is defined on seven days',
    sql: "sum(execution_count) from agent_performance_metrics, 30 days" },
  failures30d: { value: 355, clm: null, was: 'not previously recorded',
    text: 'failures in 30 days. Same problem: no row covers this window',
    sql: "sum(failure_count) from agent_performance_metrics, 30 days" },
  stories: { value: 433, clm: 'CLM-002', was: '345 on 16 Oct',
    text: 'pieces of learner work verified against a real commit',
    sql: "student_tasks where verified_by = 'build_pipeline:repo_verification'" },
  storyProjects: { value: 37, clm: 'CLM-002', was: '29 on 16 Oct',
    text: 'projects those verified pieces span',
    sql: 'count(distinct project_id) over the same rows' },
  projects: { value: 62, clm: 'CLM-001', was: '48 on 16 Oct',
    text: 'distinct learner projects in flight',
    sql: 'count(distinct project_id) from build_plans' },
  caseStudies: { value: 13, clm: 'CLM-004', was: '13 on 16 Oct, unchanged',
    text: 'case studies published and live',
    sql: "case_study_publications where status = 'published'" },
  caseStudySurfaces: { value: 3, clm: 'CLM-004', was: '3 on 16 Oct, unchanged',
    text: 'surfaces they are live on (ai-flotation, enterprise, training)',
    sql: 'count(distinct surface_key) over published rows' },
  charters: { value: 2, clm: 'CLM-008', was: '2 on 16 Oct, unchanged',
    text: 'AI employees governed by a written role charter',
    sql: 'count(*) from agent_role_charters' },
  govQualifications: { value: 92, clm: 'CLM-011', was: '31 on 16 Oct',
    text: 'government opportunities qualified',
    sql: 'count(*) from gov_qualifications' },
};

/** Derived, never typed, so a rate and its denominator cannot drift apart. */
const RATE_7D = ((MEASURED.executions7d.value - MEASURED.failures7d.value)
  / MEASURED.executions7d.value) * 100;

/**
 * Campaign state, read from production read-only on 1 November. Nothing has been sent: every
 * lead shows touchpoint_count 0, `interaction_outcomes` holds zero rows against lead ids
 * 25369-25378, `started_at` is null and qa_status is still untested.
 */
const CAMPAIGN = {
  id: '36272d49-c2e9-4688-b497-047c83afd125',
  name: 'CEO Direct - Funded AI Transformation Partner',
  status: 'draft',
  qaStatus: 'untested',
  approvalStatus: 'approved',
  startedAt: null,
  enrolled: 10,
  leadIdRange: '25369-25378',
  touchpoints: 0,
  responses: 0,
  budgetCap: '500.00',
  budgetSpent: '0.00',
  channels: { email: 'enabled, 10/day', sms: 'disabled', voice: 'disabled, no auto-dialer' },
  activationGate: { claims_approved: false, dry_run_reviewed: false },
  senderSettings: { sender_name: 'Ali Muwwakkil', sender_email: 'ali@colaberry.com',
    ali_signature: true, human_executed: true, no_auto_dial: true },
  stopRule: { negative_replies_to_stop: 3, no_reply_after_contacts: 10, review_after_days: 21 },
};

/**
 * The claim-by-claim honesty table the ticket asks for, as a list rather than prose so the guard
 * can check it against the copy. `source` is either a registry row id or 'personal'.
 */
const TRACEABILITY = [
  { claim: '152 AI agents have run in production', source: 'CLM-005',
    how: 'ai_agents where last_run_at is not null, read ' + MEASURED_AT,
    note: 'Phrased "have run", never "are running" and never "act". CLM-009 prohibits calling '
      + 'the fleet autonomous or saying it acts.' },
  { claim: '215,515 executions with 53 failures in the seven days to 1 November',
    source: 'CLM-006',
    how: 'sum(execution_count) and sum(failure_count) over agent_performance_metrics, 7 days, '
      + 'identical whether windowed on period_end or created_at',
    note: 'The window is stated in the sentence because the row is defined on seven days. A '
      + '30-day version of this sentence has no registry row and is not used.' },
  { claim: 'Every agent write is audited', source: 'CLM-007',
    how: 'Registry row, sourced to the production audit tables',
    note: 'Stated as a property of the system, with no number attached.' },
  { claim: '433 pieces of learner work verified against a real commit, across 37 projects',
    source: 'CLM-002',
    how: "student_tasks where verified_by = 'build_pipeline:repo_verification', read "
      + MEASURED_AT,
    note: 'CLM-002 is APPROVED WITH DATE precisely because it moves. It was 345 on 16 October.' },
  { claim: 'Verified by reading commits rather than by issuing a certificate',
    source: 'CLM-026',
    how: 'Registry row: we prepare people and verify what they build, we do not award a credential',
    note: 'Written as a denial of issuance, which is the form the registry requires. No '
      + 'certification is claimed anywhere in any variant.' },
  { claim: 'I lead AI delivery / I build the engineers who do this work', source: 'personal',
    how: 'Managing Director, Colaberry Consulting since September 2016; prior Senior BI '
      + 'Solutions Architect and Lead BI Developer at the same firm from 2012',
    note: 'Role and dates, verifiable from the resume and LinkedIn. No volume figure attached.' },
  { claim: 'The dated public AI statement each letter opens on', source: 'C6.13 evidence',
    how: 'Each quote was retrieved from the named primary source and is reproduced verbatim, '
      + 'with the date and the speaker the source itself names',
    note: 'Three companies carry a sourcing rule that changes who may be quoted. See the '
      + 'per-company table.' },
  { claim: 'I own Colaberry, disclosed in the first contact', source: 'personal',
    how: 'The signature names Colaberry and the role; variant C states the recusal explicitly',
    note: 'This is the conflict disclosure, placed before anything is asked for rather than '
      + 'after. Routing budget to a firm he owns is self-dealing unless disclosed first.' },
];

/** Figures deliberately NOT in the copy, and why. A reader will reach for these otherwise. */
const WITHHELD = [
  { figure: '266 agents, 765,305 executions in 30 days',
    why: 'Wrong and unregistered. 266 is the agent REGISTRY SIZE, which CLM-005 says is not a '
      + 'count of operating agents; 152 have actually run. The 30-day window has no registry '
      + 'row because CLM-006 is defined on seven days. This figure appears in this ticket\'s own '
      + 'evidence line and in the verbal brief for the recruiter call, so it needs correcting in '
      + 'both places, not just omitting here.' },
  { figure: '150+ projects architected, 100+ certified professionals mentored',
    why: 'On the resume, where they are a candidate\'s own account of a career, and no query '
      + 'stands behind either. "Certified professionals" is also certification-adjacent wording '
      + 'in a document whose acceptance criteria forbid claiming a certification. They stay on '
      + 'the resume and out of the copy.' },
  { figure: 'Any learner count, placement rate, salary or employment outcome',
    why: 'The C0.6 registry holds no row for any of them, and a scan of all production tables '
      + 'for salary, wage, placement, hired and employer columns found no employment data at '
      + 'all. Not a wording problem: the claim cannot be sourced even in principle.' },
  { figure: 'The word "free", in any form',
    why: 'CLM-027 prohibits it outright, and 40 TAC 807.172(d) is the reason. Nothing in this '
      + 'copy offers anything at no cost, so the question does not arise, but the guard checks.' },
  { figure: 'Anthropic, the Claude Partner Network, or any credential name',
    why: 'Nothing in this offer depends on them, and mentioning them triggers CLM-025\'s '
      + 'required non-affiliation wording inside a 140-word letter. Anthropic\'s own Frontier '
      + 'Academy announcement carries a client executive saying the thing that matters is "not '
      + 'about certification counts or training volume". Leaving it out is also the stronger '
      + 'position. The exact wording to use IF Ali wants it is in APPROVED_IF_USED.' },
];

/**
 * The only form the Anthropic sentence may take if Ali decides to include it. Both rows are
 * mandatory together: CLM-025 is required wording and CLM-026 is the no-issuance denial.
 */
const APPROVED_IF_USED = {
  clm: ['CLM-025', 'CLM-026'],
  text: 'We prepare people for Anthropic\'s architect certification and verify what they build. '
    + 'We do not award the credential. Colaberry is not part of the Anthropic or OpenAI '
    + 'programs and issues neither credential.',
};

/* ------------------------------------------------------------------ *
 * OPEN FLAGS - surfaced for Ali rather than resolved here
 * ------------------------------------------------------------------ */

const FLAGS = [
  { id: 'F1', title: 'The three variants this ticket says are drafted do not exist',
    detail: 'C6.14 names "the drafted variants and the claim-by-claim honesty table already '
      + 'produced" as the capability to reuse. `campaign_variants` holds zero rows for this '
      + 'campaign in production, the repository carries nothing, and C6.13\'s eight comments do '
      + 'not either. They are written here from scratch. That is a different review than '
      + 'approving someone else\'s draft, which is why it is the first thing said.',
    ask: 'Read all three as new copy, not as a check of existing copy.' },

  { id: 'F2', title: 'The company you disqualified is still enrolled and still active',
    detail: 'All ten were enrolled on 2026-10-27. You disqualified CNO Financial Group on '
      + '2026-10-28, the day after, and nobody unenrolled it. Production still holds lead 25373, '
      + 'Gary Bhojwani at CNO, as status "enrolled" and lifecycle "active" with zero touchpoints. '
      + 'max_leads_per_cycle is 10 and ten leads are enrolled, so a motion that works its '
      + 'enrolled leads contacts a company you took off the list. No letter is drafted for it, '
      + 'which protects this document but not the campaign record.',
    ask: 'Confirm lead 25373 should be unenrolled before C6.15 runs, and I will do it in a '
      + 'reviewed change.' },

  { id: 'F3', title: 'The campaign record still carries the disqualifier you replaced',
    detail: 'targeting_criteria.must_have was updated in production on 2026-10-27 to the honest '
      + 'wording about the observed date. targeting_criteria.disqualify was never updated: it '
      + 'still reads "A full talent acquisition function plus an established L&D function", the '
      + 'literal test you replaced on 2026-10-28. Anyone re-screening from the record rather '
      + 'than from the artifact cuts Tennant and Avista again, which is exactly the outcome you '
      + 'decided against.',
    ask: 'Same reviewed change as F2: write your settled wording into the record.' },

  { id: 'F4', title: 'The agent figure in this ticket, and in the brief for your recruiter '
      + 'call, is wrong twice over',
    detail: 'The ticket records "266 agents and 765,305 executions in 30 days". 266 was never a '
      + 'count of agents: it is the size of the agent REGISTRY, and CLM-005 says in as many '
      + 'words that the registry size is not a count of operating agents. Today the registry '
      + 'holds 269 rows and 152 agents have actually run. The 30-day execution window has no '
      + 'registry row at all. The same wrong pair sits in the note about what to deploy verbally '
      + 'on the Motion Recruitment call, which is the higher-stakes place for it to be wrong: '
      + 'an interviewer who asks "269 agents doing what?" gets a very different answer.',
    ask: 'Use "152 AI agents have run in production" and the seven-day execution figure. Nothing '
      + 'is lost: 215,515 executions with 53 failures is the stronger sentence anyway.' },

  { id: 'F5', title: 'CLM-006 is defined on seven days, so the thirty-day figure cannot be used',
    detail: '808,202 executions and 355 failures over thirty days is measured and true, and '
      + 'CLM-029 still prohibits it, because no registry row covers that window. The same row '
      + 'already has an amendment pending from the C3.2 bundle, which found its recorded SQL '
      + 'selects a column that does not exist and its recorded rate does not follow from its '
      + 'own numbers. One amendment can settle both.',
    ask: 'Amend CLM-006 to carry the corrected query and both windows, or leave the copy on '
      + 'seven days. The copy as drafted uses seven days either way.' },

  { id: 'F6', title: 'The branded signature turns this letter into a vendor pitch',
    detail: 'The campaign carries ali_signature true, and the house signature ends with a '
      + '"Design Your AI Organization" button pointing at advisor.colaberry.ai/advisory, under '
      + '"Colaberry Inc." and enterprise.colaberry.ai. Your chosen positioning is a director who '
      + 'staffs his own team, with Colaberry entering later once they feel the hiring pain, and '
      + 'you explicitly rejected pitching Colaberry up front. A chief executive reading that '
      + 'call to action reads a training vendor, not a delivery leader. The signature is also '
      + 'the thing that discloses the ownership, so removing it altogether is not the answer.',
    ask: 'Decide between the branded signature and a plain one naming Colaberry and the role '
      + 'without the advisory call to action. The disclosure survives either way.' },

  { id: 'F7', title: 'No campaign on the platform can pass its own governance gate',
    detail: '`campaign_governance_configs` holds ZERO rows, platform-wide, not just for this '
      + 'campaign. Whatever the governance gate checks, there is nothing for it to read. That is '
      + 'the C9.1 gap rather than this ticket\'s, and it is recorded here because C6.15 is the '
      + 'ticket that will hit it.',
    ask: 'No action in this ticket. It blocks C6.15.' },

  { id: 'F8', title: 'The filter the strategy called its sharpest cannot be claimed at all',
    detail: 'The motion was designed around an AI requisition open longer than ninety days. '
      + 'C6.13 proved that unverifiable from outside, and the rewording it adopted records the '
      + 'date WE observed the posting instead. So variant A opens on "I read your posting on 27 '
      + 'October" and can never say how long it has been sitting there. Re-observing the same '
      + 'requisition in December would build real duration evidence that is ours rather than the '
      + 'career site\'s.',
    ask: 'No action. Worth one line in C6.15 so the second observation actually gets recorded.' },
];

module.exports = {
  MEASURED_AT, MEASURED_AT_UTC, MEASURED, RATE_7D, CAMPAIGN, TRACEABILITY, WITHHELD,
  APPROVED_IF_USED, FLAGS,
};
