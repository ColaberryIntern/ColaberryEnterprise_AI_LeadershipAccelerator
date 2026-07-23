/**
 * kitSpec.ts — assembles a Class Kit deck spec from a live session + the canonical
 * class content (data/classSessionPlan.ts) + the templated run of show
 * (runOfShow.ts). The spec is a flat list of slides (each tagged with the segment
 * it belongs to, so the deck can drive a live pace tracker) plus segment timing
 * and meta. renderKitHtml (kitHtml.ts) turns a spec into the self-contained deck.
 *
 * Pure: no DB, no I/O. Everything it needs is passed in, so it unit-tests in
 * isolation and the same spec renders identically on server or in a test.
 */
import {
  DayKind, Interaction, ClassPrompt, BuildCheckpoint, WeekClassContent,
  WEEK_CLASS_CONTENT, ORIENTATION_PLAN,
} from '../../data/classSessionPlan';
import { weekBlueprint } from '../../data/weekBlueprints';
import { TeachSlide, EvidenceClaim } from '../../data/classTeachContent';
import {
  SegmentTemplate, SegmentMode, runOfShowFor, scaleSegments,
  formatClock, durationMinutes, formatLongDate, weekdayOf,
} from './runOfShow';

export type SlideKind =
  | 'cover' | 'rules' | 'bullets' | 'architecture' | 'example' | 'microbuild'
  | 'prompt' | 'checkpoint' | 'buildmap' | 'interaction' | 'failure' | 'recovery'
  | 'demos' | 'broadcast' | 'break' | 'cta' | 'segment' | 'presenterOnly' | 'assignment' | 'teach'
  | 'hook' | 'beforeafter' | 'storybeat';

export interface KitSlide {
  id: string;
  segmentId: string;
  segmentLabel: string;
  segStartMin: number;
  segEndMin: number;
  mode: SegmentMode;
  kind: SlideKind;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  prompt?: ClassPrompt;
  /** "PROMPT 2 OF 5" — set when the caller knows the prompt's position in its
   * segment (the Thursday guided-build loop); omitted elsewhere. */
  promptOf?: string;
  checkpoint?: BuildCheckpoint;
  interaction?: Interaction;
  /** Visual "Prove It" assignment brief (rendered as an emoji/chart-like card). */
  brief?: AssignmentBrief;
  /** Mermaid diagram source (rendered client-side) + its caption. */
  diagram?: string;
  diagramCaption?: string;
  /** Sourced factual claims (rendered as a small source footer). */
  evidence?: EvidenceClaim[];
  /** Guidance shown in the instructor's presenter rail, never to the room. */
  presenterTip?: string;
  /** Reminder of what this segment is worth as public content. */
  publicValue?: string;
  /** Story Mode before/after comparison ('beforeafter' kind). */
  beforeAfter?: { label?: string; before: string[]; after: string[] };
  /** Story Mode 'storybeat' fields — large icon, narrative body (uses the base
   * `body` field), and an optional closing punch line. */
  icon?: string;
  punch?: string;
  tone?: 'cherry' | 'berry' | 'amber' | 'leaf' | 'violet';
}

export interface BriefStep { emoji: string; text: string; }
export interface AssignmentBrief {
  headline: string;        // the public "prove it" title
  formula: string;         // "Learn it Monday. Build it Thursday. Prove it by Friday."
  difficulty: string;      // Foundational / Core / Stretch
  timeLabel: string;       // "~7 hrs"
  points: number;          // XP for the brief
  steps: BriefStep[];      // the deliverable journey
  proof: string;           // the evidence to show
  tags: string[];          // competencies earned
}

export interface KitSegment {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  mode: SegmentMode;
  purpose: string;
  publicValue: string;
}

export interface KitMeta {
  sessionId: string;
  sessionNumber: number;
  cohortName: string;
  week: number | null;
  dayKind: DayKind;
  dayLabel: string;
  title: string;
  publicTitle: string;
  intensive: string;
  dateLabel: string;
  timeRange: string;
  startTime: string;
  durationMin: number;
  checkinUrl: string;
  qrSvg: string;
  meetLink: string | null;
  anthropicCourse: { title: string; url: string } | null;
}

export interface KitSpec {
  meta: KitMeta;
  rules: string[];
  segments: KitSegment[];
  slides: KitSlide[];
  builderBroadcastPrompts: string[];
  totalMinutes: number;
}

