/**
 * NOT A TEST — a render harness. Mounts the real OutreachJourneyFlow against a
 * realistic payload and writes its actual DOM to disk so it can be screenshotted.
 *
 * SKIPPED unless HARNESS_OUT is set, because it writes a file and a test suite
 * must not have side effects on the working tree. Run it deliberately:
 *
 *   HARNESS_OUT=<path>.html HARNESS_W=1340 CI=true npx react-scripts test \
 *     --testPathPattern="renderHarness.dump" --watchAll=false
 *   node scripts/captureJourneyHarness.js <path>.html <out-dir>
 *
 * It exists so a visual can be produced from the REAL component and the REAL
 * recharts layout rather than from a mockup. Three defects were found this way
 * that every assertion in the suite had passed over: campaign labels colliding
 * with the outcome column, outcomes crushed to sub-pixel bands, and a stale
 * `flipX` dependency that left label sides computed at the wrong width.
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import OutreachJourneyFlow from '../OutreachJourneyFlow';
import * as api from '../../../../../services/intelligenceApi';

jest.mock('../../../../../services/intelligenceApi');

/**
 * The chart measures its wrapper's clientWidth, which jsdom always reports as 0.
 * Stubbing it is what lets this harness render at a REAL column width rather than
 * at the fallback, so the capture shows the layout the browser would produce.
 */
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    return Number(process.env.HARNESS_W || 900);
  },
});

const mockedApi = api as jest.Mocked<typeof api>;

const node = (id: string, type: string, label: string, count: number, extra: object = {}) =>
  ({ id, type, label, count, metrics: {}, ...extra }) as any;
const edge = (from: string, to: string, volume: number, median?: number) =>
  ({
    from,
    to,
    label: 'moves',
    volume,
    ...(median ? { velocity: { median_hours: median, velocity: 0.5, throughput_per_day: 1, bottleneck_score: 0.2 } } : {}),
  }) as any;

/**
 * Shaped after the real production funnel described in the campaign graph:
 * ~24.7k leads, mostly anonymous, email-dominant outreach, heavy ignore rate.
 */
