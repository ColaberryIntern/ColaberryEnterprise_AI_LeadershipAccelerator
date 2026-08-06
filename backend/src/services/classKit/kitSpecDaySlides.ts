/**
 * kitSpecDaySlides.ts — the per-day-kind slide builders (Architecture Day, Build
 * Day, Orientation) plus buildKitSpec, the composer that ties them to a session.
 * Split out of kitSpec.ts (which stays under the file-size ceiling as the
 * types + shared-helpers module) — this file is strictly downstream of it, so
 * there is no circular dependency between the two.
 */
import {
  WEEK_CLASS_CONTENT, ORIENTATION_PLAN, ARCHITECTURE_DIAGRAMS, StoryBeat, DayKind,
} from '../../data/classSessionPlan';
import { teachSlidesFor, ORIENTATION_TEACH, TeachSlide } from '../../data/classTeachContent';
import { runOfShowFor } from './runOfShow';
import {
  KitMeta, KitSegment, KitSlide, KitSpec, BuildKitSpecInput,
  slide, segById, openingSlides, teachToSlides, buildCheckpointDiagram, buildWeekBrief, firstSentence,
  detectDayKind, parseWeek, buildMeta, toSegments,
  BUILDER_BROADCAST_PROMPTS, PROVE_FORMULA, STEP_EMOJIS, PHONE_RULES,
} from './kitSpec';
import { KitConfig, DEFAULT_KIT_CONFIG, InteractionPlacement, Slot, OpeningCopy, HookCopy } from './kitConfig';

/** Insert story beats right after a segment's own content — the instructor's
 * `config.storyBeats.overrides` (a full replacement set, filtered to this
 * segment) when set, else the authored defaults for this day. No-op when
 * neither has anything for this segment — story beats stay opt-in per class. */
function pushStoryBeats(
  out: KitSlide[], defaultBeats: Record<string, StoryBeat[]> | undefined,
  segId: string, seg: KitSegment, config: KitConfig,
): void {
  if (!config.storyBeats.enabled) return;
  const list = config.storyBeats.overrides
    ? config.storyBeats.overrides.filter((b) => b.segment === segId)
    : (defaultBeats?.[segId] || []);
  if (!list.length) return;
  list.forEach((b, i) => {
    out.push(slide(seg, 900 + i, 'storybeat', {
      eyebrow: b.eyebrow, title: b.title, body: b.body, icon: b.icon, punch: b.punch, tone: b.tone,
      presenterTip: 'Change of pace — tell the story, let it land, then move on. Do not over-explain it.',
    }));
  });
}

/** Resolve the deep-teaching ("Lessons") slides for whichever day this session
 * is: config.teach.enabled:false hides them all; overrides fully replaces the
 * authored/generated set (`teachSlidesFor`); max caps the count, in order. */
function resolveTeachSlides(base: TeachSlide[], config: KitConfig): TeachSlide[] {
  if (!config.teach.enabled) return [];
  const list = config.teach.overrides ?? base;
  return config.teach.max != null ? list.slice(0, config.teach.max) : list;
}

/** The authored default survey questions ("interactions") for a given week +
 * day kind, expressed as an ordinary segment-taggable list — the SAME shape
 * an instructor's overrides use. Exported so kitConfigDefaults.ts (the
 * Customize UI's "here's what's actually running" preview) can resolve the
 * identical list without duplicating this logic. Monday's design-choice poll
 * appears twice on purpose (asked at check-in, revealed at the architecture
 * challenge, same question both times) — that's authored content, not a
 * special case the engine needs to know about. */
