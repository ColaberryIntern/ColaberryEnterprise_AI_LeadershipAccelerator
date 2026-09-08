/**
 * Claude Studio — the 13-week content set (weeks 0-12) and its lookups.
 *
 * Split across three files to stay inside the repo's file-size ceiling, exactly
 * like `data/architectMindsetWeeks/`. This module is the only import surface;
 * nothing outside should reach into the per-range files directly.
 */
import { ClaudeStudioWeek } from './types';
import { STUDIOS_00_TO_04 } from './weeks00to04';
import { STUDIOS_05_TO_08 } from './weeks05to08';
import { STUDIOS_09_TO_12 } from './weeks09to12';

export * from './types';

/** All 13 studios, ordered by week. */
export const CLAUDE_STUDIOS: ClaudeStudioWeek[] = [
  ...STUDIOS_00_TO_04,
  ...STUDIOS_05_TO_08,
  ...STUDIOS_09_TO_12,
];

/** The week certification preparation becomes active (Part 3F of the brief). */
export const CERTIFICATION_START_WEEK = 7;

/** Lookup by week number. Returns undefined for a week with no studio. */
export function studioForWeek(week: number): ClaudeStudioWeek | undefined {
  return CLAUDE_STUDIOS.find((s) => s.week === week);
}

/** Lookup by stable content key, e.g. 'problem-framing'. */
export function studioByKey(key: string): ClaudeStudioWeek | undefined {
  return CLAUDE_STUDIOS.find((s) => s.key === key);
}

/**
 * Every documented deviation from the source curriculum brief, for the
 * completion report and the instructor view. An adaptation that is not recorded
 * here is a defect, not a shortcut.
 */
export function adaptations(): Array<{ week: number; title: string; adaptation: string }> {
  return CLAUDE_STUDIOS
    .filter((s): s is ClaudeStudioWeek & { adaptation: string } => !!s.adaptation)
    .map((s) => ({ week: s.week, title: s.title, adaptation: s.adaptation }));
}
