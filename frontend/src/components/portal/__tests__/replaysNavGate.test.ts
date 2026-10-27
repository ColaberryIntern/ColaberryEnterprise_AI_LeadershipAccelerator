import { showReplaysTab } from '../replaysNavGate';
import { DISCOVERY_FALLBACK } from '../../../contexts/BroadcastDiscoveryContext';

/**
 * The four states a sidebar gate can be in, and only one of them shows the tab.
 *
 * This is a two-term boolean with its own file and its own suite because the second term is
 * the one that looks redundant. Gating on `!disabled` alone was the first version: `disabled`
 * starts false, so the tab appeared on every page load and vanished when the 404 arrived.
 * With `BROADCAST_ENABLED` dark — the documented default, and production's state today — the
 * flash is the only thing the tab would ever do.
 */

describe('showReplaysTab', () => {
  it('shows the tab only when discovery has ANSWERED and broadcasting is on', () => {
    expect(showReplaysTab({ answered: true, disabled: false })).toBe(true);
  });

  it('hides it while the first request is still in flight', () => {
    // THE CASE THE SECOND TERM EXISTS FOR. `disabled` is false here and means nothing yet.
    expect(showReplaysTab({ answered: false, disabled: false })).toBe(false);
  });

  it('hides it when broadcasting is off', () => {
    expect(showReplaysTab({ answered: true, disabled: true })).toBe(false);
  });

  it('hides it when neither is known', () => {
    expect(showReplaysTab({ answered: false, disabled: true })).toBe(false);
  });

  it('hides it outside the discovery provider, from the real fallback', () => {
    // Not a hand-made object: the actual exported fallback, so a change to it that made the
    // tab appear without a provider fails here.
    expect(showReplaysTab(DISCOVERY_FALLBACK)).toBe(false);
  });
});
