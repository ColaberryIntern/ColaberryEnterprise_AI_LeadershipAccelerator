/**
 * Tests for anthropicCatalogScraper.ts
 *
 * Source of truth is curriculum_course_links (provider='skilljar', course_url non-null).
 * Fallback is KNOWN_CATALOG when that table is unavailable or returns no rows.
 *
 * Covers:
 * - Happy path: reads tracked URLs from DB, scrapes outlines, syncs registry
 * - New course: creates registry row flagged change_detected=true
 * - Unchanged course: bumps last_checked, no change flag
 * - Changed outline: updates row, flags change_detected=true
 * - curriculum_course_links DB failure: falls back to KNOWN_CATALOG
 * - No skilljar rows in DB: falls back to KNOWN_CATALOG
 * - Course page unreachable: outline is empty string, sync still runs
 * - DB write failure: reports error outcome, continues for remaining courses
 * - normalizeCourseUrl: URL normalization variants
 */

import { runCatalogScraper } from '../anthropicCatalogScraper';
import CurriculumCourseLink from '../../models/CurriculumCourseLink';
import AnthropicContentRegistry from '../../models/AnthropicContentRegistry';
import { normalizeCourseUrl, KNOWN_CATALOG } from '../lib/catalogFallback';

jest.mock('../../models/CurriculumCourseLink');
jest.mock('../../models/AnthropicContentRegistry');

jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

// ─── fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

const COURSE_HTML_WITH_OUTLINE = `
<html><body>
  <main>
    <h2>Getting Started</h2>
    <h2>Core Concepts</h2>
    <h2>Hands-on Labs</h2>
  </main>
</body></html>
`;

const TRACKED_ROWS = [
  { provider: 'skilljar', course_title: 'Claude Code 101', course_url: 'https://anthropic.skilljar.com/claude-code-101' },
  { provider: 'skilljar', course_title: 'Claude Code in Action', course_url: 'https://anthropic.skilljar.com/claude-code-in-action' },
];

/**
 * A page that fetches and parses fine but matches none of the outline selectors:
 * no `main`/`article` headings, no `[class*="outline"] li`. This is what a
 * redesign or a platform migration looks like from inside the extractor - and
 * until `outlines_missing` existed it was indistinguishable from "unchanged".
 */
const COURSE_HTML_NO_OUTLINE = `
<html><body>
  <div class="shell"><p>Sign in to view this course.</p></div>
</body></html>
`;

/** An existing registry row with good stored content, which must never be clobbered. */
function existingRowWithContent() {
  return {
    title: 'Claude Code 101',
    outline: 'Getting Started\nCore Concepts\nHands-on Labs',
    content_hash: 'a'.repeat(64),
    update: jest.fn().mockResolvedValue({}),
  };
}

/** n tracked rows with distinct URLs, so per-URL fetch behaviour can be mixed. */
function trackedRows(n: number) {
  return Array.from({ length: n }, (_i, idx) => ({
    provider: 'skilljar',
    course_title: `Course ${idx + 1}`,
    course_url: `https://academy.claude.com/courses/course-${idx + 1}`,
  }));
}

// ─── normalizeCourseUrl ───────────────────────────────────────────────────────

describe('normalizeCourseUrl', () => {
  it('strips protocol and returns host/path', () => {
    expect(normalizeCourseUrl('https://anthropic.skilljar.com/claude-code-101'))
      .toBe('anthropic.skilljar.com/claude-code-101');
  });

  it('strips trailing slash', () => {
    expect(normalizeCourseUrl('https://anthropic.skilljar.com/claude-code-101/'))
      .toBe('anthropic.skilljar.com/claude-code-101');
  });

  it('lowercases host and path', () => {
    expect(normalizeCourseUrl('https://Anthropic.Skilljar.Com/Claude-Code-101'))
      .toBe('anthropic.skilljar.com/claude-code-101');
  });

  it('strips query string and hash', () => {
    expect(normalizeCourseUrl('https://anthropic.skilljar.com/claude-code-101?ref=learn#top'))
      .toBe('anthropic.skilljar.com/claude-code-101');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeCourseUrl(null)).toBe('');
    expect(normalizeCourseUrl(undefined)).toBe('');
    expect(normalizeCourseUrl('')).toBe('');
  });
});