export interface KitSessionInput {
  id: string;
  session_number: number;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
}

export interface BuildKitSpecInput {
  session: KitSessionInput;
  cohortName: string;
  checkinUrl: string;
  qrSvg: string;
  meetLink: string | null;
}

/** The rules slide — how students use their phone during class (same every class). */
const PHONE_RULES: string[] = [
  'Scan the QR once — your phone becomes your class controller for the whole session',
  'Tap your status any time: I’m here · I’m building · I’m stuck · I finished',
  'Ask a question from your phone — it reaches the instructor without interrupting the class',
  'Mark this moment when something clicks — it becomes a highlight clip later',
  'Answer the polls and trivia — they show up on your phone automatically',
];

export const BUILDER_BROADCAST_PROMPTS = [
  'The problem I started with was…',
  'The architecture decision I made was…',
  'I used Claude Code to build…',
  'Here is the proof that it works…',
  'The next thing I would improve is…',
];

const DIFFICULTY_LABEL: Record<string, string> = { intro: 'Foundational', core: 'Core', stretch: 'Stretch' };
const DIFFICULTY_POINTS: Record<string, number> = { intro: 75, core: 100, stretch: 150 };
export const STEP_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
export const PROVE_FORMULA = 'Learn it Monday. Build it Thursday. Prove it by Friday.';

