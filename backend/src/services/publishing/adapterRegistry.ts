import { DryRunAdapter } from './dryRunAdapter';
import { HandoffAdapter } from './handoffAdapter';
import { LinkedInAdapter } from './linkedInAdapter';
import { MetaAdapter } from './metaAdapter';
import { makeMetaHttp } from './metaHttp';
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
 * `LIVE_CONNECTORS` - read from the environment variable of the same name at boot, so once the
 * credentials exist the entire activation is `LIVE_CONNECTORS=linkedin_member` plus a restart.
 * The env reader only accepts providers listed in `IMPLEMENTED_CONNECTORS`, which a test holds
 * equal to the keys here. Anything marked direct with no entry here still raises
 * `NoLiveAdapterError`: loud and permanent, dead-lettered with a reason, rather than publishing
 * nothing silently.
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
  /** The provider's own id for the account: a Facebook Page id, an Instagram account id. */
  getTargetId: (accountId: string) => Promise<string>;
  /**
   * A short-lived public URL for one attachment. Meta FETCHES media rather than taking bytes,
   * so an adapter for it needs a URL where LinkedIn needs a Buffer.
   */
  signedUrlFor: (ref: string) => Promise<string>;
}

/**
 * Where Meta is told to fetch media from. It must be a host reachable from the public internet
 * and serving `/m/...`; `MEDIA_PUBLIC_BASE_URL` overrides, otherwise the OAuth base (itself
 * derived from the live LinkedIn redirect) is the same public host.
 */
export function mediaPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.MEDIA_PUBLIC_BASE_URL?.trim() || env.MARKETING_OAUTH_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const linkedIn = env.LINKEDIN_REDIRECT_URI?.trim();
  if (!linkedIn) return null;
  try {
    return new URL(linkedIn).origin;
  } catch {
    return null;
  }
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
    getTargetId: async (accountId) => {
      const { getProviderAccountId } = await import('../marketing/channelAccountService');
      return getProviderAccountId(accountId);
    },
    signedUrlFor: async (ref) => {
      const base = mediaPublicBaseUrl();
      if (!base) {
        // Permanent: without a public host there is no URL Meta could fetch, and retrying
        // cannot invent one. Named so the dead-letter row says which variable to set.
        throw new ProviderPublishError(
          'No public base URL is configured for media (MEDIA_PUBLIC_BASE_URL), so Meta cannot fetch the attachment.',
          true,
          'media_base_url_missing',
          null,
        );
      }
      const { signedUrl } = await import('../media/mediaStore');
      return signedUrl(ref, base).url;
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
  meta_facebook_page: (deps, clock) => new MetaAdapter({
    provider: 'meta_facebook_page', getToken: deps.getToken, getTargetId: deps.getTargetId,
    signedUrlFor: deps.signedUrlFor, http: makeMetaHttp(), clock,
  }),
  meta_instagram: (deps, clock) => new MetaAdapter({
    provider: 'meta_instagram', getToken: deps.getToken, getTargetId: deps.getTargetId,
    signedUrlFor: deps.signedUrlFor, http: makeMetaHttp(), clock,
  }),
};

/** The providers a live adapter exists for; held equal to IMPLEMENTED_CONNECTORS by a test. */
export const LIVE_ADAPTER_KEYS: readonly ProviderKey[] = Object.keys(LIVE_ADAPTERS) as ProviderKey[];

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
