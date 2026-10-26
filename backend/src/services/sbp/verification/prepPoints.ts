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

/**
 * WHAT HANDING IN THE TEXT PAYS — zero by default, since 2026-10-24.
 *
 * Ali, looking at the "Submit · +40 pts" button on PREP-1: "The points should
 * be moved from here. This is not a good place to collect points. Set up a
 * points system where they get points for the 1st video in each section."
 *
 * The prep week paid 40 for pasting text into a box. The work that box stands
 * for is the video, and the video is now paid directly — 30 for recording a
 * type the first time, 15 more for sharing it. Paying both would pay twice for
 * one piece of work and leave the incentive pointed at the box.
 *
 * A SEPARATE KEY RATHER THAN ZEROING `demo`. That row also prices the `demo`
 * CARD type elsewhere in the curriculum; zeroing it to settle a prep question
 * would silently unprice something nobody was talking about.
 *
 * A ROW AT ZERO, NOT A DELETED AWARD. `prepPointsMap` leaves a zero-priced task
 * out of the map, and every consumer already reads absence as "no badge" — so
 * the button stops advertising points with no UI change at all. Turning it back
 * on is one admin edit rather than a deploy.
 *
 * Demo Day is untouched. It is a live presentation a staff member marks, not a
 * video in the portfolio, so it keeps pricing from `presentation`.
 */
export const PREP_HANDIN_XP_KEY = 'prep_handin';

export const PREP_STORY_IDS = ['PREP-1', 'PREP-2', 'PREP-3', 'PREP-4', 'PREP-5', 'PREP-6'] as const;
export type PrepStoryId = typeof PREP_STORY_IDS[number];

/** The one task staff mark rather than the student evidencing. */
export const DEMO_DAY_STORY_ID: PrepStoryId = 'PREP-6';

export function isPrepStory(storyId: string | null | undefined): storyId is PrepStoryId {
  return !!storyId && (PREP_STORY_IDS as readonly string[]).includes(storyId);
}

/** Which points_config row pays a given prep task. */
export function prepXpKey(storyId: PrepStoryId): string {
  return storyId === DEMO_DAY_STORY_ID ? PRESENTATION_XP_KEY : PREP_HANDIN_XP_KEY;
}

/**
 * The verb a tile's button uses for a prep task, or null for anything else.
 * A story is BUILT and verified from the repo; a prep task is handed in
 * ("Submit"), and Demo Day is marked by staff ("Demo Day") — the button must
 * not promise a build where there is nothing to build. The Projects page
 * mapper (frontend DemoEvidencePanel) makes the same call from the same ids;
 * this is the server's copy for the Today feed item and the Classroom rail,
 * which price a task before the frontend ever sees it. Pure.
 */
export function prepCtaVerb(storyId: string | null | undefined): 'Submit' | 'Demo Day' | null {
  if (!isPrepStory(storyId)) return null;
  return storyId === DEMO_DAY_STORY_ID ? 'Demo Day' : 'Submit';
}

/**
 * `story_id → points` for every prep task. Reads the two rows once, not per
 * task. A row that is missing or priced at 0 prices its tasks at nothing —
 * they are left OUT of the map, which every consumer already treats as
 * "no badge".
 */
export async function prepPointsMap(): Promise<Map<string, number>> {
  const [handIn, presentation] = await Promise.all([
    getTypeXp(PREP_HANDIN_XP_KEY), getTypeXp(PRESENTATION_XP_KEY),
  ]);
  const m = new Map<string, number>();
  for (const id of PREP_STORY_IDS) {
    const rate = id === DEMO_DAY_STORY_ID ? presentation.builder : handIn.builder;
    if (rate > 0) m.set(id, rate);
  }
  return m;
}
