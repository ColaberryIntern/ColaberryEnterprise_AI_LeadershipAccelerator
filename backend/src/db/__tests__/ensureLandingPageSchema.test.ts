/**
 * Static + behavioural contract test for ensureLandingPageSchema, with no live database
 * (mocked sequelize.query, same convention as ensureAdminUserIdentitySchema.test.ts).
 *
 * Two failures are being guarded against. The cheap one: a column added to the Sequelize model
 * and not to the DDL, which boots fine, passes every other test, and throws "column does not
 * exist" the first time a page is written in production. The expensive one: a DDL statement that
 * fails at boot. The loop only `console.warn`s on a failed statement, so "it booted" proves
 * nothing — the post-condition is what turns a silent miss into a SchemaInvariantViolation, and
 * a post-condition nobody tested is just more code that can be wrong.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureLandingPageSchema, LANDING_PAGE_SCHEMA_STATEMENTS } from '../ensureLandingPageSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

/** Mirrors `LandingPageAttributes` in models/LandingPage.ts. Adding one there means adding it here. */
const NEW_COLUMNS = [
  'tenant_id', 'brand_id', 'site_slug', 'kind', 'slug', 'status',
  'content', 'published_at', 'created_by', 'repo_path', 'repo_commit',
];

const ALL_INDEXES = [
  'landing_pages_brand_slug_unique',
  'idx_landing_pages_tenant',
  'idx_landing_pages_brand_status',
];

const sql = LANDING_PAGE_SCHEMA_STATEMENTS.join('\n');

/**
 * Answer the two verification queries from a given world, so a test can describe a database
 * where the DDL only partly landed. Everything else (the DDL itself) resolves empty.
 */