// ─── runCatalogScraper ────────────────────────────────────────────────────────

describe('runCatalogScraper', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads tracked URLs from curriculum_course_links and creates registry rows (happy path)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(TRACKED_ROWS);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockResolvedValue({});

    const result = await runCatalogScraper();

    expect(result.source).toBe('curriculum_course_links');
    expect(result.courses_found).toBe(2);
    expect(result.created).toBe(2);
    expect(result.errors).toBe(0);
    expect(AnthropicContentRegistry.create).toHaveBeenCalledTimes(2);
    expect(AnthropicContentRegistry.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: TRACKED_ROWS[0].course_url, change_detected: true }),
    );
  });

  it('is idempotent: marks unchanged when outline hash matches stored hash', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([TRACKED_ROWS[0]]);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));

    const outline = 'Getting Started\nCore Concepts\nHands-on Labs';
    const { createHash } = jest.requireActual<typeof import('crypto')>('crypto');
    const hash = createHash('sha256').update(outline).digest('hex');

    const mockUpdate = jest.fn().mockResolvedValue({});
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue({
      title: 'Claude Code 101',
      content_hash: hash,
      update: mockUpdate,
    });

    const result = await runCatalogScraper();

    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockUpdate).toHaveBeenCalledWith({ last_checked: expect.any(Date) });
  });

  it('flags change_detected when outline changes (change detection path)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([TRACKED_ROWS[0]]);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));

    const mockUpdate = jest.fn().mockResolvedValue({});
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue({
      title: 'Claude Code 101',
      content_hash: 'outdated-hash',
      update: mockUpdate,
    });

    const result = await runCatalogScraper();

    expect(result.updated).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ change_detected: true }),
    );
  });

  it('does not flag a change when a failed fetch yields an empty outline on an existing course (false-alert guard)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([TRACKED_ROWS[0]]);
    // Fetch fails → scrapeOutline returns '' (transient blip, not a real outline deletion)
    mockFetch.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { name: 'Error' }));

    const mockUpdate = jest.fn().mockResolvedValue({});
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue({
      title: 'Claude Code 101',
      outline: 'Getting Started\nCore Concepts\nHands-on Labs',
      content_hash: 'prior-good-hash',
      update: mockUpdate,
    });

    const result = await runCatalogScraper();

    // Stored good outline is preserved; only last_checked bumped, no false alert.
    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockUpdate).toHaveBeenCalledWith({ last_checked: expect.any(Date) });
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ change_detected: true }),
    );
  });

  it('de-duplicates course URLs that normalize to the same course (no inflated counts)', async () => {
    const dupRows = [
      { provider: 'skilljar', course_title: 'Claude Code 101 wk1', course_url: 'https://anthropic.skilljar.com/claude-code-101' },
      { provider: 'skilljar', course_title: 'Claude Code 101 wk2', course_url: 'https://anthropic.skilljar.com/claude-code-101/' },
      { provider: 'skilljar', course_title: 'Claude Code 101 wk3', course_url: 'https://Anthropic.Skilljar.Com/Claude-Code-101?ref=learn#top' },
    ];
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(dupRows);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockResolvedValue({});

    const result = await runCatalogScraper();

    // All three rows normalize to one course → one create, count not inflated.
    expect(result.courses_found).toBe(1);
    expect(AnthropicContentRegistry.create).toHaveBeenCalledTimes(1);
    // De-dup is first-wins; it must read rows in a deterministic module order
    // so the surviving title is stable across runs.
    expect(CurriculumCourseLink.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ order: [['module_number', 'ASC']] }),
    );
  });

  it('falls back to KNOWN_CATALOG when curriculum_course_links query fails (failure path)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockRejectedValue(new Error('DB connection lost'));
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockResolvedValue({});

    const result = await runCatalogScraper();

    expect(result.source).toBe('fallback');
    expect(result.courses_found).toBe(KNOWN_CATALOG.length);
  });

  it('falls back to KNOWN_CATALOG when no skilljar rows exist in DB (boundary)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([]);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockResolvedValue({});

    const result = await runCatalogScraper();

    expect(result.source).toBe('fallback');
    expect(result.courses_found).toBe(KNOWN_CATALOG.length);
  });

  it('stores empty outline when course page is unreachable — sync still runs (failure path)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([TRACKED_ROWS[0]]);
    mockFetch.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { name: 'Error' }));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockResolvedValue({});

    const result = await runCatalogScraper();

    // Run completes; course is created with empty outline but NOT flagged as a
    // change (an empty outline is a failed scrape, not a real curriculum change).
    expect(result.errors).toBe(0);
    expect(result.created).toBe(1);
    expect(AnthropicContentRegistry.create).toHaveBeenCalledWith(
      expect.objectContaining({ outline: null, change_detected: false, change_summary: null }),
    );
  });

  it('reports error outcome and continues when registry DB write fails (failure path)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(TRACKED_ROWS);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockRejectedValue(new Error('write failed'));

    const result = await runCatalogScraper();

    expect(result.errors).toBe(2);
    expect(result.created).toBe(0);
    // Does not throw — run completes
  });

  it('skips rows from curriculum_course_links that have no course_url', async () => {
    const rowsWithNull = [
      ...TRACKED_ROWS,
      { provider: 'skilljar', course_title: 'Pending Course', course_url: null },
    ];
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(rowsWithNull);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockResolvedValue({});

    const result = await runCatalogScraper();

    expect(result.courses_found).toBe(2); // null-URL row excluded
  });

  it('KNOWN_CATALOG has entries with non-empty titles, URLs, and outlines', () => {
    expect(KNOWN_CATALOG.length).toBeGreaterThanOrEqual(1);
    for (const course of KNOWN_CATALOG) {
      expect(course.url).toBeTruthy();
      expect(course.title).toBeTruthy();
      expect(course.outline.length).toBeGreaterThan(10);
    }
  });
});

