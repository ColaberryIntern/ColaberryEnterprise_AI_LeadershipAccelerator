/**
 * The attribution-schema post-condition — the fifth suite, and the one that was missing.
 *
 * Every peer in this workstream shipped one (`ensureMarketingTrackingSchema`,
 * `ensureMarketingCampaignSchema`, `ensureContentOsSchema`, `ensurePublishingSchema`) and this
 * module did not. Caught in review, not by the suite, which is the point worth recording: the
 * DDL loop deliberately swallows every failure into a `console.warn` so one bad statement can
 * never abort boot, and the direct consequence is that "it did not throw" proves nothing about
 * whether the columns landed. The post-condition IS the check, and an untested check is a
 * check nobody knows works.
 *
 * WHY THE STAKES ARE HIGHER HERE THAN FOR A NEW TABLE. `visitor_sessions` is live and busy.
 * Sequelize emits every DECLARED attribute in every SELECT, so if the model declares `fbclid`
 * and the ALTER silently failed, the failure is not "the new marketing feature is degraded" —
 * it is every visitor-session read in the product throwing at the database. The blast radius
 * is the existing tracker.
 *
 * WHY NO INDEX ASSERTIONS, unlike the campaign suite. That one checks indexes because its
 * index is UNIQUE, and a missing UNIQUE index fails silently — writes keep succeeding and two
 * campaigns quietly collide on one slug. The five indexes here are PARTIAL and
 * performance-only; losing one costs a slow reconciliation query, not a correctness bug, and
 * the module deliberately does not probe for them. Asserting on absent behaviour would be a
 * test of nothing.
 */

import { catalogResponder, throwingCatalogResponder, violationPayloads } from './postconditionHarness';

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const ALL_COLUMNS = [
  'utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid', 'ttclid', 'click_ids',
];

describe('ensureMarketingAttributionSchema post-condition', () => {
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
   * This module probes a single hardcoded table (`table_name = 'visitor_sessions'`) with no
   * `replacements`, which the harness resolves via its sole-fixture fallback.
   */
  function arrange(columns: string[]) {
    mockQuery.mockImplementation(
      catalogResponder({ columns: { visitor_sessions: columns }, indexes: [] }),
    );
  }

  it('reports ok when all seven columns are present', async () => {
    const { ensureMarketingAttributionSchema } = await import('../ensureMarketingAttributionSchema');
    arrange(ALL_COLUMNS);

    const result = await ensureMarketingAttributionSchema();

    expect(result).toEqual({ ok: true, missing: [] });
    expect(violationPayloads(errorSpy)).toEqual([]);
  });

  it('reports the missing columns when an ALTER silently failed', async () => {
    const { ensureMarketingAttributionSchema } = await import('../ensureMarketingAttributionSchema');
    arrange(ALL_COLUMNS.filter((c) => c !== 'fbclid' && c !== 'click_ids'));

    const result = await ensureMarketingAttributionSchema();

    expect(result.ok).toBe(false);
    expect(result.missing.sort()).toEqual(['click_ids', 'fbclid']);
  });

  it('is not fooled by the table existing with only its ORIGINAL columns', async () => {
    // The realistic total failure: every ALTER was skipped, so the table is exactly as it was.
    // A check that merely confirmed `visitor_sessions` exists would pass here.
    const { ensureMarketingAttributionSchema } = await import('../ensureMarketingAttributionSchema');
    arrange(['id', 'visitor_id', 'utm_source', 'utm_medium', 'utm_campaign']);

    const result = await ensureMarketingAttributionSchema();

    expect(result.ok).toBe(false);
    expect(result.missing.sort()).toEqual(ALL_COLUMNS.slice().sort());
  });

  it('names the blast radius in the structured log, not just the column list', async () => {
    const { ensureMarketingAttributionSchema } = await import('../ensureMarketingAttributionSchema');
    arrange([]);

    await ensureMarketingAttributionSchema();

    const [event] = violationPayloads(errorSpy);
    expect(event).toBeDefined();
    expect(event.error_class).toBe('SchemaInvariantViolation');
    expect(event.context.table).toBe('visitor_sessions');
    // Whoever reads this at 2am needs to know it is not confined to the new feature.
    expect(event.context.impact).toMatch(/every visitor-session read may fail/i);
  });

  it('does not bring down boot when the catalog query itself throws', async () => {
    // Fail-open is correct HERE and only here: refusing to boot because a verification query
    // failed would convert an observability problem into an outage. It warns instead, and the
    // asymmetry is deliberate.
    const { ensureMarketingAttributionSchema } = await import('../ensureMarketingAttributionSchema');
    mockQuery.mockImplementation(throwingCatalogResponder());

    await expect(ensureMarketingAttributionSchema()).resolves.toMatchObject({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
  });
});
