import {
  routeExplorerReply,
  shouldRouteExplorerReply,
  NOT_HANDLED,
} from '../explorerInboundRouter';

/**
 * Plan §21.3: "Explorer campaigns must NOT use the bypassing auto-reply path."
 *
 * The two properties under test pull in opposite directions and both matter:
 *
 *   1. An Explorer reply must NEVER reach the auto-reply block, because that
 *      block sends via nodemailer without passing through
 *      messageValidatorService — so the Explorer fact guard never runs on it.
 *
 *   2. EVERY OTHER CAMPAIGN must be completely unaffected. This sits on the
 *      live inbound path for the whole system, and a change that quietly
 *      suppressed ordinary lead auto-replies would be a much worse bug than the
 *      one it fixes.
 */

describe('it takes over for Explorers', () => {
  it('handles a reply from a known Explorer when the flag is on', () => {
    const r = routeExplorerReply({ enrollmentId: 'enr-1', flagEnabled: true }, 'Hello!');
    expect(r.handled).toBe(true);
    expect(r.suppressAutoReply).toBe(true);
  });

  it('classifies the reply it took over', () => {
    const r = routeExplorerReply({ enrollmentId: 'enr-1', flagEnabled: true }, 'unsubscribe');
    expect(r.classification?.class).toBe('OPT_OUT');
    expect(r.classification?.route).toBe('PROCESS_OPT_OUT');
  });

  it('suppresses the auto-reply even when classification falls back to OTHER', () => {
    // "We could not classify this" is not a licence for an unvalidated
    // generator to answer instead — it is the strongest reason to stay quiet.
    const r = routeExplorerReply({ enrollmentId: 'enr-1', flagEnabled: true }, 'zzz', null);
    expect(r.classification?.class).toBe('OTHER');
    expect(r.suppressAutoReply).toBe(true);
  });
});

describe('every other campaign is untouched', () => {
  it('does not handle a sender who is not an Explorer', () => {
    // The ordinary CRM lead path, which must behave exactly as it did before
    // this file existed.
    expect(routeExplorerReply({ enrollmentId: null, flagEnabled: true }, 'Hi')).toEqual(
      NOT_HANDLED,
    );
  });

  it('does not handle anything when the flag is off', () => {
    expect(routeExplorerReply({ enrollmentId: 'enr-1', flagEnabled: false }, 'Hi')).toEqual(
      NOT_HANDLED,
    );
  });

  it('never suppresses an auto-reply it did not handle', () => {
    // The property the live path depends on: not-handled must always mean
    // not-suppressed, or ordinary leads silently stop getting replies.
    for (const ctx of [
      { enrollmentId: null, flagEnabled: true },
      { enrollmentId: 'enr-1', flagEnabled: false },
      { enrollmentId: null, flagEnabled: false },
      { enrollmentId: '', flagEnabled: true },
    ]) {
      const r = routeExplorerReply(ctx, 'anything at all');
      expect(r.handled).toBe(false);
      expect(r.suppressAutoReply).toBe(false);
    }
  });

  it('does not classify a reply it did not handle', () => {
    // Even an obvious opt-out from a non-Explorer stays with the existing
    // unsubscribe handling upstream — this router must not quietly become a
    // second opt-out path.
    expect(routeExplorerReply({ enrollmentId: null, flagEnabled: true }, 'unsubscribe'))
      .toEqual(NOT_HANDLED);
  });
});

describe('the gate fails closed', () => {
  it.each([
    ['empty enrollment id', { enrollmentId: '', flagEnabled: true }],
    ['null enrollment id', { enrollmentId: null, flagEnabled: true }],
    ['flag off', { enrollmentId: 'enr-1', flagEnabled: false }],
  ])('%s does not route', (_label, ctx) => {
    expect(shouldRouteExplorerReply(ctx)).toBe(false);
  });

  it('requires both conditions, not either', () => {
    expect(shouldRouteExplorerReply({ enrollmentId: 'enr-1', flagEnabled: true })).toBe(true);
  });
});
