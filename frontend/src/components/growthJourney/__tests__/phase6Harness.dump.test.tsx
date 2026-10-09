import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

/**
 * Render the Growth Journey surfaces to static HTML, for screenshotting (Phase 6, T619).
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
 *
 * It is a real capture of the real components: the DOM below is produced by mounting
 * them and letting React run, then dressed in the app's own stylesheets by
 * `scripts/captureGrowthJourneyScreenshots.js`.
 *
 * It is NOT a production screenshot. The payloads are fixtures shaped after what the
 * live reads return, and no admin session was involved. Anything claiming to prove
 * production BEHAVIOUR has to come from an authenticated capture against the live app
 * — which needs an admin token this loop will not mint. What these prove is that the
 * surfaces lay out correctly and say the right thing in states that are hard to reach
 * on a dark system: a refused control, a null rate beside a real zero, a handoff whose
 * assignment was blocked. Production is dark, so those states cannot be photographed
 * live today at all.
 *
 * The same distinction `captureJourneyHarness.js` draws for the outreach flow, for the
 * same reason.
 *
 * ── SKIPPED UNLESS `HARNESS_OUT` IS SET ─────────────────────────────────────
 *
 * It writes files, so it does not run in CI:
 *
 *   HARNESS_OUT=<dir> CI=true npx react-scripts test \
 *     --testPathPattern="phase6Harness.dump" --watchAll=false
 *
 * One HTML file per surface, named for the surface. The capture script reads the
 * directory and shoots each one.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyApi', () => ({
  getStatusRegistry: jest.fn(), getReadiness: jest.fn(), getHealth: jest.fn(),
}));
jest.mock('../../../services/growthJourneyInspectApi', () => ({
  listClassifications: jest.fn(), listDecisions: jest.fn(), listTransitions: jest.fn(),
  listShadowRuns: jest.fn(), listOfferPolicies: jest.fn(), listContentRules: jest.fn(),
  getClassificationWhy: jest.fn(), getDecisionWhy: jest.fn(),
}));
jest.mock('../../../services/growthJourneyQueueApi', () => ({
  listHandoffQueue: jest.fn(), listExperiments: jest.fn(),
}));
jest.mock('../../../services/growthJourneyPerformanceApi', () => {
  const actual = jest.requireActual('../../../services/growthJourneyPerformanceApi');
  return {
    ...actual,
    getRates: jest.fn(), getMetrics: jest.fn(),
    getReceipts: jest.fn(), getOutcomes: jest.fn(), getByJourney: jest.fn(),
  };
});
jest.mock('../../../services/growthJourneyControlsApi', () => {
  const actual = jest.requireActual('../../../services/growthJourneyControlsApi');
  return { ...actual, listControls: jest.fn(), createPause: jest.fn(), createRollout: jest.fn(), clearPause: jest.fn(), clearRollout: jest.fn() };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const api = require('../../../services/growthJourneyApi') as Record<string, jest.Mock>;
const inspect = require('../../../services/growthJourneyInspectApi') as Record<string, jest.Mock>;
const queue = require('../../../services/growthJourneyQueueApi') as Record<string, jest.Mock>;
const perf = require('../../../services/growthJourneyPerformanceApi') as Record<string, jest.Mock>;
const ctrl = require('../../../services/growthJourneyControlsApi') as Record<string, jest.Mock>;
/* eslint-enable @typescript-eslint/no-var-requires */

const OverviewTab = require('../OverviewTab').default;
const ClassificationTab = require('../ClassificationTab').default;
const DecisionsTab = require('../DecisionsTab').default;
const ShadowTab = require('../ShadowTab').default;
const ContentTab = require('../ContentTab').default;
const ExperimentsTab = require('../ExperimentsTab').default;
const HandoffsTab = require('../HandoffsTab').default;
const PerformanceTab = require('../PerformanceTab').default;
const ControlsTab = require('../ControlsTab').default;
const SystemStateNotices = require('../SystemStateNotices').default;

const WORDS = { subject: 'learner', relationship: 'enrolment', pipeline: 'path' };
const SCOPE = { tenant_id: 't-cola', brand_id: 'b-cpn', program_id: null };

/*
 * `react-scripts` hardcodes resetMocks: true, so a factory implementation is stripped
 * before every test. Behaviour goes here and only here.
 */