function databaseWith({ columns, indexes }: { columns: string[]; indexes: string[] }) {
  mockQuery.mockImplementation(async (statement: string) => {
    if (/information_schema\.columns/.test(statement)) {
      return [columns.map((column_name) => ({ column_name }))];
    }
    if (/pg_indexes/.test(statement)) {
      return [indexes.map((indexname) => ({ indexname }))];
    }
    return [];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  databaseWith({ columns: NEW_COLUMNS, indexes: ALL_INDEXES });
});

describe('every new column is actually added', () => {
  it.each(NEW_COLUMNS)('%s has an additive statement', (col) => {
    expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
  });

  it('adds nothing destructively - no DROP, no TRUNCATE, no DELETE', () => {
    // This runs at every boot against a live table with seventeen rows someone depends on.
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('every statement can run twice', () => {
    const notIdempotent = LANDING_PAGE_SCHEMA_STATEMENTS.filter(
      (s) => !/IF NOT EXISTS/i.test(s) && !/EXCEPTION WHEN duplicate_object/i.test(s),
    );
    expect(notIdempotent).toEqual([]);
  });
});

describe('ownership is nullable, because seventeen rows already exist', () => {
  it('does not try to add tenant_id or brand_id NOT NULL', () => {
    // A NOT NULL column with no default cannot be added to a populated table, and inventing an
    // owner for a legacy row is worse than recording that it is unknown.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS tenant_id[^,\n]*NOT NULL/);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS brand_id[^,\n]*NOT NULL/);
  });

  it('carries site_slug as well as brand_id', () => {
    // brand_id pools five web properties into one; site_slug is the grain the analytics use.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS site_slug/);
  });
});

describe('the legacy rows keep working', () => {
  it('kind defaults to external_path, which is what they have always been', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS kind VARCHAR\(20\) NOT NULL DEFAULT 'external_path'/);
  });

  it('the brand+slug uniqueness is PARTIAL, so rows without either are not forced into it', () => {
    const idx = LANDING_PAGE_SCHEMA_STATEMENTS.find((s) => s.includes('landing_pages_brand_slug_unique'))!;
    expect(idx).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
    expect(idx).toMatch(/WHERE kind = 'hosted'/);
    expect(idx).toMatch(/brand_id IS NOT NULL AND slug IS NOT NULL/);
  });
});

describe('two things the database refuses rather than one service remembering to', () => {
  it('a hosted page must have a slug - without one it could never be served', () => {
    expect(sql).toMatch(/landing_pages_hosted_needs_slug/);
    expect(sql).toMatch(/CHECK \(kind <> 'hosted' OR slug IS NOT NULL\)/);
  });

  it('a published page must have content - otherwise it renders blank at a public URL', () => {
    expect(sql).toMatch(/landing_pages_published_needs_content/);
    expect(sql).toMatch(/CHECK \(status <> 'published' OR content <> '\{\}'::jsonb\)/);
  });

  it('both constraints survive a second boot', () => {
    const checks = LANDING_PAGE_SCHEMA_STATEMENTS.filter((s) => s.includes('ADD CONSTRAINT'));
    expect(checks).toHaveLength(2);
    for (const c of checks) expect(c).toMatch(/EXCEPTION WHEN duplicate_object THEN NULL/);
  });
});

/**
 * The content_items -> landing_pages foreign key is NOT here. It is owned by
 * ensureContentItemDestinationSchema, which runs after this file, because the column it
 * constrains belongs to content_items and that table is created earlier in the boot.
 * See ensureContentItemDestinationSchema.test.ts.
 */
describe('content is structured, not markup', () => {
  it('is JSONB rather than TEXT', () => {
    // A renderer that accepts HTML is a way to put arbitrary markup on our own origin.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS content JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS (html|body_html)/);
  });
});

describe('running it', () => {
  it('issues every statement, so none is quietly skipped', async () => {
    await ensureLandingPageSchema();
    const issued = mockQuery.mock.calls.map((c) => String(c[0]));
    for (const statement of LANDING_PAGE_SCHEMA_STATEMENTS) {
      expect(issued).toContain(statement);
    }
  });

  it('reports ok when the table ends up with everything', async () => {
    const result = await ensureLandingPageSchema();
    expect(result).toEqual({ ok: true, verified: true, missing: [], missingIndexes: [] });
  });

  it('keeps going after one statement throws, then still checks the result', async () => {
    // The DDL loop swallows per-statement failures by design; the post-condition is the net.
    let seen = 0;
    mockQuery.mockImplementation(async (statement: string) => {
      if (/information_schema\.columns/.test(statement)) {
        return [NEW_COLUMNS.map((column_name) => ({ column_name }))];
      }
      if (/pg_indexes/.test(statement)) return [ALL_INDEXES.map((indexname) => ({ indexname }))];
      seen += 1;
      if (seen === 2) throw new Error('deadlock detected');
      return [];
    });
    const result = await ensureLandingPageSchema();
    expect(seen).toBe(LANDING_PAGE_SCHEMA_STATEMENTS.length);
    expect(result.ok).toBe(true);
  });
});

describe('the post-condition, which is the only thing that notices a failed DDL', () => {
  let error: jest.SpyInstance;
  beforeEach(() => { error = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { error.mockRestore(); });

  function emitted(): any | null {
    const call = error.mock.calls.find((c) => String(c[0]).includes('SchemaInvariantViolation'));
    return call ? JSON.parse(String(call[0])) : null;
  }

  it('names the missing column rather than reporting a generic failure', async () => {
    databaseWith({ columns: NEW_COLUMNS.filter((c) => c !== 'content'), indexes: ALL_INDEXES });
    const result = await ensureLandingPageSchema();

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['landing_pages.content']);
    const log = emitted();
    expect(log.error_class).toBe('SchemaInvariantViolation');
    expect(log.context.missing_columns).toEqual(['landing_pages.content']);
  });

  it('says what a missing uniqueness index actually costs - two pages on one URL', async () => {
    // The impact line has to be specific; "index missing" tells an on-call nothing.
    databaseWith({ columns: NEW_COLUMNS, indexes: ['idx_landing_pages_tenant', 'idx_landing_pages_brand_status'] });
    const result = await ensureLandingPageSchema();

    expect(result.missingIndexes).toEqual(['landing_pages_brand_slug_unique']);
    expect(emitted().context.impact).toMatch(/two pages could claim one brand\+slug/);
  });

  it('stays silent when nothing is missing, so the log means something', async () => {
    await ensureLandingPageSchema();
    expect(emitted()).toBeNull();
  });

  it('an unverifiable check reads as not-ok, not as healthy', async () => {
    // The boot must survive information_schema being unreachable, but "we could not check" must
    // never come back as ok - that would be a green light produced by the check failing.
    mockQuery.mockImplementation(async (statement: string) => {
      if (/information_schema\.columns/.test(statement)) throw new Error('connection terminated');
      return [];
    });

    const result = await ensureLandingPageSchema();

    expect(result).toEqual({ ok: false, verified: false, missing: [], missingIndexes: [] });
    const call = error.mock.calls.find((c) => String(c[0]).includes('SchemaVerificationUnavailable'));
    expect(call).toBeDefined();
    expect(JSON.parse(String(call![0])).context.reason).toBe('connection terminated');
  });
});
