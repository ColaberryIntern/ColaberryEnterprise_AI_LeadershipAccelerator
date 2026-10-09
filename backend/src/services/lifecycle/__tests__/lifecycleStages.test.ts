/**
 * The stage machine, asserted over the FULL 13×13 matrix rather than a handful of examples.
 *
 * Why exhaustively: an allow-list is only as good as the proof that everything outside it is
 * refused. Spot-checking "discovery cannot jump to building" leaves 150-odd other pairs
 * unverified, and the one that matters is always the one nobody wrote a case for. 169 pairs is
 * cheap; a missed illegal jump that authorizes a build is not.
 */
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_CONDITIONS,
  LEGAL,
  ADVANCE,
  RETURN,
  AUTHORIZATION_STAGE,
  POST_APPROVAL_STAGES,
  canTransition,
  isReturnEdge,
  crossesApprovalBoundary,
  isLifecycleStage,
  isLifecycleCondition,
  stageIndex,
  completedStages,
  type LifecycleStage,
} from '../lifecycleStages';

describe('the stage vocabulary', () => {
  it('has the thirteen stages the decision record specifies, in order', () => {
    expect(LIFECYCLE_STAGES).toHaveLength(13);
    expect(LIFECYCLE_STAGES[0]).toBe('discovery');
    expect(LIFECYCLE_STAGES[12]).toBe('operating');
    expect(AUTHORIZATION_STAGE).toBe('blueprint_approved');
  });

  it('keeps conditions out of the stage list, so a failure cannot erase the resume point', () => {
    for (const c of LIFECYCLE_CONDITIONS) {
      expect(LIFECYCLE_STAGES as ReadonlyArray<string>).not.toContain(c);
    }
    expect(LIFECYCLE_CONDITIONS).toEqual(['blocked', 'failed', 'awaiting_input', 'needs_reapproval']);
  });

  it('recognises valid stages and conditions, and rejects anything else', () => {
    expect(isLifecycleStage('planning')).toBe(true);
    expect(isLifecycleCondition('needs_reapproval')).toBe(true);
    // Positive control: the guards must reject, not just accept.
    expect(isLifecycleStage('failed')).toBe(false);       // a condition, not a stage
    expect(isLifecycleStage('')).toBe(false);
    expect(isLifecycleStage(undefined)).toBe(false);
    expect(isLifecycleStage('PLANNING')).toBe(false);     // case-sensitive on purpose
    expect(isLifecycleCondition('planning')).toBe(false);
  });
});

describe('the 13×13 transition matrix', () => {
  // Build the expected allow-list independently of LEGAL, from ADVANCE + RETURN, so the test
  // does not simply restate the thing it is checking.
  const expected = new Set<string>();
  for (const from of LIFECYCLE_STAGES) {
    const fwd = ADVANCE[from];
    if (fwd) expected.add(`${from}->${fwd}`);
    for (const back of RETURN[from]) expected.add(`${from}->${back}`);
  }

  it('covers every ordered pair exactly once, so no pair is left untested', () => {
    const pairs: string[] = [];
    for (const from of LIFECYCLE_STAGES) for (const to of LIFECYCLE_STAGES) pairs.push(`${from}->${to}`);
    expect(pairs).toHaveLength(169);
    expect(new Set(pairs).size).toBe(169);
  });

  it('allows exactly the pairs in the allow-list and refuses all 169 minus those', () => {
    let allowed = 0;
    let refused = 0;
    for (const from of LIFECYCLE_STAGES) {
      for (const to of LIFECYCLE_STAGES) {
        const key = `${from}->${to}`;
        const got = canTransition(from, to);
        expect(got).toBe(expected.has(key));
        got ? allowed++ : refused++;
      }
    }
    // Consistency: every allowed pair is one the independently-built set predicted.
    expect(allowed).toBe(expected.size);
    expect(allowed + refused).toBe(169);
    // And the edge counts themselves, which are checkable by eye against the decision record's
    // transition table: 12 forward edges (operating has none) and 15 return edges.
    const forwardCount = LIFECYCLE_STAGES.filter((s) => ADVANCE[s] !== null).length;
    const returnCount = LIFECYCLE_STAGES.reduce((n, s) => n + RETURN[s].length, 0);
    expect(forwardCount).toBe(12);
    expect(returnCount).toBe(15);
    expect(allowed).toBe(forwardCount + returnCount);
    // The overwhelming majority of pairs must be refused; a table that allowed most of them
    // would be a state machine in name only.
    expect(refused).toBe(169 - (forwardCount + returnCount));
  });

  it('refuses a same-stage transition for every stage', () => {
    for (const s of LIFECYCLE_STAGES) expect(canTransition(s, s)).toBe(false);
  });

  it('refuses every multi-step forward jump', () => {
    for (let i = 0; i < LIFECYCLE_STAGES.length; i++) {
      for (let j = i + 2; j < LIFECYCLE_STAGES.length; j++) {
        expect(canTransition(LIFECYCLE_STAGES[i], LIFECYCLE_STAGES[j])).toBe(false);
      }
    }
  });

  it('refuses an unknown stage on either side rather than throwing', () => {
    expect(canTransition('nonsense', 'planning')).toBe(false);
    expect(canTransition('planning', 'nonsense')).toBe(false);
    expect(canTransition(undefined, null)).toBe(false);
    expect(canTransition('failed', 'planning')).toBe(false); // a condition is not a stage
  });

  it('LEGAL agrees with ADVANCE + RETURN for every stage', () => {
    for (const from of LIFECYCLE_STAGES) {
      const fwd = ADVANCE[from];
      const want = fwd ? [fwd, ...RETURN[from]] : [...RETURN[from]];
      expect([...LEGAL[from]].sort()).toEqual([...want].sort());
    }
  });

  it('every stage is reachable from discovery, and nothing is a dead end except by design', () => {
    // Forward-reachability from discovery must cover all 13.
    const seen = new Set<LifecycleStage>(['discovery']);
    let cur: LifecycleStage | null = 'discovery';
    while (cur && ADVANCE[cur]) { cur = ADVANCE[cur]!; seen.add(cur); }
    expect(seen.size).toBe(13);
    // `operating` has no forward edge (it is steady state) but must still be able to leave.
    expect(ADVANCE.operating).toBeNull();
    expect(RETURN.operating).toEqual(['awaiting_blueprint_approval']);
    expect(LEGAL.operating.length).toBeGreaterThan(0);
    // `discovery` is the only stage with no return edge.
    const noReturn = LIFECYCLE_STAGES.filter((s) => RETURN[s].length === 0);
    expect(noReturn).toEqual(['discovery']);
  });
});

