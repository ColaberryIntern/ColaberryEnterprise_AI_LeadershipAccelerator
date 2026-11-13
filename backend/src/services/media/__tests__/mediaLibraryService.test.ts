import { Op } from 'sequelize';
import {
  RIGHTS_EXPIRING_WITHIN_DAYS,
  assertSafeAssetUrl,
  buildLibraryWhere,
  clampLimit,
  rightsStatus,
  toLibraryView,
} from '../mediaLibraryService';
import { WorkflowError } from '../../content/contentWorkflowService';

/**
 * The library's decidable rules, tested without a database. Everything here is pure, which is
 * why it is in this module at all: the question "is this licence expiring" should not need a
 * fixture to answer.
 */

const NOW = new Date('2026-11-13T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('rightsStatus', () => {
  it('reports unknown when nobody recorded a rights expiry', () => {
    // NOT 'ok'. An asset nobody decided anything about is the dangerous kind, because it looks
    // fine. The screen shows a grey chip for this, never a green one.
    expect(rightsStatus({ rights_expires_at: null }, NOW)).toBe('unknown');
    expect(rightsStatus({}, NOW)).toBe('unknown');
    expect(rightsStatus({ rights_expires_at: undefined }, NOW)).toBe('unknown');
  });

  it('reports unknown rather than throwing on an unparseable date', () => {
    // A bad value in a column is not a reason to 500 the whole library grid.
    expect(rightsStatus({ rights_expires_at: 'not a date' }, NOW)).toBe('unknown');
  });

  it('reports expired for a date in the past', () => {
    expect(rightsStatus({ rights_expires_at: days(-1) }, NOW)).toBe('expired');
    expect(rightsStatus({ rights_expires_at: days(-365) }, NOW)).toBe('expired');
  });

  it('reports expiring inside the window and ok outside it', () => {
    expect(rightsStatus({ rights_expires_at: days(29) }, NOW)).toBe('expiring');
    expect(rightsStatus({ rights_expires_at: days(31) }, NOW)).toBe('ok');
  });

  it('pins both boundaries of the window exactly', () => {
    // The day either side of the threshold, so an off-by-one in the comparison is a failing
    // test rather than a chip that is quietly wrong for one day a month.
    expect(RIGHTS_EXPIRING_WITHIN_DAYS).toBe(30);
    expect(rightsStatus({ rights_expires_at: days(30) }, NOW)).toBe('expiring');
    expect(rightsStatus({ rights_expires_at: days(30.001) }, NOW)).toBe('ok');
    // Expiring in a second is still expiring, not expired.
    expect(rightsStatus({ rights_expires_at: new Date(NOW.getTime() + 1000) }, NOW)).toBe('expiring');
    // A second ago is expired, not expiring.
    expect(rightsStatus({ rights_expires_at: new Date(NOW.getTime() - 1000) }, NOW)).toBe('expired');
  });

  it('accepts an ISO string as well as a Date, because Postgres returns either', () => {
    expect(rightsStatus({ rights_expires_at: days(-5).toISOString() }, NOW)).toBe('expired');
    expect(rightsStatus({ rights_expires_at: days(100).toISOString() }, NOW)).toBe('ok');
  });
});

describe('assertSafeAssetUrl', () => {
  it('accepts ordinary http and https links', () => {
    expect(assertSafeAssetUrl('https://youtu.be/abc123')).toBe('https://youtu.be/abc123');
    expect(assertSafeAssetUrl('http://example.com/a.png')).toBe('http://example.com/a.png');
    expect(assertSafeAssetUrl('  https://vimeo.com/42  ')).toBe('https://vimeo.com/42');
  });

  it('REFUSES javascript: and data:, which z.string().url() would accept', () => {
    // The whole reason this function exists rather than a Zod rule on the route. Mirrors
    // frontend/src/pages/admin/marketing/composer/videoSource.ts, which records the same trap.
    expect(() => assertSafeAssetUrl('javascript:alert(1)')).toThrow(WorkflowError);
    expect(() => assertSafeAssetUrl('data:text/html;base64,PHNjcmlwdD4=')).toThrow(WorkflowError);
    expect(() => assertSafeAssetUrl('JavaScript:alert(1)')).toThrow(WorkflowError);
  });

  it('CONTROL: those two really do parse as URLs, so the scheme check is load-bearing', () => {
    // If `new URL()` rejected them, the scheme check above would be decoration and the test
    // would pass for the wrong reason.
    expect(() => new URL('javascript:alert(1)')).not.toThrow();
    expect(() => new URL('data:text/html;base64,PHNjcmlwdD4=')).not.toThrow();
  });

  it('refuses other schemes that parse cleanly', () => {
    for (const bad of ['file:///etc/passwd', 'ftp://example.com/x', 'mailto:a@b.com']) {
      expect(() => assertSafeAssetUrl(bad)).toThrow(/http and https/);
    }
  });

  it('refuses empty, whitespace and non-URLs with a message a person can act on', () => {
    expect(() => assertSafeAssetUrl('')).toThrow(/Paste the link/);
    expect(() => assertSafeAssetUrl('   ')).toThrow(/Paste the link/);
    expect(() => assertSafeAssetUrl('youtube.com/watch')).toThrow(/starting with https/);
  });

  it('refuses a link too long to be an address', () => {
    expect(() => assertSafeAssetUrl(`https://e.com/${'a'.repeat(2100)}`)).toThrow(/too long/);
  });

  it('carries a 400 and a stable error code, not a bare Error', () => {
    try {
      assertSafeAssetUrl('javascript:alert(1)');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowError);
      expect((err as WorkflowError).status).toBe(400);
      // `errorClass`, the repo's name for it - not `code`. The route layer reads this field.
      expect((err as WorkflowError).errorClass).toBe('LinkScheme');
    }
  });
});

