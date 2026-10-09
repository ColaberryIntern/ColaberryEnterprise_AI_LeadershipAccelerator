import { deriveNextStep, type NextStepInput } from '../govNextStep';

// A "ready to approve" baseline; each test flips one field to exercise a branch (priority order matters).
const ready: NextStepInput = { decision: 'needs_evidence', establishedCount: 5, zipAttested: true, canApprove: true, canApprovePursuit: true, changed: false };

describe('deriveNextStep (pure, first-match priority)', () => {
  it('approved -> success, points at the build/submission', () => {
    const n = deriveNextStep({ ...ready, decision: 'approved_bid_pursuit' });
    expect(n.tone).toBe('success');
    expect(n.title).toMatch(/approved/i);
  });

  it('no_bid -> info, no further action', () => {
    expect(deriveNextStep({ ...ready, decision: 'no_bid' }).title).toMatch(/no-bid/i);
  });

  it('a flagged change wins over capture/attest (but not over an approved decision)', () => {
    expect(deriveNextStep({ ...ready, establishedCount: 0, changed: true }).title).toMatch(/change/i);
    expect(deriveNextStep({ ...ready, decision: 'approved_bid_pursuit', changed: true }).title).toMatch(/approved/i);
  });

  it('no requirements established -> capture the requirements', () => {
    const n = deriveNextStep({ ...ready, establishedCount: 0 });
    expect(n.title).toMatch(/capture the requirements/i);
  });

  it('established but ZIP not attested -> attest the ZIP', () => {
    expect(deriveNextStep({ ...ready, zipAttested: false }).title).toMatch(/attest/i);
  });

  it('a pursuit disqualifier -> resolve the blocking requirements (warning)', () => {
    const n = deriveNextStep({ ...ready, canApprovePursuit: false });
    expect(n.title).toMatch(/resolve the blocking/i);
    expect(n.tone).toBe('warning');
  });

  it('coverage + no disqualifier + canApprove -> approve, naming separation of duties', () => {
    const n = deriveNextStep(ready);
    expect(n.title).toMatch(/approve the bid pursuit/i);
    expect(n.detail).toMatch(/different person|separation/i);
    expect(n.tone).toBe('success');
  });
});
