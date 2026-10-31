import { deriveVettingStage, canonicalForUuid } from '../govOpportunityVetting';

describe('canonicalForUuid', () => {
  it('prefixes the feed uuid with gws: (matches the Qualify link)', () => {
    expect(canonicalForUuid('cd578408-c858-4318-9402-88a4329da444')).toBe('gws:cd578408-c858-4318-9402-88a4329da444');
  });
});

describe('deriveVettingStage', () => {
  it('a null/undefined record is not_vetted', () => {
    expect(deriveVettingStage(null).stage).toBe('not_vetted');
    expect(deriveVettingStage(undefined).stage).toBe('not_vetted');
  });

  it('approved_bid_pursuit is vetted, and wins even over an open approval request', () => {
    const v = deriveVettingStage({ decision: 'approved_bid_pursuit', requirements_json: { approval: { status: 'pending' } } });
    expect(v.stage).toBe('vetted');
  });

  it('rfi_response is rfi', () => {
    expect(deriveVettingStage({ decision: 'rfi_response' }).stage).toBe('rfi');
  });

  it('no_bid is no_bid', () => {
    expect(deriveVettingStage({ decision: 'no_bid' }).stage).toBe('no_bid');
  });

  it('an open approval request with no terminal decision is awaiting_approval', () => {
    expect(deriveVettingStage({ decision: 'pending_review', requirements_json: { approval: { status: 'pending' } } }).stage)
      .toBe('awaiting_approval');
  });

  it('needs_evidence is needs_requirements', () => {
    expect(deriveVettingStage({ decision: 'needs_evidence' }).stage).toBe('needs_requirements');
  });

  it('pending_review with no approval is in_review', () => {
    expect(deriveVettingStage({ decision: 'pending_review' }).stage).toBe('in_review');
  });

  it('carries the decision and approvalStatus through', () => {
    const v = deriveVettingStage({ decision: 'approved_bid_pursuit', requirements_json: { approval: { status: 'approved' } } });
    expect(v.decision).toBe('approved_bid_pursuit');
    expect(v.approvalStatus).toBe('approved');
  });

  it('tolerates a malformed requirements_json', () => {
    expect(deriveVettingStage({ decision: 'pending_review', requirements_json: 'oops' as unknown }).stage).toBe('in_review');
    expect(deriveVettingStage({ decision: 'pending_review', requirements_json: null }).approvalStatus).toBeNull();
  });

  it('an absent decision with no approval is not_vetted', () => {
    expect(deriveVettingStage({}).stage).toBe('not_vetted');
    expect(deriveVettingStage({ decision: null }).stage).toBe('not_vetted');
  });
});
