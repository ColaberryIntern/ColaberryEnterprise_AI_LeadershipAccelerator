import { classify, mapHeader, parseCsv, planImport, renderExceptionReport } from '../loomlyImport';
import { importLoomlyPosts, PROVENANCE, type HistoryRecord, type LoomlyImportStore } from '../loomlyImportService';
import { isReadOnlyImport } from '../../content/contentWorkflow';
import { assertWritable, WorkflowError } from '../../content/contentWorkflowService';

/**
 * Spec 18 Stage B: deduplicate by provider account + external id / permalink + published
 * timestamp; land history read-only with provenance; record every skipped or invalid row.
 *
 * The header is mapped by alias, not position, and the file-level exceptions are the first
 * thing an operator reads on the first dry run against a real export.
 */

const NOW = new Date('2026-09-11T12:00:00Z');

const HEADER = 'Calendar,Channel,Account,Status,Scheduled date,Published date,Content,Media,Labels,Post ID,Permalink,Author';
function csv(...rows: string[]): string { return [HEADER, ...rows].join('\n'); }

const PUBLISHED = 'Colaberry,LinkedIn,Colaberry Page,Published,2026-08-01T14:00:00Z,2026-08-01T14:00:12Z,"Join us, Thursday.",https://cdn/x.jpg,open-house;ai,urn:li:share:123,https://linkedin.com/feed/update/123,sohail';

describe('dedup by (account, external id, published timestamp)', () => {
  it('two identical rows are one post plus a duplicate_in_batch exception', () => {
    const plan = planImport(csv(PUBLISHED, PUBLISHED), NOW);
    expect(plan.posts).toHaveLength(1);
    expect(plan.counts.duplicatesInBatch).toBe(1);
    expect(plan.exceptions.filter((e) => e.code === 'duplicate_in_batch').map((e) => e.row)).toEqual([2]);
  });

  it('the same external id on a DIFFERENT account is a different post', () => {
    const other = PUBLISHED.replace('Colaberry Page', 'Colaberry Careers Page');
    expect(planImport(csv(PUBLISHED, other), NOW).posts).toHaveLength(2);
  });

  it('the same external id at a DIFFERENT published timestamp is a different post', () => {
    const later = PUBLISHED.replace('2026-08-01T14:00:12Z', '2026-08-02T14:00:12Z');
    expect(planImport(csv(PUBLISHED, later), NOW).posts).toHaveLength(2);
  });

  it('the account label is compared case- and space-insensitively', () => {
    const shouty = PUBLISHED.replace('Colaberry Page', '  COLABERRY   PAGE ');
    const plan = planImport(csv(PUBLISHED, shouty), NOW);
    expect(plan.posts).toHaveLength(1);
  });

  it('falls back to the permalink when there is no external id', () => {
    const noId = PUBLISHED.replace('urn:li:share:123', '');
    const plan = planImport(csv(noId, noId), NOW);
    expect(plan.posts).toHaveLength(1);
    expect(plan.posts[0].key).toContain('https://linkedin.com/feed/update/123');
    expect(plan.posts[0].keyStrength).toBe('strong');
  });

  it('with neither id nor permalink a published post is keyed on content and flagged weak_key', () => {
    const bare = PUBLISHED.replace('urn:li:share:123', '').replace('https://linkedin.com/feed/update/123', '');
    const plan = planImport(csv(bare), NOW);
    expect(plan.posts[0].keyStrength).toBe('weak');
    expect(plan.exceptions.some((e) => e.code === 'weak_key' && e.row === 1)).toBe(true);
  });
});

describe('header mapping by alias', () => {
  it('accepts alternative spellings and reports unmapped columns', () => {
    const m = mapHeader(['Brand', 'Platform', 'Post Status', 'Message', 'Something Loomly Added']);
    expect(m.columns).toEqual({ calendar: 0, channel: 1, status: 2, content: 3 });
    expect(m.exceptions).toEqual([{ row: 0, code: 'unknown_column', detail: 'Column "Something Loomly Added" is not mapped and will be ignored.' }]);
  });

  it('rejects a file missing a required column, naming the accepted aliases', () => {
    const plan = planImport('Calendar,Channel,Status\nColaberry,LinkedIn,Published', NOW);
    expect(plan.posts).toEqual([]);
    const missing = plan.exceptions.find((e) => e.code === 'missing_column')!;
    expect(missing.detail).toContain('"content"');
    expect(missing.detail).toContain('caption');
  });
});