describe('approval-boundary crossing decides when reapproval is forced', () => {
  it('a return out of the post-approval band forces reapproval', () => {
    expect(crossesApprovalBoundary('blueprint_approved', 'awaiting_blueprint_approval')).toBe(true);
    expect(crossesApprovalBoundary('planning', 'awaiting_blueprint_approval')).toBe(true);
    expect(crossesApprovalBoundary('operating', 'awaiting_blueprint_approval')).toBe(true);
  });

  it('a return that stays INSIDE the post-approval band does not', () => {
    // Plan or build rework against a still-valid approval. Forcing reapproval here would train
    // owners to click through it, which is how a gate stops meaning anything.
    expect(crossesApprovalBoundary('plan_ready', 'planning')).toBe(false);
    expect(crossesApprovalBoundary('building', 'plan_ready')).toBe(false);
    expect(crossesApprovalBoundary('release_review', 'building')).toBe(false);
    expect(crossesApprovalBoundary('launch_ready', 'release_review')).toBe(false);
  });

  it('a forward advance never forces reapproval', () => {
    for (const from of LIFECYCLE_STAGES) {
      const fwd = ADVANCE[from];
      if (fwd) expect(crossesApprovalBoundary(from, fwd)).toBe(false);
    }
  });

  it('a pre-approval return never forces reapproval, because there is no approval yet', () => {
    expect(crossesApprovalBoundary('design_ready', 'allocation_ready')).toBe(false);
    expect(crossesApprovalBoundary('requirements_ready', 'discovery')).toBe(false);
    expect(crossesApprovalBoundary('awaiting_blueprint_approval', 'allocation_ready')).toBe(false);
  });

  it('identifies the post-approval band exactly', () => {
    expect([...POST_APPROVAL_STAGES].sort()).toEqual(
      ['blueprint_approved', 'building', 'launch_ready', 'operating', 'plan_ready', 'planning', 'release_review'].sort(),
    );
    // awaiting_blueprint_approval is deliberately NOT in the band: it is where reapproval lands.
    expect(POST_APPROVAL_STAGES.has('awaiting_blueprint_approval' as LifecycleStage)).toBe(false);
  });

  it('isReturnEdge distinguishes direction', () => {
    expect(isReturnEdge('process_ready', 'requirements_ready')).toBe(true);
    expect(isReturnEdge('requirements_ready', 'process_ready')).toBe(false);
  });
});

describe('stage ordering helpers', () => {
  it('indexes stages in declared order', () => {
    expect(stageIndex('discovery')).toBe(0);
    expect(stageIndex('blueprint_approved')).toBe(6);
    expect(stageIndex('operating')).toBe(12);
  });

  it('reports completed stages as everything strictly before the current one', () => {
    expect(completedStages('discovery')).toEqual([]);
    expect(completedStages('process_ready')).toEqual(['discovery', 'requirements_ready']);
    expect(completedStages('operating')).toHaveLength(12);
  });
});