beforeEach(() => {
  queue.listHandoffQueue.mockResolvedValue({
    rows: [
      {
        id: 'h-1', brand_id: 'b-cpn', subject_ref: 'lead:4821', owner_queue: 'admissions',
        status: 'queued', urgent: true, priority: 'high', expected_value: '1500.00',
        confidence: '0.820', reason: 'enrolment-ready in conversation', reason_redacted: false,
        ticket_id: null, assignment_blocked_reason: 'capacity_full',
        assigned_to_id: null, created_at: '2026-10-03T14:02:11.000Z',
      },
      {
        id: 'h-2', brand_id: 'b-cpn', subject_ref: 'lead:5190', owner_queue: 'admissions',
        status: 'accepted', urgent: false, priority: 'normal', expected_value: null,
        confidence: '0.610', reason: 'redacted', reason_redacted: true,
        ticket_id: 'tk-77', assignment_blocked_reason: null,
        assigned_to_id: 'u-9', created_at: '2026-10-02T09:40:00.000Z',
      },
    ],
    total: 2, limit: 25, offset: 0, status: 'open', owner_queue: null,
  });

  const rate = (v: number | null, n = 0, d = 0) => (v === null
    ? { value: null, numerator: n, denominator: d, reason: 'no_denominator' }
    : { value: v, numerator: n, denominator: d });
  const median = (v: number | null, s: number) => (v === null
    ? { value: null, samples: s, reason: 'below_min_samples' } : { value: v, samples: s });
  const rates = {
    brand_id: 'b-cpn', owner_queue: 'all',
    window: { from: '2026-09-04T00:00:00.000Z', to: '2026-10-04T00:00:00.000Z' },
    handoffs: 12, accepted: 5, verdicts: 4,
    // A real zero AND a real null in one table: the whole point of this surface.
    acceptance_rate: rate(0, 0, 12), expiry_rate: rate(null),
    connection_rate: rate(0.5, 2, 4), meeting_rate: rate(null),
    qualification_rate: rate(0.25, 1, 4), proposal_rate: rate(null),
    conversion_rate: rate(0.125, 1, 8), false_positive_handoff_rate: rate(null),
    time_to_accept_hours: median(12.5, 6),
    time_to_disposition_hours: median(null, 2),
    time_to_first_connection_hours: median(null, 0),
  };
  perf.getRates.mockResolvedValue({
    brands: [{
      brand_id: 'b-cpn', rates: { all: rates, by_queue: {} },
      capped: false, handoffs_in_window: 12, outcomes_in_window: 9,
    }],
    window_days: 30, max_handoffs_per_brand: 5000, max_outcomes_per_brand: 10000, scope: SCOPE,
  });
  perf.getMetrics.mockResolvedValue({
    metrics: [{
      key: 'journey.handoff_acceptance_rate', value: 0.42,
      freshness: {
        verdict: 'stale', age_hours: 31, reason: 'last_run_at is 31h old, past 26h',
        source: 'live', max_age_hours: 26,
      },
    }],
    computed_at: '2026-10-04T08:00:00.000Z', scope: SCOPE,
  });
  const empty = { rows: [], total: 0, limit: 25, offset: 0, scope: SCOPE };
  perf.getReceipts.mockResolvedValue(empty);
  perf.getOutcomes.mockResolvedValue(empty);
  perf.getByJourney.mockResolvedValue({
    journeys: [
      {
        program_slug: 'cpn-learner', program_name: 'CPN Learner', program_status: 'active',
        path_slug: 'paid-training', has_leads: true, leads_count: 31, classified_count: 31,
        emails_sent: 18, open_rate: 44.44, click_rate: 11.11, reply_rate: 5.56,
        conversion_rate: null, campaigns_count: 2,
      },
      {
        program_slug: 'ai-flotation-consulting', program_name: 'AI Flotation Consulting',
        program_status: 'draft', path_slug: null, has_leads: false, leads_count: null,
        classified_count: null, emails_sent: null, open_rate: null, click_rate: null,
        reply_rate: null, conversion_rate: null, campaigns_count: null,
      },
    ],
    scope: { ...SCOPE, start: null, end: null },
  });

  const page = { total: 2, limit: 25, offset: 0 };

  api.getReadiness.mockResolvedValue({
    items: [
      { key: 'master_flag', ready: false, reason: 'GROWTH_JOURNEY_ENABLED is off, so every journey route answers 404 and no cron does anything', next_move: 'set GROWTH_JOURNEY_ENABLED=true in the backend environment and restart' },
      { key: 'memberships', ready: false, reason: 'no tenant memberships exist, so every brand-scoped journey read returns nothing for every admin', next_move: 'populate tenant_memberships for the admins who need journey access' },
      { key: 'content_rules', ready: false, reason: '0 of 2 learner brand(s) have at least one APPROVED content rule', next_move: 'add at least one approved content rule per learner brand' },
      { key: 'kill_switch_row', ready: true, reason: 'the kill switch row exists and is off', next_move: null },
      { key: 'ledger_indexes', ready: true, reason: 'all 3 event_ledger indexes are present', next_move: null },
      // The three-state `ready`: null is "cannot be known from here", and it counts
      // neither as ready nor in the denominator.
      { key: 'tests_green', ready: null, reason: "not readable from here - the section 16 suite's last result lives in CI, not in this process", next_move: 'check the latest guards job on the branch before launch' },
    ],
    score: { ready: 2, known: 5, unknown: 1, pct: 40 },
    next_move: 'master_flag',
    as_of: '2026-10-04T19:43:30.698Z',
  });
  api.getHealth.mockResolvedValue({
    receipts: [], stuck_pending_review: { count: 0, over_hours: 72 },
    held: { total: 0, by_reason: {} }, refused: { total: 0, by_reason: {}, capped: false },
    crons: [
      { agent: 'GrowthJourneyShadowDecisions', schedule: '20 4 * * *', state: 'disabled', last_run_at: null, max_age_hours: null },
      { agent: 'GrowthJourneyExecutor', schedule: '*/15 14-22 * * 1-5', state: 'disabled', last_run_at: null, max_age_hours: null },
      { agent: 'GrowthJourneyHandoffDigest', schedule: '30 12 * * 1-5', state: 'disabled', last_run_at: null, max_age_hours: null },
    ],
    controls: { pause: 1, rollout: 0 }, journey_hold_rows: 0, ledger_read: 'ok',
    window_hours: 24, as_of: '2026-10-04T19:43:30.698Z', truncated: [],
  });

  inspect.listClassifications.mockResolvedValue({
    ...page, status: 'needs_review',
    rows: [
      {
        id: 'cl-1', tenant_id: 't-cola', brand_id: 'b-cpn', subject_ref: 'lead:4821',
        lead_id: 4821, enrollment_id: null, trigger: 'reply_received',
        input_hash: 'a19f', brand_relationship: 'prospect',
        journey_program_slug: 'cpn-learner', primary_path: 'learner_paid_training',
        secondary_paths: [], intent: 'asked about the next cohort start date',
        // DECIMAL(4,3) over JSON arrives as a STRING. The list route does not coerce it.
        confidence: '0.820', evidence: ['replied within 2h', 'viewed pricing twice'],
        source_step: 3, requires_human_review: false, status: 'confirmed', locked: false,
        eligibility: null, referral_target_brand_id: null, ai_involved: true,
        model_version: 'claude-sonnet-5', ruleset_version: 'v4', override_of: null,
        decided_by: 'redacted', decided_by_redacted: true,
        created_at: '2026-10-03T14:02:11.000Z',
      },
      {
        id: 'cl-2', tenant_id: 't-cola', brand_id: 'b-aif', subject_ref: 'lead:5190',
        lead_id: 5190, enrollment_id: null, trigger: 'form_submitted',
        input_hash: 'b733', brand_relationship: null,
        journey_program_slug: 'ai-flotation-consulting', primary_path: 'application_build',
        secondary_paths: ['workflow_automation'], intent: 'unknown',
        confidence: '0.410', evidence: ['single page view'], source_step: 1,
        requires_human_review: true, status: 'needs_review', locked: true,
        eligibility: null, referral_target_brand_id: 'b-cbe', ai_involved: true,
        model_version: 'claude-sonnet-5', ruleset_version: 'v4', override_of: 'cl-0',
        decided_by: 'ali', decided_by_redacted: false,
        created_at: '2026-10-02T09:40:00.000Z',
      },
    ],
  });

  inspect.listDecisions.mockResolvedValue({
    ...page, mode: 'shadow',
    rows: [
      {
        id: 'de-1', tenant_id: 't-cola', brand_id: 'b-cpn', program_id: 'p-1',
        subject_ref: 'lead:4821', classification_id: 'cl-1', trigger: 'nightly',
        decision_date: '2026-10-04', mode: 'shadow', selected_action: 'SEND_EMAIL',
        selected_path: 'learner_paid_training', selected_channel: 'email',
        state_at_decision: 'engaged', reason: 'enrolment-ready in conversation',
        requires_human_review: false, ai_involved: true, model_version: 'claude-sonnet-5',
        ruleset_version: 'v4', executed: false, decided_by: 'GrowthJourneyShadowDecisions',
        created_at: '2026-10-04T04:20:08.000Z',
      },
      {
        id: 'de-2', tenant_id: 't-cola', brand_id: 'b-cpn', program_id: 'p-1',
        subject_ref: 'lead:5002', classification_id: 'cl-3', trigger: 'nightly',
        decision_date: '2026-10-04', mode: 'shadow', selected_action: null,
        selected_path: null, selected_channel: null, state_at_decision: 'engaged',
        // Two reasons that are NOT failures, and the tab says so.
        reason: 'holdout:capability_education_q4',
        requires_human_review: false, ai_involved: true, model_version: 'claude-sonnet-5',
        ruleset_version: 'v4', executed: false, decided_by: 'GrowthJourneyShadowDecisions',
        created_at: '2026-10-04T04:20:09.000Z',
      },
    ],
  });

  inspect.listTransitions.mockResolvedValue({
    ...page, scope: SCOPE,
    rows: [
      {
        id: 'tr-1', brand_id: 'b-cpn', program_id: 'p-1', subject_ref: 'lead:4821',
        transition_type: 'state', status: 'applied', from_state: 'aware',
        to_state: 'engaged', reason: 'replied to the cohort email',
        reason_redacted: false, requested_by: 'GrowthJourneyShadowDecisions',
        requested_by_redacted: false, created_at: '2026-10-03T14:05:00.000Z',
      },
      {
        id: 'tr-2', brand_id: 'b-cpn', program_id: 'p-1', subject_ref: 'lead:5190',
        transition_type: 'path', status: 'applied', from_state: null,
        to_state: 'learner_paid_training', reason: 'redacted',
        reason_redacted: true, requested_by: 'ali', requested_by_redacted: false,
        created_at: '2026-10-02T10:00:00.000Z',
      },
    ],
  });

  inspect.listShadowRuns.mockResolvedValue({
    ...page, window_days: 7, counts_available: true,
    agents: ['GrowthJourneyShadowDecisions', 'GrowthJourneyExecutor', 'GrowthJourneyHandoffDigest'],
    scope: SCOPE,
    rows: [
      { id: 'r-1', agent: 'GrowthJourneyShadowDecisions', result: 'success', duration_ms: 4192, trace_id: null, started_at: '2026-10-04T04:20:00.000Z' },
      // A failure whose ONLY handle is the trace id: reason and stack are never projected.
      { id: 'r-2', agent: 'GrowthJourneyShadowDecisions', result: 'failure', duration_ms: 812, trace_id: 'c7f1a2e0', started_at: '2026-10-03T04:20:00.000Z' },
    ],
  });

  inspect.listContentRules.mockResolvedValue({
    ...page, scope: SCOPE,
    rows: [
      {
        id: 'cr-1', brand_id: 'b-cpn', offer_family: 'learner_paid_training',
        collection_key: 'cohort-oct', asset_id: 'as-11', version: 3,
        approval_status: 'approved', approved_by: 'ali', approved_by_redacted: false,
        approved_at: '2026-09-28T16:00:00.000Z', claims_count: 4, access_tier: 'public',
        effective_from: '2026-10-01', expires_at: null,
      },
      {
        id: 'cr-2', brand_id: 'b-aif', offer_family: 'business_training',
        collection_key: null, asset_id: 'as-20', version: 1,
        // Only `approved` is usable. A pending rule beside an approved one is the
        // clearest way to show that.
        approval_status: 'pending', approved_by: 'unknown', approved_by_redacted: false,
        approved_at: null, claims_count: 0, access_tier: null,
        effective_from: null, expires_at: null,
      },
    ],
  });
  inspect.listOfferPolicies.mockResolvedValue({
    ...page, scope: SCOPE,
    rows: [
      {
        id: 'op-1', brand_id: 'b-aif', offer_family: 'business_training',
        decision: 'deny', status: 'active', effective_from: '2026-01-01',
        effective_to: null, approved_landing_pages: [], approved_landing_pages_total: 0,
        claims_count: 0, ctas_count: 0, required_approvals: [],
      },
      {
        id: 'op-2', brand_id: 'b-cpn', offer_family: 'learner_paid_training',
        decision: 'allow', status: 'active', effective_from: '2026-01-01',
        effective_to: null,
        approved_landing_pages: ['/lp/cpn-cohort-oct', '/lp/cpn-overview'],
        // The TRUE length is larger than the array: the server cut the list at 25,
        // and the screen has to say so rather than imply there are only two.
        approved_landing_pages_total: 27,
        claims_count: 6, ctas_count: 2, required_approvals: ['brand_lead'],
      },
    ],
  });

  queue.listExperiments.mockResolvedValue({
    window_days: 90, policy_type: 'holdout',
    conversion_outcomes: ['enrolled_paid', 'subscription_active', 'project_started'],
    scope: SCOPE,
    brands: [
      {
        brand_id: 'b-cpn', status: 'active',
        // An experiment NAME, not a credential; `key:` trips gitleaks' generic-api-key.
        policy: { experiment_key: 'capability_education_q4', control_share: 0.25 }, // gitleaks:allow
        lift: {
          experiment_key: 'capability_education_q4', window_days: 90, // gitleaks:allow
          treatment: { n: 38, converted: 6, capped: false },
          control: { n: 12, converted: 1, capped: false },
          // UNKNOWN lift: the Measured union makes rendering a number impossible.
          lift: { known: false, reason: 'control arm has 12 subjects, below the floor of 30' },
          min_arm_n: 30, capped: false, max_arm_decisions: 5000,
        },
      },
      // The one absence that needs a human, kept distinct from the three that do not.
      { brand_id: 'b-aif', status: 'settings_invalid', policy: null, lift: null },
    ],
  });

  ctrl.listControls.mockResolvedValue({
    controls: [{
      id: 'c-1', kind: 'pause', mode: 'off', scope_key: 'b-cpn|*|email|*',
      brand_id: 'b-cpn', program_id: null, channel: 'email', subject_ref: null,
      reason: 'investigating a duplicate send report', created_at: '2026-10-03T11:00:00.000Z',
      created_by: 'ali', cleared_at: null, cleared_by: null, cleared_reason: null,
      cohort_lead_ids: null, daily_limit: null,
    }],
    count: 1,
  });
});

