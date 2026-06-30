/**
 * Anthropic catalog scraper — weekly scheduled service.
 *
 * Reads the tracked course URLs from curriculum_course_links (the program's
 * authoritative week→course map), fetches each course page, extracts the
 * outline (module/section list), and diffs against anthropic_content_registry.
 *
 * When outline text or a URL returns non-ok, change_detected is set on the
 * registry row so the existing anthropicChangeDetector pipeline fires an alert.
 *
 * Failure path: if curriculum_course_links is unreachable, falls back to
 * KNOWN_CATALOG (catalogFallback.ts) so a DB outage never silently drops
 * all monitoring.
 */

import crypto from 'crypto';
import * as cheerio from 'cheerio';
import CurriculumCourseLink from '../models/CurriculumCourseLink';
import AnthropicContentRegistry, { ChangeSummary } from '../models/AnthropicContentRegistry';
import { KNOWN_CATALOG, KnownCourse, normalizeCourseUrl } from './lib/catalogFallback';

const FETCH_TIMEOUT_MS = 20_000;
const SERVICE = 'anthropicCatalogScraper';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrapedCourse {
  title: string;
  url: string;
  outline: string;
}

export interface CourseScrapResult {
  url: string;
  outcome: 'updated' | 'unchanged' | 'created' | 'error';
  error_class?: string;
}

export interface CatalogScraperRunResult {
  source: 'curriculum_course_links' | 'fallback';
  courses_found: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  results: CourseScrapResult[];
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: SERVICE, event, ...ctx }) + '\n',
  );
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ColaberryAnthropicWatcher/1.0' },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Outline extraction ───────────────────────────────────────────────────────

/**
 * Fetch a course page and extract module/section titles as a newline-joined string.
 * Fails soft — outline extraction failure is logged but never aborts the run.
 */
async function scrapeOutline(courseUrl: string): Promise<string> {
  let resp: Response;
  try {
    resp = await fetchWithTimeout(courseUrl);
  } catch (err: any) {
    const error_class = err.name === 'AbortError' ? 'TimeoutError' : 'NetworkError';
    log('warn', 'outline_fetch_failed', { url: courseUrl, error_class, message: err.message });
    return '';
  }

  if (!resp.ok) {
    log('warn', 'outline_fetch_non_ok', { url: courseUrl, status: resp.status, error_class: 'UpstreamUnavailable' });
    return '';
  }

  const html = await resp.text();
  const $ = cheerio.load(html);
  const sections: string[] = [];

  // Try selectors in priority order; stop when we have at least 3 items.
  const outlineSelectors = [
    '.course-outline li',
    '.curriculum li',
    '.syllabus li',
    '[class*="outline"] li',
    '[class*="curriculum"] li',
    '[class*="syllabus"] li',
    'article h2, article h3',
    'main h2, main h3',
  ];

  for (const selector of outlineSelectors) {
    $(selector).each((_i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 3 && text.length < 200) sections.push(text);
    });
    if (sections.length >= 3) break;
  }

  return sections.join('\n');
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ─── Registry sync ────────────────────────────────────────────────────────────

async function syncCourse(course: ScrapedCourse): Promise<CourseScrapResult> {
  const outlineHash = sha256(course.outline);

  try {
    const existing = await AnthropicContentRegistry.findOne({ where: { url: course.url } });

    if (!existing) {
      await AnthropicContentRegistry.create({
        content_type: 'course',
        title: course.title,
        url: course.url,
        outline: course.outline || null,
        content_hash: outlineHash,
        last_checked: new Date(),
        change_detected: true,
        change_summary: {
          detected_at: new Date().toISOString(),
          detection_method: 'content_hash',
          previous_value: null,
          current_value: outlineHash,
        },
      });
      log('info', 'course_created', { url: course.url, outcome: 'success' });
      return { url: course.url, outcome: 'created' };
    }

    const titleChanged = existing.title !== course.title;
    const outlineChanged = existing.content_hash !== outlineHash;

    if (!titleChanged && !outlineChanged) {
      await existing.update({ last_checked: new Date() });
      log('info', 'course_unchanged', { url: course.url, outcome: 'success' });
      return { url: course.url, outcome: 'unchanged' };
    }

    const summary: ChangeSummary = {
      detected_at: new Date().toISOString(),
      detection_method: 'content_hash',
      previous_value: existing.content_hash ?? null,
      current_value: outlineHash,
    };

    await existing.update({
      title: course.title,
      outline: course.outline || null,
      content_hash: outlineHash,
      last_checked: new Date(),
      change_detected: true,
      change_summary: summary,
    });

    log('info', 'course_updated', { url: course.url, title_changed: titleChanged, outline_changed: outlineChanged, outcome: 'success' });
    return { url: course.url, outcome: 'updated' };
  } catch (err: any) {
    log('error', 'course_sync_failed', { url: course.url, error_class: 'DatabaseError', message: err.message, outcome: 'failure' });
    return { url: course.url, outcome: 'error', error_class: 'DatabaseError' };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runCatalogScraper(): Promise<CatalogScraperRunResult> {
  log('info', 'run_start', {});

  // Step 1: get the tracked URLs from curriculum_course_links
  let coursesToWatch: { title: string; url: string }[] = [];
  let source: CatalogScraperRunResult['source'] = 'curriculum_course_links';

  try {
    const rows = await CurriculumCourseLink.findAll({
      where: { provider: 'skilljar' },
    });

    const withUrls = rows.filter((r) => r.course_url && normalizeCourseUrl(r.course_url) !== '');
    coursesToWatch = withUrls.map((r) => ({ title: r.course_title ?? '', url: r.course_url as string }));

    if (coursesToWatch.length === 0) {
      log('warn', 'no_tracked_courses_in_db', { outcome: 'partial' });
      source = 'fallback';
    }
  } catch (err: any) {
    log('error', 'curriculum_links_fetch_failed', { error_class: 'DatabaseError', message: err.message, outcome: 'partial' });
    source = 'fallback';
  }

  if (source === 'fallback') {
    log('warn', 'using_fallback_catalog', { courses: KNOWN_CATALOG.length });
    coursesToWatch = (KNOWN_CATALOG as KnownCourse[]).map((c) => ({ title: c.title, url: c.url }));
  }

  // Step 2: fetch outline for each course and sync to registry
  const results: CourseScrapResult[] = [];

  for (const course of coursesToWatch) {
    const outline = await scrapeOutline(course.url);
    const result = await syncCourse({ ...course, outline });
    results.push(result);
  }

  const created   = results.filter((r) => r.outcome === 'created').length;
  const updated   = results.filter((r) => r.outcome === 'updated').length;
  const unchanged = results.filter((r) => r.outcome === 'unchanged').length;
  const errors    = results.filter((r) => r.outcome === 'error').length;

  log('info', 'run_complete', {
    source,
    courses_found: coursesToWatch.length,
    created,
    updated,
    unchanged,
    errors,
    outcome: errors === coursesToWatch.length ? 'failure' : errors > 0 ? 'partial' : 'success',
  });

  return { source, courses_found: coursesToWatch.length, created, updated, unchanged, errors, results };
}