// ─── fail loudly ──────────────────────────────────────────────────────────────

/**
 * The failure this block exists for: `errors` counts only DatabaseError, so a
 * 404 on every course, a timeout, or an Anthropic markup change all produced an
 * empty outline, landed as `unchanged`, bumped `last_checked` so nothing looked
 * stale, and made the run report `outcome: 'success'` with `errors: 0`.
 *
 * A monitor in that state is worse than no monitor: it answers the question
 * "are we detecting curriculum changes?" with a green check, forever. It is also
 * the single most likely consequence of moving platforms, which is what prompted
 * this - if a slug in the November 2026 Claude Academy migration had been wrong,
 * this scraper would have reported a clean run every week.
 */
describe('runCatalogScraper refuses to call an unproven run clean', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is UNHEALTHY when every course page matches no outline selector', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(TRACKED_ROWS);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_NO_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockImplementation(async () => existingRowWithContent());

    const result = await runCatalogScraper();

    expect(result.healthy).toBe(false);
    expect(result.outlines_missing).toBe(2);
    // Deliberately NOT folded into `errors`: other callers already depend on that
    // meaning "the database write failed".
    expect(result.errors).toBe(0);
    expect(result.results.map((r) => r.error_class)).toEqual(['SelectorMiss', 'SelectorMiss']);
  });

  it('is UNHEALTHY when every course page 404s, rather than reporting them unchanged', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(TRACKED_ROWS);
    mockFetch.mockResolvedValue(mockResponse('', 404));
    (AnthropicContentRegistry.findOne as jest.Mock).mockImplementation(async () => existingRowWithContent());

    const result = await runCatalogScraper();

    expect(result.healthy).toBe(false);
    expect(result.outlines_missing).toBe(2);
    expect(result.results.map((r) => r.error_class)).toEqual([
      'UpstreamUnavailable',
      'UpstreamUnavailable',
    ]);
  });

  it('distinguishes a timeout from a selector miss', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([TRACKED_ROWS[0]]);
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(abort);
    (AnthropicContentRegistry.findOne as jest.Mock).mockImplementation(async () => existingRowWithContent());

    const result = await runCatalogScraper();

    expect(result.healthy).toBe(false);
    expect(result.results[0].error_class).toBe('TimeoutError');
  });

  it('still leaves a good stored outline alone when extraction fails', async () => {
    // The DB behaviour that must NOT change. Overwriting a good outline with
    // empty, or flagging a change off it, would fire the false curriculum-change
    // alert this monitor exists to prevent. Only the REPORTING changed.
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([TRACKED_ROWS[0]]);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_NO_OUTLINE));
    const row = existingRowWithContent();
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(row);

    const result = await runCatalogScraper();

    expect(row.update).toHaveBeenCalledWith({ last_checked: expect.any(Date) });
    expect(row.update).toHaveBeenCalledTimes(1);
    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('treats ONE dark course among four as a per-course alert, not a broken monitor', async () => {
    // A course can legitimately go away: Anthropic retires it, or renames it and
    // our link 404s. That is one alert, not evidence the extractor is broken, and
    // calling the whole run unhealthy for it would train everyone to ignore the
    // flag - the same way the daily points alert stopped being read.
    const rows = trackedRows(4);
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(rows);
    mockFetch.mockImplementation(async (url: string) =>
      url.endsWith('course-4')
        ? mockResponse(COURSE_HTML_NO_OUTLINE)
        : mockResponse(COURSE_HTML_WITH_OUTLINE),
    );
    (AnthropicContentRegistry.findOne as jest.Mock).mockImplementation(async () => existingRowWithContent());

    const result = await runCatalogScraper();

    expect(result.courses_found).toBe(4);
    expect(result.outlines_missing).toBe(1);
    expect(result.healthy).toBe(true);
  });

  it('treats HALF the catalog going dark as the extractor breaking', async () => {
    const rows = trackedRows(4);
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(rows);
    mockFetch.mockImplementation(async (url: string) =>
      url.endsWith('course-3') || url.endsWith('course-4')
        ? mockResponse(COURSE_HTML_NO_OUTLINE)
        : mockResponse(COURSE_HTML_WITH_OUTLINE),
    );
    (AnthropicContentRegistry.findOne as jest.Mock).mockImplementation(async () => existingRowWithContent());

    const result = await runCatalogScraper();

    expect(result.outlines_missing).toBe(2);
    expect(result.healthy).toBe(false);
  });

  it('records the reason on a NEW course that scraped nothing', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([TRACKED_ROWS[0]]);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_NO_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockResolvedValue({});

    const result = await runCatalogScraper();

    // Still created quietly - flagging change_detected off an empty outline would
    // be a low-quality alert - but no longer created SILENTLY.
    expect(AnthropicContentRegistry.create).toHaveBeenCalledWith(
      expect.objectContaining({ change_detected: false }),
    );
    expect(result.results[0].error_class).toBe('SelectorMiss');
    expect(result.healthy).toBe(false);
  });

  it('calls a run that actually read every course healthy, with nothing missing', async () => {
    // The control. Without this, every assertion above would also pass if
    // `healthy` were hardcoded to false.
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(TRACKED_ROWS);
    mockFetch.mockResolvedValue(mockResponse(COURSE_HTML_WITH_OUTLINE));
    (AnthropicContentRegistry.findOne as jest.Mock).mockResolvedValue(null);
    (AnthropicContentRegistry.create as jest.Mock).mockResolvedValue({});

    const result = await runCatalogScraper();

    expect(result.healthy).toBe(true);
    expect(result.outlines_missing).toBe(0);
    expect(result.created).toBe(2);
  });
});
