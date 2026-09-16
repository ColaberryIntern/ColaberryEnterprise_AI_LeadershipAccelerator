import { DryRunAdapter } from './dryRunAdapter';
import { HandoffAdapter } from './handoffAdapter';
import { LinkedInAdapter } from './linkedInAdapter';
import { makeLinkedInHttp } from './linkedInHttp';
import { decidePublishMode, getProviderCapabilities, PROVIDER_KEYS, type ProviderKey } from './providerCapabilities';
import { ProviderPublishError, type SocialProviderAdapter } from './socialProviderAdapter';

/**
 * Which adapter runs a job.
 *
 *   transport 'dry_run' -> DryRunAdapter for every provider. Tests, local dev, staging.
 *   transport 'live'    -> HandoffAdapter where the registry says handoff; otherwise a
 *                          PERMANENT error, because no live adapter exists yet.
 *
 * The 'live' default is deliberate. With every provider currently in handoff (`LIVE_CONNECTORS`
 * is empty: app review prepared, not submitted; no credentials), production resolves to
 * HandoffAdapter for every job, which is the truthful behaviour: packages for a person, no
 * pretend posts.
 *
 * WHERE A REAL ADAPTER PLUGS IN. `LIVE_ADAPTERS` below maps a provider to its implementation.
 * A provider reaches it only when `decidePublishMode` says `direct`, which requires it to be in
 * `LIVE_CONNECTORS` - so today the LinkedIn entry is present and unreachable, and flipping that
 * one constant (once credentials exist) is the entire activation. Anything marked direct with
 * no entry here still raises `NoLiveAdapterError`: loud and permanent, dead-lettered with a
 * reason, rather than publishing nothing silently.
 *
 * DEPENDENCIES ARE INJECTED, not imported at module load. `channelAccountService` reaches the
 * models and the credential vault, and importing it here directly would both create a cycle
 * risk and drag a database-backed module into every test that builds a dry-run factory. The
 * default resolver requires it lazily, at the moment a live adapter is actually constructed.
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

/**
 * What a live adapter needs from the rest of the system: a token for an account, and that
 * account's author URN. Both are per-call by design - holding a token in a field would keep
 * plaintext alive in process memory for the life of the adapter.
 */
export interface LiveAdapterDeps {
  getToken: (accountId: string) => Promise<string>;
  getAuthorUrn: (accountId: string) => Promise<string>;
  /** Bytes of an attachment by storage key. Verified against the key's hash on read. */
  readMedia: (ref: string) => Promise<Buffer>;
}

/** Lazily resolved so a dry-run factory never loads the models or the vault. */
function defaultLiveDeps(): LiveAdapterDeps {
  return {
    getToken: async (accountId) => {
      const { getAccessToken } = await import('../marketing/channelAccountService');
      return getAccessToken(accountId);
    },
    getAuthorUrn: async (accountId) => {
      const { getAuthorUrn } = await import('../marketing/channelAccountService');
      return getAuthorUrn(accountId);
    },
    readMedia: async (ref) => {
      const { read } = await import('../media/mediaStore');
      return read(ref);
    },
  };
}

/**
 * Provider -> live implementation. Reached only when `decidePublishMode` says `direct`.
 *
 * Adding a provider here does NOT enable it; adding it to `LIVE_CONNECTORS` does. Keeping those
 * two separate is what lets this wiring ship and be tested before any credential exists.
 */
const LIVE_ADAPTERS: Partial<Record<ProviderKey, (deps: LiveAdapterDeps, clock: () => Date) => SocialProviderAdapter>> = {
  linkedin_member: (deps, clock) => new LinkedInAdapter({
    provider: 'linkedin_member', getToken: deps.getToken, getAuthorUrn: deps.getAuthorUrn, readMedia: deps.readMedia,
    http: makeLinkedInHttp(), clock,
  }),
  linkedin_organization: (deps, clock) => new LinkedInAdapter({
    provider: 'linkedin_organization', getToken: deps.getToken, getAuthorUrn: deps.getAuthorUrn, readMedia: deps.readMedia,
    http: makeLinkedInHttp(), clock,
  }),
};

/** A factory with one adapter instance per provider, so dry-run receipts stay idempotent within a run. */
export function makeAdapterFactory(
  transport: PublishingTransport,
  clock: () => Date = () => new Date(),
  deps: LiveAdapterDeps = defaultLiveDeps(),
): AdapterFactory {
  const cache = new Map<ProviderKey, SocialProviderAdapter>();
  return (provider) => {
    const hit = cache.get(provider);
    if (hit) return hit;
    let adapter: SocialProviderAdapter;
    if (transport === 'dry_run') {
      adapter = new DryRunAdapter(provider, clock);
    } else {
      const mode = decidePublishMode(getProviderCapabilities(provider), 'publish');
      if (mode.mode === 'handoff') {
        adapter = new HandoffAdapter(provider, clock);
      } else {
        const build = LIVE_ADAPTERS[provider];
        if (!build) throw new NoLiveAdapterError(provider);
        adapter = build(deps, clock);
      }
    }
    cache.set(provider, adapter);
    return adapter;
  };
}
