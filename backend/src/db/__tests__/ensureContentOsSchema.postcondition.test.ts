/**
 * The Content OS post-condition must fire on both failure modes, across seven tables.
 *
 * Third in the family, and the pattern is now settled: a missing COLUMN is loud (Sequelize
 * emits every declared attribute in every SELECT, so the next read throws), while a missing
 * UNIQUE INDEX is SILENT — every write succeeds and the only symptom is a duplicate nobody
 * notices until it matters.
 *
 * Here the silent failures are specific and each one is a real incident:
 *   - `content_approval_one_open_per_item` gone: two people approve two different revisions
 *     of the same post, and both approvals look valid.
 *   - `content_variants_item_provider_account_unique` gone: two variants for one account,
 *     i.e. the same post published twice to the same audience.
 *   - `media_assets_brand_checksum_unique` gone: the same asset ingested repeatedly, so the
 *     library fills with duplicates and rights-expiry tracking is spread across copies.
 *
 * Because the DDL loop only warns, without the index check the function would return
 * `ok: true` over every one of those states.
 */

import { catalogResponder, throwingCatalogResponder, violationPayloads } from './postconditionHarness';

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const COLUMNS: Record<string, string[]> = {
  content_items: ['id', 'tenant_id', 'title', 'status', 'revision', 'human_approved'],
  content_variants: ['id', 'content_item_id', 'provider', 'is_manually_edited', 'validation_state'],
  media_assets: ['id', 'tenant_id', 'storage_key', 'mime_type', 'alt_text', 'rights_expires_at'],
  content_item_media: ['id', 'content_item_id', 'media_asset_id'],
  content_templates: ['id', 'tenant_id', 'body_template', 'version'],
  content_approval_requests: ['id', 'content_item_id', 'status', 'revision_at_request', 'revision_at_decision'],
  content_approval_events: ['id', 'approval_request_id', 'event_type', 'occurred_at'],
};

/**
 * Deliberately a test-local literal, NOT imported from the module.
 *
 * That is what makes the it.each below pin in both directions: drop an entry from the
 * module's REQUIRED_INDEXES and `missingIndexes` comes back empty, failing the case; add one
 * and it comes back with two entries, also failing. Importing the constant would make the
 * test agree with the module by construction and assert nothing.
 *
 * It did exactly that when `content_item_media_unique` was added to the module - six cases
 * went red until this list was updated to match, which is the intended behaviour.
 */
const ALL_INDEXES = [
  'content_approval_one_open_per_item',
  'content_variants_item_provider_account_unique',
  'media_assets_brand_checksum_unique',
  'content_templates_name_version_unique',
  'content_item_media_unique',
];

describe('ensureContentOsSchema post-condition', () => {
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

  /** Delegates to the shared harness. */
  function arrange(columns: Record<string, string[]>, indexes: string[]) {
    mockQuery.mockImplementation(catalogResponder({ columns, indexes }));
  }

  it('reports ok when all seven tables and every unique index are present', async () => {
    const { ensureContentOsSchema } = await import('../ensureContentOsSchema');
    arrange(COLUMNS, ALL_INDEXES);

    const result = await ensureContentOsSchema();

    expect(result).toEqual({ ok: true, missing: [], missingIndexes: [] });
    expect(violationPayloads(errorSpy)).toEqual([]);
  });

  it('names the table AND the columns when one table failed to create', async () => {
    const { ensureContentOsSchema } = await import('../ensureContentOsSchema');
    const broken = { ...COLUMNS, content_approval_requests: [] };
    arrange(broken, ALL_INDEXES);

    const result = await ensureContentOsSchema();

    expect(result.ok).toBe(false);
    const entry = result.missing.find((m) => m.table === 'content_approval_requests');
    expect(entry).toBeDefined();
    expect(entry!.columns).toEqual(
      expect.arrayContaining(['revision_at_decision', 'revision_at_request']),
    );
    // The other six are fine and must not be reported.
    expect(result.missing).toHaveLength(1);
  });

  it('FAILS on a missing approval index even when every column landed', async () => {
    // The silent one. All seven tables exist, every write succeeds, and two people can
    // approve two different revisions of the same post.
    const { ensureContentOsSchema } = await import('../ensureContentOsSchema');
    arrange(COLUMNS, ALL_INDEXES.filter((i) => i !== 'content_approval_one_open_per_item'));

    const result = await ensureContentOsSchema();

    expect(result.missing).toEqual([]);
    expect(result.missingIndexes).toEqual(['content_approval_one_open_per_item']);
    expect(result.ok).toBe(false);
  });

  it.each(ALL_INDEXES)('FAILS when %s is missing', async (missingIdx) => {
    const { ensureContentOsSchema } = await import('../ensureContentOsSchema');
    arrange(COLUMNS, ALL_INDEXES.filter((i) => i !== missingIdx));

    const result = await ensureContentOsSchema();

    expect(result.missingIndexes).toEqual([missingIdx]);
    expect(result.ok).toBe(false);
  });

  it('states the consequence in the log, not just the index name', async () => {
    const { ensureContentOsSchema } = await import('../ensureContentOsSchema');
    arrange(COLUMNS, []);

    await ensureContentOsSchema();

    const idxEvent = violationPayloads(errorSpy).find((p) => p.context?.missing_indexes);
    expect(idxEvent).toBeDefined();
    expect(idxEvent.error_class).toBe('SchemaInvariantViolation');
    expect(idxEvent.context.impact).toMatch(/duplicate-prevention is NOT enforced/i);
  });

  it('does not bring down boot when the catalog query itself throws', async () => {
    const { ensureContentOsSchema } = await import('../ensureContentOsSchema');
    mockQuery.mockImplementation(throwingCatalogResponder());

    // Documented fail-open: verification failing is not a reason to refuse to boot. It warns
    // loudly instead. Pinned deliberately so the behaviour is a choice, not an accident.
    await expect(ensureContentOsSchema()).resolves.toMatchObject({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
  });
});
