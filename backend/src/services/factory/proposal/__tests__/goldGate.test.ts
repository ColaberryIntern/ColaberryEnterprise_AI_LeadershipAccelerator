import { goldReady, goldFullyApproved, goldApprovalNeed, goldNeedFor, type GoldDocState } from '../goldGate';
import { AI_GATES, HUMAN_GATES, aiGates, humanGates, isAiGate, isHumanGate } from '../proposalReviewConfig';

describe('gate automation config (T13)', () => {
  it('splits the AI gates from the single human gate', () => {
    expect(AI_GATES).toEqual(['pink', 'red', 'white_glove']);
    expect(HUMAN_GATES).toEqual(['gold']);
    expect(aiGates).toBe(AI_GATES);
    expect(humanGates).toBe(HUMAN_GATES);
    expect(isAiGate('pink')).toBe(true);
    expect(isAiGate('gold')).toBe(false);
    expect(isHumanGate('gold')).toBe(true);
    expect(isHumanGate('red')).toBe(false);
  });
});

describe('goldReady', () => {
  it('is true only when there is an eligible doc and every eligible doc passes', () => {
    expect(goldReady([{ docKey: 'a', passes: true }, { docKey: 'b', passes: true }])).toBe(true);
    expect(goldReady([{ docKey: 'a', passes: true }, { docKey: 'b', passes: false }])).toBe(false);
    expect(goldReady([])).toBe(false);
  });

  it('ignores superseded documents', () => {
    expect(goldReady([{ docKey: 'a', passes: true }, { docKey: 'b', passes: false, superseded: true }])).toBe(true);
    expect(goldReady([{ docKey: 'a', passes: false, superseded: true }])).toBe(false); // nothing eligible
  });
});

describe('goldFullyApproved', () => {
  it('is true only when every eligible doc already has Gold approved', () => {
    expect(goldFullyApproved([{ docKey: 'a', passes: true, goldApproved: true }])).toBe(true);
    expect(goldFullyApproved([{ docKey: 'a', passes: true, goldApproved: true }, { docKey: 'b', passes: true }])).toBe(false);
  });
});

describe('goldApprovalNeed', () => {
  it('is a single approval need used-in every eligible document', () => {
    const n = goldApprovalNeed(['a', 'b']);
    expect(n).toMatchObject({ kind: 'approval', key: 'approval:gold', blocking: 'score' });
    expect(n.usedIn).toEqual([{ docKey: 'a' }, { docKey: 'b' }]);
  });
});

describe('goldNeedFor', () => {
  const docs: GoldDocState[] = [{ docKey: 'a', passes: true }, { docKey: 'b', passes: true }];

  it('surfaces the need when ready and not yet approved', () => {
    expect(goldNeedFor(docs)!.key).toBe('approval:gold');
  });
  it('is null when not ready', () => {
    expect(goldNeedFor([{ docKey: 'a', passes: false }])).toBeNull();
  });
  it('is null once every eligible doc has Gold approved (nothing left to ask)', () => {
    expect(goldNeedFor(docs.map((d) => ({ ...d, goldApproved: true })))).toBeNull();
  });
});
