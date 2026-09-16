import {
  MILESTONE_RUNGS, PROJECT_MILESTONE_TARGET, PROGRAM_MILESTONE_TARGET,
  programMilestonesHeld, rankForMilestones, latchRank, legacyRankToMilestoneRank,
  milestoneGaps, rungForRank, rungForSlug, rungNameForRank, MilestoneState,
} from '../milestoneLadder';

// The ladder as decided on 2026-09-16 (docs/POINTS_LADDER_DECISIONS.md). Every
// number here is a decision, not a tuning knob, so the tests pin them.

const s = (over: Partial<MilestoneState> = {}): MilestoneState => ({
  curriculumComplete: false, projectsComplete: 0, certificationApproved: false, ...over,
});

describe('MILESTONE_RUNGS definition', () => {
  it('is AI Builder I–IV, AI Architect, Senior AI Architect, ranks 1..6 in order', () => {
    expect(MILESTONE_RUNGS.map((r) => [r.rank, r.rungName])).toEqual([
      [1, 'AI Builder I'], [2, 'AI Builder II'], [3, 'AI Builder III'], [4, 'AI Builder IV'],
      [5, 'AI Architect'], [6, 'Senior AI Architect'],
    ]);
  });
  it('Builder I–IV need 1..4 milestones and no certification; Architect needs 4 + certification', () => {
    expect(MILESTONE_RUNGS.slice(0, 4).map((r) => [r.minMilestones, r.requiresCertification])).toEqual([[1, false], [2, false], [3, false], [4, false]]);
    expect(rungForRank(5)).toMatchObject({ minMilestones: 4, requiresCertification: true, manualOnly: false });
  });
  it('rung IV carries the Program Graduate label; only Senior is manual', () => {
    expect(rungForRank(4)?.label).toBe('Program Graduate');
    expect(MILESTONE_RUNGS.filter((r) => r.manualOnly).map((r) => r.slug)).toEqual(['senior_ai_architect']);
  });
  it('uses slugs that do not collide with the legacy ladder', () => {
    for (const legacy of ['junior_builder', 'practitioner', 'developer', 'senior_developer', 'engineer', 'senior_engineer', 'architect_candidate', 'architect']) {
      expect(rungForSlug(legacy)).toBeNull();
    }
  });
  it('four program milestones: curriculum + three projects', () => {
    expect(PROGRAM_MILESTONE_TARGET).toBe(4);
    expect(PROJECT_MILESTONE_TARGET).toBe(3);
  });
});

describe('programMilestonesHeld', () => {
  it('counts curriculum as one and projects up to three, any order', () => {
    expect(programMilestonesHeld(s())).toBe(0);
    expect(programMilestonesHeld(s({ curriculumComplete: true }))).toBe(1);
    expect(programMilestonesHeld(s({ projectsComplete: 1 }))).toBe(1);
    expect(programMilestonesHeld(s({ curriculumComplete: true, projectsComplete: 2 }))).toBe(3);
    expect(programMilestonesHeld(s({ curriculumComplete: true, projectsComplete: 3 }))).toBe(4);
  });
  it('a fourth or fifth project never substitutes for the curriculum', () => {
    expect(programMilestonesHeld(s({ projectsComplete: 5 }))).toBe(3);
    expect(programMilestonesHeld(s({ projectsComplete: 99 }))).toBe(3);
  });
  it('is safe on garbage counts', () => {
    expect(programMilestonesHeld(s({ projectsComplete: -2 }))).toBe(0);
    expect(programMilestonesHeld(s({ projectsComplete: NaN }))).toBe(0);
    expect(programMilestonesHeld(s({ projectsComplete: 1.9 }))).toBe(1);
  });
});

describe('rankForMilestones — the full matrix', () => {
  // Every combination of curriculum (2) × projects (0..3) × certification (2).
  const expected: Array<[boolean, number, boolean, number]> = [
    [false, 0, false, 0], [false, 1, false, 1], [false, 2, false, 2], [false, 3, false, 3],
    [true, 0, false, 1], [true, 1, false, 2], [true, 2, false, 3], [true, 3, false, 4],
    // A certification without the four milestones changes nothing.
    [false, 0, true, 0], [false, 1, true, 1], [false, 2, true, 2], [false, 3, true, 3],
    [true, 0, true, 1], [true, 1, true, 2], [true, 2, true, 3],
    // Program Graduate + certification = AI Architect.
    [true, 3, true, 5],
  ];
  it.each(expected)('curriculum=%s projects=%s cert=%s → rank %s', (cur, projects, cert, rank) => {
    expect(rankForMilestones(s({ curriculumComplete: cur, projectsComplete: projects, certificationApproved: cert }))).toBe(rank);
  });

  it('never computes the manual-only Senior rung, whatever the inputs', () => {
    expect(rankForMilestones(s({ curriculumComplete: true, projectsComplete: 99, certificationApproved: true }))).toBe(5);
  });

  it('is monotonic: adding a milestone or a certification never lowers the rank', () => {
    for (const cur of [false, true]) for (let p = 0; p <= 3; p += 1) for (const cert of [false, true]) {
      const base = rankForMilestones(s({ curriculumComplete: cur, projectsComplete: p, certificationApproved: cert }));
      expect(rankForMilestones(s({ curriculumComplete: true, projectsComplete: p, certificationApproved: cert }))).toBeGreaterThanOrEqual(base);
      expect(rankForMilestones(s({ curriculumComplete: cur, projectsComplete: p + 1, certificationApproved: cert }))).toBeGreaterThanOrEqual(base);
      expect(rankForMilestones(s({ curriculumComplete: cur, projectsComplete: p, certificationApproved: true }))).toBeGreaterThanOrEqual(base);
    }
  });

  it('has no points input at all — the anti-cheat line is structural', () => {
    // The state type carries no points; a caller cannot even pass them.
    expect(Object.keys(s()).sort()).toEqual(['certificationApproved', 'curriculumComplete', 'projectsComplete']);
  });
});

