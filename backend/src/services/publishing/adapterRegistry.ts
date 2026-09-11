import { DryRunAdapter } from './dryRunAdapter';
import { HandoffAdapter } from './handoffAdapter';
import { decidePublishMode, getProviderCapabilities, PROVIDER_KEYS, type ProviderKey } from './providerCapabilities';
import { ProviderPublishError, type SocialProviderAdapter } from './socialProviderAdapter';

/**
 * Which adapter runs a job.
 *
 *   transport 'dry_run' -> DryRunAdapter for every provider. Tests, local dev, staging.
 *   transport 'live'    -> HandoffAdapter where the registry says handoff; otherwise a
 *                          PERMANENT error, because no live adapter exists yet.
 *
 * The 'live' default is deliberate. With every provider currently in handoff (app review
 * prepared, not submitted; no account connected), production resolves to HandoffAdapter for
 * every job, which is the truthful behaviour: packages for a person, no pretend posts. The
 * moment a provider becomes `direct` in the registry, the same default STOPS with
 * `NoLiveAdapterError` instead of publishing nothing silently - the failure is loud and
 * permanent, and the job dead-letters with a reason a human can act on.
 */

export type PublishingTransport = 'dry_run' | 'live';

export class NoLiveAdapterError extends ProviderPublishError {
  constructor(provider: ProviderKey) {
    super(`No live adapter is implemented for ${provider}; the registry marks it direct-publishable but nothing can carry the request.`, true, 'no_live_adapter');
    this.name = 'NoLiveAdapterError';
  }
}

export function transportFromEnv(env: NodeJS.ProcessEnv = process.env): PublishingTransport {
  return env.PUBLISHING_TRANSPORT === 'dry_run' ? 'dry_run' : 'live';
}

export function isProviderKey(s: string): s is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(s);
}

export type AdapterFactory = (provider: ProviderKey) => SocialProviderAdapter;

/** A factory with one adapter instance per provider, so dry-run receipts stay idempotent within a run. */
export function makeAdapterFactory(transport: PublishingTransport, clock: () => Date = () => new Date()): AdapterFactory {
  const cache = new Map<ProviderKey, SocialProviderAdapter>();
  return (provider) => {
    const hit = cache.get(provider);
    if (hit) return hit;
    let adapter: SocialProviderAdapter;
    if (transport === 'dry_run') {
      adapter = new DryRunAdapter(provider, clock);
    } else {
      const mode = decidePublishMode(getProviderCapabilities(provider), 'publish');
      if (mode.mode === 'handoff') adapter = new HandoffAdapter(provider, clock);
      else throw new NoLiveAdapterError(provider);
    }
    cache.set(provider, adapter);
    return adapter;
  };
}
