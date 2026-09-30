import { hardStopReason, mayProceed } from '../hardStop';
import type { GovernorContext } from '../../types';

const NOW = new Date('2026-08-23T12:00:00Z');

function ctx(over: Partial<GovernorContext['hardStop']> = {}): GovernorContext {
  return {
    enrollment_id: 'e1',
    primary_state: 'ACTIVATING',
    overlays: [],
    scores: { e: 10, i: 0, f: 0 },
    affinities: [],
    readout: {} as any,
    days_in_current_state: 3,
    contactability: { email: { eligible: true } },
    hardStop: {
      converted: false,
      unsubscribed: false,
      dnc: false,
      consentRevoked: false,
      killSwitch: false,
      campaignInactive: false,
      ...over,
    },
    asOf: NOW,
  };
}

describe('tier 0 terminates the decision — it is not an action', () => {
  it('permits a clean learner through', () => {
    expect(hardStopReason(ctx())).toBeNull();
    expect(mayProceed(ctx())).toBe(true);
  });

  it.each([
    ['converted', 'converted'],
    ['unsubscribed', 'unsubscribed'],
    ['dnc', 'dnc'],
    ['consentRevoked', 'consent_revoked'],
    ['killSwitch', 'kill_switch'],
    ['campaignInactive', 'campaign_inactive'],
  ])('stops on %s', (flag, reason) => {
    const c = ctx({ [flag]: true } as any);
    expect(hardStopReason(c)).toBe(reason);
    expect(mayProceed(c)).toBe(false);
  });

  it('stops a CONVERTED learner — this is how the 7 staff accounts are excluded', () => {
    // Verified in production: 9 CONVERTED, of which 7 are @colaberry.com staff
    // with community_members.role='staff'. They must never receive acquisition
    // messaging, and this is the check that guarantees it.
    expect(mayProceed(ctx({ converted: true }))).toBe(false);
  });

  it('treats a MISSING hardStop block as a stop, not as nothing to stop', () => {
    // Absent evidence is not evidence of eligibility.
    const broken = { ...ctx(), hardStop: undefined } as unknown as GovernorContext;
    expect(hardStopReason(broken)).toBe('kill_switch');
    expect(mayProceed(broken)).toBe(false);
  });

  it('reports converted first when several conditions apply', () => {
    // Only affects which reason is recorded; any one of them stops the decision.
    // Converted is the most informative for a human reading the row.
    expect(hardStopReason(ctx({ converted: true, dnc: true, killSwitch: true }))).toBe(
      'converted',
    );
  });

  it('is pure — same input, same answer', () => {
    const c = ctx({ dnc: true });
    expect(hardStopReason(c)).toBe(hardStopReason(c));
  });
});