describe('latchRank (decision D5: rungs never go down)', () => {
  it('keeps the higher of held and computed', () => {
    expect(latchRank(0, 2)).toBe(2);
    expect(latchRank(2, 0)).toBe(2);
    expect(latchRank(3, 3)).toBe(3);
  });
  it('treats garbage as the entry rank', () => {
    expect(latchRank(NaN, 1)).toBe(1);
    expect(latchRank(-4, -1)).toBe(0);
  });
});

describe('legacyRankToMilestoneRank', () => {
  it('folds the nine legacy ranks onto the six milestone rungs by name', () => {
    expect(legacyRankToMilestoneRank('builder', 0)).toBe(0);
    expect(legacyRankToMilestoneRank('junior_builder', 1)).toBe(1);
    expect(legacyRankToMilestoneRank('practitioner', 2)).toBe(2);
    expect(legacyRankToMilestoneRank('developer', 3)).toBe(3);
    expect(legacyRankToMilestoneRank('senior_developer', 4)).toBe(4);
    expect(legacyRankToMilestoneRank('engineer', 5)).toBe(4);
    expect(legacyRankToMilestoneRank('senior_engineer', 6)).toBe(4);
    expect(legacyRankToMilestoneRank('architect_candidate', 7)).toBe(5);
    expect(legacyRankToMilestoneRank('architect', 8)).toBe(6);
  });
  it('passes a milestone-ladder slug straight through', () => {
    expect(legacyRankToMilestoneRank('builder_iii', 3)).toBe(3);
    expect(legacyRankToMilestoneRank('ai_architect', 5)).toBe(5);
  });
  it('clamps an unknown slug to what its rank can mean here', () => {
    expect(legacyRankToMilestoneRank('mystery', 2)).toBe(2);
    expect(legacyRankToMilestoneRank('mystery', 40)).toBe(6);
    expect(legacyRankToMilestoneRank(null, null)).toBe(0);
  });
});

describe('milestoneGaps — what a student is told to do next', () => {
  it('names the concrete things left, not "milestones 1 of 4"', () => {
    const gaps = milestoneGaps(s({ projectsComplete: 1 }), 1);
    expect(gaps.map((g) => g.text)).toEqual([
      'Curriculum complete — every graded card in all 12 weeks',
      'Projects verified — 1 of 3',
    ]);
  });
  it('drops a line once that thing is done', () => {
    expect(milestoneGaps(s({ curriculumComplete: true, projectsComplete: 1 }), 2).map((g) => g.key)).toEqual(['projects']);
  });
  it('at Program Graduate, the only gap to AI Architect is the certification', () => {
    expect(milestoneGaps(s({ curriculumComplete: true, projectsComplete: 3 }), 4)).toEqual([
      { key: 'certification', have: 0, need: 1, text: 'Certification approved by staff' },
    ]);
  });
  it('at AI Architect there is nothing to work toward from a checklist (Senior is manual)', () => {
    expect(milestoneGaps(s({ curriculumComplete: true, projectsComplete: 3, certificationApproved: true }), 5)).toEqual([]);
    expect(milestoneGaps(s(), 6)).toEqual([]);
  });
  it('a rank-3 learner missing only the curriculum sees exactly that', () => {
    expect(milestoneGaps(s({ projectsComplete: 3 }), 3).map((g) => g.key)).toEqual(['curriculum']);
  });
});

describe('rungNameForRank', () => {
  it('renders the Program Graduate label on IV and nothing for the entry state', () => {
    expect(rungNameForRank(0)).toBe('');
    expect(rungNameForRank(1)).toBe('AI Builder I');
    expect(rungNameForRank(4)).toBe('AI Builder IV · Program Graduate');
    expect(rungNameForRank(5)).toBe('AI Architect');
  });
});
