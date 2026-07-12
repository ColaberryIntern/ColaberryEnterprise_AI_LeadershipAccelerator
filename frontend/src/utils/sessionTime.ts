/**
 * Parse a session start time to a 24-hour "HH:MM" string, or null if unparseable.
 * Accepts 12-hour ("1:00 PM", "12:00 AM") and 24-hour ("13:00", "9:00") inputs.
 *
 * Extracted from PortalSessionDetailPage so the AM/PM conversion (the source of the
 * earlier NaN-countdown bug) is unit-testable in isolation, per the BUILD-BREAK-HARDEN
 * rule that each fix ships with a test reproducing the original break.
 */
export function parseSessionTimeToHHMM(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = String(raw).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  if (h > 23 || Number(m) > 59) return null;
  return `${String(h).padStart(2, '0')}:${m}`;
}
