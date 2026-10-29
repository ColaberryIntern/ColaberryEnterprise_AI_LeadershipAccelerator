/**
 * runOfShow.ts — the templated 120-minute run-of-show for each class day kind,
 * taken verbatim from AI_BUILD_SHOW_STRATEGY.md §3 (Monday / Architecture Day)
 * and §4 (Thursday / Build Day), plus the Orientation structure Ali specified
 * (60 min Ali + 30 min Taiwo + 30 min Swati).
 *
 * The timing is identical every week — that consistency is what makes the show a
 * show and what powers the Class Kit's live pace tracker ("you are 4 min behind
 * on the Guided Build"). The per-week CONTENT that fills these segments lives in
 * data/classSessionPlan.ts.
 *
 * Segment minute offsets assume a 120-minute session. buildKitSpec scales them
 * proportionally if a session's actual duration differs, so a 90-minute class
 * still gets a coherent, in-proportion run of show.
 *
 * Pure data + pure helpers, dependency-free, so it unit-tests in isolation.
 */
import type { DayKind } from '../../data/classSessionPlan';

export type SegmentMode = 'open' | 'present' | 'interact' | 'build' | 'break' | 'close';

export interface SegmentTemplate {
  id: string;
  startMin: number;
  endMin: number;
  label: string;
  mode: SegmentMode;
  /** Classroom purpose (what happens in the room). */
  purpose: string;
  /** Public-content value (what this segment becomes for the show). */
  publicValue: string;
}

/** Monday · Architecture Day — AI_BUILD_SHOW_STRATEGY.md §3. */
export const ARCHITECTURE_RUN_OF_SHOW: SegmentTemplate[] = [
  { id: 'cold-open', startMin: 0, endMin: 3, label: 'Cold open', mode: 'open', purpose: 'Show what will exist by Thursday', publicValue: 'Opening hook' },
  { id: 'checkin', startMin: 3, endMin: 10, label: 'Check-in + prediction', mode: 'interact', purpose: 'Attendance + student commitment', publicValue: 'Poll / reaction clip' },
  { id: 'business-problem', startMin: 10, endMin: 25, label: 'The business problem', mode: 'present', purpose: 'Why this matters beyond the tool', publicValue: 'LinkedIn thought-leadership clip' },
  { id: 'architecture', startMin: 25, endMin: 45, label: 'Architecture story', mode: 'present', purpose: 'Diagram, components, risks, decisions', publicValue: 'Evergreen lesson' },
  { id: 'deconstruct', startMin: 45, endMin: 60, label: 'Deconstruct a real example', mode: 'present', purpose: 'Show what works and what fails', publicValue: 'Breakdown clip' },
  { id: 'reset', startMin: 60, endMin: 65, label: 'Reset', mode: 'break', purpose: 'Short break', publicValue: 'Edited out' },
  { id: 'micro-build', startMin: 65, endMin: 95, label: 'Guided micro-build', mode: 'build', purpose: 'Students begin the first component', publicValue: 'Tutorial sequence' },
  { id: 'challenge', startMin: 95, endMin: 110, label: 'Architecture challenge', mode: 'interact', purpose: 'Students choose between design options', publicValue: 'Poll and comments' },
  { id: 'trivia', startMin: 110, endMin: 117, label: 'Knowledge check', mode: 'interact', purpose: 'Validate learning', publicValue: 'Curriculum assessment' },
  { id: 'trailer', startMin: 117, endMin: 120, label: 'Thursday trailer', mode: 'close', purpose: 'Open loop: "Thursday we make it work"', publicValue: 'Social teaser' },
];

