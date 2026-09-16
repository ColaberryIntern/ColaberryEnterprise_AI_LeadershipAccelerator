import { getProviderCapabilities, type ProviderCapabilities, type ProviderKey } from './providerCapabilities';
import { commentaryExceedsLimit, escapeLittleText, COMMENTARY_MAX_CHARS } from './linkedInText';
import { headerValue, isPermanentStatus, messageOf, providerCodeOf } from './linkedInErrors';
import type { LinkedInHttp } from './linkedInHttp';
import { LINKEDIN_IMAGE_MIME_TYPES, uploadImages, type UploadedImage } from './linkedInImages';
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

/**
 * LinkedInAdapter — the first adapter that talks to a real network.
 *
 * WHAT IT COVERS, AND WHY BOTH. LinkedIn is two products that share one wire format:
 *   - MEMBER posting (`w_member_social`) - SELF-SERVE, no partner review, available today.
 *   - ORGANIZATION posting (`w_organization_social`) - Community Management API, an
 *     application LinkedIn can decline, weeks of waiting.
 * The only difference at this layer is the author URN, one field. So this adapter takes the
 * author as a parameter and serves both; which one ships first is a business decision, not a
 * code one, and it does not need to be made for this file to be correct.
 *
 * THE TRANSPORT QUIRKS ENCODED HERE were verified by reading a working implementation, not
 * inferred from documentation. Each one fails the post rather than degrading it:
 *
 *   1. `LinkedIn-Version: YYYYMM` is REQUIRED on every `/rest/` call and has no default. Only
 *      ~12 monthly versions stay active; a sunset one returns 426 NONEXISTENT_VERSION. That is
 *      a scheduled outage with no code change behind it, which is why the version is a named
 *      constant with a review date rather than a literal buried in a header block.
 *   2. `commentary` is "little text": ``\ | { } @ [ ] ( ) < > # * _ ~`` must be escaped or the
 *      call 422s. Marketing copy is full of them (see linkedInText.ts).
 *   3. The created post's URN comes back in the `x-restli-id` RESPONSE HEADER, not the body. An
 *      adapter that reads only the body records no external id and permanently loses the
 *      ability to reconcile that post.
 *   4. Images are not attached, they are REFERENCED: each one is uploaded first through the
 *      Images API (linkedInImages.ts) and the post carries the resulting URN. One image is
 *      `content.media`; two or more is `content.multiImage`. Different shapes, and the wrong
 *      one is a 422.
 *
 * NO TOKEN IS STORED, CACHED OR LOGGED HERE. The adapter is constructed with a function that
 * fetches the account's access token on demand (`channelAccountService.getAccessToken`, which
 * opens the sealed credential). Holding one in a field would keep a plaintext token alive in
 * process memory for the lifetime of the adapter and make it visible to any heap dump.
 */

/**
 * The LinkedIn API version this adapter speaks.
 *
 * REVIEW BY 2027-03. LinkedIn retires versions on a rolling ~12-month window and a retired one
 * returns 426 with no warning and no deploy on our side. When the 426 arrives this constant is
 * the single thing to change; `publish` classifies that status as permanent and names this
 * constant in the message so the fix is obvious from the dead-letter row alone.
 */
export const LINKEDIN_API_VERSION = '202609';

const POSTS_URL = 'https://api.linkedin.com/rest/posts';

export type { LinkedInHttp, LinkedInHttpResponse } from './linkedInHttp';

export interface LinkedInAdapterOptions {
  provider: Extract<ProviderKey, 'linkedin_member' | 'linkedin_organization'>;
  /** Resolves the account's access token at call time. Never held. */
  getToken: (accountId: string) => Promise<string>;
  /** `urn:li:person:{sub}` or `urn:li:organization:{id}` for the account. */
  getAuthorUrn: (accountId: string) => Promise<string>;
  /** Bytes for an attachment by storage key (`mediaStore.read` in production). */
  readMedia: (ref: string) => Promise<Buffer>;
  http: LinkedInHttp;
  clock?: () => Date;
  /** Injected so the image-processing wait is instant in tests. */
  sleep?: (ms: number) => Promise<void>;
}

