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
  WEEK_CLASS_CONTENT, ORIENTATION_PLAN, ClassPrompt, StoryBeat, DayKind,
} from '../../data/classSessionPlan';
import { teachSlidesFor, ORIENTATION_TEACH, TeachSlide, EvidenceClaim } from '../../data/classTeachContent';
import { detectDayKind, parseWeek, BuildKitSpecInput, KitSessionInput } from './kitSpec';
import { buildKitSpec, defaultInteractionsFor } from './kitSpecDaySlides';
import { DEFAULT_KIT_CONFIG, StoryBeatOverride, InteractionPlacement } from './kitConfig';

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

  return { dayKind, week, teach, prompts, interactions, storyBeats, evidence };
}