describe('row mapping and classification', () => {
  it('published -> history with timestamps preserved and the provider normalised', () => {
    const [p] = planImport(csv(PUBLISHED), NOW).posts;
    expect(p.kind).toBe('history');
    expect(p.provider).toBe('linkedin_organization');
    expect(p.publishedAt).toBe('2026-08-01T14:00:12.000Z');
    expect(p.scheduledFor).toBe('2026-08-01T14:00:00.000Z');
    expect(p.text).toBe('Join us, Thursday.');
    expect(p.labels).toEqual(['open-house', 'ai']);
    expect(p.mediaUrls).toEqual(['https://cdn/x.jpg']);
  });

  it('a future schedule -> scheduled_draft; a past unpublished schedule -> draft', () => {
    expect(classify('Scheduled', null, '2026-12-01T10:00:00.000Z', NOW)).toBe('scheduled_draft');
    expect(classify('Scheduled', null, '2026-01-01T10:00:00.000Z', NOW)).toBe('draft');
    expect(classify('Draft', null, null, NOW)).toBe('draft');
  });

  it('an unknown channel, an empty row and a bad date are each skipped with their own code', () => {
    const plan = planImport(csv(
      'Colaberry,Pinterest,acct,Published,,2026-08-01T14:00:00Z,hi,,,,,',
      'Colaberry,LinkedIn,acct,Draft,,,,,,,,',
      'Colaberry,LinkedIn,acct,Published,,not a date,hi,,,,,',
    ), NOW);
    expect(plan.posts).toHaveLength(0);
    expect(plan.exceptions.map((e) => [e.row, e.code])).toEqual([[1, 'unknown_channel'], [2, 'empty_content'], [3, 'bad_date']]);
    expect(plan.counts.skipped).toBe(3);
  });

  it('parses quoted commas, embedded newlines and doubled quotes', () => {
    expect(parseCsv('a,"b, c","line1\nline2","say ""hi"""\n')).toEqual([['a', 'b, c', 'line1\nline2', 'say "hi"']]);
  });
});

function memoryStore(brands: Record<string, { id: string; tenant_id: string }>) {
  const keys = new Set<string>();
  const history: HistoryRecord[] = [];
  const drafts: HistoryRecord[] = [];
  const store: LoomlyImportStore = {
    async brandForCalendar(c) { return brands[c] ?? null; },
    async existsByKey(k) { return keys.has(k); },
    async insertHistory(r) { keys.add(r.post.key); history.push(r); },
    async insertDraft(r) { keys.add(r.post.key); drafts.push(r); },
  };
  return { store, history, drafts };
}

describe('importing through the store port', () => {
  const BRANDS = { colaberry: { id: 'b-1', tenant_id: 't-1' } };

  it('lands history and drafts, then a re-run of the same file imports nothing and reports duplicate_existing', async () => {
    const future = 'Colaberry,Instagram,IG,Scheduled,2026-12-01T10:00:00Z,,Coming soon,,,,,';
    const plan = planImport(csv(PUBLISHED, future), NOW);
    const { store, history, drafts } = memoryStore(BRANDS);
    const first = await importLoomlyPosts(plan.posts, store, { execute: true, calendarToBrandSlug: { Colaberry: 'colaberry' } });
    expect(first.imported).toEqual({ history: 1, scheduledDraft: 1, draft: 0 });
    expect(history[0].brandId).toBe('b-1');
    expect(drafts[0].post.kind).toBe('scheduled_draft');

    const second = await importLoomlyPosts(plan.posts, store, { execute: true, calendarToBrandSlug: { Colaberry: 'colaberry' } });
    expect(second.imported).toEqual({ history: 0, scheduledDraft: 0, draft: 0 });
    expect(second.skipped).toBe(2);
    expect(second.exceptions.every((e) => e.code === 'duplicate_existing')).toBe(true);
    expect(history).toHaveLength(1);
  });

  it('a dry run counts what it would do and writes nothing', async () => {
    const { store, history, drafts } = memoryStore(BRANDS);
    const out = await importLoomlyPosts(planImport(csv(PUBLISHED), NOW).posts, store, { execute: false, calendarToBrandSlug: { Colaberry: 'colaberry' } });
    expect(out.imported.history).toBe(1);
    expect(history).toHaveLength(0);
    expect(drafts).toHaveLength(0);
  });

  it('an unmapped calendar is skipped with an actionable exception, not guessed', async () => {
    const { store } = memoryStore(BRANDS);
    const out = await importLoomlyPosts(planImport(csv(PUBLISHED), NOW).posts, store, { execute: true });
    expect(out.skipped).toBe(1);
    expect(out.exceptions[0].code).toBe('unknown_calendar');
    expect(out.exceptions[0].detail).toContain('--calendar "Colaberry=<brand-slug>"');
  });
});

describe('imported history is read-only', () => {
  it('the guard recognises provenance + readOnly and refuses a write with a 409', () => {
    const meta = { provenance: PROVENANCE, readOnly: true, loomlyKey: 'k' };
    expect(isReadOnlyImport(meta)).toBe(true);
    expect(isReadOnlyImport({ provenance: PROVENANCE, readOnly: false })).toBe(false);
    expect(isReadOnlyImport({})).toBe(false);
    expect(isReadOnlyImport(null)).toBe(false);
    let caught: unknown;
    try { assertWritable({ metadata: meta } as any); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(WorkflowError);
    expect((caught as WorkflowError).status).toBe(409);
    expect((caught as WorkflowError).errorClass).toBe('ReadOnlyImport');
  });
});

describe('the exception report', () => {
  it('is a markdown table with one row per exception and the code legend', () => {
    const md = renderExceptionReport([{ row: 3, code: 'bad_date', detail: 'x|y' }], 'export.csv', NOW);
    expect(md).toContain('| 3 | `bad_date` | x\\|y |');
    expect(md).toContain('Exceptions: 1');
    expect(md).toContain('`duplicate_existing`');
  });
});
