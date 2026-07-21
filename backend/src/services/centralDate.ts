/**
 * Central-time date key — the ONE timezone boundary used across the points
 * economy (daily streaks, daily anti-cheat caps, the HUD's notion of "today").
 * Extracted into its own module so streakService and pointsService share a
 * single tz definition rather than each carrying its own copy (CLAUDE.md: a
 * dependency two modules share belongs in a third module they both import,
 * never A→B→A). Pure — no clock, no I/O, deterministic for a given instant.
 */

export const CENTRAL_TZ = 'America/Chicago';

/** 'YYYY-MM-DD' for an instant (epoch ms) as seen in Central time. */
export function centralDateKey(ms: number): string {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}