/** Thursday · Build Day — AI_BUILD_SHOW_STRATEGY.md §4. */
export const BUILD_RUN_OF_SHOW: SegmentTemplate[] = [
  { id: 'result-preview', startMin: 0, endMin: 5, label: 'Result preview', mode: 'open', purpose: 'Remind students what they are producing', publicValue: 'Cold open' },
  { id: 'readiness', startMin: 5, endMin: 15, label: 'Readiness check + trivia', mode: 'interact', purpose: 'Confirm everyone has the required setup', publicValue: 'Interaction clip' },
  { id: 'build-map', startMin: 15, endMin: 25, label: 'Build map', mode: 'present', purpose: 'Explain checkpoints and safety rules', publicValue: 'Tutorial roadmap' },
  { id: 'guided-build', startMin: 25, endMin: 75, label: 'Guided Claude Code build', mode: 'build', purpose: 'Students follow you through checkpoints', publicValue: 'Main build footage' },
  { id: 'reset', startMin: 75, endMin: 85, label: 'Reset', mode: 'break', purpose: 'Break and individual catch-up', publicValue: 'Mostly edited out' },
  { id: 'failure', startMin: 85, endMin: 102, label: 'Failure + recovery', mode: 'build', purpose: 'Teach troubleshooting and architecture thinking', publicValue: 'High-retention sequence' },
  { id: 'demos', startMin: 102, endMin: 114, label: 'Student demonstrations', mode: 'interact', purpose: 'Social proof and peer learning', publicValue: 'Reaction / testimonial clips' },
  { id: 'broadcast', startMin: 114, endMin: 119, label: 'Builder Broadcast', mode: 'interact', purpose: 'Each student records a 30-second Build Proof', publicValue: 'Student content' },
  { id: 'cta', startMin: 119, endMin: 120, label: 'Final CTA', mode: 'close', purpose: 'Point viewers to the free entry point', publicValue: 'Conversion' },
];

// Orientation — Ali's exact structure: 60 Ali (incl. a 5-min welcome) + 30 Taiwo
// + 30 Swati. Segment minutes match the per-presenter budgets so the pace bar
// reads "on time" while a presenter is within their stated time (Ali 0-60,
// Taiwo 60-90, Swati 90-120). The cohort close folds into the tail of setup.
export const ORIENTATION_RUN_OF_SHOW: SegmentTemplate[] = [
  { id: 'welcome', startMin: 0, endMin: 5, label: 'Welcome + check-in', mode: 'open', purpose: 'Set the tone; students check in on their phones', publicValue: 'Opening hook' },
  { id: 'big-picture', startMin: 5, endMin: 60, label: 'The big picture (Ali)', mode: 'present', purpose: 'From AI user to AI builder — the moment, the proof, the program', publicValue: 'Evergreen keynote' },
  { id: 'platform', startMin: 60, endMin: 90, label: 'Your platform (Taiwo)', mode: 'present', purpose: 'Tour the daily command center', publicValue: 'Product walkthrough' },
  { id: 'setup', startMin: 90, endMin: 120, label: 'Environment setup (Swati)', mode: 'build', purpose: 'Claude Code + VS Code live setup — everyone leaves set up; then what to expect before Week 1', publicValue: 'Setup tutorial' },
];

