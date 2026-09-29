import type { BuildPlan } from '../sbp/planContract';
import {
  DIMENSION_LABELS, UNDERSTANDING_DIMENSIONS, itemsFor,
  type ProjectUnderstanding, type UnderstandingDimension,
} from './projectUnderstanding';
import { phraseForBrief, type BuildIntake } from './buildIntakeAdapter';

/**
 * What the customer said, against what the plan contains.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 *     "I heard from Swati today that she gave the process very detailed
 *      requirements and it missed some of them. I want to show all the
 *      requirements through this process."  (Ali, 2026-09-29)
 *
 * Two silent cuts were fixed at source: the intake stopped clipping a detailed
 * dimension at 4,000 characters, and the decomposer stopped being told to
 * compress to the tier band. Neither of those PROVES the model complied. The
 * only thing that can is comparing what went in against what came out, and
 * nothing did — every one of the gate's seventeen rules reads the plan against
 * ITSELF (`must_uncovered` means "a requirement IN THE PLAN has no story"), so
 * a requirement that never entered the plan is invisible to all of them.
 *
 * ── THE GRANULARITY IS DIMENSIONS, AND THAT IS DELIBERATE ──────────────────
 *
 * A plan requirement cites `from_dimensions`, not item ids, and `planContract`
 * explains why: truth items are a JSONB array with no stable id, so "citing a
 * per-item id would be more precise and would break the first time a student
 * corrected a word."
 *
 * So this reports at the honest granularity available: per dimension, what the
 * customer said and which requirements came from it. It does NOT claim to match
 * item to requirement — doing that would need a model call, and a wrong match
 * is worse than an admitted gap, because it reports coverage that is not there.
 * `stated` carries the items verbatim so a human can do the last step by eye,
 * which is exactly what Ali asked to be able to do.
 */

export interface DimensionCoverage {
  dimension: string;
  label: string;
  /** What the customer actually said here, verbatim. */
  stated: string[];
  /** Requirements in the plan citing this dimension. */
  requirement_ids: string[];
  /**
   * They said something here and NOTHING in the plan cites it. Not proof a
   * requirement was lost — a requirement can omit its provenance — but it is
   * the place to look first.
   */
  unaccounted: boolean;
}

export interface RequirementCoverage {
  stated_items: number;
  planned_requirements: number;
  dimensions: DimensionCoverage[];
  /**
   * Dimensions the customer filled in that no requirement cites. The headline:
   * an empty array is the clean answer.
   */
  unaccounted_dimensions: string[];
  /**
   * Plan requirements citing no dimension at all. Not a fault — provenance is
   * optional and absence means "unknown", never "caused by nothing" — but it
   * separates what the customer asked for from what the model added.
   */
  requirements_without_provenance: string[];
  /** Items the intake could not carry, straight from the adapter. Never silent. */
  dropped: BuildIntake['dropped'];
}

/**
 * Compare an understanding against the plan built from it.
 *
 * Pure: no database, no model, no I/O. Everything it reports is derived from
 * the two documents it is handed, which is what makes it safe to run on every
 * generation and cheap enough to show on the review screen.
 */
export function requirementCoverage(params: {
  understanding: ProjectUnderstanding;
  plan: BuildPlan | null;
  dropped?: BuildIntake['dropped'];
}): RequirementCoverage {
  const { understanding, plan } = params;
  const requirements = plan?.requirements ?? [];

  // Dimension -> the requirements citing it. Built once; a plan with 80
  // requirements against 20 dimensions should not be a nested scan.
  const citedBy = new Map<string, string[]>();
  const withoutProvenance: string[] = [];
  for (const req of requirements) {
    const dims = req.from_dimensions ?? [];
    if (!dims.length) {
      withoutProvenance.push(req.id);
      continue;
    }
    for (const d of dims) {
      const list = citedBy.get(d);
      if (list) list.push(req.id);
      else citedBy.set(d, [req.id]);
    }
  }

  const dimensions: DimensionCoverage[] = [];
  let statedItems = 0;

  for (const dimension of UNDERSTANDING_DIMENSIONS as readonly UnderstandingDimension[]) {
    const items = itemsFor(understanding, dimension);
    if (!items.length) continue;
    statedItems += items.length;

    const requirementIds = citedBy.get(dimension) ?? [];
    dimensions.push({
      dimension,
      label: DIMENSION_LABELS[dimension],
      stated: items.map(phraseForBrief),
      requirement_ids: requirementIds,
      // Only meaningful once there IS a plan. Before one exists, nothing is
      // unaccounted for; it simply has not been decomposed yet.
      unaccounted: requirements.length > 0 && requirementIds.length === 0,
    });
  }

  return {
    stated_items: statedItems,
    planned_requirements: requirements.length,
    dimensions,
    unaccounted_dimensions: dimensions.filter((d) => d.unaccounted).map((d) => d.dimension),
    requirements_without_provenance: withoutProvenance,
    dropped: params.dropped ?? [],
  };
}

/**
 * One line a human can read without opening the detail.
 *
 * Deliberately states the granularity out loud. "12 of 14 areas produced
 * requirements" invites the reading "2 requirements missing", which is not what
 * was measured, so the sentence says what it is.
 */
export function coverageSummary(c: RequirementCoverage): string {
  if (!c.planned_requirements) return 'No plan yet.';
  const areas = c.dimensions.length;
  const accounted = areas - c.unaccounted_dimensions.length;
  const parts = [
    `${c.stated_items} things said across ${areas} areas became ${c.planned_requirements} requirements`,
    `${accounted} of ${areas} areas are cited by at least one requirement`,
  ];
  if (c.unaccounted_dimensions.length) {
    parts.push(`nothing cites: ${c.unaccounted_dimensions.join(', ')}`);
  }
  if (c.dropped.length) parts.push(`${c.dropped.length} item(s) could not be carried at intake`);
  return `${parts.join('; ')}.`;
}
