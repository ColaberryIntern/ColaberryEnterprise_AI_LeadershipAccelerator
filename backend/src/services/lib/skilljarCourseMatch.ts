/**
 * Skilljar course-URL matching — the "which courses do we track?" decision,
 * extracted so it can be unit-tested in isolation.
 *
 * WHY THIS EXISTS: the tracked URLs below are the human-facing landing-page URLs.
 * The live Skilljar API may return the same course with a trailing slash, a
 * different protocol/casing, or a query/hash fragment. An exact-string match
 * (`Set.has(course_url)`) against these would then filter out every item and
 * return `courses_synced: 0, error: null` — an invisible no-op that no CI catches
 * because tests feed exactly-matching URLs. So matching MUST normalize both sides.
 * (See PR #85 review.)
 */

/**
 * The 5 Anthropic-required Skilljar courses tracked for every accelerator student.
 * Source: seedAnthropicContentRegistry.ts (confirmed 2026-06-18).
 */
export const TRACKED_COURSE_URLS: readonly string[] = [
  'https://anthropic.skilljar.com/introduction-to-agent-skills',
  'https://anthropic.skilljar.com/claude-with-the-anthropic-api',
  'https://anthropic.skilljar.com/introduction-to-model-context-protocol',
  'https://anthropic.skilljar.com/claude-code-in-action',
  'https://anthropic.skilljar.com/claude-code-101',
];

/**
 * Normalize a course URL to a stable comparison key: `host/path`, lowercased, with
 * protocol, query, hash, and any trailing slash removed. Two URLs that differ only
 * by those incidental parts normalize to the same key. Falls back to a best-effort
 * lowercased/trimmed string when the input is not a parseable absolute URL.
 */
export function normalizeCourseUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    const host = u.host.toLowerCase();
    const path = u.pathname.replace(/\/+$/, '').toLowerCase(); // drop trailing slash(es)
    return `${host}${path}`;
  } catch {
    // Not an absolute URL — best effort: lowercase, drop query/hash, drop trailing slash.
    return trimmed
      .toLowerCase()
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
  }
}

const TRACKED_NORMALIZED = new Set(TRACKED_COURSE_URLS.map(normalizeCourseUrl));

/**
 * True when `courseUrl` refers to one of the tracked Anthropic courses, tolerant of
 * trailing-slash / protocol / casing / query-param differences from the live API.
 */
export function isTrackedCourseUrl(courseUrl: string | null | undefined): boolean {
  const key = normalizeCourseUrl(courseUrl);
  return key !== '' && TRACKED_NORMALIZED.has(key);
}
