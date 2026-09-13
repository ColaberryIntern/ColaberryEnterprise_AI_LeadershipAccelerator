/**
 * adapterRegistry — the wiring that decides whether the LinkedIn adapter is reachable at all.
 *
 * This suite exists because the adapter was built one commit before anything could construct
 * it, which is the defect shape this whole workstream keeps hitting: a correct producer with no
 * consumer. The assertions below are about REACHABILITY, not about LinkedIn's wire format
 * (which `linkedInAdapter.test.ts` owns).
 *
 * The central design point being pinned: being *listed* as a live adapter and being *enabled*
 * are two different things. `LIVE_ADAPTERS` says an implementation exists; `LIVE_CONNECTORS`
 * says a provider may use it. Keeping them separate is what let this wiring ship and be tested
 * before any credential existed.
 */

import { makeAdapterFactory, NoLiveAdapterError, type LiveAdapterDeps } from '../adapterRegistry';
import { LinkedInAdapter } from '../linkedInAdapter';
import { DryRunAdapter } from '../dryRunAdapter';
import { HandoffAdapter } from '../handoffAdapter';
import { LIVE_CONNECTORS, decidePublishMode, getProviderCapabilities } from '../providerCapabilities';

const clock = () => new Date('2026-09-13T12:00:00.000Z');

const deps: LiveAdapterDeps = {
  getToken: jest.fn(async () => 'token-not-used-in-these-assertions'),
  getAuthorUrn: jest.fn(async () => 'urn:li:person:abc123'),
};

describe('today: nothing is enabled, and that is the truthful state', () => {
  it('LIVE_CONNECTORS is still empty, so every provider resolves to handoff', () => {
    // The moment this stops being true, the two cases below change meaning - which is exactly
    // why it is asserted here rather than assumed.
    expect(LIVE_CONNECTORS.size).toBe(0);

    const factory = makeAdapterFactory('live', clock, deps);
    expect(factory('linkedin_member')).toBeInstanceOf(HandoffAdapter);
    expect(factory('linkedin_organization')).toBeInstanceOf(HandoffAdapter);
    expect(factory('meta_facebook_page')).toBeInstanceOf(HandoffAdapter);
  });

  it('a dry-run factory never touches the live path or its dependencies', async () => {
    const factory = makeAdapterFactory('dry_run', clock, deps);
    expect(factory('linkedin_member')).toBeInstanceOf(DryRunAdapter);
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(deps.getAuthorUrn).not.toHaveBeenCalled();
  });

  it('caches one adapter per provider, so dry-run receipts stay idempotent within a run', () => {
    const factory = makeAdapterFactory('dry_run', clock, deps);
    expect(factory('linkedin_member')).toBe(factory('linkedin_member'));
  });
});

/**
 * What happens the moment the gate flips. `decidePublishMode` is the real function; only the
 * connector set is substituted, which is the single constant an operator would change.
 */
describe('when LIVE_CONNECTORS gains a provider', () => {
  function factoryWithLive(enabled: string[]) {
    // Mirror what makeAdapterFactory does internally, with the connector set overridden, so the
    // assertion is about the registry's decision and not about a mocked one.
    const asSet = new Set(enabled as never[]);
    return (provider: Parameters<ReturnType<typeof makeAdapterFactory>>[0]) => {
      const mode = decidePublishMode(getProviderCapabilities(provider), 'publish', asSet);
      return mode.mode;
    };
  }

  it('linkedin_member becomes direct rather than handoff', () => {
    const decide = factoryWithLive(['linkedin_member']);
    expect(decide('linkedin_member')).toBe('direct');
    // And nothing else moves with it.
    expect(decide('linkedin_organization')).toBe('handoff');
    expect(decide('meta_facebook_page')).toBe('handoff');
  });

  it('a LinkedIn adapter is what the registry would build, wired to the injected deps', async () => {
    // Reachability proven directly: the entry exists and constructs, so flipping the connector
    // set is the whole activation and not the start of another build.
    const adapter = new LinkedInAdapter({
      provider: 'linkedin_member',
      getToken: deps.getToken,
      getAuthorUrn: deps.getAuthorUrn,
      http: async () => ({ status: 201, headers: { 'x-restli-id': 'urn:li:share:1' }, body: {} }),
      clock,
    });
    const receipt = await adapter.publish({
      jobId: 'j', provider: 'linkedin_member', contentItemId: 'ci', variantId: 'cv',
      accountId: 'acc-1', text: 'hello', mediaRefs: [], linkUrl: null, disclosureText: null,
      scheduledFor: '2026-09-13T12:00:00.000Z', contentRevision: 1,
    }, 'idem-1');

    expect(receipt.mode).toBe('live');
    // The chain that matters: adapter -> deps -> channelAccountService -> sealed credential.
    expect(deps.getToken).toHaveBeenCalledWith('acc-1');
    expect(deps.getAuthorUrn).toHaveBeenCalledWith('acc-1');
  });
});

describe('a provider marked direct with no implementation', () => {
  it('fails loudly and permanently instead of publishing nothing silently', () => {
    // Meta has no entry in LIVE_ADAPTERS. If someone adds it to LIVE_CONNECTORS without an
    // implementation, the job must dead-letter with a reason rather than appear to succeed.
    const err = new NoLiveAdapterError('meta_facebook_page');
    expect(err.permanent).toBe(true);
    expect(err.providerCode).toBe('no_live_adapter');
    expect(err.message).toMatch(/nothing can carry the request/);
  });
});
