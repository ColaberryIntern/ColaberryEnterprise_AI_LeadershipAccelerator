/**
 * kitConfigDefaults.ts — resolves the AUTHORED default content for a session,
 * so the Customize UI can show what is actually running today, not just a
 * "using defaults" placeholder. Pure (no DB/I/O): the caller (controller)
 * fetches the session row and passes its title/date in.
 *
 * Evidence is aggregated across every rendered teach slide (the same shape the
 * readiness report already uses in sessionKitDocService.ts), so it is computed
 * by building a real spec with DEFAULT_KIT_CONFIG and reading its slides back —
 * every other category is read directly from the source data.
 */
import {
  WEEK_CLASS_CONTENT, ORIENTATION_PLAN, ClassPrompt, StoryBeat, DayKind, BuildCheckpoint,
} from '../../data/classSessionPlan';
import { teachSlidesFor, ORIENTATION_TEACH, TeachSlide, EvidenceClaim } from '../../data/classTeachContent';
import { detectDayKind, parseWeek, BuildKitSpecInput, KitSessionInput } from './kitSpec';
import { buildKitSpec, defaultInteractionsFor, defaultOpeningFor, DefaultOpening } from './kitSpecDaySlides';
import { DEFAULT_KIT_CONFIG, StoryBeatOverride, InteractionPlacement } from './kitConfig';
import { runOfShowFor } from './runOfShow';

/** A checkpoint pin at its real render position — `segment` is hardcoded to
 * `'build-map'` here to mirror the literal segment kitSpecDaySlides.ts's
 * own buildSlides() attaches checkpoint slides to (not carried on
 * BuildCheckpoint itself, which has no segment field). */
export interface CheckpointLandmark extends BuildCheckpoint { segment: string }
/** The templated "Reset" break window — identical every week (fixed show
 * timing, not per-session authored content); null for Orientation, which
 * has no break in its run-of-show template. */
export interface BreakLandmark { segment: string; startMin: number; endMin: number; label: string }

export interface KitConfigDefaults {
  dayKind: DayKind;
  week: number | null;
  /** Deep-teaching ("Lessons") slides authored/generated for this session's day. */
  teach: TeachSlide[];
  /** Build Bay prompts — only non-empty on Build Day. */
  prompts: ClassPrompt[];
  /** Survey questions (polls + trivia) — an ordinary segment-taggable list,
   * the same shape config.interactions.overrides uses. */
  interactions: InteractionPlacement[];
  storyBeats: StoryBeatOverride[];
  evidence: EvidenceClaim[];
  /** The authored default opening content (cold-open/hook/result-preview). */
  opening: DefaultOpening;
  /** Read-only timeline landmarks (Phase 4/5) — never part of KitConfig,
   * never editable, never persisted. Checkpoints only populate on Build Day;
   * breakSegment is null for Orientation (no 'break' segment in its
   * run-of-show template). */
  checkpoints: CheckpointLandmark[];
  breakSegment: BreakLandmark | null;
}

function flattenStoryBeats(map: Record<string, StoryBeat[]> | undefined): StoryBeatOverride[] {
  if (!map) return [];
  return Object.entries(map).flatMap(([segment, beats]) => beats.map((b) => ({ ...b, segment })));
}

export function getKitConfigDefaults(session: KitSessionInput): KitConfigDefaults {
  const dayKind = detectDayKind(session.title, session.session_date);
  const week = dayKind === 'orientation' ? null : parseWeek(session.title);
  const wc = week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === week) : undefined;

  const teach =
    dayKind === 'orientation' ? ORIENTATION_TEACH
      : dayKind === 'architecture' ? teachSlidesFor(week, 'monday')
        : teachSlidesFor(week, 'thursday');

  const prompts = dayKind === 'build' && wc ? wc.thursday.prompts : [];

  const interactions = defaultInteractionsFor(week, dayKind);
  const opening = defaultOpeningFor(week, dayKind);

  const storyBeats = flattenStoryBeats(
    dayKind === 'orientation' ? ORIENTATION_PLAN.storyBeats
      : dayKind === 'architecture' && wc ? wc.monday.storyBeats
        : undefined, // Build Day has no authored story beats yet (kitSpecDaySlides.ts comment)
  );

  const input: BuildKitSpecInput = {
    session, cohortName: '', checkinUrl: '', qrSvg: '', meetLink: null, config: DEFAULT_KIT_CONFIG,
  };
  const defaultSpec = buildKitSpec(input);
  const evidence = defaultSpec.slides.flatMap((s) => s.evidence || []);

  // Mirrors kitSpecDaySlides.ts's own buildSlides() call site, which
  // attaches every checkpoint slide to the 'build-map' segment.
  const checkpoints: CheckpointLandmark[] =
    dayKind === 'build' && wc ? wc.thursday.checkpoints.map((cp) => ({ ...cp, segment: 'build-map' })) : [];
  const breakTemplate = runOfShowFor(dayKind).find((s) => s.mode === 'break');
  const breakSegment: BreakLandmark | null = breakTemplate
    ? { segment: breakTemplate.id, startMin: breakTemplate.startMin, endMin: breakTemplate.endMin, label: breakTemplate.label }
    : null;

  return { dayKind, week, teach, prompts, interactions, storyBeats, evidence, opening, checkpoints, breakSegment };
}
