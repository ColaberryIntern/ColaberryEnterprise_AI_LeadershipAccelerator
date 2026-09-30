/**
 * milestoneLadder — the build ladder as Ali decided it on 2026-09-16
 * (docs/POINTS_LADDER_DECISIONS.md). PURE: no I/O, exhaustively unit-tested.
 *
 * A band above AI Enabled is earned by finishing the things the program asks
 * for, each verified by a deterministic signal a student can see:
 *
 *   curriculum_complete      every graded card in all 12 weeks
 *   project_complete (x3)    every story of a published plan verified
 *   certification_approved   a certificate the student uploaded and staff approved
 *
 * The first four are the PROGRAM MILESTONES and count in any order:
 *
 *   rank 1  AI Builder I        1 of 4
 *   rank 2  AI Builder II       2 of 4
 *   rank 3  AI Builder III      3 of 4
 *   rank 4  AI Builder IV       4 of 4  ("Program Graduate")
 *   rank 5  AI Architect        Program Graduate + certification approved
 *   rank 6  Senior AI Architect manual only (a case study at operational_result,
 *                               or staff nomination) — never computed here
 *
 * WHY MILESTONES AND NOT EVIDENCE COUNTS. The previous ladder (seeders.BUILDER_LEVELS,
 * nine ranks) gated rank 2 on two `artifact` evidence rows that no live path
 * could produce, so nobody ever passed rank 1 — 416 students at rank 0, 26 at
 * rank 1, none above (audit of 2026-09-16). Its gates could not be explained to
 * a student in a sentence. These can: "two of your four milestones are done".
 *
 * WHY THE NUMBERS ARE CODE, NOT `builder_levels` ROWS. 1/2/3/4 is the count of
 * milestones, a structural fact of the program, not a tunable threshold. The
 * legacy table stays for the flag-off path and for history.
 *
 * INVARIANTS (test-locked):
 *   - points never appear here: engagement points cannot reach a build band.
 *   - rank never exceeds 5 from computation; 6 is manual.
 *   - the rank function is monotonic in milestones and in certification.
 *   - a rank, once held, is never lowered by this module (latch is applied by
 *     the caller through `latchRank`).
 */

export const MILESTONE_TYPES = ['curriculum_complete', 'project_complete', 'certification_approved'] as const;
export type MilestoneType = typeof MILESTONE_TYPES[number];

/** The four program milestones that move AI Builder I → IV. Certification is separate. */
export const PROGRAM_MILESTONE_TARGET = 4;
/** Projects that count toward the four (curriculum is the fourth). */
export const PROJECT_MILESTONE_TARGET = 3;
/** The curriculum's length in graded weeks. */
export const CURRICULUM_WEEKS = 12;

export interface MilestoneRung {
  slug: string;
  rank: number;
  rungName: string;
  bandSlug: 'builder' | 'architect';
  /** Program milestones required (curriculum + projects, any order). */
  minMilestones: number;
  requiresCertification: boolean;
  /** True for a rung this module never computes; staff set it by hand. */
  manualOnly: boolean;
  /** Shown beside the name on rung IV. */
  label?: string;
}

export const MILESTONE_RUNGS: readonly MilestoneRung[] = Object.freeze([
  { slug: 'builder_i',        rank: 1, rungName: 'AI Builder I',        bandSlug: 'builder',   minMilestones: 1, requiresCertification: false, manualOnly: false },
  { slug: 'builder_ii',       rank: 2, rungName: 'AI Builder II',       bandSlug: 'builder',   minMilestones: 2, requiresCertification: false, manualOnly: false },
  { slug: 'builder_iii',      rank: 3, rungName: 'AI Builder III',      bandSlug: 'builder',   minMilestones: 3, requiresCertification: false, manualOnly: false },
  { slug: 'builder_iv',       rank: 4, rungName: 'AI Builder IV',       bandSlug: 'builder',   minMilestones: 4, requiresCertification: false, manualOnly: false, label: 'Program Graduate' },
  // Distinct from the legacy `architect` / `architect_candidate` slugs, which
  // bandLadder still maps for rows promoted under the old ladder.
  { slug: 'ai_architect',        rank: 5, rungName: 'AI Architect',        bandSlug: 'architect', minMilestones: 4, requiresCertification: true,  manualOnly: false },
  { slug: 'senior_ai_architect', rank: 6, rungName: 'Senior AI Architect', bandSlug: 'architect', minMilestones: 4, requiresCertification: true,  manualOnly: true },
]);

/** The entry state every learner starts in. Not a promotion. */
export const ENTRY_RANK = 0;
export const ENTRY_SLUG = 'builder';

const RUNG_BY_SLUG = new Map(MILESTONE_RUNGS.map((r) => [r.slug, r]));
const RUNG_BY_RANK = new Map(MILESTONE_RUNGS.map((r) => [r.rank, r]));

export function rungForSlug(slug: string | null | undefined): MilestoneRung | null {
  return slug ? RUNG_BY_SLUG.get(slug) ?? null : null;
}
export function rungForRank(rank: number | null | undefined): MilestoneRung | null {
  return typeof rank === 'number' ? RUNG_BY_RANK.get(rank) ?? null : null;
}

