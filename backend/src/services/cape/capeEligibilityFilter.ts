/**
 * capeEligibilityFilter — Stage 2 of the CAPE Phase 4 learning-value ranker
 * (design doc §9 Stage 2, §15). PURE — no I/O, no Date.now.
 *
 * Entitlement/access, publish/release window, cohort/week gates, and
 * already-completed/dismissed policy are ALL already enforced upstream by
 * `gatherAnchored()` / `timelineService.getFeed()` — only `today_eligible`
 * cards are ever candidates in the first place (execution-contract.md
 * Assumption 4). This filter adds the one gate that is genuinely new: the
 * required-prerequisite-skill check, using each candidate's stamped
 * `skill_mapping.prerequisite_skills` cross-referenced against the learner's
 * CURRENT PLACEMENT (Phase 2 — never verified proficiency substituting for a
 * real gate, and never used to grant access this filter didn't already
 * have — see the safety-invariant test in this module's test file).
 *
 * A candidate with no prerequisite_skills is eligible by default (most
 * curriculum has none). A candidate is excluded only when the learner's
 * placement for a required skill is BELOW the stated min_placement — i.e.
 * this is a strict subset operation on its input: it can only ever REMOVE
 * candidates, never add or reinstate one that wasn't already in the list.
 */
import type { LearningValueCandidate } from './capeCandidateFeatureService';
import type { LearnerState } from './capeLearnerStateService';

export interface EligibilityExclusion {
  ref: string;
  reason: string;
}

export interface EligibilityResult {
  eligible: LearningValueCandidate[];
  excluded: EligibilityExclusion[];
}

function placementFor(state: LearnerState, skillId: string): number {
  const found = state.skills.find((s) => s.skill_id === skillId);
  return found ? found.placement : 0; // unknown/unevaluated skill -> treat as zero placement (fail safe, not fail open)
}

/**
 * Filter candidates by the CAPE-specific hard eligibility gate. Never throws
 * — a candidate list and a learner state are plain in-memory data; there is
 * no failure mode here that isn't a programming error.
 */
export function filterEligible(candidates: LearningValueCandidate[], learnerState: LearnerState): EligibilityResult {
  const eligible: LearningValueCandidate[] = [];
  const excluded: EligibilityExclusion[] = [];

  for (const c of candidates) {
    const prereqs = c.skill_mapping?.prerequisite_skills ?? [];
    const unmet = prereqs.find((p) => placementFor(learnerState, p.skill_id) < p.min_placement);
    if (unmet) {
      const have = placementFor(learnerState, unmet.skill_id);
      excluded.push({
        ref: c.ref,
        reason: `requires ${unmet.skill_id} placement >= ${unmet.min_placement} (learner at ${have})`,
      });
      continue;
    }
    eligible.push(c);
  }

  return { eligible, excluded };
}