const PAYLOAD = {
  nodes: [
    node('src_marketing', 'source', 'Marketing', 642),
    node('src_cold_outbound', 'source', 'Cold Outbound', 2104),
    node('src_alumni', 'source', 'Alumni Network', 689),
    node('src_anonymous', 'source', 'Anonymous / Direct', 21241),
    node('outreach_email', 'outreach', 'Email Outreach', 8712),
    node('outreach_sms', 'outreach', 'SMS Outreach', 1488),
    node('outreach_voice', 'outreach', 'Voice Outreach', 329),
    node('engagement_engaged', 'engagement', 'Engaged', 1107),
    node('engagement_opened', 'engagement', 'Opened / Seen', 1468),
    node('engagement_ignored', 'engagement', 'Ignored', 7954),
    node('visitor_site', 'visitor', 'Site Visitors', 3120),
    node('visitor_never', 'visitor', 'Never Visited', 14210),
    node('entry_cory_chat', 'entry', 'Cory Chat', 1402),
    node('entry_blueprint', 'entry', 'Blueprint Signup', 884),
    node('entry_strategy_call', 'entry', 'Strategy Call', 421),
    node('entry_activated_referral', 'entry', 'Activated Referral', 413),
    node('campaign_c1', 'campaign', 'Executive AI Briefing Q3', 1180, {
      brand_id: 'b1',
      brand_name: 'Colaberry Enterprise',
    }),
    node('campaign_c2', 'campaign', 'Alumni Win-Back Wave 2', 742, {
      brand_id: 'b1',
      brand_name: 'Colaberry Enterprise',
    }),
    node('campaign_c3', 'campaign', 'Open House Nurture', 620, {
      brand_id: 'b1',
      brand_name: 'Colaberry Enterprise',
    }),
    node('campaign_c4', 'campaign', 'Scholarship Outreach', 318, {
      brand_id: 'b2',
      brand_name: 'Career Pathways Network',
    }),
    node('campaign_c5', 'campaign', 'Re-Engagement Sweep', 260, {
      brand_id: '__unattributed__',
      brand_name: 'Unattributed',
    }),
    node('outcome_enrolled', 'outcome', 'Enrolled', 399),
    node('outcome_paid', 'outcome', 'Paid', 59),
  ],
  edges: [
    edge('src_marketing', 'outreach_email', 601, 6.2),
    edge('src_cold_outbound', 'outreach_email', 1902, 12.4),
    edge('src_cold_outbound', 'outreach_sms', 202, 9.1),
    edge('src_alumni', 'outreach_email', 480, 4.4),
    edge('src_alumni', 'outreach_sms', 209, 3.8),
    edge('src_anonymous', 'outreach_email', 5729, 40.5),
    edge('src_anonymous', 'outreach_sms', 1077, 33.0),
    edge('src_anonymous', 'outreach_voice', 329, 51.2),
    edge('src_anonymous', 'visitor_site', 1980),
    edge('outreach_email', 'engagement_engaged', 806, 18.0),
    edge('outreach_email', 'engagement_opened', 1204, 14.5),
    edge('outreach_email', 'engagement_ignored', 6702, 72.0),
    edge('outreach_sms', 'engagement_engaged', 301, 5.5),
    edge('outreach_sms', 'engagement_opened', 264, 7.2),
    edge('outreach_sms', 'engagement_ignored', 923, 60.0),
    edge('outreach_voice', 'engagement_ignored', 329, 48.0),
    edge('engagement_engaged', 'visitor_site', 1107, 22.0),
    edge('engagement_opened', 'visitor_site', 33, 30.0),
    edge('engagement_ignored', 'visitor_never', 7954, 120.0),
    edge('src_cold_outbound', 'visitor_never', 3210),
    edge('src_anonymous', 'visitor_never', 3046),
    edge('visitor_site', 'entry_cory_chat', 1402, 2.1),
    edge('visitor_site', 'entry_blueprint', 884, 3.4),
    edge('visitor_site', 'entry_strategy_call', 421, 26.0),
    edge('visitor_site', 'entry_activated_referral', 413, 18.0),
    edge('entry_cory_chat', 'campaign_c1', 780, 30.0),
    edge('entry_cory_chat', 'campaign_c3', 400, 44.0),
    edge('entry_blueprint', 'campaign_c1', 400, 28.0),
    edge('entry_blueprint', 'campaign_c2', 342, 36.0),
    edge('entry_strategy_call', 'campaign_c4', 318, 20.0),
    edge('entry_activated_referral', 'campaign_c2', 400, 16.0),
    edge('entry_activated_referral', 'campaign_c5', 13, 50.0),
    edge('campaign_c1', 'outcome_enrolled', 188, 96.0),
    edge('campaign_c1', 'outcome_paid', 31, 240.0),
    edge('campaign_c2', 'outcome_enrolled', 104, 88.0),
    edge('campaign_c2', 'outcome_paid', 18, 210.0),
    edge('campaign_c3', 'outcome_enrolled', 62, 130.0),
    edge('campaign_c4', 'outcome_enrolled', 45, 74.0),
    edge('campaign_c4', 'outcome_paid', 10, 180.0),
  ],
  validation: {
    total_leads: 24676,
    leads_with_first_touch: 3120,
    leads_unengaged: 14210,
    leads_in_campaigns: 3120,
    leads_enrolled: 399,
    leads_paid: 59,
    leads_with_visitor: 3120,
    leads_contacted: 10529,
    leads_contacted_no_visit: 7954,
    leads_engaged: 1107,
    leads_opened: 1468,
    leads_ignored: 7954,
    warnings: [
      'All 5 campaigns belong to Colaberry Enterprise. Brand filtering will not narrow this view until campaigns exist under another brand.',
    ],
  },
  brands: [
    { brand_id: 'b1', brand_name: 'Colaberry Enterprise', attributed: true, campaign_count: 3, lead_count: 2542 },
    { brand_id: 'b2', brand_name: 'Career Pathways Network', attributed: true, campaign_count: 1, lead_count: 318 },
    { brand_id: '__unattributed__', brand_name: 'Unattributed', attributed: false, campaign_count: 1, lead_count: 260 },
  ],
  brand_filter: null,
} as any;

const maybeIt = process.env.HARNESS_OUT ? it : it.skip;

/**
 * A real payload, when one is supplied.
 *
 * `HARNESS_PAYLOAD` points at a JSON file captured from the live graph endpoint.
 * It is READ, never committed: production data does not belong in the repo, so the
 * fixture above stays synthetic and the real thing lives outside it. Pointing this
 * at a live capture is how the component gets exercised against the shape and the
 * skew the API actually produces — 16 campaigns, one entry node holding 20,850
 * leads, several nodes at zero — rather than against numbers chosen to look good.
 */
function loadPayload(): any {
  const file = process.env.HARNESS_PAYLOAD;
  if (!file) return PAYLOAD;
  const real = JSON.parse(fs.readFileSync(file, 'utf8'));
  // eslint-disable-next-line no-console
  console.log(
    `[harness] real payload: ${real.nodes.length} nodes, ${real.edges.length} edges, ` +
      `${real.validation?.total_leads?.toLocaleString?.() ?? '?'} leads`,
  );
  return real;
}

maybeIt('writes the rendered component to disk', async () => {
  // The palette is chosen in JS from data-theme and baked into the SVG's fills, so
  // a dark capture has to be RENDERED dark. Restyling a light render with dark CSS
  // afterwards recolours the chrome and leaves every band in its light colour,
  // which would be a dark-mode screenshot that never exercised the dark palette.
  if (process.env.HARNESS_THEME === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  mockedApi.getCampaignGraph.mockResolvedValue({ data: loadPayload() } as any);
  mockedApi.getGraphEdgeUsers.mockResolvedValue({
    data: { users: [], total: 0, page: 1, limit: 50 },
  } as any);

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(<OutreachJourneyFlow />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const out = process.env.HARNESS_OUT || path.join(process.cwd(), 'harness-render.html');
  fs.writeFileSync(out, container.innerHTML, 'utf8');
  expect(container.querySelectorAll('path.journey-ribbon').length).toBeGreaterThan(20);
});