export interface MilestoneState {
  curriculumComplete: boolean;
  /** Distinct completed projects. Only the first PROJECT_MILESTONE_TARGET count. */
  projectsComplete: number;
  certificationApproved: boolean;
}

/** How many of the four program milestones are held. Capped, so a 5th project
 *  never counts twice and can never substitute for the curriculum. */
export function programMilestonesHeld(s: MilestoneState): number {
  const projects = Math.min(PROJECT_MILESTONE_TARGET, Math.max(0, Math.trunc(s.projectsComplete || 0)));
  return (s.curriculumComplete ? 1 : 0) + projects;
}

/**
 * The highest COMPUTABLE rank the milestones justify. Never returns a
 * manualOnly rung. Pure and monotonic.
 */
export function rankForMilestones(s: MilestoneState): number {
  const held = programMilestonesHeld(s);
  let best = ENTRY_RANK;
  for (const rung of MILESTONE_RUNGS) {
    if (rung.manualOnly) continue;
    if (held < rung.minMilestones) continue;
    if (rung.requiresCertification && !s.certificationApproved) continue;
    best = Math.max(best, rung.rank);
  }
  return best;
}

/**
 * Decision D5: a rung, once earned, is kept. The caller passes the rank the
 * learner already holds (on either ladder, mapped through `legacyRankToMilestoneRank`
 * first) and the freshly computed one; the result is what to persist.
 */
export function latchRank(currentRank: number, computedRank: number): number {
  const cur = Number.isFinite(currentRank) ? Math.max(0, Math.trunc(currentRank)) : 0;
  const next = Number.isFinite(computedRank) ? Math.max(0, Math.trunc(computedRank)) : 0;
  return Math.max(cur, next);
}

/**
 * Where a learner promoted under the nine-rank evidence ladder lands on this
 * one, so the backfill honours D5 (never lower anyone). Read the old NAMES:
 * builder ranks fold onto AI Builder I–IV, the two architect ranks onto the
 * architect rungs. Nobody was above legacy rank 1 in production, so in practice
 * this maps 26 people to AI Builder I.
 */
export const LEGACY_SLUG_TO_MILESTONE_RANK: Record<string, number> = {
  builder: 0,
  junior_builder: 1,
  practitioner: 2,
  developer: 3,
  senior_developer: 4,
  engineer: 4,
  senior_engineer: 4,
  architect_candidate: 5,
  architect: 6,
};

export function legacyRankToMilestoneRank(levelSlug: string | null | undefined, rank: number | null | undefined): number {
  if (levelSlug && levelSlug in LEGACY_SLUG_TO_MILESTONE_RANK) return LEGACY_SLUG_TO_MILESTONE_RANK[levelSlug];
  // A milestone-ladder slug is already on this ladder.
  const rung = rungForSlug(levelSlug);
  if (rung) return rung.rank;
  // Unknown slug: trust the rank only as far as this ladder goes.
  const r = typeof rank === 'number' && Number.isFinite(rank) ? Math.trunc(rank) : 0;
  return Math.max(0, Math.min(MILESTONE_RUNGS.length, r));
}

export interface MilestoneGap {
  key: 'curriculum' | 'projects' | 'certification';
  have: number;
  need: number;
  /** Student-facing sentence, e.g. "Projects verified — 1 of 3". */
  text: string;
}

/**
 * What still stands between the learner and the NEXT computable rung, in the
 * order a student would act on it. Empty at AI Architect (rank 5) — Senior is
 * not something to work toward from a checklist.
 */
export function milestoneGaps(s: MilestoneState, currentRank: number): MilestoneGap[] {
  const next = rungForRank(Math.max(0, Math.trunc(currentRank)) + 1);
  if (!next || next.manualOnly) return [];
  const gaps: MilestoneGap[] = [];
  const held = programMilestonesHeld(s);
  if (held < next.minMilestones) {
    // Name the concrete things left rather than "milestones 2 of 4": a student
    // can go and do a project; they cannot go and do "a milestone".
    if (!s.curriculumComplete) {
      gaps.push({ key: 'curriculum', have: 0, need: 1, text: 'Curriculum complete — every graded card in all 12 weeks' });
    }
    const projects = Math.min(PROJECT_MILESTONE_TARGET, Math.max(0, s.projectsComplete));
    if (projects < PROJECT_MILESTONE_TARGET) {
      gaps.push({ key: 'projects', have: projects, need: PROJECT_MILESTONE_TARGET, text: `Projects verified — ${projects} of ${PROJECT_MILESTONE_TARGET}` });
    }
  }
  if (next.requiresCertification && !s.certificationApproved) {
    gaps.push({ key: 'certification', have: 0, need: 1, text: 'Certification approved by staff' });
  }
  return gaps;
}

/** The rung display name for a rank on this ladder; '' for the entry state. */
export function rungNameForRank(rank: number): string {
  const rung = rungForRank(rank);
  if (!rung) return '';
  return rung.label ? `${rung.rungName} · ${rung.label}` : rung.rungName;
}
