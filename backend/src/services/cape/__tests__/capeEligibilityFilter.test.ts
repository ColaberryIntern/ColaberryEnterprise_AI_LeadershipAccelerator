import { filterEligible } from '../capeEligibilityFilter';
import { EMPTY_CONTRACT, type LearningValueCandidate } from '../capeCandidateFeatureService';
import type { LearnerState, LearnerSkillState } from '../capeLearnerStateService';

function skillState(skillId: string, placement: number): LearnerSkillState {
  return {
    skill_id: skillId, name: skillId, axis_order: 0, placement, claim: 0, knowledge: 0, application: 0,
    judgment: 0, proficiency: 0, confidence: 0, next_review_at: null, evidence_balance_ratio: 0,
  };
}

function learnerState(skills: LearnerSkillState[]): LearnerState {
  return {
    enrollment_id: 'enr-1', skills, overall_placement: 0, overall_proficiency: 0,
    goal: null, role: null, industry: null, has_resume: false, recent_failure: false,
    learner_state_version: '2026-08-03T00:00:00.000Z',
  };
}

function candidate(ref: string, prerequisites: Array<{ skill_id: string; min_placement: number }> = []): LearningValueCandidate {
  return {
    position: 0, kind: 'anchored', ref, surface: 'today', type: 'implementation_task', render_band: 'task',
    card_id: `card-${ref}`, title: ref, subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: 5, estimated_time: 30, status: null, interacted: false,
    skill_mapping: { ...EMPTY_CONTRACT, prerequisite_skills: prerequisites },
  };
}

describe('filterEligible — happy path', () => {
  it('a candidate with an unmet prerequisite is excluded with a human-readable reason', () => {
    const cands = [candidate('mcp-lab', [{ skill_id: 'agents_mcp', min_placement: 40 }])];
    const state = learnerState([skillState('agents_mcp', 10)]);
    const { eligible, excluded } = filterEligible(cands, state);
    expect(eligible).toHaveLength(0);
    expect(excluded).toEqual([{ ref: 'mcp-lab', reason: 'requires agents_mcp placement >= 40 (learner at 10)' }]);
  });

  it('a candidate with all prerequisites met (or none) is eligible', () => {
    const cands = [candidate('intro', []), candidate('mcp-lab', [{ skill_id: 'agents_mcp', min_placement: 40 }])];
    const state = learnerState([skillState('agents_mcp', 50)]);
    const { eligible, excluded } = filterEligible(cands, state);
    expect(eligible.map((c) => c.ref)).toEqual(['intro', 'mcp-lab']);
    expect(excluded).toHaveLength(0);
  });
});

describe('filterEligible — boundary: brand-new learner, zero placement data', () => {
  it('every prerequisite-gated candidate is excluded (fails safe, not fails open); zero-prerequisite candidates remain eligible', () => {
    const cands = [
      candidate('gated', [{ skill_id: 'rag', min_placement: 1 }]),
      candidate('ungated', []),
    ];
    const state = learnerState([]); // no skill rows at all
    const { eligible, excluded } = filterEligible(cands, state);
    expect(eligible.map((c) => c.ref)).toEqual(['ungated']);
    expect(excluded.map((e) => e.ref)).toEqual(['gated']);
  });
});

describe('filterEligible — SAFETY INVARIANT (design doc §15): the filter can never grant access, only remove it', () => {
  it('is a strict subset operation on its input — no ref appears in the output that was not in the input, and every input ref appears in exactly one of eligible/excluded', () => {
    const cands = [
      candidate('a', []), candidate('b', [{ skill_id: 'rag', min_placement: 90 }]),
      candidate('c', [{ skill_id: 'rag', min_placement: 1 }]),
    ];
    const state = learnerState([skillState('rag', 50)]);
    const { eligible, excluded } = filterEligible(cands, state);

    expect(eligible.length + excluded.length).toBe(cands.length);
    const outputRefs = new Set([...eligible.map((c) => c.ref), ...excluded.map((e) => e.ref)]);
    const inputRefs = new Set(cands.map((c) => c.ref));
    expect(outputRefs).toEqual(inputRefs);
    // and no ref is double-counted (present in both lists)
    const eligibleRefs = new Set(eligible.map((c) => c.ref));
    const excludedRefs = new Set(excluded.map((e) => e.ref));
    for (const ref of eligibleRefs) expect(excludedRefs.has(ref)).toBe(false);
  });

  it('resume placement can compress optional foundations but never grants access beyond what min_placement already permits — a very high placement never bypasses an EQUAL-OR-HIGHER prerequisite threshold', () => {
    const cands = [candidate('advanced', [{ skill_id: 'rag', min_placement: 80 }])];
    const state = learnerState([skillState('rag', 79)]); // one point short
    const { eligible, excluded } = filterEligible(cands, state);
    expect(eligible).toHaveLength(0);
    expect(excluded).toHaveLength(1);
  });
});
