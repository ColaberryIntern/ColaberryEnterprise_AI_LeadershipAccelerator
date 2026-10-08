import { newPostGate } from '../newPostGate';

/**
 * A post that could never go out should not be startable.
 *
 * Ali, 2026-10-08, on a brand with nothing connected: "I should not have the ability to create new
 * post if I don't have an account connected to that brand." The Overview offered "+ New post"
 * twice beside a tile reading "0 Channels that can publish".
 *
 * The case these tests exist for is the THIRD one: an unknown count is not a zero. The overview
 * reports null while loading and after a failure, and a gate that treated that as "no channels"
 * would turn an outage into a product that refuses to work.
 */

describe('a brand with no connected channel cannot start a post', () => {
  it('blocks when the brand has zero publishable channels', () => {
    const gate = newPostGate({ brandChosen: true, publishableChannels: 0 });
    expect(gate.allowed).toBe(false);
  });

  it('says what to do about it, not just that it is blocked', () => {
    const gate = newPostGate({ brandChosen: true, publishableChannels: 0 });
    expect(gate.reason).toContain('Brands & channels');
  });

  it('allows it as soon as one channel can publish', () => {
    expect(newPostGate({ brandChosen: true, publishableChannels: 1 }).allowed).toBe(true);
    expect(newPostGate({ brandChosen: true, publishableChannels: 7 }).allowed).toBe(true);
  });

  it('gives no reason when nothing is wrong', () => {
    expect(newPostGate({ brandChosen: true, publishableChannels: 2 }).reason).toBeNull();
  });
});

describe('an unknown count is not a zero', () => {
  it('stays OPEN while the overview has not loaded, or failed', () => {
    // The whole point. A failed request must not read as "this brand has no channels".
    const gate = newPostGate({ brandChosen: true, publishableChannels: null });
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBeNull();
  });
});

describe('"All brands" is not one brand', () => {
  it('does not block when no single brand is selected', () => {
    // There is no one brand's channel list to judge, and the composer asks for a brand anyway.
    expect(newPostGate({ brandChosen: false, publishableChannels: 0 }).allowed).toBe(true);
  });

  it('does not block on All brands even when channels exist', () => {
    expect(newPostGate({ brandChosen: false, publishableChannels: 3 }).allowed).toBe(true);
  });
});
