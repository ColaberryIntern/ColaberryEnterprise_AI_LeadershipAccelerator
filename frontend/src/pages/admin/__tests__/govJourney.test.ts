import { deriveJourney, type JourneyInput } from '../govJourney';

// A fully-progressed-through-attestation baseline; each test rolls state back to exercise the stage transitions.
const attested: JourneyInput = { hasRecord: true, establishedCount: 3, zipAttested: true, assessed: true, decision: 'needs_evidence' };

const stateOf = (j: ReturnType<typeof deriveJourney>, key: string) => j.steps.find((s) => s.key === key)!.state;

describe('deriveJourney (pure)', () => {
  it('always has the six pipeline stages in order, build last', () => {
    const j = deriveJourney(attested);
    expect(j.steps.map((s) => s.key)).toEqual(['discovered', 'requirements', 'captured', 'assessed', 'approved', 'build']);
  });

  it('an opened-but-empty record: only Discovered is done, Requirements is current', () => {
    const j = deriveJourney({ hasRecord: true, establishedCount: 0, zipAttested: false, assessed: false, decision: null });
    expect(stateOf(j, 'discovered')).toBe('done');
    expect(stateOf(j, 'requirements')).toBe('current');
    expect(stateOf(j, 'captured')).toBe('todo');
    expect(j.currentIndex).toBe(1);
  });

  it('requirements established but ZIP not attested: Captured is current', () => {
    const j = deriveJourney({ ...attested, zipAttested: false, assessed: false });
    expect(stateOf(j, 'requirements')).toBe('done');
    expect(stateOf(j, 'captured')).toBe('current');
  });

  it('attested + assessed but not approved: Pursuit approved is current', () => {
    const j = deriveJourney(attested);
    expect(stateOf(j, 'captured')).toBe('done');
    expect(stateOf(j, 'assessed')).toBe('done');
    expect(stateOf(j, 'approved')).toBe('current');
  });

  it('assessed requires established requirements (empty set is not "assessed")', () => {
    const j = deriveJourney({ hasRecord: true, establishedCount: 0, zipAttested: true, assessed: true, decision: null });
    expect(stateOf(j, 'assessed')).toBe('todo');
  });

  it('approved_bid_pursuit marks Pursuit approved done; Build is the current (never auto-done) tail', () => {
    const j = deriveJourney({ ...attested, decision: 'approved_bid_pursuit' });
    expect(stateOf(j, 'approved')).toBe('done');
    expect(stateOf(j, 'build')).toBe('current'); // build is never marked done here; it is the last step
    expect(j.currentIndex).toBe(5);
  });

  it('rfi_response also counts as an approval', () => {
    expect(stateOf(deriveJourney({ ...attested, decision: 'rfi_response' }), 'approved')).toBe('done');
  });
});
