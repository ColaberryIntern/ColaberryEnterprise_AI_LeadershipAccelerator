/**
 * weekPacks.ts — the registry of per-week content packs (see weekPack.ts).
 *
 * A week listed here supplies its own teach slides AND its own narrative layer
 * from a single file. The deck builder prefers a pack when one exists and
 * otherwise falls back to the original sources, so weeks without a pack behave
 * exactly as they did before this module existed.
 *
 * Deliberately import-only + lookup helpers: no logic, so adding a week is a
 * one-line change and two files can never disagree about who owns a week.
 */
import type { TeachSlide } from './classTeachContent';
import type { WeekPack, DayNarrative } from './weekPack';

// Weeks 4-12 packs are registered here as they land. Weeks 1-3 deliberately
// keep their original layout (classTeachContent.ts / classTeachWeek3*.ts +
// classSessionPlan.ts) — they are taught and proven, and migrating them would
// be churn with no teaching benefit.
import { WEEK4_PACK } from './weeks/week4';
import { WEEK5_PACK } from './weeks/week5';
import { WEEK6_PACK } from './weeks/week6';
import { WEEK7_PACK } from './weeks/week7';
import { WEEK8_PACK } from './weeks/week8';
import { WEEK9_PACK } from './weeks/week9';
import { WEEK10_PACK } from './weeks/week10';
import { WEEK11_PACK } from './weeks/week11';
import { WEEK12_PACK } from './weeks/week12';

const PACKS: WeekPack[] = [
  WEEK4_PACK, WEEK5_PACK, WEEK6_PACK, WEEK7_PACK, WEEK8_PACK,
  WEEK9_PACK, WEEK10_PACK, WEEK11_PACK, WEEK12_PACK,
];

/** The pack for a week, or undefined when that week has none. */
export function weekPack(week: number | null): WeekPack | undefined {
  if (week == null) return undefined;
  return PACKS.find((p) => p.week === week);
}

/** Teach slides from the pack for this week+day, or undefined to fall back. */
export function packTeach(week: number | null, day: 'monday' | 'thursday'): TeachSlide[] | undefined {
  const p = weekPack(week);
  if (!p) return undefined;
  const slides = p[day].teach;
  return slides && slides.length ? slides : undefined;
}

/** Narrative layer from the pack for this week+day, or undefined to fall back. */
export function packNarrative(week: number | null, day: 'monday' | 'thursday'): DayNarrative | undefined {
  const p = weekPack(week);
  return p ? p[day] : undefined;
}

/** Every week that currently ships a pack — used by tests and the readiness report. */
export function packedWeeks(): number[] {
  return PACKS.map((p) => p.week).sort((a, b) => a - b);
}
