import {
  AdapterUnsupportedError,
  ProviderPublishError,
  type ConnectInput,
  type ConnectionResult,
  type DateRange,
  type MetricPage,
  type PublicationState,
  type PublishPayload,
  type PublishReceipt,
  type SocialProviderAdapter,
  type ValidationResult,
} from './socialProviderAdapter';
import { getProviderCapabilities, type ProviderCapabilities, type ProviderKey } from './providerCapabilities';
import { assemblePostText } from './postText';
import { publishToFacebookPage, publishToInstagram, type MetaPublishDeps, type MetaPublishResult } from './metaPublish';
import type { MetaHttp } from './metaGraph';

/**
 * metaAdapter - publishing to a Facebook Page and to an Instagram professional account.
 *
 * One class for both because everything except the posting sequence is shared: the same app, the
 * same Page token, the same error classification, the same validation shape. The two sequences
 * live in metaPublish.ts.
 *
 * WHAT IS DELIBERATELY NOT HERE:
 *   - `connect`: accounts are connected through the OAuth flow in services/marketing/oauth and
 *     sealed by channelAccountService. An adapter-level connect would be a second way in.
 *   - `refreshCredential`: Page tokens derived from a long-lived user token do not expire. If
 *     one stops working the account needs reconnecting, which the Brands page says.
 *   - metrics: refused rather than answered with an empty page, which would read as "zero
 *     engagement" - the fabricated-metric failure ESC-002 exists for.
 *
 * MEDIA. Meta fetches attachments from a URL rather than taking bytes, so this adapter is given
 * a `signedUrlFor` rather than a `readMedia`. The URL is public (Meta's fetcher has no session),
 * unguessable, and expires in minutes - see mediaFetchRoutes.
 */

export type MetaProvider = Extract<ProviderKey, 'meta_facebook_page' | 'meta_instagram'>;

/** What Facebook and Instagram actually accept. GIF is not a Facebook photo upload format. */
export const META_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
export const META_VIDEO_MIME_TYPES = new Set(['video/mp4']);