// Open House — a 90-minute prospect session, scaled to the session's real
// duration like every other template. Every slide comes from KitConfig. The
// segments are deliberately short: a segment renders its content, then its
// questions, so short segments are what put a question every 2-3 slides.
export const OPEN_HOUSE_RUN_OF_SHOW: SegmentTemplate[] = [
  { id: 'welcome', startMin: 0, endMin: 6, label: 'Welcome + check-in', mode: 'open', purpose: 'Everyone logs in on their phone and votes', publicValue: 'Opening hook' },
  { id: 'signal', startMin: 6, endMin: 14, label: 'The $100M signal', mode: 'present', purpose: 'What Anthropic just bet on, and why', publicValue: 'Thought-leadership clip' },
  { id: 'news', startMin: 14, endMin: 22, label: 'This month in AI', mode: 'present', purpose: 'Current events, numbers and quotes', publicValue: 'News clip' },
  { id: 'role', startMin: 22, endMin: 30, label: 'The role', mode: 'present', purpose: 'What a Forward Deployed Engineer actually does', publicValue: 'Career clip' },
  { id: 'pay', startMin: 30, endMin: 37, label: 'Pay + trajectory', mode: 'present', purpose: 'What the role pays and where it leads', publicValue: 'Career clip' },
  { id: 'architect', startMin: 37, endMin: 47, label: 'Think like an architect', mode: 'interact', purpose: 'How an architect reasons, tried live on a real decision', publicValue: 'Decision theater clip' },
  { id: 'program', startMin: 47, endMin: 55, label: 'The 12 weeks', mode: 'present', purpose: 'Curriculum and how it runs', publicValue: 'Program walkthrough' },
  { id: 'proof', startMin: 55, endMin: 63, label: 'Proof you can perform', mode: 'present', purpose: 'Internship, projects, GitHub, case studies, certification', publicValue: 'Program walkthrough' },
  { id: 'investment', startMin: 63, endMin: 73, label: 'The investment', mode: 'present', purpose: 'The cost of a year, and what the year returns', publicValue: 'Conversion' },
  { id: 'books', startMin: 73, endMin: 78, label: 'Giveaway: books', mode: 'interact', purpose: 'Raffle: 3 copies of the CEO’s book', publicValue: 'Celebration clip' },
  { id: 'scholarships', startMin: 78, endMin: 84, label: 'Giveaway: scholarships', mode: 'interact', purpose: 'Raffle: 3 scholarships (50% off a year)', publicValue: 'Celebration clip' },
  { id: 'close', startMin: 84, endMin: 90, label: 'Enroll tonight', mode: 'close', purpose: 'The decision, tonight', publicValue: 'Conversion' },
];

export function runOfShowFor(dayKind: DayKind): SegmentTemplate[] {
  if (dayKind === 'openhouse') return OPEN_HOUSE_RUN_OF_SHOW;
  if (dayKind === 'orientation') return ORIENTATION_RUN_OF_SHOW;
  if (dayKind === 'build') return BUILD_RUN_OF_SHOW;
  return ARCHITECTURE_RUN_OF_SHOW;
}

/** The template's nominal total (always 120), used to scale to actual duration. */
export function templateTotalMinutes(segments: SegmentTemplate[]): number {
  return segments.length ? segments[segments.length - 1].endMin : 120;
}

/**
 * Scale a template's minute offsets to an actual session duration, preserving
 * proportions and rounding to whole minutes. Idempotent when actual === nominal.
 */
export function scaleSegments(segments: SegmentTemplate[], actualMinutes: number): SegmentTemplate[] {
  const nominal = templateTotalMinutes(segments);
  if (!actualMinutes || actualMinutes <= 0 || actualMinutes === nominal) return segments;
  const factor = actualMinutes / nominal;
  return segments.map((s) => ({
    ...s,
    startMin: Math.round(s.startMin * factor),
    endMin: Math.round(s.endMin * factor),
  }));
}

// ---- time + date helpers (TZ-safe, no external deps) ----

/** "18:30" / "18:30:00" → "6:30 PM". Leaves already-formatted strings untouched. */
export function formatClock(t: string): string {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${period}`;
}

/** Minutes between "HH:MM[:SS]" start and end; 0 if unparseable. */
export function durationMinutes(start: string, end: string): number {
  const toMin = (t: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec((t || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null) return 0;
  return Math.max(0, b - a);
}

/** "2026-07-27" → "Monday, July 27, 2026" (TZ-safe). Falls back to the raw string. */
export function formatLongDate(d: string): string {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** Weekday index (0=Sun..6=Sat) for a 'YYYY-MM-DD' date, TZ-safe; -1 if invalid. */
export function weekdayOf(d: string): number {
  if (!d) return -1;
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? -1 : dt.getDay();
}
