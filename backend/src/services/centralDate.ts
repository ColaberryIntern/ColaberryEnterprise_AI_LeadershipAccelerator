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

/**
 * A naive wall-clock (its UTC getters carry the raw digits, e.g. built via
 * `new Date("2026-07-23T18:30:00Z")`) re-interpreted as Central time, DST-aware,
 * to recover the true instant. Originated in publicEventsService.ts for CCPP's
 * mssql driver (which reads Central wall-clock datetimes into UTC fields);
 * re-homed here so any module needing "this Central wall-clock, as an instant"
 * shares one implementation.
 */
export function centralWallClockToInstant(naive: Date): Date {
  const guess = Date.UTC(
    naive.getUTCFullYear(), naive.getUTCMonth(), naive.getUTCDate(),
    naive.getUTCHours(), naive.getUTCMinutes(), naive.getUTCSeconds(),
  );
  // How far ahead of UTC is Central at that instant? (negative — Central is behind)
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let hour = Number(parts.hour); if (hour === 24) hour = 0;
  const asCentral = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  const offset = asCentral - guess;
  return new Date(guess - offset);
}
