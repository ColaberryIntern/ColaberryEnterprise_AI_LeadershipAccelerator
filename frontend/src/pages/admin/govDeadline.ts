/**
 * govDeadline — pure helpers for the submission-deadline countdown on the gov Qualify workspace.
 *
 * The discovery feed gives a DATE-ONLY close date (no cutoff time); the canonical source may give a
 * full UTC datetime. These helpers compute the remaining time honestly from whichever precision we
 * actually have — never inventing a time of day the data doesn't carry. No IO; deterministic; total.
 */

export interface ParsedDeadline {
  ms: number;
  /** true only when the source carried a real time of day (a full ISO datetime), not a bare date. */
  hasTime: boolean;
}

/** "YYYY-MM-DD" -> midnight UTC (date-only); a full ISO datetime -> its instant. null when unparseable. */
export function parseDeadline(value: string | null | undefined): ParsedDeadline | null {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const ms = dateOnly ? Date.parse(`${v}T00:00:00Z`) : Date.parse(v);
  if (Number.isNaN(ms)) return null;
  return { ms, hasTime: !dateOnly };
}

/** Convert a human date like "Nov. 6th, 2026" or "03/15/2026" to "YYYY-MM-DD", or null when unparseable.
 *  Strips ordinal suffixes (6th -> 6) and periods (Nov. -> Nov) that Date.parse rejects. Pure + total. */
export function toIsoDate(d: string | null | undefined): string | null {
  if (!d || typeof d !== 'string') return null;
  const cleaned = d.replace(/(\d+)(?:st|nd|rd|th)\b/gi, '$1').replace(/\./g, '').trim();
  const ms = Date.parse(cleaned);
  if (Number.isNaN(ms)) return null;
  // Use the parsed LOCAL calendar components, not toISOString() — a bare date parses to local midnight, and
  // converting that to UTC would shift the day backward in positive-offset timezones (off-by-one deadline).
  const dt = new Date(ms);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Pick the SUBMISSION deadline from the dossier's detected key-date lines and return it as "YYYY-MM-DD".
 *  Prefers a "received/due/submit/closes" line and skips a "questions/inquiries" line; falls back to the first
 *  dated line. For a ZIP-uploaded pursuit (no OP close date), this is the only submission deadline we have, so
 *  without it the countdown stays empty forever. Pure + total; null when nothing is parseable. */
export function dossierDeadlineIso(
  keyDates: Array<{ date: string | null; text?: string | null }> | null | undefined,
): string | null {
  const rows = Array.isArray(keyDates) ? keyDates.filter((k) => k && k.date) : [];
  if (rows.length === 0) return null;
  const isQuestions = (t: string) => /\b(?:question|inquir|clarif)/i.test(t);
  const isSubmit = (t: string) => /\b(?:received|due|submit|proposal|closing|closes?|no\s+later|must\s+be)\b/i.test(t);
  const nonQ = rows.filter((k) => !isQuestions(k.text ?? ''));
  const chosen = nonQ.find((k) => isSubmit(k.text ?? '')) ?? nonQ[0] ?? rows[0];
  return chosen ? toIsoDate(chosen.date) : null;
}

export interface Countdown { past: boolean; days: number; hours: number; minutes: number; }

/** Whole days/hours/minutes between now and the target (magnitude); `past` when the target has passed. */
export function countdownTo(targetMs: number, nowMs: number): Countdown {
  const diff = targetMs - nowMs;
  const abs = Math.abs(diff);
  return {
    past: diff < 0,
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
  };
}

export type DeadlineTone = 'danger' | 'warning' | 'success' | 'secondary';

/** Urgency by whole days remaining: past or <=3 days -> danger, <=7 -> warning, else success. */
export function deadlineTone(c: Countdown): DeadlineTone {
  if (c.past || c.days <= 3) return 'danger';
  if (c.days <= 7) return 'warning';
  return 'success';
}

/**
 * Human countdown string. `hasTime` lets it show hours/minutes when we have a real cutoff time;
 * a date-only deadline stays day-granular rather than implying a midnight cutoff we don't know.
 */
export function formatCountdown(c: Countdown, hasTime: boolean): string {
  const plural = (n: number) => (n === 1 ? '' : 's');
  if (c.past) {
    return c.days === 0 ? 'Closed today' : `Closed ${c.days} day${plural(c.days)} ago`;
  }
  if (c.days === 0) {
    if (!hasTime) return 'Closes today';
    return c.hours > 0 ? `Closes in ${c.hours}h ${c.minutes}m` : `Closes in ${c.minutes}m`;
  }
  if (hasTime && c.days <= 2) return `${c.days}d ${c.hours}h left`;
  return `${c.days} day${plural(c.days)} left`;
}
