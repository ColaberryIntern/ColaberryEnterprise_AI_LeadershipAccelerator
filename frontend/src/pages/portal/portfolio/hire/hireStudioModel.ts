/**
 * hireStudioModel - the candidate studio's pure logic (kit §3): the 7-item "Finish your profile"
 * checklist and its strength count, the weekly grid's blocks, case-study ordering, and showing a
 * time in the candidate's own zone. No React, no I/O, so every rule is unit-tested.
 */
import type { CareerProfile } from '../../../../services/careerApi';
import type { CaseStudyOrder, HireIntro, InterviewAvailability } from '../../../../services/hireStudioApi';

/** One data source's state: its value once read, or `failed` so its section can say so. */
export type Loaded<T> = { value: T | null; failed: boolean };

export type StudioSection ='overview' | 'video' | 'about' | 'times' | 'cases';

export const SECTIONS: ReadonlyArray<{ key: StudioSection; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'video', label: 'Intro video' },
  { key: 'about', label: 'About you' },
  { key: 'times', label: 'Interview times' },
  { key: 'cases', label: 'Case studies' },
];

export interface ChecklistItem {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  /** Where the CTA jumps when it is not done. `null` = somewhere outside this tab. */
  target: StudioSection | 'publishing' | null;
  cta: string;
}

export interface StudioData {
  profile: Pick<CareerProfile, 'identity'>;
  intro: HireIntro | null;
  availability: InterviewAvailability | null;
  order: CaseStudyOrder | null;
}

export function aboutDone(intro: HireIntro | null): boolean {
  return !!intro && intro.answers.some((a) => a.text.trim()) && intro.roles.length > 0;
}

export function timesDone(a: InterviewAvailability | null): boolean {
  return !!a && a.enabled && a.blocks.length > 0 && a.formats.length > 0;
}

/** The seven items, in the kit's order. */
export function checklist(d: StudioData): ChecklistItem[] {
  const id = d.profile.identity;
  const published = d.order?.cases.length ?? 0;
  return [
    { key: 'case', title: 'Published case study', detail: published ? `${published} on Hire` : 'Employers find you through one published case study.', done: published > 0, target: 'publishing', cta: 'See publishing' },
    { key: 'photo', title: 'Photo', detail: 'A clear headshot, from your settings.', done: !!id?.avatar_data_url, target: null, cta: 'Add a photo' },
    { key: 'video', title: 'Intro video', detail: '90 seconds, in your own words.', done: d.intro?.video?.status === 'published', target: 'video', cta: 'Record' },
    { key: 'about', title: 'About you', detail: 'Answer a question and pick the roles you want.', done: aboutDone(d.intro), target: 'about', cta: 'Write it' },
    { key: 'times', title: 'Interview times', detail: 'Mark when employers can book you.', done: timesDone(d.availability), target: 'times', cta: 'Set times' },
    { key: 'resume', title: 'Resume', detail: 'Upload it once, from your settings.', done: !!id?.resume, target: null, cta: 'Upload' },
    { key: 'linkedin', title: 'LinkedIn', detail: 'Your profile link, from your settings.', done: !!id?.linkedin_url, target: null, cta: 'Add link' },
  ];
}

export const strength = (items: readonly ChecklistItem[]): number => items.filter((i) => i.done).length;

// ── Weekly grid ──────────────────────────────────────────────────────────────

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const PARTS = [
  { key: 'morning', label: 'Morning', hours: '9–12' },
  { key: 'afternoon', label: 'Afternoon', hours: '12–5' },
  { key: 'evening', label: 'Evening', hours: '5–8' },
] as const;

export const blockKey = (day: string, part: string) => `${day}-${part}`;

export function toggleIn<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// ── Case-study order ─────────────────────────────────────────────────────────

/** The full order to show: the saved order first, then any published case study not yet in it. */
export function fullOrder(o: CaseStudyOrder | null): string[] {
  if (!o) return [];
  const published = o.cases.map((c) => c.slug);
  const saved = o.slugs.filter((s) => published.includes(s));
  return [...saved, ...published.filter((s) => !saved.includes(s))];
}

export function move(slugs: readonly string[], slug: string, dir: -1 | 1): string[] {
  const i = slugs.indexOf(slug);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= slugs.length) return [...slugs];
  const next = [...slugs];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Making one the signature moves it to the top. */
export const makeSignature = (slugs: readonly string[], slug: string): string[] =>
  slugs.includes(slug) ? [slug, ...slugs.filter((s) => s !== slug)] : [...slugs];

// ── Time ─────────────────────────────────────────────────────────────────────

const ZONE_ABBR: Record<string, string> = {
  'America/New_York': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT', 'America/Phoenix': 'MST', 'America/Los_Angeles': 'PT',
};

export const TIME_ZONES = Object.keys(ZONE_ABBR);

/** "Mon, Nov 16 · 9:00 AM CT" in the given zone. */
export function formatWhen(iso: string, tz: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
  return `${day} · ${time} ${ZONE_ABBR[tz] ?? tz}`;
}

/**
 * A `datetime-local` value ("2026-11-18T10:30") read as wall-clock time in `tz`, as a UTC ISO
 * string. The browser's own zone is never assumed: the candidate set theirs in Interview times.
 */
export function wallTimeToIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t).toISOString();
}

export const FORMAT_NAME: Record<string, string> = { intro: 'Intro call', walkthrough: 'Case study walkthrough', working: 'Working session' };