export class LinkedInAdapter implements SocialProviderAdapter {
  readonly provider: ProviderKey;

  private readonly opts: LinkedInAdapterOptions;

  private readonly clock: () => Date;

  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: LinkedInAdapterOptions) {
    this.provider = opts.provider;
    this.opts = opts;
    this.clock = opts.clock ?? (() => new Date());
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => { setTimeout(resolve, ms); }));
  }

  /**
   * The OAuth authorization-code exchange is not built yet, and this refuses rather than
   * pretending. Connecting happens through `channelAccountService.connectAccount` with a token
   * obtained out of band until that flow lands.
   */
  async connect(_input: ConnectInput): Promise<ConnectionResult> {
    throw new AdapterUnsupportedError(
      'The LinkedIn OAuth flow is not built yet. Connect the account with a token obtained out of band.',
      this.provider,
    );
  }

  async refreshCredential(_accountId: string): Promise<void> {
    // LinkedIn member tokens expire and the self-serve product's refresh behaviour has not been
    // confirmed against current documentation. Refusing loudly beats a no-op that lets a
    // connection die silently weeks later, which is the exact failure oauth_token_vault
    // documents for Microsoft Graph.
    throw new AdapterUnsupportedError(
      'LinkedIn credential refresh is not implemented. The account must be reconnected when its token expires.',
      this.provider,
    );
  }

  async capabilities(_accountId: string): Promise<ProviderCapabilities> {
    return getProviderCapabilities(this.provider);
  }

  /**
   * Everything checkable without spending a network call, so a bad post fails in the composer
   * rather than at 6am from the queue.
   */
  async validate(content: PublishPayload): Promise<ValidationResult> {
    const reasons: string[] = [];

    if (content.text.trim() === '') {
      reasons.push('LinkedIn will not accept an empty post.');
    }
    if (commentaryExceedsLimit(content.text)) {
      reasons.push(`LinkedIn allows ${COMMENTARY_MAX_CHARS} characters; this post is longer.`);
    }
    // Everything about the attachments that can be known without reading them. Each of these
    // would otherwise fail on step one or two of the upload, after the text had been accepted.
    const caps = getProviderCapabilities(this.provider);
    const videos = content.media.filter((m) => m.mimeType.startsWith('video/'));
    if (videos.length > 0) {
      // Stated rather than silently dropped: a post that published without its video would look
      // successful and be wrong.
      reasons.push('LinkedIn video posting is not implemented in this adapter yet; publish the video by handoff.');
    }
    const unsupported = content.media.filter((m) => !m.mimeType.startsWith('video/') && !LINKEDIN_IMAGE_MIME_TYPES.has(m.mimeType));
    if (unsupported.length > 0) {
      reasons.push(`LinkedIn does not accept ${unsupported.map((m) => m.mimeType).join(', ')}. Use PNG, JPEG or GIF.`);
    }
    if (caps.image && content.media.length > caps.image.maxPerPost) {
      reasons.push(`LinkedIn allows ${caps.image.maxPerPost} image${caps.image.maxPerPost === 1 ? '' : 's'} on this kind of post; this one has ${content.media.length}.`);
    }
    if (caps.image) {
      const limit = caps.image.maxSizeMb * 1024 * 1024;
      for (const m of content.media) {
        if (m.byteSize !== null && m.byteSize > limit) {
          reasons.push(`${m.ref} is ${(m.byteSize / 1024 / 1024).toFixed(1)} MB; LinkedIn's limit is ${caps.image.maxSizeMb} MB.`);
        }
      }
    }

    return reasons.length === 0 ? { ok: true } : { ok: false, permanent: true, reasons };
  }

  async publish(content: PublishPayload, idempotencyKey: string): Promise<PublishReceipt> {
    if (!content.accountId) {
      throw new ProviderPublishError('No LinkedIn account is connected for this post.', true, 'NoAccount', null);
    }

    const [token, author] = await Promise.all([
      this.opts.getToken(content.accountId),
      this.opts.getAuthorUrn(content.accountId),
    ]);

    const commentary = escapeLittleText(
      content.disclosureText ? `${content.text}\n\n${content.disclosureText}` : content.text,
    );

    // Images go first, and all of them, before the post exists. A failure here leaves no post
    // behind to reconcile; a failure after would.
    const images: UploadedImage[] = content.media.length === 0 ? [] : await uploadImages({
      http: this.opts.http, token, owner: author, apiVersion: LINKEDIN_API_VERSION,
      media: content.media, readMedia: this.opts.readMedia, sleep: this.sleep,
    });

    const response = await this.opts.http({
      method: 'POST',
      url: POSTS_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Required. Without it every call fails; with a sunset value, 426.
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
        // LinkedIn's own dedup. The worker's idempotency key is reused so a retry after an
        // ambiguous timeout cannot create a second post.
        'X-RestLi-Method': 'create',
        'x-li-idempotency-key': idempotencyKey,
      },
      body: {
        author,
        commentary,
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...postContent(images),
      },
    });

    if (response.status >= 400) {
      const permanent = isPermanentStatus(response.status);
      const base = response.status === 426
        ? `LinkedIn API version ${LINKEDIN_API_VERSION} has been retired. Update LINKEDIN_API_VERSION in linkedInAdapter.ts.`
        : `LinkedIn refused the post (HTTP ${response.status}).`;
      throw new ProviderPublishError(
        messageOf(response.body, base),
        permanent,
        providerCodeOf(response.body),
        response.status,
      );
    }

    // The post URN is in a HEADER, not the body. Header names are matched case-insensitively
    // because Node lowercases them and a fake in a test may not.
    const externalId = headerValue(response.headers, 'x-restli-id') ?? headerValue(response.headers, 'x-linkedin-id');
    if (!externalId) {
      // The post may well have been created. Treating this as transient would retry and
      // duplicate it; the honest answer is a permanent failure naming what happened, so a
      // person reconciles it rather than the queue guessing.
      throw new ProviderPublishError(
        'LinkedIn accepted the post but returned no x-restli-id header, so its id cannot be recorded. '
        + 'Check the page before retrying: the post may exist.',
        true,
        'MissingPostUrn',
        response.status,
      );
    }

    return {
      externalId,
      permalink: `https://www.linkedin.com/feed/update/${externalId}/`,
      publishedAt: this.clock().toISOString(),
      mode: 'live',
      httpStatus: response.status,
      providerCode: null,
      // Sanitized by construction: lengths and flags, never the token and never the body.
      requestMetadata: {
        api_version: LINKEDIN_API_VERSION,
        author_type: author.startsWith('urn:li:organization:') ? 'organization' : 'person',
        commentary_chars: commentary.length,
        had_disclosure: content.disclosureText !== null,
        media_count: content.media.length,
        image_urns: images.map((i) => i.urn),
      },
    };
  }

  async getPublication(externalId: string): Promise<PublicationState> {
    return {
      externalId,
      // Honest: reading a post back needs a token, and this adapter is given one per ACCOUNT,
      // not per post id. Status polling is a later task (spec section 9 lists it separately);
      // reporting 'live' here would be a fabricated status.
      status: 'unknown',
      checkedAt: this.clock().toISOString(),
    };
  }

  async fetchOrganicMetrics(_range: DateRange, _cursor?: string): Promise<MetricPage> {
    // Not implemented, and an empty page would read as "zero engagement" - the exact
    // fabricated-metric failure ESC-002 exists for. Refuse instead.
    throw new AdapterUnsupportedError(
      'LinkedIn organic metrics are not implemented. Link-level attribution is available via tracked links.',
      this.provider,
    );
  }
}

/**
 * One image and several images are different shapes in the Posts API, and sending a
 * one-element `multiImage` is a 422. Empty means a text post: no `content` key at all.
 */
function postContent(images: UploadedImage[]): Record<string, unknown> {
  if (images.length === 0) return {};
  const toRef = (i: UploadedImage) => (i.altText ? { id: i.urn, altText: i.altText } : { id: i.urn });
  if (images.length === 1) return { content: { media: toRef(images[0]) } };
  return { content: { multiImage: { images: images.map(toRef) } } };
}
