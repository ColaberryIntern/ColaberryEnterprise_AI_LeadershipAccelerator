/**
 * weekPack.ts — the per-week content pack shape.
 *
 * Weeks 1-3 grew organically: teach slides live in classTeachContent.ts /
 * classTeachWeeks.ts, while the narrative layer (hook, story beats, extra
 * survey questions, before/after) lives on WeekClassContent in
 * classSessionPlan.ts. That split was fine for three weeks and is not fine for
 * twelve — classSessionPlan.ts is already over the file-size ceiling, and nine
 * weeks of narrative would double it.
 *
 * A WeekPack keeps one week's ENTIRE authored contribution — both days' teach
 * slides and both days' narrative — in a single file, so a week can be written,
 * reviewed, and revised in isolation. weekPacks.ts collects them and the deck
 * builder prefers a pack when one exists, falling back to the original sources
 * for weeks that do not have one. Nothing about weeks 1-3 changes.
 *
 * Pure types + data. No imports beyond types, so it stays dependency-free.
 */
import type { TeachSlide } from './classTeachContent';
import type { StoryBeat, Interaction } from './classSessionPlan';

/** A survey question plus where on the run-of-show timeline it fires. */
export type PlacedInteraction = Interaction & {
  segment: string;
  eyebrow?: string;
  title?: string;
  presenterTip?: string;
};

/** The narrative layer for one class day — everything that is not a teach slide. */
export interface DayNarrative {
  /** Full-screen single-statement cold open (Architecture Day only). */
  hook?: { headline: string; caption: string };
  /** Change-of-pace story slides, keyed by the run-of-show segment id they
   *  are spliced into. */
  storyBeats?: Record<string, StoryBeat[]>;
  /** Survey questions beyond the fixed design-choice / trivia slots. */
  extraInteractions?: PlacedInteraction[];
  /** Story Mode transformation payoff (Build Day only). */
  beforeAfter?: { label?: string; before: string[]; after: string[] };
}

export interface DayPack extends DayNarrative {
  teach: TeachSlide[];
}

export interface WeekPack {
  week: number;
  /** One line naming this week's place in the 12-week arc — the through-line
   *  that makes the weeks read as one story rather than twelve lessons. */
  arcBeat: string;
  monday: DayPack;
  thursday: DayPack;
}