const SURFACES: { name: string; node: React.ReactElement }[] = [
  // Both notices at once. They are mutually exclusive in practice - a dark system and
  // an unseeded one are different problems - but a reviewer needs to see each banner's
  // wording, and this is the only place both are reachable in one image.
  { name: 'switched-off', node: <SystemStateNotices off unseeded={false} /> },
  { name: 'unseeded', node: <SystemStateNotices off={false} unseeded /> },
  { name: 'overview', node: <OverviewTab /> },
  { name: 'classification', node: <ClassificationTab words={WORDS} brandName="CPN" unseeded={false} /> },
  { name: 'decisions', node: <DecisionsTab words={WORDS} brandName="CPN" unseeded={false} programId="" /> },
  { name: 'shadow', node: <ShadowTab /> },
  { name: 'content', node: <ContentTab brandName="AI Flotation" unseeded={false} /> },
  { name: 'experiments', node: <ExperimentsTab brandId="b-cpn" /> },
  { name: 'handoffs', node: <HandoffsTab words={WORDS} brandName="CPN" unseeded={false} /> },
  { name: 'performance', node: <PerformanceTab brandId="b-cpn" programId="" /> },
  { name: 'controls', node: <ControlsTab brandId="b-cpn" programId="" unseeded={false} /> },
];

