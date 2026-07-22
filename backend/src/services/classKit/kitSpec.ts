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
  WEEK_CLASS_CONTENT, ORIENTATION_PLAN, ARCHITECTURE_DIAGRAMS,
} from '../../data/classSessionPlan';
import { weekBlueprint } from '../../data/weekBlueprints';
import {
  SegmentTemplate, SegmentMode, runOfShowFor, scaleSegments,
  formatClock, durationMinutes, formatLongDate, weekdayOf,
} from './runOfShow';

export type SlideKind =
  | 'cover' | 'rules' | 'bullets' | 'architecture' | 'example' | 'microbuild'
  | 'prompt' | 'checkpoint' | 'buildmap' | 'interaction' | 'failure' | 'recovery'
  | 'demos' | 'broadcast' | 'break' | 'cta' | 'segment' | 'presenterOnly' | 'assignment';

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
  checkpoint?: BuildCheckpoint;
  interaction?: Interaction;
  /** Visual "Prove It" assignment brief (rendered as an emoji/chart-like card). */
  brief?: AssignmentBrief;
  /** Mermaid diagram source (rendered client-side) + its caption. */
  diagram?: string;
  diagramCaption?: string;
  /** Guidance shown in the instructor's presenter rail, never to the room. */
  presenterTip?: string;
  /** Reminder of what this segment is worth as public content. */
  publicValue?: string;
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

const BUILDER_BROADCAST_PROMPTS = [
  'The problem I started with was…',
  'The architecture decision I made was…',
  'I used Claude Code to build…',
  'Here is the proof that it works…',
  'The next thing I would improve is…',
];

const DIFFICULTY_LABEL: Record<string, string> = { intro: 'Foundational', core: 'Core', stretch: 'Stretch' };
const DIFFICULTY_POINTS: Record<string, number> = { intro: 75, core: 100, stretch: 150 };
const STEP_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
const PROVE_FORMULA = 'Learn it Monday. Build it Thursday. Prove it by Friday.';

