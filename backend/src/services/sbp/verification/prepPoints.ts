/**
 * prepPoints — what a demo-prep task on a build is worth.
 *
 * Ali, 2026-09-14: "Demos should provide points as well." Demo-prep tasks
 * (`PREP-1`…`PREP-6`, see buildSchedule.prepTasks) were deliberately left
 * unpaid by storyPoints because they are not stories and the repo verifier
 * never judges them. They are paid now — but by DIFFERENT evidence, so they
 * are priced from different rows:
 *
 *   PREP-1…5  the student submits evidence (a narrative, a run-through
 *             recording, slides, rehearsal notes, the final video), and the
 *             submission verifies the task — `points_config` row `demo`.
 *   PREP-6    "Present at Demo Day" — only a member of staff in the room can
 *             verify that, so staff mark it — `points_config` row
 *             `presentation`.
 *
 * Both rows already existed with builder_xp 40 and 60; nothing here invents a
 * number. Flat per-task rates, not a per-build budget: the story budget is a
 * whole-capstone figure split across however many stories the plan has, but
 * there are always exactly six prep tasks, so a flat rate is the honest one.
 *
 * Fails closed exactly like storyPoints: a missing or zero row prices nothing,
 * and an unpriced task shows no badge rather than "0 pts".
 */
import { getTypeXp } from '../../progression/pointsConfigService';

/** `points_config` keys. */
export const DEMO_XP_KEY = 'demo';
export const PRESENTATION_XP_KEY = 'presentation';

export const PREP_STORY_IDS = ['PREP-1', 'PREP-2', 'PREP-3', 'PREP-4', 'PREP-5', 'PREP-6'] as const;
export type PrepStoryId = typeof PREP_STORY_IDS[number];

/** The one task staff mark rather than the student evidencing. */
export const DEMO_DAY_STORY_ID: PrepStoryId = 'PREP-6';

export function isPrepStory(storyId: string | null | undefined): storyId is PrepStoryId {
  return !!storyId && (PREP_STORY_IDS as readonly string[]).includes(storyId);
}

/** Which points_config row pays a given prep task. */
export function prepXpKey(storyId: PrepStoryId): string {
  return storyId === DEMO_DAY_STORY_ID ? PRESENTATION_XP_KEY : DEMO_XP_KEY;
}

/**
 * `story_id → points` for every prep task. Reads the two rows once, not per
 * task. A row that is missing or priced at 0 prices its tasks at nothing —
 * they are left OUT of the map, which every consumer already treats as
 * "no badge".
 */
export async function prepPointsMap(): Promise<Map<string, number>> {
  const [demo, presentation] = await Promise.all([getTypeXp(DEMO_XP_KEY), getTypeXp(PRESENTATION_XP_KEY)]);
  const m = new Map<string, number>();
  for (const id of PREP_STORY_IDS) {
    const rate = id === DEMO_DAY_STORY_ID ? presentation.builder : demo.builder;
    if (rate > 0) m.set(id, rate);
  }
  return m;
}