export interface MetaAdapterOptions {
  provider: MetaProvider;
  /** The Page access token for the account. Resolved at call time, never held. */
  getToken: (accountId: string) => Promise<string>;
  /** The Page id, or the Instagram account id - what the connect flow stored. */
  getTargetId: (accountId: string) => Promise<string>;
  /** A short-lived public URL Meta can fetch, for one stored media key. */
  signedUrlFor: (ref: string) => Promise<string>;
  http: MetaHttp;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export class MetaAdapter implements SocialProviderAdapter {
  readonly provider: ProviderKey;

  private readonly opts: MetaAdapterOptions;

  private readonly clock: () => Date;

  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: MetaAdapterOptions) {
    this.provider = opts.provider;
    this.opts = opts;
    this.clock = opts.clock ?? (() => new Date());
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => { setTimeout(resolve, ms); }));
  }

  async connect(_input: ConnectInput): Promise<ConnectionResult> {
    throw new AdapterUnsupportedError(
      'Connect a Facebook or Instagram account from the Brands page; this adapter only publishes',
      this.provider,
    );
  }

  async refreshCredential(_accountId: string): Promise<void> {
    throw new AdapterUnsupportedError(
      'Facebook Page tokens do not expire, so there is nothing to refresh. If posting fails with an auth error, reconnect the account',
      this.provider,
    );
  }

  async capabilities(_accountId: string): Promise<ProviderCapabilities> {
    return getProviderCapabilities(this.provider);
  }

  /** Everything checkable without a network call, so a bad post fails in the composer. */
  async validate(content: PublishPayload): Promise<ValidationResult> {
    const caps = getProviderCapabilities(this.provider);
    const reasons: string[] = [];
    const instagram = this.provider === 'meta_instagram';
    const images = content.media.filter((m) => m.mimeType.startsWith('image/'));
    const videos = content.media.filter((m) => m.mimeType.startsWith('video/'));

    if (content.poll) reasons.push(`${caps.displayName} does not accept polls.`);

    // Instagram has no text-only post type at all. Said here, so it is refused in the composer
    // rather than at publish time - the operator can still hand off or attach an image.
    if (instagram && content.media.length === 0) {
      reasons.push('Instagram has no text-only post. Attach an image or a video.');
    }
    if (!instagram && content.media.length === 0 && content.text.trim() === '') {
      reasons.push('Facebook will not accept an empty post.');
    }

    // Measured on what will actually be sent - text plus tracked link plus any disclosure.
    const assembled = assemblePostText(content);
    if (assembled.length > caps.text.maxChars) {
      reasons.push(`${caps.displayName} allows ${caps.text.maxChars} characters including the tracked link and any disclosure; this post is ${assembled.length}.`);
    }

    const unsupported = content.media.filter(
      (m) => !META_IMAGE_MIME_TYPES.has(m.mimeType) && !META_VIDEO_MIME_TYPES.has(m.mimeType),
    );
    if (unsupported.length > 0) {
      reasons.push(`${caps.displayName} does not accept ${unsupported.map((m) => m.mimeType).join(', ')}. Use JPEG, PNG or MP4.`);
    }
    if (videos.length > 1) reasons.push(`${caps.displayName} takes one video per post; this post has ${videos.length}.`);
    if (videos.length > 0 && images.length > 0) {
      reasons.push(`${caps.displayName} cannot mix a video and images in one post; attach the video on its own.`);
    }
    if (caps.image && images.length > caps.image.maxPerPost) {
      reasons.push(`${caps.displayName} allows ${caps.image.maxPerPost} images per post; this one has ${images.length}.`);
    }
    if (caps.image) {
      const limit = caps.image.maxSizeMb * 1024 * 1024;
      // The image cap is for images only. Applying it to video is the defect the LinkedIn
      // adapter shipped and had caught in review; not repeated here.
      for (const m of images) {
        if (m.byteSize !== null && m.byteSize > limit) {
          reasons.push(`${m.ref} is ${(m.byteSize / 1024 / 1024).toFixed(1)} MB; ${caps.displayName}'s image limit is ${caps.image.maxSizeMb} MB.`);
        }
      }
    }
    if (caps.video) {
      for (const v of videos) {
        if (v.byteSize !== null && v.byteSize > caps.video.maxSizeMb * 1024 * 1024) {
          reasons.push(`${v.ref} is ${(v.byteSize / 1024 / 1024).toFixed(1)} MB; ${caps.displayName}'s video limit is ${caps.video.maxSizeMb} MB.`);
        }
        if (v.durationMs != null && v.durationMs > caps.video.maxDurationSec * 1000) {
          reasons.push(`${v.ref} runs ${Math.round(v.durationMs / 1000)} s; ${caps.displayName}'s limit is ${caps.video.maxDurationSec} s.`);
        }
      }
    }

    return reasons.length === 0 ? { ok: true } : { ok: false, permanent: true, reasons };
  }

  async publish(content: PublishPayload, idempotencyKey: string): Promise<PublishReceipt> {
    if (!content.accountId) {
      throw new ProviderPublishError(
        `No ${getProviderCapabilities(this.provider).displayName} account is connected for this brand. Connect one on the Brands page.`,
        true,
        'no_account',
        null,
      );
    }
    const [token, targetId] = await Promise.all([
      this.opts.getToken(content.accountId),
      this.opts.getTargetId(content.accountId),
    ]);
    const deps: MetaPublishDeps = {
      http: this.opts.http,
      token,
      targetId,
      signedUrlFor: this.opts.signedUrlFor,
      now: this.clock,
      sleep: this.sleep,
      env: this.opts.env,
    };
    const text = assemblePostText(content);
    const payload = { text, media: content.media };

    const result: MetaPublishResult = this.provider === 'meta_instagram'
      ? await publishToInstagram(payload, deps)
      : await publishToFacebookPage(payload, deps);

    return {
      externalId: result.externalId,
      permalink: result.permalink,
      publishedAt: this.clock().toISOString(),
      mode: 'live',
      httpStatus: 200,
      providerCode: null,
      // Sanitized: what was done and how big, never the token, the signed URLs or the copy.
      requestMetadata: {
        provider: this.provider,
        steps: result.steps,
        media_count: content.media.length,
        had_link: Boolean(content.linkUrl),
        chars: text.length,
        // Meta has no idempotency key; this is recorded so a receipt can be matched to the job
        // that produced it, and the duplicate check in metaPublish is what keeps retries safe.
        idempotency_key: idempotencyKey,
      },
    };
  }

  async getPublication(externalId: string): Promise<PublicationState> {
    return {
      externalId,
      // Honest: reading a post back needs the account's token, and this adapter is given one per
      // ACCOUNT, not per post id. Reporting 'live' here would be a fabricated status.
      status: 'unknown',
      checkedAt: this.clock().toISOString(),
    };
  }

  async fetchOrganicMetrics(_range: DateRange, _cursor?: string): Promise<MetricPage> {
    throw new AdapterUnsupportedError(
      'Meta organic metrics are not implemented. Link-level attribution is available via tracked links',
      this.provider,
    );
  }
}