export function defaultInteractionsFor(week: number | null, dayKind: DayKind): InteractionPlacement[] {
  if (dayKind === 'orientation') {
    return [
      { ...ORIENTATION_PLAN.designChoice, segment: 'welcome', eyebrow: 'Warm-up', title: 'Where are you starting from?', presenterTip: 'Read the spread out loud. Sets up the "from user to builder" arc.' },
      { ...ORIENTATION_PLAN.trivia, segment: 'setup', eyebrow: 'One more', title: 'What do you leave with?', presenterTip: 'Reveal: a working system + CCA-F + portfolio. Then the close.' },
    ];
  }
  const wc = week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === week) : undefined;
  if (!wc) return [];
  if (dayKind === 'architecture') {
    const m = wc.monday;
    return [
      { ...m.designChoice, segment: 'checkin', eyebrow: '🔮 Predict', title: 'Before we start — make your call', presenterTip: 'Everyone scans the QR here. Read the prediction; do not reveal yet — it pays off later.' },
      { ...m.designChoice, segment: 'challenge', eyebrow: '🧭 Architecture challenge', title: 'Choose the design', presenterTip: 'Now reveal. Tie their Monday prediction to the right architecture.' },
      { ...m.trivia, segment: 'trivia', eyebrow: '🧠 Knowledge check', title: 'Quick check', presenterTip: 'Fast. Reveal, one line of why, move on.' },
      // Optional extra questions beyond the 3 fixed slots above — empty for
      // every week that doesn't author any (see classSessionPlan.ts's
      // WeekClassContent.monday.extraInteractions doc comment).
      ...(m.extraInteractions || []),
    ];
  }
  const t = wc.thursday;
  return [
    { ...t.trivia, segment: 'readiness', eyebrow: '🧠 Warm-up', title: 'Quick check', presenterTip: 'One trivia to confirm last week landed before we build on it.' },
    // Optional extra questions beyond the fixed slot above — empty for every
    // week that doesn't author any (see WeekClassContent.thursday.extraInteractions).
    ...(t.extraInteractions || []),
  ];
}

export interface DefaultOpening {
  coldOpen: OpeningCopy | null;
  hook: HookCopy | null;
  resultPreview: OpeningCopy | null;
}

/** The authored default "opening" content for a given week + day kind —
 * cold-open framing (Monday), the optional Story Mode hook (Monday), and
 * the result-preview (Thursday). Exported so kitConfigDefaults.ts can
 * resolve the identical content without duplicating this logic. */
export function defaultOpeningFor(week: number | null, dayKind: DayKind): DefaultOpening {
  if (dayKind === 'orientation') return { coldOpen: null, hook: null, resultPreview: null };
  const wc = week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === week) : undefined;
  if (!wc) return { coldOpen: null, hook: null, resultPreview: null };
  if (dayKind === 'architecture') {
    return {
      coldOpen: { title: 'By Thursday, this will exist', body: wc.monday.payoffPreview },
      hook: wc.monday.hook ? { headline: wc.monday.hook.headline, caption: wc.monday.hook.caption } : null,
      resultPreview: null,
    };
  }
  return {
    coldOpen: null,
    hook: null,
    resultPreview: { title: 'What you are producing today', body: wc.thursday.resultPreview },
  };
}

/** Resolve one opening slot: enabled:false removes it entirely; override
 * replaces its content (even for a week with no authored default — an
 * instructor can add a hook to a week that never had one); null default +
 * no override = nothing to show. */
function resolveSlot<T>(defaultValue: T | null, slot: Slot<T>): T | null {
  if (!slot.enabled) return null;
  return slot.override ?? defaultValue;
}

/** Resolve the survey-question list for this session: enabled:false hides
 * every question; overrides fully replaces the authored defaults; max caps
 * the total count. Mirrors `resolveTeachSlides`'s exact shape. */
function resolveInteractions(base: InteractionPlacement[], config: KitConfig): InteractionPlacement[] {
  if (!config.interactions.enabled) return [];
  const list = config.interactions.overrides ?? base;
  return config.interactions.max != null ? list.slice(0, config.interactions.max) : list;
}

/** Push whichever resolved survey questions are tagged for this segment. A
 * question's `segment` field is what "strategically place it on the
 * timeline" actually means — dragging a question card to a different lane
 * in the Timeline Builder (a later phase) is exactly changing this field. */
