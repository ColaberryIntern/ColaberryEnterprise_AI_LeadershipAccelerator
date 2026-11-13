import { MEDIA_LIBRARY_SCHEMA_STATEMENTS } from '../ensureMediaLibrarySchema';

/**
 * These are unit tests of the STATEMENTS, not of the database. They pin the decisions that are
 * easy to undo by accident in a later edit and impossible to see in a diff review:
 * which column is relaxed, what the CHECK actually requires, and which rows each partial index
 * deliberately leaves out.
 *
 * Whether Postgres accepts this DDL, and whether the CHECK really refuses a malformed row, is a
 * question only a real database can answer. That is the integration test (T4), which runs against
 * the CI Postgres tier. A test file that asserted "the constraint works" by reading its own SQL
 * string would be testing the string.
 */
describe('media library schema statements', () => {
  const sql = MEDIA_LIBRARY_SCHEMA_STATEMENTS.join('\n;\n');
  const find = (needle: string) => MEDIA_LIBRARY_SCHEMA_STATEMENTS.filter((s) => s.includes(needle));

  it('adds the three columns idempotently, so a re-boot is a no-op', () => {
    for (const col of ['kind', 'source_url', 'tags']) {
      const stmt = find(`ADD COLUMN IF NOT EXISTS ${col}`);
      expect(stmt).toHaveLength(1);
    }
    // A re-run must not fail on an existing column. Every ADD COLUMN carries the guard.
    const adds = MEDIA_LIBRARY_SCHEMA_STATEMENTS.filter((s) => s.includes('ADD COLUMN'));
    expect(adds).toHaveLength(3);
    expect(adds.every((s) => s.includes('IF NOT EXISTS'))).toBe(true);
  });

  it("defaults kind to 'file', so the rows already in the table need no backfill", () => {
    expect(find('ADD COLUMN IF NOT EXISTS kind')[0]).toMatch(/NOT NULL DEFAULT 'file'/);
  });

  it('defaults tags to an empty array rather than NULL, so readers need no null check', () => {
    expect(find('ADD COLUMN IF NOT EXISTS tags')[0]).toMatch(/NOT NULL DEFAULT '\{\}'::text\[\]/);
  });

  it('relaxes storage_key and NOTHING else', () => {
    const relaxed = MEDIA_LIBRARY_SCHEMA_STATEMENTS.filter((s) => s.includes('DROP NOT NULL'));
    expect(relaxed).toHaveLength(1);
    expect(relaxed[0]).toContain('ALTER COLUMN storage_key DROP NOT NULL');
    // mime_type staying NOT NULL is a decision, not an oversight: a link carries 'text/uri-list',
    // and relaxing it would be a breaking contract change for every existing reader.
    expect(sql).not.toContain('mime_type DROP NOT NULL');
  });

  describe('the CHECK constraint, which is the actual deliverable', () => {
    const check = () => {
      const found = MEDIA_LIBRARY_SCHEMA_STATEMENTS.filter((s) => s.includes('media_assets_kind_shape'));
      expect(found).toHaveLength(1);
      return found[0];
    };

    it('requires a file row to carry both storage_key and mime_type, and no URL', () => {
      expect(check()).toContain("kind = 'file' AND storage_key IS NOT NULL AND mime_type IS NOT NULL AND source_url IS NULL");
    });

    it('requires a link row to carry a URL and no storage_key', () => {
      expect(check()).toContain("kind = 'link' AND source_url IS NOT NULL AND storage_key IS NULL");
    });

    it('is wrapped so a second boot does not fail, because ADD CONSTRAINT has no IF NOT EXISTS', () => {
      expect(check()).toContain('EXCEPTION WHEN duplicate_object THEN NULL');
    });

    it('catches ONLY duplicate_object, so a real failure is not swallowed', () => {
      // A bare `WHEN OTHERS` here would let the module report success with the table unprotected,
      // which is precisely what the post-condition exists to catch.
      expect(check()).not.toMatch(/WHEN\s+OTHERS/i);
    });
  });

  describe('the link uniqueness index and the holes left in it on purpose', () => {
    const idx = () => find('media_assets_link_unique')[0];

    it('is unique on (brand_id, source_url)', () => {
      expect(idx()).toContain('CREATE UNIQUE INDEX IF NOT EXISTS media_assets_link_unique');
      expect(idx()).toContain('ON media_assets (brand_id, source_url)');
    });

    it('excludes brand_id IS NULL, mirroring media_assets_brand_checksum_unique', () => {
      // ensureContentOsSchema.ts:169-178 accepts the same hole for the same reason: deduplicating
      // a tenant-level asset across brands would tell brand A what brand B has saved.
      expect(idx()).toContain('brand_id IS NOT NULL');
    });

    it('excludes archived rows, so a link an operator archived can be added again', () => {
      expect(idx()).toContain('archived_at IS NULL');
    });

    it('applies only to links, so it can never collide with a file row', () => {
      expect(idx()).toContain("kind = 'link'");
    });
  });

  it('indexes tags with GIN, because a btree would never be used for array containment', () => {
    expect(find('media_assets_tags_gin')[0]).toContain('USING GIN (tags)');
  });

  it('indexes the library default view: one brand, live only, newest first', () => {
    const live = find('media_assets_brand_live')[0];
    expect(live).toContain('(brand_id, created_at DESC)');
    expect(live).toContain('WHERE archived_at IS NULL');
  });

  it('is additive only: nothing here drops a column, a table, or data', () => {
    // The rollback story for this task is "leave it", which is only true while that holds.
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/i);
  });

  it('touches only media_assets', () => {
    for (const statement of MEDIA_LIBRARY_SCHEMA_STATEMENTS) {
      expect(statement).toContain('media_assets');
    }
  });
});
