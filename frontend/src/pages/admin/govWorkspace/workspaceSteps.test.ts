import {
  WORKSPACE_STEPS, resolveStep, deriveStepState, LEGACY_TAB_TO_STEP,
  type StepStateInput, type WorkspaceStep,
} from './workspaceSteps';

const base: StepStateInput = {
  zipAttested: false, establishedCount: 0, decision: null,
  proposalContentReady: false, hasBuild: false, submissionStatus: null, outcome: null,
};

describe('workspaceSteps (pure, advisory)', () => {
  it('has the 8 redesign steps in order, each with a one-line question', () => {
    expect(WORKSPACE_STEPS.map((s) => s.key)).toEqual(
      ['snapshot', 'solicitation', 'fit', 'decide', 'build', 'proposal', 'submit', 'outcome'],
    );
    expect(WORKSPACE_STEPS.every((s) => s.question.length > 0 && s.label.length > 0)).toBe(true);
  });

  it('resolveStep maps legacy tabs forward and unknown → snapshot', () => {
    expect(resolveStep('requirements')).toBe('solicitation'); // folded into Solicitation
    expect(resolveStep('gono')).toBe('decide');
    expect(resolveStep('proposal')).toBe('proposal'); // now its OWN step, no longer a Build alias
    expect(resolveStep('submission')).toBe('submit');
    expect(resolveStep('documents')).toBe('solicitation');
    expect(resolveStep('build')).toBe('build');       // a current key resolves directly
    expect(resolveStep('fit')).toBe('fit');
    expect(resolveStep('')).toBe('snapshot');
    expect(resolveStep('nonsense')).toBe('snapshot');
    // every legacy alias resolves to a real step
    for (const target of Object.values(LEGACY_TAB_TO_STEP)) {
      expect(WORKSPACE_STEPS.some((s) => s.key === target)).toBe(true);
    }
  });

  it('steps 5–8 are LOCKED until approval; Build never shows done before approval', () => {
    // An AI plan exists (hasBuild) and proposal content is ready, but NOT approved.
    const m = deriveStepState('snapshot', { ...base, zipAttested: true, establishedCount: 3, hasBuild: true, proposalContentReady: true, decision: null });
    expect(m.approved).toBe(false);
    expect(m.statuses.build).toBe('locked');
    expect(m.statuses.proposal).toBe('locked');
    expect(m.statuses.submit).toBe('locked');
    expect(m.statuses.outcome).toBe('locked');
    expect(m.statuses.build).not.toBe('done'); // the pre-redesign bug: Build showed done from an AI plan
  });

  it('approval unlocks 5–8; Build is done at approval, Proposal only when every response is approved', () => {
    // Viewing Build, just approved, proposal not written yet.
    const m = deriveStepState('build', { ...base, zipAttested: true, establishedCount: 3, decision: 'approved_bid_pursuit', proposalContentReady: false });
    expect(m.approved).toBe(true);
    expect(m.statuses.build).toBe('current');   // being viewed
    expect(m.statuses.proposal).toBe('todo');   // unlocked, not done (no approved responses yet)
    expect(m.statuses.submit).toBe('todo');     // unlocked, not done
    // Viewing Submit, approved, every response approved → Build and Proposal both done.
    const m2 = deriveStepState('submit', { ...base, zipAttested: true, establishedCount: 3, decision: 'approved_bid_pursuit', proposalContentReady: true });
    expect(m2.statuses.build).toBe('done');     // done once approved (the build runs post-award)
    expect(m2.statuses.proposal).toBe('done');  // responses approved
    expect(m2.statuses.submit).toBe('current');
  });

  it('done-ness follows pursuit order: no later step is done while an earlier one is not', () => {
    // decision set (would make fit/decide "raw done") but solicitation not complete → clamp.
    const m = deriveStepState('snapshot', { ...base, zipAttested: false, establishedCount: 0, decision: 'approved_bid_pursuit' });
    expect(m.statuses.solicitation).not.toBe('done');
    expect(m.statuses.fit).not.toBe('done');     // clamped: earlier step not done
    expect(m.statuses.decide).not.toBe('done');
  });

  it('frontier is the first unfinished, actionable step (where a fresh load lands)', () => {
    expect(deriveStepState('snapshot', base).frontier).toBe('snapshot');
    expect(deriveStepState('snapshot', { ...base, zipAttested: true }).frontier).toBe('solicitation');
    const afterReqs = deriveStepState('snapshot', { ...base, zipAttested: true, establishedCount: 2 });
    expect(afterReqs.frontier).toBe('fit');
    // locked steps are never the frontier before approval
    const notApproved = deriveStepState('snapshot', { ...base, zipAttested: true, establishedCount: 2, hasBuild: true });
    expect((['build', 'proposal', 'submit', 'outcome'] as WorkspaceStep[]).includes(notApproved.frontier)).toBe(false);
  });

  it('the viewed step is current even if done elsewhere', () => {
    const m = deriveStepState('snapshot', { ...base, zipAttested: true, establishedCount: 2 });
    expect(m.statuses.snapshot).toBe('current');
    expect(m.statuses.solicitation).toBe('done');
  });
});