function pushInteractions(out: KitSlide[], list: InteractionPlacement[], segId: string, seg: KitSegment): void {
  list.filter((q) => q.segment === segId).forEach((q, i) => {
    out.push(slide(seg, 950 + i, 'interaction', {
      eyebrow: q.eyebrow || '🗳️ Survey', title: q.title || 'Quick check', interaction: q,
      presenterTip: q.presenterTip || 'Read the question, take responses, reveal when ready.',
    }));
  });
}

/** Applies the deck-wide parts of KitConfig that don't need per-segment
 * context: a total cap on story-beat slides, disabling Live Decision Theater
 * (falls back to the normal compact inline poll), and hiding Build Bay's
 * extra "you should see"/"stop when" rows. Runs once, after the day-specific
 * builder has produced the full slide list. */
function applyKitConfig(slides: KitSlide[], config: KitConfig): KitSlide[] {
  let out = slides;
  if (config.storyBeats.max != null) {
    let seen = 0;
    out = out.filter((s) => {
      if (s.kind !== 'storybeat') return true;
      seen += 1;
      return seen <= config.storyBeats.max!;
    });
  }
  if (!config.theaterEnabled) {
    out = out.map((s) => (s.interaction?.theater ? { ...s, interaction: { ...s.interaction, theater: false } } : s));
  }
  if (!config.buildBayDetail) {
    out = out.map((s) => (s.prompt ? { ...s, prompt: { ...s.prompt, expectedResult: undefined, stopCondition: undefined } } : s));
  }
  return out;
}

// -- Architecture Day (Monday) --------------------------------------------------

