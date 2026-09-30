import {
  catalogResponder,
  throwingCatalogResponder,
  violationPayloads,
  type CatalogState,
} from './postconditionHarness';

/**
 * Post-condition for the publishing queue.
 *
 * This is the one where a silent miss is worst. Losing a column throws on the next read.
 * Losing either uniqueness index publishes the same content twice to a real audience, and a
 * published post cannot be recalled — there is no compensating action, only an apology.
 *
 * Because the DDL loop only warns, without the index half of this check the function would
 * return `ok: true` over exactly that state.
 */

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const HEALTHY: CatalogState = {
  columns: {
    publishing_jobs: [
      'id', 'tenant_id', 'content_item_id', 'provider', 'publish_at',
      'scheduled_occurrence', 'content_revision', 'idempotency_key', 'state',
      'attempts', 'max_attempts', 'next_retry_at', 'dead_lettered_at',
    ],
    external_publications: ['id', 'provider', 'external_id', 'permalink', 'current_status'],
    platform_delivery_events: ['id', 'publishing_job_id', 'direction', 'payload_redacted', 'occurred_at'],
  },
  indexes: [
    'publishing_jobs_idempotency_key_unique',
    'publishing_jobs_semantic_unique',
    'external_publications_provider_external_unique',
  ],
};

describe('ensurePublishingSchema post-condition', () => {
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

  it('reports ok when all three tables and both uniqueness guards are present', async () => {
    const { ensurePublishingSchema } = await import('../ensurePublishingSchema');
    mockQuery.mockImplementation(catalogResponder(HEALTHY));

    const result = await ensurePublishingSchema();

    expect(result).toEqual({ ok: true, missing: [], missingIndexes: [] });
    expect(violationPayloads(errorSpy)).toEqual([]);
  });

  it('reports the missing scheduling columns when publishing_jobs failed to create', async () => {
    const { ensurePublishingSchema } = await import('../ensurePublishingSchema');
    mockQuery.mockImplementation(catalogResponder({
      ...HEALTHY,
      columns: { ...HEALTHY.columns, publishing_jobs: [] },
    }));

    const result = await ensurePublishingSchema();

    expect(result.ok).toBe(false);
    const entry = result.missing.find((m) => m.table === 'publishing_jobs');
    expect(entry!.columns).toEqual(
      expect.arrayContaining(['publish_at', 'idempotency_key', 'scheduled_occurrence']),
    );
    expect(result.missing).toHaveLength(1);
  });

  it.each([
    'publishing_jobs_idempotency_key_unique',
    'publishing_jobs_semantic_unique',
    'external_publications_provider_external_unique',
  ])('FAILS when %s is missing, even with every column present', async (missingIdx) => {
    // Each of these, absent, means a duplicate publish. The columns all being present is what
    // makes it silent: nothing errors, nothing looks wrong, and the audience sees the post
    // twice.
    const { ensurePublishingSchema } = await import('../ensurePublishingSchema');
    mockQuery.mockImplementation(catalogResponder({
      ...HEALTHY,
      indexes: HEALTHY.indexes.filter((i) => i !== missingIdx),
    }));

    const result = await ensurePublishingSchema();

    expect(result.missing).toEqual([]);
    expect(result.missingIndexes).toEqual([missingIdx]);
    expect(result.ok).toBe(false);
  });

  it('names the consequence in the structured log, not just the index', async () => {
    const { ensurePublishingSchema } = await import('../ensurePublishingSchema');
    mockQuery.mockImplementation(catalogResponder({ ...HEALTHY, indexes: [] }));

    await ensurePublishingSchema();

    const idxEvent = violationPayloads(errorSpy).find((p) => p.context?.missing_indexes);
    expect(idxEvent).toBeDefined();
    expect(idxEvent.error_class).toBe('SchemaInvariantViolation');
    // Whoever reads this at 2am should not have to work out why a missing index matters.
    expect(idxEvent.context.impact).toMatch(/idempotency is NOT enforced/i);
    expect(idxEvent.context.impact).toMatch(/cannot be recalled/i);
  });

  it('does not bring down boot when the catalog query itself throws', async () => {
    const { ensurePublishingSchema } = await import('../ensurePublishingSchema');
    mockQuery.mockImplementation(throwingCatalogResponder());

    // Documented fail-open: an unverifiable state warns rather than refusing to boot. Pinned
    // so the behaviour stays a deliberate choice. A caller that ever branches on `ok` needs a
    // third state here (verified: false) rather than reading this as a clean bill of health.
    await expect(ensurePublishingSchema()).resolves.toMatchObject({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
  });
});