const maybeIt = process.env.HARNESS_OUT ? it.each(SURFACES) : it.skip.each(SURFACES);

maybeIt('writes $name', async ({ name, node }) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // Wrapped for ALL surfaces, not just the ones that link: `HandoffsTab` renders
  // `<Link>` and threw "Cannot destructure property 'basename'" without a Router.
  // Wrapping unconditionally keeps the harness from depending on which surface
  // happens to link today.
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/admin/growth-journey']}>{node}</MemoryRouter>);
  });

  /*
   * BAKE CONTROLLED VALUES INTO THE MARKUP BEFORE SERIALISING.
   *
   * React sets a <select>'s value as a DOM PROPERTY, not an HTML attribute, so
   * `innerHTML` loses it and a browser rendering the dump falls back to the FIRST
   * option. The first capture showed the window select reading "7 days" while the
   * table beside it said "30-day window" - a reviewer would reasonably file that as a
   * product bug, and it is an artefact of serialisation. Same for checkboxes and text
   * inputs. A misleading screenshot is worse than no screenshot.
   */
  container.querySelectorAll('select').forEach((sel) => {
    Array.from(sel.options).forEach((opt) => {
      if (opt.value === sel.value) opt.setAttribute('selected', 'selected');
      else opt.removeAttribute('selected');
    });
  });
  container.querySelectorAll('input').forEach((el) => {
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked) el.setAttribute('checked', 'checked');
    } else if (el.value) {
      el.setAttribute('value', el.value);
    }
  });

  const dir = process.env.HARNESS_OUT as string;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.html`), container.innerHTML, 'utf8');
  // The capture script needs to know a surface rendered something, not just that a
  // file exists - an empty div would screenshot as a blank page and look deliberate.
  expect(container.innerHTML.length).toBeGreaterThan(400);

  act(() => { root.unmount(); });
  container.remove();
});
