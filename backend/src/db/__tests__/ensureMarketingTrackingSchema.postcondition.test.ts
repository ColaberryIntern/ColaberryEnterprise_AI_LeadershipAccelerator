/**
 * The post-condition check must actually fire when a table fails to land.
 *
 * WHY THIS EXISTS: `ensureMarketingTrackingSchema` runs its DDL in a loop that only
 * `console.warn`s on failure — deliberately, so one bad statement never aborts boot. The
 * consequence is that "it did not throw" proves nothing. If `tracked_links` silently failed
 * to create, every `/r/:shortCode` request would 404 while the deploy looked perfectly
 * clean, and the first symptom would be marketing reporting zero clicks on a live campaign.
 *
 * The catalog check is the thing that catches that. A check nobody tests is a check nobody
 * knows works, so this drives it directly — no database required.
 *
 * `jest.mock` is hoisted above the imports by ts-jest, so the harness import sitting above it
 * is safe - the harness never touches the mocked module. The mocked-module handle
 * (`mockQuery`) is still declared before `jest.mock` so the factory closes over it, which is
 * the part of the repo idiom that actually matters (see
 * services/__tests__/visitorTrackingIdentity.test.ts).
 */

import { catalogResponder, throwingCatalogResponder, violationPayloads } from './postconditionHarness';

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

describe('ensureMarketingTrackingSchema post-condition', () => {
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
   * Every DDL statement succeeds; the catalog then reports whatever `catalog` says.
   * Delegates to the shared harness - this module has no indexes to verify, so the
   * responder is given an empty index list.
   */
  function arrangeCatalog(catalog: Record<string, string[]>) {
    mockQuery.mockImplementation(catalogResponder({ columns: catalog, indexes: [] }));
  }

  it('reports ok when every required column is present', async () => {
    const { ensureMarketingTrackingSchema } = await import('../ensureMarketingTrackingSchema');
    arrangeCatalog({
      tracked_links: ['id', 'tenant_id', 'short_code', 'destination_url', 'status', 'superseded_by'],
      link_clicks: ['id', 'tracked_link_id', 'occurred_at', 'is_bot', 'fbclid', 'gclid', 'click_ids'],
    });

    const result = await ensureMarketingTrackingSchema();

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(violationPayloads(errorSpy)).toEqual([]);
  });

  it('reports the missing columns when a table never landed', async () => {
    const { ensureMarketingTrackingSchema } = await import('../ensureMarketingTrackingSchema');
    // tracked_links absent entirely — the exact silent failure this guards.
    arrangeCatalog({
      tracked_links: [],
      link_clicks: ['id', 'tracked_link_id', 'occurred_at', 'is_bot', 'fbclid', 'gclid', 'click_ids'],
    });

    const result = await ensureMarketingTrackingSchema();

    expect(result.ok).toBe(false);
    const trackedLinks = result.missing.find((m) => m.table === 'tracked_links');
    expect(trackedLinks).toBeDefined();
    expect(trackedLinks!.columns).toEqual(
      expect.arrayContaining(['id', 'short_code', 'destination_url']),
    );
    expect(result.missing.find((m) => m.table === 'link_clicks')).toBeUndefined();
  });

  it('emits a structured SchemaInvariantViolation rather than a bare string', async () => {
    const { ensureMarketingTrackingSchema } = await import('../ensureMarketingTrackingSchema');
    arrangeCatalog({ tracked_links: [], link_clicks: [] });

    await ensureMarketingTrackingSchema();

    expect(errorSpy).toHaveBeenCalled();
    const payload = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(payload).toMatchObject({
      level: 'error',
      service: 'backend',
      event: 'SchemaInvariantViolation',
      outcome: 'failure',
      error_class: 'SchemaInvariantViolation',
    });
    expect(payload.context.table).toBeDefined();
    expect(Array.isArray(payload.context.missing_columns)).toBe(true);
  });

  it('still returns a result when the catalog query itself throws', async () => {
    const { ensureMarketingTrackingSchema } = await import('../ensureMarketingTrackingSchema');
    mockQuery.mockImplementation(throwingCatalogResponder('permission denied for information_schema'));

    // Boot must not be brought down by the verification step itself.
    await expect(ensureMarketingTrackingSchema()).resolves.toMatchObject({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
  });
});
