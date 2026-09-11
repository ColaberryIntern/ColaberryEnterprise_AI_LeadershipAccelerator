import { CONTENT_OS_SCHEMA_STATEMENTS } from '../ensureContentOsSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
import {
  CONTENT_ITEM_STATUSES,
  type ContentItemStatus,
} from '../../models/ContentItem';
import '../../models';

/**
 * Schema/model parity for the Content OS.
 *
 * Same class of bug as the other parity suites: a column in the DDL that no model declares is
 * invisible to Sequelize, so reads return undefined and writes are silently dropped, while
 * every mocked unit test keeps passing.
 *
 * The stakes here are approval integrity. If `revision_at_decision` were dropped on write,
 * an approval would never register as stale — and stale approvals are precisely what
 * authorises publishing content nobody approved in its current form.
 */

describe('ensureContentOsSchema — DDL and models agree', () => {
  const created = parseCreatedTables(CONTENT_OS_SCHEMA_STATEMENTS);

  it('creates exactly the expected tables', () => {
    expect(created.map((c) => c.table).sort()).toEqual([
      'content_approval_events',
      'content_approval_requests',
      'content_item_media',
      'content_items',
      'content_templates',
      'content_variants',
      'media_assets',
    ]);
  });

  it('pins the exact column count per table', () => {
    // Pinned, not bounded. A loose guard lets a column be deleted from BOTH the DDL and the
    // model without any test noticing — `alt_text`, `rights_expires_at` and
    // `is_manually_edited` are all droppable that way, and each one silently removes a
    // capability the spec requires.
    const counts = Object.fromEntries(created.map((c) => [c.table, c.columns.length]));
    expect(counts).toEqual({
      content_items: 22,
      content_variants: 20,
      media_assets: 20,
      content_item_media: 5,
      content_templates: 12,
      content_approval_requests: 17,
      content_approval_events: 9,
    });
  });

  it('every created table has a registered Sequelize model', () => {
    const byTable = modelsByTable();
    const unknown = created.map((c) => c.table).filter((t) => !byTable[t]);
    expect(unknown).toEqual([]);
  });

  it('every created column is declared as a model attribute', () => {
    const byTable = modelsByTable();
    const missing: string[] = [];
    for (const { table, columns } of created) {
      const model = byTable[table];
      if (!model) continue;
      const mapped = modelColumnNames(model);
      for (const column of columns) {
        if (!mapped.has(column)) missing.push(`${table}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('declares no model attribute that the DDL will not create', () => {
    const byTable = modelsByTable();
    const extra: string[] = [];
    for (const { table, columns } of created) {
      const model = byTable[table];
      if (!model) continue;
      const ddl = new Set(columns);
      for (const field of modelColumnNames(model)) {
        if (!ddl.has(field)) extra.push(`${table}.${field}`);
      }
    }
    expect(extra).toEqual([]);
  });

  it('is additive only — nothing here alters an existing table', () => {
    const joined = CONTENT_OS_SCHEMA_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME/);
    expect(joined).not.toMatch(/ALTER\s+TABLE/);
    expect(joined).not.toMatch(/TRUNCATE|DELETE\s+FROM/);
  });

  it('every statement is idempotent', () => {
    for (const sql of CONTENT_OS_SCHEMA_STATEMENTS) {
      expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
    }
  });
});

describe('the invariants the content workflow depends on', () => {
  const REQUIRED: Array<[string, string[]]> = [
    ['content_items', ['id', 'tenant_id', 'title', 'status', 'revision', 'human_approved', 'scheduled_for']],
    ['content_variants', ['content_item_id', 'provider', 'is_manually_edited', 'validation_state', 'disclosure_text']],
    ['media_assets', ['storage_key', 'mime_type', 'alt_text', 'rights_expires_at', 'checksum_sha256']],
    ['content_approval_requests', ['content_item_id', 'status', 'revision_at_request', 'revision_at_decision']],
    ['content_approval_events', ['approval_request_id', 'event_type', 'occurred_at']],
  ];

  it.each(REQUIRED)('%s declares its load-bearing attributes', (table, columns) => {
    const model = modelsByTable()[table];
    expect(model).toBeDefined();
    const mapped = modelColumnNames(model);
    for (const column of columns) expect(mapped.has(column)).toBe(true);
  });

  it('approval staleness is expressible — both revision columns exist', () => {
    // The whole approval-invalidation rule (spec 8.3) rests on comparing the revision an
    // approval was DECIDED at against the item's CURRENT revision. Without both halves an
    // approval can never go stale, which means edited content stays authorised to publish.
    const item = modelColumnNames(modelsByTable()['content_items']);
    const req = modelColumnNames(modelsByTable()['content_approval_requests']);
    expect(item.has('revision')).toBe(true);
    expect(req.has('revision_at_decision')).toBe(true);
  });

  it('media assets can carry alt text and a rights expiry', () => {
    // Accessibility and licensing are both stated requirements, and both are the kind of
    // field that quietly becomes optional if it lives in a JSONB blob.
    const media = modelColumnNames(modelsByTable()['media_assets']);
    expect(media.has('alt_text')).toBe(true);
    expect(media.has('rights_expires_at')).toBe(true);
  });

  it('a variant can record that a human edited it', () => {
    // Regeneration must skip manually-edited variants. Without this column, "regenerate
    // variants" silently destroys copy somebody wrote.
    const v = modelColumnNames(modelsByTable()['content_variants']);
    expect(v.has('is_manually_edited')).toBe(true);
  });

  it('the duplicate-prevention indexes are all present in the DDL', () => {
    const joined = CONTENT_OS_SCHEMA_STATEMENTS.join('\n');
    for (const idx of [
      'content_approval_one_open_per_item',
      'content_variants_item_provider_account_unique',
      'media_assets_brand_checksum_unique',
      'content_templates_name_version_unique',
      'content_item_media_unique',
    ]) {
      expect(joined).toContain(idx);
    }
  });

  it('only one approval request can be open per item', () => {
    // Two open requests means two people can approve different revisions of the same post.
    const idx = CONTENT_OS_SCHEMA_STATEMENTS.find((s) =>
      s.includes('content_approval_one_open_per_item'));
    expect(idx).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(idx).toMatch(/WHERE\s+status\s*=\s*'pending'/i);
  });

  it('media dedup is scoped to a brand, never global', () => {
    // Deduping across brands would let one brand's asset library leak into another's.
    const idx = CONTENT_OS_SCHEMA_STATEMENTS.find((s) =>
      s.includes('media_assets_brand_checksum_unique'));
    expect(idx).toMatch(/\(\s*brand_id\s*,\s*checksum_sha256\s*\)/);
    expect(idx).toMatch(/WHERE\s+checksum_sha256\s+IS\s+NOT\s+NULL/i);
  });
});

describe('the content lifecycle enum', () => {
  it('covers every state in spec 8.3, happy path and exceptional', () => {
    // Named explicitly rather than derived from the constant, so deleting a state from the
    // union cannot quietly make this pass by leaving nothing to compare against.
    expect([...CONTENT_ITEM_STATUSES].sort()).toEqual([
      'approved', 'archived', 'cancelled', 'changes_requested', 'draft', 'expired',
      'idea', 'partially_published', 'publishing', 'published', 'publish_failed',
      'ready_for_review', 'removed_by_provider', 'scheduled', 'validation_failed',
    ].sort());
  });

  it('keeps the exceptional states in the same field as the happy path', () => {
    // A status field that cannot express failure ends up with failure encoded in a second,
    // unqueryable column — which is how "why did this not publish" becomes unanswerable.
    for (const s of ['validation_failed', 'publish_failed', 'partially_published',
      'removed_by_provider'] as ContentItemStatus[]) {
      expect(CONTENT_ITEM_STATUSES).toContain(s);
    }
  });
});
