import { getProviderCapabilities, type ProviderCapabilities, type ProviderKey } from './providerCapabilities';
import { commentaryExceedsLimit, escapeLittleText, COMMENTARY_MAX_CHARS } from './linkedInText';
import { headerValue, isPermanentStatus, messageOf, providerCodeOf } from './linkedInErrors';
import type { LinkedInHttp } from './linkedInHttp';
import { LINKEDIN_DOCUMENT_MIME_TYPES, LINKEDIN_IMAGE_MIME_TYPES, uploadDocument, uploadImages, type UploadedImage } from './linkedInImages';
import { LINKEDIN_VIDEO_MIME_TYPES, uploadVideo } from './linkedInVideo';
import { pollProblems } from '../content/pollSpec';
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
 *   5. A poll is `content.poll` with the duration as a NAMED value (`THREE_DAYS`), not a number,
 *      and `content` is one-of: a poll post cannot also carry media. Both refused at validate.
 *   6. A document (PDF) goes through the Documents API - same three steps as an image - and the
 *      post references it as `content.media { id, title }`: a TITLE, shown on the post, where an
 *      image carries alt text. One document per post, and nothing else alongside it.
 *   7. A video goes through the Videos API (linkedInVideo.ts): chunked parts with ETag receipts,
 *      a finalize call, a longer processing wait. One video per post, alone, MP4 only.
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
    // Measured on what will actually be sent - text plus the tracked link plus any disclosure -
    // so a post that fits without its link cannot be refused by LinkedIn once the link is added.
    if (commentaryExceedsLimit(assembleCommentary(content))) {
      reasons.push(`LinkedIn allows ${COMMENTARY_MAX_CHARS} characters including the tracked link and any disclosure; this post is longer.`);
    }
    // Everything about the attachments that can be known without reading them. Each of these
    // would otherwise fail on step one or two of the upload, after the text had been accepted.
    const caps = getProviderCapabilities(this.provider);
    if (content.poll) {
      if (!caps.poll) {
        reasons.push(`${caps.displayName} does not accept polls.`);
      } else {
        reasons.push(...pollProblems(caps.displayName, caps.poll, content.poll));
        if (content.media.length > 0) reasons.push('A LinkedIn poll cannot carry media; remove the attachment or the poll.');
      }
    }
    const videos = content.media.filter((m) => m.mimeType.startsWith('video/'));
    if (videos.length > 0) {
      const unsupportedVideo = videos.filter((m) => !LINKEDIN_VIDEO_MIME_TYPES.has(m.mimeType));
      if (unsupportedVideo.length > 0) reasons.push(`LinkedIn takes MP4 video only, not ${unsupportedVideo.map((m) => m.mimeType).join(', ')}.`);
      if (videos.length > 1) reasons.push(`LinkedIn takes one video per post; this post has ${videos.length}.`);
      if (videos.length !== content.media.length) reasons.push('A LinkedIn video post cannot also carry images or a document; attach the video on its own.');
      if (caps.video) {
        for (const v of videos) {
          if (v.byteSize !== null && v.byteSize > caps.video.maxSizeMb * 1024 * 1024) {
            reasons.push(`${v.ref} is ${(v.byteSize / 1024 / 1024).toFixed(1)} MB; LinkedIn's video limit is ${caps.video.maxSizeMb} MB.`);
          }
          if (v.durationMs != null && v.durationMs > caps.video.maxDurationSec * 1000) {
            reasons.push(`${v.ref} runs ${Math.round(v.durationMs / 1000)} s; LinkedIn's limit is ${caps.video.maxDurationSec} s.`);
          }
        }
      }
    }
    const unsupported = content.media.filter((m) => !m.mimeType.startsWith('video/') && !LINKEDIN_IMAGE_MIME_TYPES.has(m.mimeType) && !LINKEDIN_DOCUMENT_MIME_TYPES.has(m.mimeType));
    if (unsupported.length > 0) {
      reasons.push(`LinkedIn does not accept ${unsupported.map((m) => m.mimeType).join(', ')}. Use PNG, JPEG, GIF, MP4 or PDF.`);
    }
    const documents = content.media.filter((m) => LINKEDIN_DOCUMENT_MIME_TYPES.has(m.mimeType));
    if (documents.length > 1) reasons.push(`LinkedIn takes one document per post; this post has ${documents.length}.`);
    if (documents.length > 0 && documents.length !== content.media.length) reasons.push('A LinkedIn document post cannot also carry images or video; attach the PDF on its own.');
    if (documents.length > 0 && !documents[0].altText?.trim()) reasons.push('The document needs a title (the description typed at upload); LinkedIn shows it on the post.');
    if (documents.length > 0 && caps.document) {
      for (const d of documents) {
        if (d.byteSize !== null && d.byteSize > caps.document.maxSizeMb * 1024 * 1024) {
          reasons.push(`${d.ref} is ${(d.byteSize / 1024 / 1024).toFixed(1)} MB; LinkedIn's document limit is ${caps.document.maxSizeMb} MB.`);
        }
      }
    }
    if (documents.length === 0 && caps.image && content.media.length > caps.image.maxPerPost) {
      reasons.push(`LinkedIn allows ${caps.image.maxPerPost} image${caps.image.maxPerPost === 1 ? '' : 's'} on this kind of post; this one has ${content.media.length}.`);
    }
    if (caps.image) {
      const limit = caps.image.maxSizeMb * 1024 * 1024;
      // The image cap is for images. Applying it to the PDF (the first version did) let the
      // composer approve a 50 MB carousel that the worker then failed permanently at 8 MB.
      for (const m of content.media.filter((x) => LINKEDIN_IMAGE_MIME_TYPES.has(x.mimeType))) {
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

    const commentary = escapeLittleText(assembleCommentary(content));

    // Media goes first, and all of it, before the post exists. A failure here leaves no post
    // behind to reconcile; a failure after would. One PDF is a document post; anything else
    // is images (validate has already refused a mix).
    const uploadInput = { http: this.opts.http, token, owner: author, apiVersion: LINKEDIN_API_VERSION, media: content.media, readMedia: this.opts.readMedia, sleep: this.sleep };
    const isDocument = content.media.length === 1 && LINKEDIN_DOCUMENT_MIME_TYPES.has(content.media[0].mimeType);
    const isVideo = content.media.length === 1 && LINKEDIN_VIDEO_MIME_TYPES.has(content.media[0].mimeType);
    // validate() refuses a mixed list; a caller that skipped it must not have the PDF or the
    // MP4 quietly sent to the Images API.
    if (!isDocument && !isVideo && content.media.some((m) => !LINKEDIN_IMAGE_MIME_TYPES.has(m.mimeType))) {
      throw new ProviderPublishError('A LinkedIn post carries images, or one video, or one document - not a mix. Run validate first.', true, 'MixedMediaKinds', null);
    }
    const document: UploadedImage | null = isDocument ? await uploadDocument(uploadInput, content.media[0]) : null;
    const video: UploadedImage | null = isVideo ? await uploadVideo(uploadInput, content.media[0]) : null;
    const images: UploadedImage[] = content.media.length === 0 || isDocument || isVideo ? [] : await uploadImages(uploadInput);

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
        ...postContent(images, content.poll, document ?? video),
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
        had_link: content.linkUrl !== null,
        media_count: content.media.length,
        image_urns: images.map((i) => i.urn),
        document_urn: document?.urn ?? null,
        video_urn: video?.urn ?? null,
        poll_options: content.poll?.options.length ?? 0,
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
 * The post's text as LinkedIn will show it: the copy, then the tracked link on its own line,
 * then any disclosure. The link is a URL in the commentary - LinkedIn turns the first URL in a
 * post into a clickable preview, and that is how a click reaches `/r/<code>` and the campaign
 * graph. Until 2026-09-17 the adapter sent the text alone: the link was minted, stored on the
 * variant, shown in the preview and named in the handoff package, and never reached the
 * post. Found on Ali's first tracked-link test, before it fired.
 */
export function assembleCommentary(content: Pick<PublishPayload, 'text' | 'linkUrl' | 'disclosureText'>): string {
  const parts = [content.text];
  if (content.linkUrl && !content.text.includes(content.linkUrl)) parts.push(content.linkUrl);
  if (content.disclosureText) parts.push(content.disclosureText);
  return parts.join('\n\n');
}

/** LinkedIn names its voting windows; the composer stores days. validate() refuses any other value. */
const POLL_DURATION: Record<number, string> = { 1: 'ONE_DAY', 3: 'THREE_DAYS', 7: 'SEVEN_DAYS', 14: 'FOURTEEN_DAYS' };

/**
 * One image and several images are different shapes in the Posts API, and sending a
 * one-element `multiImage` is a 422. A poll is a third shape. Empty means a text post: no
 * `content` key at all.
 */
function postContent(images: UploadedImage[], poll: PublishPayload['poll'], single: UploadedImage | null): Record<string, unknown> {
  if (single) {
    // A document or a video: one URN, and the operator's description at upload becomes the
    // title LinkedIn shows with it. validate() refused a document without one.
    return { content: { media: single.altText ? { id: single.urn, title: single.altText } : { id: single.urn } } };
  }
  if (poll) {
    const duration = POLL_DURATION[poll.durationDays];
    // Unreachable through the worker (validate runs first), but a direct caller must not get a
    // silently different poll than the one the operator set.
    if (!duration) throw new ProviderPublishError(`LinkedIn polls run for 1, 3, 7 or 14 days; ${poll.durationDays} is not offered.`, true, 'PollDurationUnsupported', null);
    return { content: { poll: { question: poll.question, options: poll.options.map((text) => ({ text })), settings: { duration } } } };
  }
  if (images.length === 0) return {};
  const toRef = (i: UploadedImage) => (i.altText ? { id: i.urn, altText: i.altText } : { id: i.urn });
  if (images.length === 1) return { content: { media: toRef(images[0]) } };
  return { content: { multiImage: { images: images.map(toRef) } } };
}
