/**
 * portfolioReaders - the defensive readers the public portfolio projection is built on.
 *
 * EXTRACTED FROM `careerPortfolioPublicProjection.ts` on 2026-10-17. That file stood at 516
 * lines against CLAUDE.md's 500-line hard ceiling, and the rule is that the next change to an
 * oversize file splits it before adding new code. C5.0 was that next change, so these four
 * pure helpers moved out rather than the ceiling moving.
 *
 * Nothing here holds policy. Every function answers "is this value safe to render", and the
 * decision about WHAT to render stays in the projection where a reviewer expects to find it.
 * They are exported for that file and for its tests, not as a general-purpose toolkit.
 */

// ── Defensive readers. Anything unreadable is dropped, never rendered. ─────

export const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

export const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/**
 * Only `http:` and `https:` survive. A `javascript:` or `data:` URL reaching an
 * unauthenticated page is a scripting vector, and this content is student-authored.
 */
export function httpUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A record's title, and NEVER its slug.
 *
 * `ali-muwwakkil` rendered as a project title on Ali's own live page, because
 * `system.project_name` was null and the fallback was the slug. A URL fragment presented
 * as the name of someone's work reads as broken software to the hiring manager it is
 * shown to.
 *
 * The fallback chain uses only REAL data, never an invented name:
 *   1. `project_name` as compiled
 *   2. the descriptor's own first heading -- the document titled itself
 *   3. "Untitled record" -- honest, and still a working link
 */
export function recordTitle(r: any): string {
  const named = str(r.title) ?? str(r.project_name);
  if (named) return named;

  const descriptor = str(r.descriptor);
  if (descriptor) {
    for (const line of descriptor.split('\n')) {
      const m = /^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/.exec(line);
      // Strip inline emphasis so a heading like `# **Strategy**` does not keep its stars.
      if (m) {
        const heading = m[1].replace(/[*_`]/g, '').trim();
        if (heading) return heading.slice(0, 160);
      }
    }
  }
  return 'Untitled record';
}