describe('clampLimit', () => {
  it('defaults, clamps the top, and refuses to go below one', () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit(500)).toBe(100);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-10)).toBe(1);
    expect(clampLimit(25)).toBe(25);
    expect(clampLimit(25.9)).toBe(25);
    expect(clampLimit(Number.NaN)).toBe(50);
  });
});

describe('buildLibraryWhere', () => {
  it('ALWAYS scopes to a tenant, and refuses to build a clause without one', () => {
    // The one filter that is a boundary rather than a narrowing. A builder that can omit it is
    // one refactor away from returning another tenant's library.
    expect(() => buildLibraryWhere({ tenantId: '' })).toThrow(WorkflowError);
    expect(buildLibraryWhere({ tenantId: 't-1' })).toMatchObject({ tenant_id: 't-1' });
  });

  it('hides archived assets unless they are asked for', () => {
    expect(buildLibraryWhere({ tenantId: 't-1' })).toMatchObject({ archived_at: { [Op.is]: null } });
    expect(buildLibraryWhere({ tenantId: 't-1', includeArchived: true })).not.toHaveProperty('archived_at');
  });

  it('distinguishes "every brand" from "the tenant-level assets"', () => {
    // undefined means every brand; null means the assets that belong to no brand. Collapsing
    // the two would silently widen the query.
    expect(buildLibraryWhere({ tenantId: 't-1' })).not.toHaveProperty('brand_id');
    expect(buildLibraryWhere({ tenantId: 't-1', brandId: null })).toMatchObject({ brand_id: null });
    expect(buildLibraryWhere({ tenantId: 't-1', brandId: 'b-1' })).toMatchObject({ brand_id: 'b-1' });
  });

  it('matches a mime family by prefix, so image never matches text/image-ish', () => {
    const where = buildLibraryWhere({ tenantId: 't-1', mimeFamily: 'image' }) as any;
    expect(where.mime_type[Op.like]).toBe('image/%');
  });

  it('filters tags by containment, which is what the GIN index serves', () => {
    const where = buildLibraryWhere({ tenantId: 't-1', tag: 'q4' }) as any;
    expect(where.tags[Op.contains]).toEqual(['q4']);
  });

  it('searches filename and alt text, case-insensitively, and ignores a blank term', () => {
    const where = buildLibraryWhere({ tenantId: 't-1', q: ' brochure ' }) as any;
    expect(where[Op.or]).toHaveLength(2);
    expect(where[Op.or][0].original_filename[Op.iLike]).toBe('%brochure%');
    expect(where[Op.or][1].alt_text[Op.iLike]).toBe('%brochure%');
    // toHaveProperty cannot address a symbol key, so read it directly.
    expect((buildLibraryWhere({ tenantId: 't-1', q: '   ' }) as any)[Op.or]).toBeUndefined();
  });
});

describe('toLibraryView', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'm-1', kind: 'file', storage_key: 'media/b/abc.png', source_url: null,
    mime_type: 'image/png', original_filename: 'a.png', alt_text: 'alt', tags: ['q4'],
    byte_size: '12345', width: 10, height: 20, duration_ms: null,
    rights_holder: 'Colaberry', rights_expires_at: null, archived_at: null,
    created_at: new Date('2026-11-01T00:00:00Z'), ...over,
  }) as any;

  it('converts BIGINT byte_size from string to number, as the contract says', () => {
    expect(toLibraryView(row(), NOW).byteSize).toBe(12345);
    expect(toLibraryView(row({ byte_size: null }), NOW).byteSize).toBeNull();
  });

  it('computes the rights status rather than making the caller do it', () => {
    expect(toLibraryView(row(), NOW).rightsStatus).toBe('unknown');
    expect(toLibraryView(row({ rights_expires_at: days(10) }), NOW).rightsStatus).toBe('expiring');
    expect(toLibraryView(row({ rights_expires_at: days(-1) }), NOW).rightsStatus).toBe('expired');
  });

  it('never returns a null tags array, because the column cannot be null', () => {
    expect(toLibraryView(row({ tags: null }), NOW).tags).toEqual([]);
    expect(toLibraryView(row({ tags: ['a', 'b'] }), NOW).tags).toEqual(['a', 'b']);
  });

  it('carries a link asset through with no storage key and no derived provider data', () => {
    const view = toLibraryView(row({
      kind: 'link', storage_key: null, source_url: 'https://youtu.be/abc', mime_type: 'text/uri-list',
    }), NOW);
    expect(view.kind).toBe('link');
    expect(view.storageKey).toBeNull();
    expect(view.sourceUrl).toBe('https://youtu.be/abc');
    // No youTubeId, no thumbnailUrl, no embedUrl: the frontend owns that (videoEmbed.ts), and a
    // second implementation here would drift from it.
    expect(Object.keys(view).sort()).toEqual([
      'altText', 'archivedAt', 'byteSize', 'createdAt', 'durationMs', 'height', 'id', 'kind',
      'mimeType', 'originalFilename', 'rightsExpiresAt', 'rightsHolder', 'rightsStatus',
      'sourceUrl', 'storageKey', 'tags', 'width',
    ]);
  });

  it('treats any unexpected kind as a file rather than inventing a third state', () => {
    expect(toLibraryView(row({ kind: undefined }), NOW).kind).toBe('file');
    expect(toLibraryView(row({ kind: 'wat' }), NOW).kind).toBe('file');
  });
});
