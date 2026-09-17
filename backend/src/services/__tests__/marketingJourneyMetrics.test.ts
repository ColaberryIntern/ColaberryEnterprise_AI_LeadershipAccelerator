/**
 * T411 - the campaigns table one dimension over: brand x programme x path.
 *
 * The same harness as `marketingCampaignScope.test.ts` (a real, never-connected
 * Sequelize with `query` stubbed), so the assertions are about the SQL the
 * service sends and the shape it returns - including the rule that matters: a
 * programme with no leads reads `null`, never `0`.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => {
  const { Sequelize } = jest.requireActual('sequelize');
  const sequelize = new Sequelize('postgres://never:never@127.0.0.1:1/never', { logging: false });
  sequelize.query = (...a: unknown[]) => mockQuery(...a);
  return { sequelize };
});
jest.mock('../governanceService', () => ({ logAgentExecution: jest.fn().mockResolvedValue(undefined) }));

import { ACTIVITY_DATE_COLUMNS, getCampaignMetricsByJourney, type JourneyMetricRow } from '../marketingAnalyticsService';

function lastSql(): { sql: string; replacements: Record<string, unknown> } {
  const [sql, opts] = mockQuery.mock.calls.at(-1) as [string, { replacements: Record<string, unknown> }];
  return { sql: sql.replace(/\s+/g, ' '), replacements: opts.replacements };
}

const BRAND = 'b0000000-0000-4000-8000-000000000001';
/** A row as Postgres returns it: every count already an int, `leads_count` 0 for a programme nobody is on. */
const row = (over: Record<string, unknown> = {}) => ({
  brand_id: BRAND, program_slug: 'business-growth', program_name: 'Business Growth', program_status: 'active',
  path_slug: 'workflow_automation', leads_count: 8, campaigns_count: 3, emails_sent: 40, opens_count: 20,
  clicks_count: 10, replies_count: 4, meetings_count: 2, enrollments_count: 1, ...over,
});

beforeEach(() => { mockQuery.mockReset().mockResolvedValue([]); });

describe('the SQL', () => {
  it('groups by brand, programme and path, reads the LATEST classification per lead, and joins the outcomes the campaign table counts', async () => {
    await getCampaignMetricsByJourney();
    const { sql } = lastSql();
    expect(sql).toContain('SELECT DISTINCT ON (c.lead_id)');
    expect(sql).toContain('FROM growth_journey_classifications c');
    expect(sql).toContain('ORDER BY c.lead_id, c.created_at DESC');
    expect(sql).toContain('FROM journey_programs p');
    expect(sql).toContain('GROUP BY p.brand_id, p.slug, p.name, p.status, jl.primary_path');
    expect(sql).toContain('LEFT JOIN interaction_outcomes io');
    // A LEFT JOIN from the programmes, so a programme with no lead still produces its row.
    expect(sql).toContain('LEFT JOIN journey_leads jl');
    expect(sql).toContain("WHERE p.status <> 'retired'");
  });

  it('with a brand: the journey rows are scoped by a bound replacement, never an interpolated id', async () => {
    await getCampaignMetricsByJourney({ brandId: BRAND });
    const { sql, replacements } = lastSql();
    expect(sql).toContain('AND p.brand_id = :brandId');
    expect(replacements.brandId).toBe(BRAND);
    expect(sql).not.toContain('b0000000');
  });

  it('without a brand: no brand clause and no brand replacement', async () => {
    await getCampaignMetricsByJourney({});
    const { sql, replacements } = lastSql();
    expect(sql).not.toContain('p.brand_id = :brandId');
    expect(replacements).not.toHaveProperty('brandId');
  });

  it('the date range applies to the OUTCOMES, on the column the model declares - a lead classified earlier still counts in this window', async () => {
    await getCampaignMetricsByJourney({ start: '2026-09-01', end: '2026-09-30' });
    const { sql, replacements } = lastSql();
    expect(sql).toContain(`io.${ACTIVITY_DATE_COLUMNS.interaction_outcomes} >=`);
    expect(replacements).toMatchObject({ start: '2026-09-01' });
    // Not on the classification: the range never appears inside the latest-classification CTE.
    const cte = sql.slice(sql.indexOf('WITH latest_classification'), sql.indexOf('journey_leads AS'));
    expect(cte).not.toContain('>=');
  });
});