function architectureSlides(meta: KitMeta, segs: KitSegment[], config: KitConfig): KitSlide[] {
  const wc = meta.week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === meta.week) : undefined;
  const out: KitSlide[] = [...openingSlides(meta, segs)];
  if (!wc) return out;
  const m = wc.monday;
  const mteach = resolveTeachSlides(teachSlidesFor(meta.week, 'monday'), config); // deep teaching slides, inserted per segment
  const interactions = resolveInteractions(defaultInteractionsFor(meta.week, 'architecture'), config);
  const opening = defaultOpeningFor(meta.week, 'architecture');
  const hook = resolveSlot(opening.hook, config.opening.hook);
  const coldOpen = resolveSlot(opening.coldOpen, config.opening.coldOpen);

  const cold = segById(segs, 'cold-open');
  if (hook) {
    out.push(slide(cold, -1, 'hook', {
      title: hook.headline, body: hook.caption,
      presenterTip: 'One sentence. Let it land. Do not explain it yet — the class explains it.',
    }));
  }
  if (coldOpen) {
    out.push(slide(cold, 0, 'segment', {
      eyebrow: '🎬 Cold open', title: coldOpen.title, body: coldOpen.body,
      presenterTip: 'Show the finished artifact first. Sell the payoff before any theory.',
    }));
  }
  pushInteractions(out, interactions, 'cold-open', cold);

  const checkin = segById(segs, 'checkin');
  pushInteractions(out, interactions, 'checkin', checkin);
  pushStoryBeats(out, m.storyBeats, 'checkin', checkin, config);

  const prob = segById(segs, 'business-problem');
  out.push(slide(prob, 0, 'bullets', {
    eyebrow: '💼 The business problem', title: 'Why this matters beyond the tool', body: m.tension,
    presenterTip: 'This is the LinkedIn clip. Stay on the business stakes, not the syntax.',
  }));
  out.push(...teachToSlides(mteach, 'business-problem', prob));
  pushStoryBeats(out, m.storyBeats, 'business-problem', prob, config);
  pushInteractions(out, interactions, 'business-problem', prob);

  const arch = segById(segs, 'architecture');
  out.push(slide(arch, 0, 'architecture', {
    eyebrow: '🏛️ Architecture story', title: 'The architecture', bullets: m.architectureBeats,
    diagram: meta.week != null ? ARCHITECTURE_DIAGRAMS[meta.week] : undefined,
    diagramCaption: `Walk it left to right. ${firstSentence(m.tension) || 'This is how this week’s system fits together.'}`,
    presenterTip: 'Walk the diagram node by node: components, the risky edges, the decisions. This is the evergreen lesson — take your time (≈20 min). Ask the room where the trust boundary is.',
  }));
  out.push(...teachToSlides(mteach, 'architecture', arch));
  pushStoryBeats(out, m.storyBeats, 'architecture', arch, config);
  pushInteractions(out, interactions, 'architecture', arch);

  const dec = segById(segs, 'deconstruct');
  out.push(slide(dec, 0, 'example', {
    eyebrow: '🔍 Deconstruct a real example', title: 'What works, and what fails', body: m.realExample,
    presenterTip: 'Show the good and the broken. The failure is the breakdown clip.',
  }));
  out.push(...teachToSlides(mteach, 'deconstruct', dec));
  pushStoryBeats(out, m.storyBeats, 'deconstruct', dec, config);
  pushInteractions(out, interactions, 'deconstruct', dec);

  out.push(breakSlide(segById(segs, 'reset')));

  const micro = segById(segs, 'micro-build');
  out.push(slide(micro, 0, 'microbuild', {
    eyebrow: '🛠️ Guided micro-build', title: 'Start the first component', body: m.microBuild,
    presenterTip: 'Watch the pulse. If people go “stuck”, slow down. This is the tutorial sequence.',
  }));
  out.push(...teachToSlides(mteach, 'micro-build', micro));
  // Story beats keyed 'micro-build' are opt-in (empty for every week that
  // doesn't author one) — added so a week's narrative can continue through
  // the guided-build phase instead of only checkin/business-problem/
  // architecture/deconstruct.
  pushStoryBeats(out, m.storyBeats, 'micro-build', micro, config);
  pushInteractions(out, interactions, 'micro-build', micro);

  const chal = segById(segs, 'challenge');
  pushInteractions(out, interactions, 'challenge', chal);

  const triv = segById(segs, 'trivia');
  pushInteractions(out, interactions, 'trivia', triv);

  const trailer = segById(segs, 'trailer');
  out.push(slide(trailer, 0, 'cta', {
    eyebrow: '🎟️ Thursday', title: 'Thursday we make it work', body: m.thursdayTrailer,
    presenterTip: 'Open loop. Leave them wanting Build Day. This is the social teaser.',
  }));
  pushInteractions(out, interactions, 'trailer', trailer);

  return out;
}

// -- Build Day (Thursday) -------------------------------------------------------

