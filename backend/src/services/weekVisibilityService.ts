import WeekItemVisibility, { ACTIVITY_SEQUENCE, WeekItemType } from '../models/WeekItemVisibility';
import CurriculumCourseLink from '../models/CurriculumCourseLink';

export interface WeekVisibilityMap {
  [itemType: string]: { visible: boolean; revealed_at: Date | null };
}

export interface WeekContentData {
  week_number: number;
  course_link: { url: string | null; status: string; title: string | null } | null;
  visibility: WeekVisibilityMap;
  next_unrevealed: WeekItemType | null;
}

// Called when a student first opens a week. Idempotent — safe to call on every page load.
// Seeds warm_up as visible; all subsequent activities start hidden.
export async function initWeekVisibility(
  enrollmentId: string,
  weekNumber: number
): Promise<void> {
  for (const itemType of ACTIVITY_SEQUENCE) {
    await WeekItemVisibility.findOrCreate({
      where: { enrollment_id: enrollmentId, week_number: weekNumber, item_type: itemType },
      defaults: {
        visible: itemType === 'warm_up',
        revealed_at: itemType === 'warm_up' ? new Date() : null,
      },
    });
  }
}

// Returns the current visibility state for all activities in a week.
export async function getWeekVisibility(
  enrollmentId: string,
  weekNumber: number
): Promise<WeekVisibilityMap> {
  const rows = await WeekItemVisibility.findAll({
    where: { enrollment_id: enrollmentId, week_number: weekNumber },
  });

  const map: WeekVisibilityMap = {};
  for (const item of ACTIVITY_SEQUENCE) {
    const row = rows.find((r) => r.item_type === item);
    map[item] = row
      ? { visible: row.visible, revealed_at: row.revealed_at }
      : { visible: false, revealed_at: null };
  }
  return map;
}

// Called after a student completes an activity. Reveals the next item in the sequence.
// Idempotent — revealing an already-visible item is a no-op.
export async function revealNextActivity(
  enrollmentId: string,
  weekNumber: number,
  completedItem: WeekItemType
): Promise<{ revealed: WeekItemType | null; visibility: WeekVisibilityMap }> {
  const completedIndex = ACTIVITY_SEQUENCE.indexOf(completedItem);
  const nextItem =
    completedIndex >= 0 && completedIndex < ACTIVITY_SEQUENCE.length - 1
      ? ACTIVITY_SEQUENCE[completedIndex + 1]
      : null;

  if (nextItem) {
    const [row] = await WeekItemVisibility.findOrCreate({
      where: { enrollment_id: enrollmentId, week_number: weekNumber, item_type: nextItem },
      defaults: { visible: true, revealed_at: new Date() },
    });

    if (!row.visible) {
      await row.update({ visible: true, revealed_at: new Date(), updated_at: new Date() });
    }
  }

  const visibility = await getWeekVisibility(enrollmentId, weekNumber);
  return { revealed: nextItem, visibility };
}

// Returns full week data: course link + visibility map + next unrevealed item.
export async function getWeekData(
  enrollmentId: string,
  weekNumber: number
): Promise<WeekContentData> {
  await initWeekVisibility(enrollmentId, weekNumber);

  const [courseLink, visibility] = await Promise.all([
    CurriculumCourseLink.findOne({ where: { module_number: weekNumber } }),
    getWeekVisibility(enrollmentId, weekNumber),
  ]);

  const nextUnrevealed =
    ACTIVITY_SEQUENCE.find((item) => !visibility[item]?.visible) ?? null;

  return {
    week_number: weekNumber,
    course_link: courseLink
      ? { url: courseLink.course_url, status: courseLink.link_status, title: courseLink.course_title }
      : null,
    visibility,
    next_unrevealed: nextUnrevealed,
  };
}
