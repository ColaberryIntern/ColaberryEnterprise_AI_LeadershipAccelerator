import {
  STEPS, blockedReason, firstOpenStep, isStepKey, nextOpenStep, previousStep, stepStates,
  type StepFacts,
} from '../composer/composerSteps';

/**
 * The composer's five steps: which are finished, which cannot be opened yet, and - the part that
 * matters most - what an operator is told when one cannot.
 */

const FRESH: StepFacts = {
  hasItem: false, selectedCount: 0, variantCount: 0, validation: null,
  approved: false, jobCount: 0, itemStatus: null,
};
const DRAFTED: StepFacts = { ...FRESH, hasItem: true, itemStatus: 'draft' };
const WRITTEN: StepFacts = { ...DRAFTED, selectedCount: 1, variantCount: 1 };
const VALIDATED: StepFacts = { ...WRITTEN, validation: { ran: true, ok: true, blockerCount: 0 } };
const APPROVED: StepFacts = { ...VALIDATED, approved: true, itemStatus: 'approved' };
const QUEUED: StepFacts = { ...APPROVED, jobCount: 1, itemStatus: 'scheduled' };

describe('what you cannot open yet, and why', () => {
  it('nothing works before the draft is saved - and every step says the same thing to do', () => {
    for (const step of ['channels', 'preview', 'confirm', 'publishing'] as const) {
      expect(blockedReason(step, FRESH)).toMatch(/Save the setup first/);
    }
    // Setup itself is never blocked; it is where you are.
    expect(blockedReason('setup', FRESH)).toBeNull();
  });

  it('preview and confirm wait for the versions, and say which step makes them', () => {
    expect(blockedReason('preview', DRAFTED)).toMatch(/Generate the versions in Channels/);
    expect(blockedReason('confirm', DRAFTED)).toMatch(/Generate the versions in Channels/);
    expect(blockedReason('preview', WRITTEN)).toBeNull();
    expect(blockedReason('confirm', WRITTEN)).toBeNull();
  });

  it('publishing waits for something to be queued, and names where to do it', () => {
    expect(blockedReason('publishing', APPROVED)).toMatch(/Schedule or publish from Confirm/);
    expect(blockedReason('publishing', QUEUED)).toBeNull();
  });

  it('a post already published opens its publishing step even with no job rows loaded', () => {
    expect(blockedReason('publishing', { ...APPROVED, itemStatus: 'published' })).toBeNull();
  });

  it('every blocked reason tells you what to DO, not merely what is wrong', () => {
    const reasons = [
      blockedReason('channels', FRESH), blockedReason('preview', DRAFTED), blockedReason('publishing', APPROVED),
    ];
    for (const r of reasons) expect(r).toMatch(/Save|Generate|Schedule/);
  });
});

describe('the state of each step in the rail', () => {
  it('a fresh composer: Setup current, everything after it blocked', () => {
    expect(stepStates(FRESH, 'setup')).toEqual({
      setup: 'current', channels: 'blocked', preview: 'blocked', confirm: 'blocked', publishing: 'blocked',
    });
  });

  it('setup reads done once the draft exists, even while standing on it', () => {
    expect(stepStates(DRAFTED, 'channels').setup).toBe('done');
    expect(stepStates(DRAFTED, 'channels').channels).toBe('current');
  });

  it('looking at a preview does not finish it - running validation does', () => {
    expect(stepStates(WRITTEN, 'confirm').preview).toBe('available');
    expect(stepStates(VALIDATED, 'confirm').preview).toBe('done');
  });

  it('failed validation is not "done"', () => {
    const failed = { ...WRITTEN, validation: { ran: true, ok: false, blockerCount: 2 } };
    expect(stepStates(failed, 'confirm').preview).toBe('available');
  });

  it('confirm finishes on approval, or on the post being on its way', () => {
    expect(stepStates(VALIDATED, 'setup').confirm).toBe('available');
    expect(stepStates(APPROVED, 'setup').confirm).toBe('done');
    expect(stepStates({ ...VALIDATED, itemStatus: 'scheduled' }, 'setup').confirm).toBe('done');
  });

  it('publishing only finishes when the post is actually published', () => {
    expect(stepStates(QUEUED, 'setup').publishing).toBe('available');
    expect(stepStates({ ...QUEUED, itemStatus: 'published' }, 'setup').publishing).toBe('done');
  });

  it('the current step is always current, even when it is also blocked or done', () => {
    expect(stepStates(FRESH, 'publishing').publishing).toBe('current');
  });
});

describe('where the composer opens, and where Next goes', () => {
  it('a fresh draft opens on Setup; a written one on the first unfinished step', () => {
    expect(firstOpenStep(FRESH)).toBe('setup');
    expect(firstOpenStep(DRAFTED)).toBe('channels');
    expect(firstOpenStep(WRITTEN)).toBe('preview');
    expect(firstOpenStep(VALIDATED)).toBe('confirm');
  });

  it('a finished post opens on Publishing rather than sending you back to the start', () => {
    expect(firstOpenStep({ ...QUEUED, itemStatus: 'published' })).toBe('publishing');
  });

  it('Next skips a step that cannot be opened', () => {
    // From Setup on a saved draft with no versions: Preview and Confirm are blocked, so the
    // only forward move is Channels.
    expect(nextOpenStep('setup', DRAFTED)).toBe('channels');
    expect(nextOpenStep('channels', DRAFTED)).toBeNull();
    expect(nextOpenStep('channels', WRITTEN)).toBe('preview');
    expect(nextOpenStep('confirm', QUEUED)).toBe('publishing');
  });

  it('Back is always the step before, since you have already been there', () => {
    expect(previousStep('setup')).toBeNull();
    expect(previousStep('confirm')).toBe('preview');
  });
});

describe('the step in the URL', () => {
  it('accepts only real step names', () => {
    expect(isStepKey('confirm')).toBe(true);
    expect(isStepKey('Confirm')).toBe(false);
    expect(isStepKey('everything')).toBe(false);
    expect(isStepKey(null)).toBe(false);
  });

  it('the five steps are numbered in the order they are worked', () => {
    expect(STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
    expect(STEPS.map((s) => s.key)).toEqual(['setup', 'channels', 'preview', 'confirm', 'publishing']);
  });
});