function buildSlides(meta: KitMeta, segs: KitSegment[], config: KitConfig): KitSlide[] {
  const wc = meta.week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === meta.week) : undefined;
  const out: KitSlide[] = [...openingSlides(meta, segs)];
  if (!wc) return out;
  const t = wc.thursday;
  const tteach = resolveTeachSlides(teachSlidesFor(meta.week, 'thursday'), config); // deep teaching slides, inserted per segment
  const interactions = resolveInteractions(defaultInteractionsFor(meta.week, 'build'), config);
  const resultPreview = resolveSlot(defaultOpeningFor(meta.week, 'build').resultPreview, config.opening.resultPreview);

  const preview = segById(segs, 'result-preview');
  if (resultPreview) {
    out.push(slide(preview, 0, 'segment', {
      eyebrow: '🎯 Result preview', title: resultPreview.title, body: resultPreview.body,
      presenterTip: 'Show the finished result first. This is the cold open of the episode.',
    }));
  }
  pushStoryBeats(out, t.storyBeats, 'result-preview', preview, config);
  pushInteractions(out, interactions, 'result-preview', preview);

  const readiness = segById(segs, 'readiness');
  out.push(slide(readiness, 0, 'segment', {
    eyebrow: '✅ Readiness check', title: 'You are ready to build if…', body: t.readinessCheck,
    presenterTip: 'Ask the room to tap “I’m here”. Anyone not set up goes to the rescue branch.',
  }));
  pushInteractions(out, interactions, 'readiness', readiness);

  const map = segById(segs, 'build-map');
  out.push(slide(map, 0, 'buildmap', {
    eyebrow: '🗺️ Build map', title: 'The checkpoints', bullets: t.buildMap,
    diagram: buildCheckpointDiagram(t.checkpoints),
    diagramCaption: 'Everyone moves together, checkpoint to checkpoint. Stuck? The rescue branch catches you up.',
    presenterTip: 'Show the safety rails: the checkpoints and the rescue branch. Nobody gets left behind. Confirm CP0 before the first prompt.',
  }));
  out.push(...teachToSlides(tteach, 'build-map', map));
  t.checkpoints.forEach((cp, i) => {
    out.push(slide(map, i + 1, 'checkpoint', {
      eyebrow: `Checkpoint ${cp.n}`, title: cp.label, body: cp.detail, checkpoint: cp,
      presenterTip: i === 0 ? 'Everyone starts here. Confirm CP0 before the first prompt.' : 'Wait for the pulse to catch up before the next checkpoint.',
    }));
  });
  pushStoryBeats(out, t.storyBeats, 'build-map', map, config);
  pushInteractions(out, interactions, 'build-map', map);

  // Guided build: the deep teaching steps when authored, else the plain prompt
  // beats — `config.prompts` only affects this fallback path (a week WITH
  // deep teach content carries its prompts inside `teach` overrides instead).
  const guided = segById(segs, 'guided-build');
  const gbTeach = teachToSlides(tteach, 'guided-build', guided);
  if (gbTeach.length) {
    out.push(...gbTeach);
  } else if (config.prompts.enabled) {
    const promptList = config.prompts.overrides ?? t.prompts;
    const cappedPrompts = config.prompts.max != null ? promptList.slice(0, config.prompts.max) : promptList;
    cappedPrompts.forEach((p, i) => {
      out.push(slide(guided, i, 'prompt', {
        eyebrow: `⌨️ Guided build · prompt ${i + 1}`, title: p.label, prompt: p,
        promptOf: `PROMPT ${i + 1} OF ${cappedPrompts.length}`,
        presenterTip: 'Paste on screen, narrate the decision (not every character), run it, show the result.',
      }));
    });
  }
  pushInteractions(out, interactions, 'guided-build', guided);

  out.push(breakSlide(segById(segs, 'reset')));

  // Failure + recovery: the deep teaching version when authored, else the two beats.
  const fail = segById(segs, 'failure');
  const failTeach = teachToSlides(tteach, 'failure', fail);
  if (failTeach.length) {
    out.push(...failTeach);
  } else {
    out.push(slide(fail, 0, 'failure', {
      eyebrow: '💥 Failure injection', title: 'Let’s break it on purpose', body: t.failureInjection,
      presenterTip: 'Do not hide the error. This controlled failure is the highest-retention moment of the show.',
    }));
    out.push(slide(fail, 1, 'recovery', {
      eyebrow: '🔧 Recover like an architect', title: 'Diagnose and fix', body: t.recovery,
      presenterTip: 'Narrate the diagnosis. This is where they learn architecture thinking, not just syntax.',
    }));
    pushStoryBeats(out, undefined, 'failure', fail, config);
  }
  pushInteractions(out, interactions, 'failure', fail);

  const demos = segById(segs, 'demos');
  out.push(slide(demos, 0, 'demos', {
    eyebrow: '🎤 Student demonstrations', title: 'Show your build', body: 'Two or three students share their screen and demo what they built. The room votes on the strongest one.',
    presenterTip: 'Call on students who tapped “I finished”. Social proof + peer learning = testimonial clips.',
  }));
  pushInteractions(out, interactions, 'demos', demos);

  const bc = segById(segs, 'broadcast');
  out.push(slide(bc, 0, 'broadcast', {
    eyebrow: '🎬 Builder Broadcast', title: 'Record your 30-second Build Proof', bullets: BUILDER_BROADCAST_PROMPTS,
    body: `This week, your proof is: ${wc.builderBroadcastFocus}.`,
    presenterTip: 'Everyone records 30–60s on their phone using these five prompts. Opt-in becomes your content pipeline.',
  }));
  pushInteractions(out, interactions, 'broadcast', bc);

  const cta = segById(segs, 'cta');
  pushInteractions(out, interactions, 'cta', cta);
  if (t.beforeAfter) {
    out.push(slide(cta, -1, 'beforeafter', {
      title: t.beforeAfter.label || 'Before → After', beforeAfter: t.beforeAfter,
      presenterTip: 'Let the two columns do the talking. This is the transformation payoff — pause here.',
    }));
  }
  out.push(slide(cta, 0, 'assignment', {
    eyebrow: 'Prove it by Friday', title: wc.assignment.title,
    brief: buildWeekBrief(meta.week, wc),
    presenterTip: 'Restate the assignment and the proof. Learn it Monday, build it Thursday, prove it by Friday.',
  }));

  return out;
}