function humanizeTag(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** First sentence of a longer passage, capped — used to turn a paragraph of
 * authored context into a one-line diagram caption instead of a generic label. */
export function firstSentence(s: string | undefined, maxLen = 150): string {
  if (!s) return '';
  const m = s.match(/^[^.!?]*[.!?]/);
  let out = (m ? m[0] : s).trim();
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + '…';
  return out;
}

/** Build a visual "Prove It" brief from a week's assignment + its blueprint. */
export function buildWeekBrief(week: number | null, wc: WeekClassContent): AssignmentBrief {
  const bp = week != null ? weekBlueprint(week) : undefined;
  const diff = (bp?.difficulty as string) || 'core';
  return {
    headline: wc.assignment.title,
    formula: PROVE_FORMULA,
    difficulty: DIFFICULTY_LABEL[diff] || 'Core',
    timeLabel: bp ? `~${bp.estimated_hours} hrs` : '',
    points: DIFFICULTY_POINTS[diff] || 100,
    steps: wc.assignment.deliverables.map((d, i) => ({ emoji: STEP_EMOJIS[i] || '✅', text: d })),
    proof: wc.assignment.proof,
    tags: (bp?.competencies || []).slice(0, 5).map(humanizeTag),
  };
}

/** Map deep teaching slides for one segment into KitSlides (kind 'teach'). */
export function teachToSlides(teach: TeachSlide[], segId: string, seg: KitSegment): KitSlide[] {
  return teach
    .filter((t) => t.segment === segId)
    .map((t, i) =>
      slide(seg, 200 + i, 'teach', {
        eyebrow: t.eyebrow,
        title: t.title,
        body: t.body,
        bullets: t.bullets,
        prompt: t.code ? { label: t.code.label, prompt: t.code.code } : undefined,
        diagram: t.diagram,
        evidence: t.evidence,
        presenterTip: t.script || seg.purpose,
      }),
    );
}

/** Mermaid flow of the build checkpoints (CP0 → … → CPn) with a rescue branch. */
export function buildCheckpointDiagram(cps: BuildCheckpoint[]): string {
  if (!cps.length) return '';
  const nodes = cps.map((cp) => `  CP${cp.n}["CP${cp.n} · ${cp.label}"]`).join('\n');
  const chain = '  ' + cps.map((cp) => `CP${cp.n}`).join(' --> ');
  const last = cps[cps.length - 1].n;
  return `flowchart LR\n${nodes}\n${chain}\n  Rescue["🛟 Rescue branch"] -.stuck? catch up.-> CP${last}`;
}

/** Detect the class day kind from title first, then weekday, then fall back. */
export function detectDayKind(title: string, dateStr: string): DayKind {
  if (/orientation/i.test(title)) return 'orientation';
  if (/architecture day/i.test(title)) return 'architecture';
  if (/build day/i.test(title)) return 'build';
  const wd = weekdayOf(dateStr);
  if (wd === 1) return 'architecture'; // Monday
  if (wd === 4) return 'build'; // Thursday
  return wd >= 0 && wd <= 3 ? 'architecture' : 'build';
}

function parseWeek(title: string): number | null {
  const m = title.match(/week\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function dayLabelFor(dayKind: DayKind): string {
  if (dayKind === 'orientation') return 'Orientation';
  if (dayKind === 'build') return 'Build Day';
  return 'Architecture Day';
}

/** Build the meta block shared by every day kind. */
function buildMeta(input: BuildKitSpecInput, dayKind: DayKind, week: number | null): KitMeta {
  const { session } = input;
  const durationMin = durationMinutes(session.start_time, session.end_time) || 120;
  const bp = week != null ? weekBlueprint(week) : undefined;
  const wc = week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === week) : undefined;
  const title =
    dayKind === 'orientation'
      ? ORIENTATION_PLAN.title
      : (wc?.title || session.title.replace(/^week\s+\d+\s*[·:—-]*\s*(architecture day|build day)?\s*[—:-]*\s*/i, '').trim() || session.title);
  const publicTitle =
    dayKind === 'orientation' ? ORIENTATION_PLAN.publicTitle : (wc?.publicTitle || title);
  const intensive =
    dayKind === 'orientation' ? ORIENTATION_PLAN.intensive : (wc?.intensive || '');
  const anthropicCourse =
    bp && bp.anthropic.title && bp.anthropic.url ? { title: bp.anthropic.title, url: bp.anthropic.url } : null;

  return {
    sessionId: session.id,
    sessionNumber: session.session_number,
    cohortName: input.cohortName,
    week,
    dayKind,
    dayLabel: dayLabelFor(dayKind),
    title,
    publicTitle,
    intensive,
    dateLabel: formatLongDate(session.session_date),
    timeRange: [formatClock(session.start_time), formatClock(session.end_time)].filter(Boolean).join(' – '),
    startTime: session.start_time,
    durationMin,
    checkinUrl: input.checkinUrl,
    qrSvg: input.qrSvg,
    meetLink: input.meetLink,
    anthropicCourse,
  };
}

/** Map templates → KitSegment[] (scaled to actual duration). */
function toSegments(templates: SegmentTemplate[], durationMin: number): KitSegment[] {
  return scaleSegments(templates, durationMin).map((s) => ({
    id: s.id, label: s.label, startMin: s.startMin, endMin: s.endMin,
    mode: s.mode, purpose: s.purpose, publicValue: s.publicValue,
  }));
}

/** Convenience: a slide bound to a segment, with sensible defaults. */
export function slide(seg: KitSegment, idx: number, kind: SlideKind, partial: Partial<KitSlide>): KitSlide {
  return {
    id: `${seg.id}-${idx}`,
    segmentId: seg.id,
    segmentLabel: seg.label,
    segStartMin: seg.startMin,
    segEndMin: seg.endMin,
    mode: seg.mode,
    kind,
    publicValue: seg.publicValue,
    title: partial.title || seg.label,
    ...partial,
  };
}

export function segById(segs: KitSegment[], id: string): KitSegment {
  return segs.find((s) => s.id === id) || segs[0];
}

/** Cover slide + rules slide, shared by every deck. */
export function openingSlides(meta: KitMeta, segs: KitSegment[]): KitSlide[] {
  const first = segs[0];
  return [
    slide(first, 0, 'cover', {
      eyebrow: `${meta.cohortName} · ${meta.dayLabel}`,
      title: meta.title,
      subtitle: meta.week != null ? `Week ${meta.week} · ${meta.intensive}` : meta.intensive,
      body: meta.dateLabel + (meta.timeRange ? ` · ${meta.timeRange}` : ''),
      presenterTip: 'Start the class clock (Start class) the moment you begin. The pace bar tracks you from here.',
    }),
    slide(first, 1, 'rules', {
      title: 'Your phone is your class controller',
      subtitle: 'Scan once. Stay connected the whole class.',
      bullets: PHONE_RULES,
      presenterTip: 'Give the rules once, up front. 60 seconds. Everyone scans before you move on.',
    }),
  ];
}

// buildKitSpec (the composer that turns a session into a full KitSpec) lives in
// kitSpecDaySlides.ts, which imports the types and helpers above — kept in a
// separate file so that module stays strictly downstream of this one (no
// circular dependency) while keeping both files under the 500-line ceiling.
export { buildMeta, toSegments, PHONE_RULES, parseWeek };
