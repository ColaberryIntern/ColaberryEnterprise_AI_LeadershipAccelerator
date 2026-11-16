import { NAV_GROUPS } from '../Layout/adminNav';
import { PLACEMENT_SECTION } from '../campus/hq/hqModel';

/**
 * The Career Prep floor's number, the same rule buildHq uses (groups number from groups + 1 down),
 * so the room's "‹ Floor n" and trail always agree with the tower. Never a constant. Null if the
 * Placement group is not in the sidebar.
 */
export function careerPrepFloorNum(groups: ReadonlyArray<{ section: string }> = NAV_GROUPS): string | null {
  const i = groups.findIndex((g) => g.section === PLACEMENT_SECTION);
  return i < 0 ? null : String(groups.length + 1 - i);
}
