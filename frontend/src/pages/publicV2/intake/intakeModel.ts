/**
 * intakeModel - the pure parts of the v2 intake page (2026-11-21): the time comparison, the
 * file rules, and how a time is shown. No React, so it is tested on its own.
 */

/** Ali: "the Human call 20-30 minutes of all people involved" vs "AI and one person". */
export const DISCOVERY_MINUTES = { low: 20, high: 30 } as const;
export const AI_INTERVIEW_MINUTES = 10;
export const DEFAULT_PEOPLE = 4;
export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 12;

export interface Comparison {
  people: number;
  humanLow: number;
  humanHigh: number;
  ai: number;
  /** How many times less people-time the AI interview takes, at the high end. */
  times: number;
}

export function compareTime(people: number): Comparison {
  const p = Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, Math.round(people) || DEFAULT_PEOPLE));
  const humanLow = DISCOVERY_MINUTES.low * p;
  const humanHigh = DISCOVERY_MINUTES.high * p;
  return { people: p, humanLow, humanHigh, ai: AI_INTERVIEW_MINUTES, times: Math.round(humanHigh / AI_INTERVIEW_MINUTES) };
}

/** "80 to 120 minutes", or hours once it is over four hours. */
export function minutesLabel(low: number, high: number): string {
  if (high <= 240) return `${low} to ${high} minutes`;
  const h = (m: number) => (m / 60).toFixed(m % 60 === 0 ? 0 : 1);
  return `${h(low)} to ${h(high)} hours`;
}

// --- Their research files (the server checks again, by the bytes) ---

export const FILE_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt'] as const;
export const FILE_ACCEPT = FILE_EXTENSIONS.join(',');
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 5;

/** Why this file cannot be sent, or null when it can. */
export function fileProblem(file: { name: string; size: number }, alreadyShared: number): string | null {
  if (alreadyShared >= MAX_FILES) return `You can share up to ${MAX_FILES} files.`;
  const ext = (file.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
  if (!(FILE_EXTENSIONS as readonly string[]).includes(ext)) return 'Share a PDF, Word, PowerPoint or text file.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_FILE_BYTES) return 'Each file must be 25 MB or smaller.';
  return null;
}

export const fileSize = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// --- Times, shown in the visitor's own time zone with its name ---

export const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const timeLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const whenLabel = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

/** The bounds for "schedule it for later": 30 minutes to 14 days out, as datetime-local values. */
export function laterBounds(now = new Date()): { min: string; max: string; suggested: string } {
  const local = (d: Date) => {
    const off = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  };
  const tomorrow10 = new Date(now);
  tomorrow10.setDate(tomorrow10.getDate() + 1);
  tomorrow10.setHours(10, 0, 0, 0);
  return { min: local(new Date(now.getTime() + 30 * 60_000)), max: local(new Date(now.getTime() + 14 * 86_400_000)), suggested: local(tomorrow10) };
}