// -- Orientation ----------------------------------------------------------------

function orientationSlides(meta: KitMeta, segs: KitSegment[], config: KitConfig): KitSlide[] {
  const out: KitSlide[] = [...openingSlides(meta, segs)];
  const interactions = resolveInteractions(defaultInteractionsFor(meta.week, 'orientation'), config);

  const welcome = segById(segs, 'welcome');
  out.push(slide(welcome, 0, 'segment', {
    eyebrow: 'Welcome', title: 'Welcome to the Accelerator', body: ORIENTATION_PLAN.welcome,
    presenterTip: 'High energy. Everyone scans the QR and checks in before you start.',
  }));
  pushStoryBeats(out, ORIENTATION_PLAN.storyBeats, 'welcome', welcome, config);
  pushInteractions(out, interactions, 'welcome', welcome);

  const segIds = ['big-picture', 'platform', 'setup'];
  ORIENTATION_PLAN.segments.forEach((os, si) => {
    const seg = segById(segs, segIds[si]);
    out.push(slide(seg, 0, 'segment', {
      eyebrow: `${os.presenter} · ${os.minutes} min`, title: os.title, bullets: os.beats,
      presenterTip: si === 0 ? 'Your hour, Ali. Quotes, data, the program promise.' : `Hand off to ${os.presenter}. Keep to ${os.minutes} minutes — the pace bar will tell you if you drift.`,
    }));
    out.push(...teachToSlides(ORIENTATION_TEACH, segIds[si], seg));
    pushStoryBeats(out, ORIENTATION_PLAN.storyBeats, segIds[si], seg, config);
    // 'setup' is handled once, below, at the close — it appears twice in this
    // function (once here as a plain content segment, once as the closing
    // wrap-up) and pushing its tagged questions in both places would double them.
    if (segIds[si] !== 'setup') pushInteractions(out, interactions, segIds[si], seg);
  });

  const close = segById(segs, 'setup');
  pushInteractions(out, interactions, 'setup', close);
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
  const config = input.config || DEFAULT_KIT_CONFIG;
  const dayKind = detectDayKind(session.title, session.session_date);
  const week = dayKind === 'orientation' ? null : parseWeek(session.title);
  const meta = buildMeta(input, dayKind, week);

  const templates = runOfShowFor(dayKind);
  const segments = toSegments(templates, meta.durationMin);

  let slides: KitSlide[];
  if (dayKind === 'orientation') slides = orientationSlides(meta, segments, config);
  else if (dayKind === 'build') slides = buildSlides(meta, segments, config);
  else slides = architectureSlides(meta, segments, config);
  slides = applyKitConfig(slides, config);

  return {
    meta,
    rules: PHONE_RULES,
    segments,
    slides,
    builderBroadcastPrompts: BUILDER_BROADCAST_PROMPTS,
    totalMinutes: meta.durationMin,
  };
}
