import { getProviderCapabilities, type ProviderCapabilities, type ProviderKey } from './providerCapabilities';
import { commentaryExceedsLimit, escapeLittleText, COMMENTARY_MAX_CHARS } from './linkedInText';
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

/** Minimal shape of the HTTP call, so the adapter is testable without a network. */
export interface LinkedInHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export type LinkedInHttp = (input: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}) => Promise<LinkedInHttpResponse>;

export interface LinkedInAdapterOptions {
  provider: Extract<ProviderKey, 'linkedin_member' | 'linkedin_organization'>;
  /** Resolves the account's access token at call time. Never held. */
  getToken: (accountId: string) => Promise<string>;
  /** `urn:li:person:{sub}` or `urn:li:organization:{id}` for the account. */
  getAuthorUrn: (accountId: string) => Promise<string>;
  http: LinkedInHttp;
  clock?: () => Date;
}

/**
 * Which HTTP statuses must never be retried.
 *
 * Getting this wrong is expensive in both directions: retrying a 422 burns every attempt and
 * dead-letters anyway, while NOT retrying a 503 silently loses a scheduled post. 429 is
 * transient on purpose - it means slow down, not stop.
 */
function isPermanentStatus(status: number): boolean {
  if (status === 429) return false;              // rate limited: back off and retry
  if (status === 426) return true;               // sunset API version: needs a code change
  return status >= 400 && status < 500;          // auth, permission, validation
}

function providerCodeOf(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const key of ['code', 'serviceErrorCode', 'status']) {
      if (typeof b[key] === 'string') return b[key] as string;
      if (typeof b[key] === 'number') return String(b[key]);
    }
  }
  return null;
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const m = (body as Record<string, unknown>).message;
    if (typeof m === 'string' && m.trim() !== '') return m;
  }
  return fallback;
}

export class LinkedInAdapter implements SocialProviderAdapter {
  readonly provider: ProviderKey;

  private readonly opts: LinkedInAdapterOptions;

  private readonly clock: () => Date;

  constructor(opts: LinkedInAdapterOptions) {
    this.provider = opts.provider;
    this.opts = opts;
    this.clock = opts.clock ?? (() => new Date());
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
    // SVG is rejected by the image upload endpoint. Caught here because the three-step upload
    // would otherwise fail on step two, after the post text had already been accepted.
    const svg = content.mediaRefs.filter((ref) => ref.toLowerCase().endsWith('.svg'));
    if (svg.length > 0) {
      reasons.push(`LinkedIn does not accept SVG images (${svg.join(', ')}). Use PNG, JPEG or GIF.`);
    }
    if (content.mediaRefs.length > 0) {
      // Stated rather than silently dropped: a post that published without its image would look
      // successful and be wrong.
      reasons.push('Image posting is not implemented in this adapter yet; publish text-only or use handoff.');
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
        media_count: content.mediaRefs.length,
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

function headerValue(headers: Record<string, string>, name: string): string | null {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}
