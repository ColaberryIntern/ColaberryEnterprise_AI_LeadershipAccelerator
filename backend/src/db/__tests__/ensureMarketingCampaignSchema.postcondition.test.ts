/**
 * The campaign-schema post-condition must fire on BOTH failure modes.
 *
 * Sibling of `ensureMarketingTrackingSchema.postcondition.test.ts`. That one shipped with its
 * module; this one did not, and the gap was caught in review — same run, same pattern, one
 * covered and one not.
 *
 * The two failure modes are not equally loud, which is the whole reason both are checked:
 *
 *   A missing COLUMN is loud. Sequelize emits every declared attribute in every SELECT, so
 *   the next campaign read throws at the database and somebody notices immediately.
 *
 *   A missing UNIQUE INDEX is silent. Every write still succeeds. The only symptom is that
 *   two campaigns inside one tenant can share a `utm_campaign_slug` — and from that moment
 *   their clicks, sessions and leads land in one indistinguishable bucket. Nothing errors,
 *   and the attribution cannot be untangled after the fact. Since the DDL loop only warns,
 *   without the index check the function would return `ok: true` over exactly that state.
 *
 * `jest.mock` is hoisted above the imports, so the harness import above it is safe. The
 * `mockQuery` handle is declared before the factory so it closes over it - that ordering is
 * the part that matters.
 */

import { catalogResponder, throwingCatalogResponder, violationPayloads } from './postconditionHarness';

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const ALL_COLUMNS = [
  'funnel_stage', 'owner_admin_id', 'approver_admin_id', 'planned_start_at',
  'planned_end_at', 'utm_campaign_slug', 'goals_json', 'parent_campaign_id',
  'archived_at', 'archived_reason',
];

describe('ensureMarketingCampaignSchema post-condition', () => {
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockQuery.mockReset();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  /**
   * Delegates to the shared harness. This module probes a single hardcoded table
   * (`table_name = 'campaigns'`) with no `replacements`, which the harness handles by
   * falling back to the sole fixture entry.
   */
  function arrange(columns: string[], indexes: string[]) {
    mockQuery.mockImplementation(catalogResponder({ columns: { campaigns: columns }, indexes }));
  }

  it('reports ok when every column and the unique index are present', async () => {
    const { ensureMarketingCampaignSchema } = await import('../ensureMarketingCampaignSchema');
    arrange(ALL_COLUMNS, ['campaigns_tenant_utm_slug_unique']);

    const result = await ensureMarketingCampaignSchema();

    expect(result).toEqual({ ok: true, missing: [], missingIndexes: [] });
    expect(violationPayloads(errorSpy)).toEqual([]);
  });

  it('reports the missing columns when an ALTER silently failed', async () => {
    const { ensureMarketingCampaignSchema } = await import('../ensureMarketingCampaignSchema');
    arrange(
      ALL_COLUMNS.filter((c) => c !== 'utm_campaign_slug' && c !== 'goals_json'),
      ['campaigns_tenant_utm_slug_unique'],
    );

    const result = await ensureMarketingCampaignSchema();

    expect(result.ok).toBe(false);
    expect(result.missing.sort()).toEqual(['goals_json', 'utm_campaign_slug']);
  });

  it('FAILS when the unique index is absent even though every column landed', async () => {
    // The silent one. Columns all present, writes all succeed, and slug uniqueness is simply
    // not enforced. Before the index check existed this returned ok: true.
    const { ensureMarketingCampaignSchema } = await import('../ensureMarketingCampaignSchema');
    arrange(ALL_COLUMNS, ['idx_campaigns_funnel_stage']); // other indexes fine, unique one gone

    const result = await ensureMarketingCampaignSchema();

    expect(result.missing).toEqual([]);
    expect(result.missingIndexes).toEqual(['campaigns_tenant_utm_slug_unique']);
    expect(result.ok).toBe(false);
  });

  it('names the consequence in the structured log, not just the index name', async () => {
    const { ensureMarketingCampaignSchema } = await import('../ensureMarketingCampaignSchema');
    arrange(ALL_COLUMNS, []);

    await ensureMarketingCampaignSchema();

    const idxEvent = violationPayloads(errorSpy).find((p) => p.context?.missing_indexes);
    expect(idxEvent).toBeDefined();
    expect(idxEvent.error_class).toBe('SchemaInvariantViolation');
    // Whoever reads this log at 2am should not have to work out why a missing index matters.
    expect(idxEvent.context.impact).toMatch(/uniqueness is NOT enforced/i);
  });

  it('does not bring down boot when the catalog query itself throws', async () => {
    const { ensureMarketingCampaignSchema } = await import('../ensureMarketingCampaignSchema');
    mockQuery.mockImplementation(throwingCatalogResponder());

    await expect(ensureMarketingCampaignSchema()).resolves.toMatchObject({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
  });
});