describe('the counting unit is the campaign table\'s: DISTINCT LEADS, over campaign outcomes only (the T411 verifier)', () => {
  it('every outcome counter counts distinct LEADS, never event rows - a row count would let an open rate exceed 100%', async () => {
    await getCampaignMetricsByJourney();
    const { sql } = lastSql();
    for (const outcome of ['sent', 'opened', 'clicked', 'replied', 'booked_meeting']) {
      expect(sql).toContain(`COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = '${outcome}')`);
    }
    // The same unit the campaign table uses for the identically named fields.
    expect(sql).toContain("COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'sent')");
    expect(sql).not.toContain('COUNT(DISTINCT io.id)');
    // Distinct campaigns, not lead-campaign pairs; and the per-lead fan-out is gone with the grouping.
    expect(sql).toContain('COUNT(DISTINCT io.campaign_id) AS campaigns');
    expect(sql).toContain('COUNT(DISTINCT lc.lead_id) AS leads');
    expect(sql).not.toContain('SUM(jl.');
    expect(sql).toContain('GROUP BY lc.brand_id, lc.journey_program_slug, lc.primary_path ');
  });

  it('only CAMPAIGN outcomes count, as the campaign table requires - a non-campaign interaction is not campaign engagement', async () => {
    await getCampaignMetricsByJourney();
    const { sql } = lastSql();
    // The whole join condition, not just the presence of the phrase: a widened condition
    // (`... IS NOT NULL OR true`) would satisfy a containment check and count everything.
    expect(sql).toContain('LEFT JOIN interaction_outcomes io ON io.lead_id = lc.lead_id AND io.campaign_id IS NOT NULL');
    const cte = sql.slice(sql.indexOf('journey_leads AS'), sql.indexOf('journey_enrollments AS'));
    // No backslash in this assertion on purpose: written through a heredoc once, `\b` became a real
    // backspace byte and the regex matched nothing - a vacuous check the close-out mutation walked through.
    expect(cte.includes(' OR ')).toBe(false);
  });

  it('no rate can exceed 100%: the counts share a unit, and the ceiling holds even if a row arrived saying otherwise', async () => {
    // An impossible row (more opens than sends) is a model bug upstream; the answer is still bounded.
    mockQuery.mockResolvedValue([row({ emails_sent: 4, opens_count: 9, clicks_count: 7, replies_count: 6, enrollments_count: 40, leads_count: 8 })]);
    const [r] = await getCampaignMetricsByJourney();
    for (const k of ['open_rate', 'click_rate', 'reply_rate', 'conversion_rate'] as const) {
      expect(r[k]).not.toBeNull();
      expect(r[k] as number).toBeLessThanOrEqual(100);
    }
  });
});

describe('missing is null, never zero', () => {
  it('a programme with no leads: every count and every rate is null, the row still appears, and has_leads says so', async () => {
    mockQuery.mockResolvedValue([row({ program_slug: 'flotation-projects', program_name: 'Flotation Projects', path_slug: null, leads_count: 0, campaigns_count: 0, emails_sent: 0, opens_count: 0, clicks_count: 0, replies_count: 0, meetings_count: 0, enrollments_count: 0 })]);
    const [r] = await getCampaignMetricsByJourney();
    expect(r).toEqual({
      brand_id: BRAND, program_slug: 'flotation-projects', program_name: 'Flotation Projects', program_status: 'active',
      path_slug: null, has_leads: false,
      leads_count: null, classified_count: null, campaigns_count: null, emails_sent: null, opens_count: null,
      clicks_count: null, replies_count: null, meetings_count: null, enrollments_count: null,
      open_rate: null, click_rate: null, reply_rate: null, conversion_rate: null,
    });
    for (const k of ['leads_count', 'open_rate', 'conversion_rate'] as const) expect(r[k]).not.toBe(0);
  });

  it('a programme with leads but nothing sent: the counts are the genuine 0 and the rates over sent are null, not 0%', async () => {
    mockQuery.mockResolvedValue([row({ emails_sent: 0, opens_count: 0, clicks_count: 0, replies_count: 0, enrollments_count: 0 })]);
    const [r] = await getCampaignMetricsByJourney();
    expect(r).toMatchObject({ has_leads: true, leads_count: 8, emails_sent: 0, opens_count: 0 });
    expect(r.open_rate).toBeNull();
    expect(r.click_rate).toBeNull();
    expect(r.reply_rate).toBeNull();
    // Conversion divides by the leads, which exist - so it is the genuine 0%.
    expect(r.conversion_rate).toBe(0);
  });

  it('a populated row: the rates are the ratios the campaign table computes, two decimals', async () => {
    mockQuery.mockResolvedValue([row()]);
    const [r] = await getCampaignMetricsByJourney();
    expect(r).toMatchObject({
      has_leads: true, program_slug: 'business-growth', path_slug: 'workflow_automation',
      leads_count: 8, classified_count: 8, campaigns_count: 3, emails_sent: 40, opens_count: 20, clicks_count: 10,
      replies_count: 4, meetings_count: 2, enrollments_count: 1,
      open_rate: 50, click_rate: 25, reply_rate: 10, conversion_rate: 12.5,
    });
  });

  it('every programme in the answer keeps its identity and status, and no row carries an address or a blob', async () => {
    mockQuery.mockResolvedValue([row(), row({ program_slug: 'cpn-scholars', path_slug: 'learner_free_training', program_status: 'draft', leads_count: 0 })]);
    const rows: JourneyMetricRow[] = await getCampaignMetricsByJourney();
    expect(rows.map((r) => [r.program_slug, r.program_status, r.has_leads])).toEqual([
      ['business-growth', 'active', true],
      ['cpn-scholars', 'draft', false],
    ]);
    expect(JSON.stringify(rows)).not.toContain('@');
    for (const r of rows) expect(Object.keys(r).sort()).toEqual([
      'brand_id', 'campaigns_count', 'classified_count', 'click_rate', 'clicks_count', 'conversion_rate', 'emails_sent',
      'enrollments_count', 'has_leads', 'leads_count', 'meetings_count', 'open_rate', 'opens_count', 'path_slug',
      'program_name', 'program_slug', 'program_status', 'replies_count', 'reply_rate',
    ]);
  });
});