function humanizeTag(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build a visual "Prove It" brief from a week's assignment + its blueprint. */
function buildWeekBrief(week: number | null, wc: WeekClassContent): AssignmentBrief {
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

/** Mermaid flow of the build checkpoints (CP0 → … → CPn) with a rescue branch. */
function buildCheckpointDiagram(cps: BuildCheckpoint[]): string {
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
function slide(seg: KitSegment, idx: number, kind: SlideKind, partial: Partial<KitSlide>): KitSlide {
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

function segById(segs: KitSegment[], id: string): KitSegment {
  return segs.find((s) => s.id === id) || segs[0];
}

/** Cover slide + rules slide, shared by every deck. */
function openingSlides(meta: KitMeta, segs: KitSegment[]): KitSlide[] {
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

// -- Architecture Day (Monday) --------------------------------------------------

function architectureSlides(meta: KitMeta, segs: KitSegment[]): KitSlide[] {
  const wc = meta.week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === meta.week) : undefined;
  const out: KitSlide[] = [...openingSlides(meta, segs)];
  if (!wc) return out;
  const m = wc.monday;

  const cold = segById(segs, 'cold-open');
  out.push(slide(cold, 0, 'segment', {
    eyebrow: '🎬 Cold open', title: 'By Thursday, this will exist', body: m.payoffPreview,
    presenterTip: 'Show the finished artifact first. Sell the payoff before any theory.',
  }));

  const checkin = segById(segs, 'checkin');
  out.push(slide(checkin, 0, 'interaction', {
    eyebrow: '🔮 Predict', title: 'Before we start — make your call', interaction: m.designChoice,
    presenterTip: 'Everyone scans the QR here. Read the prediction; do not reveal yet — it pays off later.',
  }));

  const prob = segById(segs, 'business-problem');
  out.push(slide(prob, 0, 'bullets', {
    eyebrow: '💼 The business problem', title: 'Why this matters beyond the tool', body: m.tension,
    presenterTip: 'This is the LinkedIn clip. Stay on the business stakes, not the syntax.',
  }));

  const arch = segById(segs, 'architecture');
  out.push(slide(arch, 0, 'architecture', {
    eyebrow: '🏛️ Architecture story', title: 'The architecture', bullets: m.architectureBeats,
    diagram: meta.week != null ? ARCHITECTURE_DIAGRAMS[meta.week] : undefined,
    diagramCaption: 'How this week’s system fits together — walk it left to right.',
    presenterTip: 'Walk the diagram node by node: components, the risky edges, the decisions. This is the evergreen lesson — take your time (≈20 min). Ask the room where the trust boundary is.',
  }));

  const dec = segById(segs, 'deconstruct');
  out.push(slide(dec, 0, 'example', {
    eyebrow: '🔍 Deconstruct a real example', title: 'What works, and what fails', body: m.realExample,
    presenterTip: 'Show the good and the broken. The failure is the breakdown clip.',
  }));

  out.push(breakSlide(segById(segs, 'reset')));

  const micro = segById(segs, 'micro-build');
  out.push(slide(micro, 0, 'microbuild', {
    eyebrow: '🛠️ Guided micro-build', title: 'Start the first component', body: m.microBuild,
    presenterTip: 'Watch the pulse. If people go “stuck”, slow down. This is the tutorial sequence.',
  }));

  const chal = segById(segs, 'challenge');
  out.push(slide(chal, 0, 'interaction', {
    eyebrow: '🧭 Architecture challenge', title: 'Choose the design', interaction: m.designChoice,
    presenterTip: 'Now reveal. Tie their Monday prediction to the right architecture.',
  }));

  const triv = segById(segs, 'trivia');
  out.push(slide(triv, 0, 'interaction', {
    eyebrow: '🧠 Knowledge check', title: 'Quick check', interaction: m.trivia,
    presenterTip: 'Fast. Reveal, one line of why, move on.',
  }));

  const trailer = segById(segs, 'trailer');
  out.push(slide(trailer, 0, 'cta', {
    eyebrow: '🎟️ Thursday', title: 'Thursday we make it work', body: m.thursdayTrailer,
    presenterTip: 'Open loop. Leave them wanting Build Day. This is the social teaser.',
  }));

  return out;
}

// -- Build Day (Thursday) -------------------------------------------------------

function buildSlides(meta: KitMeta, segs: KitSegment[]): KitSlide[] {
  const wc = meta.week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === meta.week) : undefined;
  const out: KitSlide[] = [...openingSlides(meta, segs)];
  if (!wc) return out;
  const t = wc.thursday;

  const preview = segById(segs, 'result-preview');
  out.push(slide(preview, 0, 'segment', {
    eyebrow: '🎯 Result preview', title: 'What you are producing today', body: t.resultPreview,
    presenterTip: 'Show the finished result first. This is the cold open of the episode.',
  }));

  const readiness = segById(segs, 'readiness');
  out.push(slide(readiness, 0, 'segment', {
    eyebrow: '✅ Readiness check', title: 'You are ready to build if…', body: t.readinessCheck,
    presenterTip: 'Ask the room to tap “I’m here”. Anyone not set up goes to the rescue branch.',
  }));
  out.push(slide(readiness, 1, 'interaction', {
    eyebrow: '🧠 Warm-up', title: 'Quick check', interaction: t.trivia,
    presenterTip: 'One trivia to confirm last week landed before we build on it.',
  }));

  const map = segById(segs, 'build-map');
  out.push(slide(map, 0, 'buildmap', {
    eyebrow: '🗺️ Build map', title: 'The checkpoints', bullets: t.buildMap,
    diagram: buildCheckpointDiagram(t.checkpoints),
    diagramCaption: 'Everyone moves together, checkpoint to checkpoint. Stuck? The rescue branch catches you up.',
    presenterTip: 'Show the safety rails: the checkpoints and the rescue branch. Nobody gets left behind. Confirm CP0 before the first prompt.',
  }));
  t.checkpoints.forEach((cp, i) => {
    out.push(slide(map, i + 1, 'checkpoint', {
      eyebrow: `Checkpoint ${cp.n}`, title: cp.label, body: cp.detail, checkpoint: cp,
      presenterTip: i === 0 ? 'Everyone starts here. Confirm CP0 before the first prompt.' : 'Wait for the pulse to catch up before the next checkpoint.',
    }));
  });

  const guided = segById(segs, 'guided-build');
  t.prompts.forEach((p, i) => {
    out.push(slide(guided, i, 'prompt', {
      eyebrow: `⌨️ Guided build · prompt ${i + 1}`, title: p.label, prompt: p,
      presenterTip: 'Paste on screen, narrate the decision (not every character), run it, show the result.',
    }));
  });

  out.push(breakSlide(segById(segs, 'reset')));

  const fail = segById(segs, 'failure');
  out.push(slide(fail, 0, 'failure', {
    eyebrow: '💥 Failure injection', title: 'Let’s break it on purpose', body: t.failureInjection,
    presenterTip: 'Do not hide the error. This controlled failure is the highest-retention moment of the show.',
  }));
  out.push(slide(fail, 1, 'recovery', {
    eyebrow: '🔧 Recover like an architect', title: 'Diagnose and fix', body: t.recovery,
    presenterTip: 'Narrate the diagnosis. This is where they learn architecture thinking, not just syntax.',
  }));

  const demos = segById(segs, 'demos');
  out.push(slide(demos, 0, 'demos', {
    eyebrow: '🎤 Student demonstrations', title: 'Show your build', body: 'Two or three students share their screen and demo what they built. The room votes on the strongest one.',
    presenterTip: 'Call on students who tapped “I finished”. Social proof + peer learning = testimonial clips.',
  }));

  const bc = segById(segs, 'broadcast');
  out.push(slide(bc, 0, 'broadcast', {
    eyebrow: '🎬 Builder Broadcast', title: 'Record your 30-second Build Proof', bullets: BUILDER_BROADCAST_PROMPTS,
    body: `This week, your proof is: ${wc.builderBroadcastFocus}.`,
    presenterTip: 'Everyone records 30–60s on their phone using these five prompts. Opt-in becomes your content pipeline.',
  }));

  const cta = segById(segs, 'cta');
  out.push(slide(cta, 0, 'assignment', {
    eyebrow: 'Prove it by Friday', title: wc.assignment.title,
    brief: buildWeekBrief(meta.week, wc),
    presenterTip: 'Restate the assignment and the proof. Learn it Monday, build it Thursday, prove it by Friday.',
  }));

  return out;
}

// -- Orientation ----------------------------------------------------------------

function orientationSlides(meta: KitMeta, segs: KitSegment[]): KitSlide[] {
  const out: KitSlide[] = [...openingSlides(meta, segs)];

  const welcome = segById(segs, 'welcome');
  out.push(slide(welcome, 0, 'segment', {
    eyebrow: 'Welcome', title: 'Welcome to the Accelerator', body: ORIENTATION_PLAN.welcome,
    presenterTip: 'High energy. Everyone scans the QR and checks in before you start.',
  }));
  out.push(slide(welcome, 1, 'interaction', {
    eyebrow: 'Warm-up', title: 'Where are you starting from?', interaction: ORIENTATION_PLAN.designChoice,
    presenterTip: 'Read the spread out loud. Sets up the “from user to builder” arc.',
  }));

  const segIds = ['big-picture', 'platform', 'setup'];
  ORIENTATION_PLAN.segments.forEach((os, si) => {
    const seg = segById(segs, segIds[si]);
    out.push(slide(seg, 0, 'segment', {
      eyebrow: `${os.presenter} · ${os.minutes} min`, title: os.title, bullets: os.beats,
      presenterTip: si === 0 ? 'Your hour, Ali. Quotes, data, the program promise.' : `Hand off to ${os.presenter}. Keep to ${os.minutes} minutes — the pace bar will tell you if you drift.`,
    }));
  });

  const close = segById(segs, 'setup');
  out.push(slide(close, 1, 'interaction', {
    eyebrow: 'One more', title: 'What do you leave with?', interaction: ORIENTATION_PLAN.trivia,
    presenterTip: 'Reveal: a working system + CCA-F + portfolio. Then the close.',
  }));
  out.push(slide(close, 2, 'assignment', {
    eyebrow: 'Before Week 1', title: ORIENTATION_PLAN.assignment.title,
    brief: {
      headline: ORIENTATION_PLAN.assignment.title,
      formula: PROVE_FORMULA,
      difficulty: 'Foundational',
      timeLabel: '~1 hr',
      points: 50,
      steps: ORIENTATION_PLAN.assignment.deliverables.map((d, i) => ({ emoji: STEP_EMOJIS[i] || '✅', text: d })),
      proof: ORIENTATION_PLAN.assignment.proof,
      tags: ['AI Foundations', 'Workspace Setup'],
    },
    presenterTip: 'Everyone leaves tonight with Claude Code running. Week 1 Monday is Architecture Day.',
  }));

  return out;
}

function breakSlide(seg: KitSegment): KitSlide {
  return slide(seg, 0, 'break', {
    eyebrow: 'Reset', title: 'Short break', body: 'Stretch, questions, individual catch-up. Back in 5.',
    presenterTip: 'Use the break to clear the “stuck” queue on your phone rail.',
  });
}

/**
 * Build the full Class Kit deck spec for a session. Deterministic and pure — the
 * same input always yields the same spec, so it is safe to persist as kit_json
 * and safe to re-render.
 */
export function buildKitSpec(input: BuildKitSpecInput): KitSpec {
  const { session } = input;
  const dayKind = detectDayKind(session.title, session.session_date);
  const week = dayKind === 'orientation' ? null : parseWeek(session.title);
  const meta = buildMeta(input, dayKind, week);

  const templates = runOfShowFor(dayKind);
  const segments = toSegments(templates, meta.durationMin);

  let slides: KitSlide[];
  if (dayKind === 'orientation') slides = orientationSlides(meta, segments);
  else if (dayKind === 'build') slides = buildSlides(meta, segments);
  else slides = architectureSlides(meta, segments);

  return {
    meta,
    rules: PHONE_RULES,
    segments,
    slides,
    builderBroadcastPrompts: BUILDER_BROADCAST_PROMPTS,
    totalMinutes: meta.durationMin,
  };
}
