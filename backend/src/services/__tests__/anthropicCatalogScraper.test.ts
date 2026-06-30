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

    // Run completes; course is created with empty outline
    expect(result.errors).toBe(0);
    expect(result.created).toBe(1);
    expect(AnthropicContentRegistry.create).toHaveBeenCalledWith(
      expect.objectContaining({ outline: null }),
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

  it('KNOWN_CATALOG has 5 entries with non-empty titles, URLs, and outlines', () => {
    expect(KNOWN_CATALOG.length).toBe(5);
    for (const course of KNOWN_CATALOG) {
      expect(course.url).toBeTruthy();
      expect(course.title).toBeTruthy();
      expect(course.outline.length).toBeGreaterThan(10);
    }
  });
});
