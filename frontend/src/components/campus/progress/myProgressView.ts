import type { MyProgress } from './myProgressApi';

/**
 * C120: the pure mapping from the my-progress answer to the screen's lines (approved design C120_1_ONE_PAGE). Tested, so the
 * screen component only lays it out. Nothing is invented: a missing piece is left out of its line, never filled with a guess.
 * Copy: American spelling, and never the word "free" (TWC 807.172(d)).
 */
export const STORY_POINTS = 25; // the existing onboarding reward for uploading a resume (portalSettingsService)

/** "Ali, this is your progress." / "This is your progress." */
export const cheerLine = (firstName: string | null): string => (firstName ? `${firstName}, this is your progress.` : 'This is your progress.');

/** The week ring's fill, 0..100 (W1 of 12 = 8). */
export function ringPct(week: MyProgress['week']): number {
  if (!week || week.total <= 0) return 0;
  return Math.round((Math.min(week.current, week.total) / week.total) * 100);
}

const n = (v: number): string => v.toLocaleString('en-US');

/** "Lv 4 · AI Enabled II · 1,379 pts · 2 of 6 cards done this week" (each part only when it is known). */
export function statusLine(p: MyProgress): string {
  const parts: string[] = [];
  if (p.points.level) parts.push(`Lv ${p.points.level}`);
  if (p.points.levelName) parts.push(p.points.levelName);
  parts.push(`${n(p.points.total)} pts`);
  if (p.week && p.week.cardsThisWeek > 0) parts.push(`${p.week.cardsDoneThisWeek} of ${p.week.cardsThisWeek} cards done this week`);
  return parts.join(' · ');
}

/** "Nov 4" in Central time (the campus clock). */
export function shortDate(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
}

/** "Prompt patterns lab · Nov 4"; nothing finished yet: the line that invites the first one. */
export function winLine(win: MyProgress['latestWin']): string {
  if (!win) return 'Your first finished card shows up here.';
  const d = shortDate(win.date);
  return d ? `${win.title} · ${d}` : win.title;
}

/** "14" -> "14 years"; "1" -> "1 year"; "10+ years" stays as written. */
export function yearsLabel(years: string | null): string | null {
  if (!years) return null;
  const m = /^(\d+)(\+?)$/.exec(years.trim());
  if (!m) return years;
  return `${m[1]}${m[2]} ${m[1] === '1' && !m[2] ? 'year' : 'years'}`;
}

/** "Director of Operations at Acme · Logistics · 14 years" from whatever the resume gave. */
export function backgroundLine(bg: NonNullable<MyProgress['background']>): string | null {
  const head = bg.title && bg.company ? `${bg.title} at ${bg.company}` : bg.title ?? bg.company;
  const parts = [head, bg.industry, yearsLabel(bg.years)].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : null;
}

/** The chips under it: the top skills, then the education. */
export const backgroundChips = (bg: NonNullable<MyProgress['background']>): string[] => [...bg.skills, ...(bg.education ? [bg.education] : [])];

/** Which story card the screen shows: the background once a resume is on record, the upload invitation before. */
export const storyState = (p: MyProgress): 'background' | 'upload' => (p.hasResume ? 'background' : 'upload');

/** The Settings upload's rules (SettingsPage RESUME_EXT / RESUME_MAX), so the campus card refuses the same files with the same
 *  words; the server checks again on upload. */
export const RESUME_EXT = ['.pdf', '.doc', '.docx', '.rtf', '.txt', '.md'];
export const RESUME_MAX_BYTES = 3 * 1024 * 1024;
export function resumeFileProblem(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!RESUME_EXT.includes(ext)) return 'Accepted: PDF, Word, RTF, Text, Markdown';
  if (file.size > RESUME_MAX_BYTES) return 'Resume must be 3 MB or smaller';
  return null;
}
