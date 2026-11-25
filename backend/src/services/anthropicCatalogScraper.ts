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

/**
 * Why an outline came back empty. An empty outline is NOT the same as "this
 * course has no outline" - it is always a failure of ours or of the fetch, and
 * before this type existed all four cases were indistinguishable from
 * "unchanged".
 */
export type OutlineFailure =
  | 'TimeoutError'
  | 'NetworkError'
  | 'UpstreamUnavailable'
  | 'SelectorMiss';

export interface CatalogScraperRunResult {
  source: 'curriculum_course_links' | 'fallback';
  courses_found: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  /**
   * Courses whose page produced no outline at all. Counted separately from
   * `errors` because `errors` means "the database write failed", while this
   * means "we learned nothing about this course" - which the old shape reported
   * as `unchanged`, i.e. as good news.
   */
  outlines_missing: number;
  /**
   * False when this run proved nothing. A monitor that cannot read its source
   * must say so; reporting a clean run is worse than reporting a failure,
   * because nobody looks at a green check.
   */
  healthy: boolean;
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
 *
 * Fails soft - one bad course never aborts the run - but it now RETURNS the
 * reason. The caller needs to tell "Anthropic did not change this page" apart
 * from "we could not read this page", because those are opposite facts and the
 * old signature collapsed them into the same empty string.
 */
async function scrapeOutline(
  courseUrl: string,
): Promise<{ outline: string; failure: OutlineFailure | null }> {
  let resp: Response;
  try {
    resp = await fetchWithTimeout(courseUrl);
  } catch (err: any) {
    // err: any — fetch/abort throw sites are untyped at the JS boundary; read via err.name/err.message only.
    const error_class: OutlineFailure = err.name === 'AbortError' ? 'TimeoutError' : 'NetworkError';
    log('warn', 'outline_fetch_failed', { url: courseUrl, error_class, message: err.message });
    return { outline: '', failure: error_class };
  }

  if (!resp.ok) {
    log('warn', 'outline_fetch_non_ok', { url: courseUrl, status: resp.status, error_class: 'UpstreamUnavailable' });
    return { outline: '', failure: 'UpstreamUnavailable' };
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

  if (sections.length === 0) {
    // Every selector missed. The page was fetched and parsed, so this is OUR
    // extractor against THEIR markup - the failure a platform migration or a
    // redesign causes, and the one most worth shouting about.
    log('warn', 'outline_selectors_missed', {
      url: courseUrl,
      error_class: 'SelectorMiss',
      html_bytes: html.length,
    });
    return { outline: '', failure: 'SelectorMiss' };
  }

  return { outline: sections.join('\n'), failure: null };
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ─── Registry sync ────────────────────────────────────────────────────────────

async function syncCourse(
  course: ScrapedCourse,
  failure: OutlineFailure | null = null,
): Promise<CourseScrapResult> {
  const outlineHash = sha256(course.outline);

  try {
    const existing = await AnthropicContentRegistry.findOne({ where: { url: course.url } });

    if (!existing) {
      // A brand-new course whose page didn't scrape (empty outline = failed
      // fetch / selector miss) is created quietly: flagging change_detected off
      // an empty outline would fire a low-quality alert. The next successful
      // scrape detects the real outline and flags the change then.
      const hasOutline = Boolean(course.outline);
      await AnthropicContentRegistry.create({
        content_type: 'course',
        title: course.title,
        url: course.url,
        outline: course.outline || null,
        content_hash: outlineHash,
        last_checked: new Date(),
        change_detected: hasOutline,
        change_summary: hasOutline
          ? {
              detected_at: new Date().toISOString(),
              detection_method: 'content_hash',
              previous_value: null,
              current_value: outlineHash,
            }
          : null,
      });
      log('info', 'course_created', { url: course.url, outcome: 'success', change_flagged: hasOutline });
      return hasOutline
        ? { url: course.url, outcome: 'created' }
        : { url: course.url, outcome: 'created', error_class: failure ?? 'SelectorMiss' };
    }

    // Guard: a fresh scrape that yields an empty outline almost always means a
    // failed fetch or a selector miss, not that Anthropic deleted the whole
    // outline. Never overwrite a previously-good outline with empty or flag a
    // change off it — that would fire a false curriculum-change alert, the exact
    // failure mode this monitor exists to prevent. Bump last_checked and move on.
    const existingHasContent = Boolean(existing.outline) || Boolean(existing.content_hash);
    if (!course.outline && existingHasContent) {
      // The row is left alone on purpose: overwriting a good outline with empty,
      // or flagging a change off it, would fire the false alert this monitor
      // exists to prevent. What changed is that the run no longer calls this
      // success. `last_checked` still moves, so staleness alone cannot be the
      // signal either - `outlines_missing` is.
      await existing.update({ last_checked: new Date() });
      log('warn', 'outline_empty_skipped', {
        url: course.url,
        outcome: 'partial',
        error_class: failure ?? 'SelectorMiss',
      });
      return { url: course.url, outcome: 'unchanged', error_class: failure ?? 'SelectorMiss' };
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
    // err: any — Sequelize/DB rejections are untyped at the JS boundary; read err.message only.
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
    // provider='skilljar' is a LEGACY ENUM VALUE that now means Claude Academy.
    // The courses moved to academy.claude.com in November 2026; the column is
    // CHECK-constrained and this query selects on it, so the value stayed put.
    // DO NOT "tidy" it to 'academy' without migrating the column in the same
    // commit: this query would match zero rows, the code below would quietly
    // fall back to the hardcoded KNOWN_CATALOG, and the run would report success
    // while monitoring a list instead of the program.
    const rows = await CurriculumCourseLink.findAll({
      where: { provider: 'skilljar' },
      // Deterministic order so the de-dup below is first-wins-stable: if two
      // week-rows ever normalize to one course URL with differing titles, the
      // lowest module_number wins consistently (no Postgres row-order flake
      // flipping titleChanged and firing a false alert).
      order: [['module_number', 'ASC']],
    });

    const withUrls = rows.filter((r) => r.course_url && normalizeCourseUrl(r.course_url) !== '');
    coursesToWatch = withUrls.map((r) => ({ title: r.course_title ?? '', url: r.course_url as string }));

    if (coursesToWatch.length === 0) {
      log('warn', 'no_tracked_courses_in_db', { outcome: 'partial' });
      source = 'fallback';
    }
  } catch (err: any) {
    // err: any — Sequelize/DB rejections are untyped at the JS boundary; read err.message only.
    log('error', 'curriculum_links_fetch_failed', { error_class: 'DatabaseError', message: err.message, outcome: 'partial' });
    source = 'fallback';
  }

  if (source === 'fallback') {
    log('warn', 'using_fallback_catalog', { courses: KNOWN_CATALOG.length });
    coursesToWatch = (KNOWN_CATALOG as KnownCourse[]).map((c) => ({ title: c.title, url: c.url }));
  }

  // De-duplicate by normalized URL: curriculum_course_links maps many week-rows
  // onto the same course, which would otherwise inflate courses_found and
  // produce a created+unchanged pair for one course within a single run.
  const seenUrls = new Set<string>();
  coursesToWatch = coursesToWatch.filter((c) => {
    const key = normalizeCourseUrl(c.url);
    if (!key || seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  });

  // Step 2: fetch outline for each course and sync to registry
  const results: CourseScrapResult[] = [];

  for (const course of coursesToWatch) {
    const { outline, failure } = await scrapeOutline(course.url);
    const result = await syncCourse({ ...course, outline }, failure);
    results.push(result);
  }

  const created   = results.filter((r) => r.outcome === 'created').length;
  const updated   = results.filter((r) => r.outcome === 'updated').length;
  const unchanged = results.filter((r) => r.outcome === 'unchanged').length;
  const errors    = results.filter((r) => r.outcome === 'error').length;

  // A missing outline is a non-DB failure, so it is deliberately NOT folded into
  // `errors` (whose meaning other callers already depend on) and is counted here.
  const outlines_missing = results.filter((r) => r.outcome !== 'error' && Boolean(r.error_class)).length;

  // WHY A FRACTION AND NOT A SINGLE MISS. One course can legitimately go dark -
  // Anthropic retires it, or renames it and our link 404s - and that is a
  // per-course alert, not a broken monitor. Half the catalog going dark in one
  // run is not eight coincidences; it is our extractor against their markup, or
  // a host that no longer exists. That is the case worth waking someone for.
  const found = coursesToWatch.length;
  const extractionBroken = found > 0 && outlines_missing >= Math.ceil(found / 2);
  const allErrored = found > 0 && errors === found;
  const healthy = !extractionBroken && !allErrored;

  if (extractionBroken) {
    log('error', 'outline_extraction_broken', {
      source,
      courses_found: found,
      outlines_missing,
      error_class: outlines_missing === found ? 'OutlineExtractionBroken' : 'OutlineExtractionDegraded',
      outcome: 'failure',
      message:
        'No usable outline for at least half the tracked courses. The monitor cannot ' +
        'see curriculum changes until this is fixed; treat a quiet week as unproven, not clean.',
    });
  }

  log(healthy ? 'info' : 'error', 'run_complete', {
    source,
    courses_found: found,
    created,
    updated,
    unchanged,
    errors,
    outlines_missing,
    healthy,
    outcome: healthy ? (errors > 0 || outlines_missing > 0 ? 'partial' : 'success') : 'failure',
  });

  return {
    source,
    courses_found: found,
    created,
    updated,
    unchanged,
    errors,
    outlines_missing,
    healthy,
    results,
  };
}
