/**
 * providerCapabilities — what each network lets us do, as versioned data, and the ONE function
 * that decides whether an action is a direct publish or a Handoff.
 *
 * WHY A REGISTRY. Limits scattered through components drift: a character cap in the composer,
 * a different one in the validator, a third in the scheduler. One data structure per provider,
 * with a version and a freshness date, means every consumer reads the same truth and the
 * question "where did this number come from" has one answer.
 *
 * WHY THE DECISION LIVES HERE TOO. Spec 8.2: if a network action is unsupported or the app
 * lacks access, show Handoff Required - not a fake Publish button. The only way to make that
 * a guarantee rather than a convention is to have exactly one function that answers "may we
 * publish directly?", and to have every button derive from its answer. `decidePublishMode` is
 * that function. It returns `handoff` whenever the capability is absent OR the app is not
 * approved for it, and it says which.
 *
 * WHAT IS TRUE TODAY. The Meta and LinkedIn App Review packages are PREPARED and not submitted
 * (docs/marketing/APP_REVIEW_*.md). So organization-level publishing on both is `not_submitted`
 * and resolves to Handoff. LinkedIn MEMBER posting (w_member_social) is a self-serve product
 * that needs no review, and is the one path that could go direct once an account is connected -
 * which nothing can be until ESC-001 (credential encryption) closes.
 *
 * LIMITS ARE DATED, NOT ETERNAL. Every entry carries `asOf`. Provider limits change without
 * notice, and a stale limit fails in the expensive direction - content passes validation here
 * and is rejected by the network at publish time, after approval. Anything older than
 * LIMITS_STALE_AFTER_DAYS is reported stale by `isStale()` so the composer can say so.
 */

export type ProviderKey =
  | 'meta_facebook_page'
  | 'meta_instagram'
  | 'linkedin_organization'
  | 'linkedin_member'
  | 'youtube'
  | 'tiktok'
  | 'x';

export type ContentType = 'text' | 'image' | 'video' | 'carousel' | 'thread' | 'link';

export type PublishAction =
  | 'publish'
  | 'firstComment'
  | 'reply'
  | 'edit'
  | 'delete'
  | 'analytics'
  | 'ads'
  | 'webhooks';

export type AppReviewStatus = 'not_submitted' | 'in_review' | 'approved' | 'rejected' | 'self_serve';

export interface ProviderCapabilities {
  provider: ProviderKey;
  displayName: string;
  /** Bump when any limit below changes. Consumers may pin to a version. */
  version: string;
  /** When these limits were last checked against the provider's documentation. */
  asOf: string;
  contentTypes: readonly ContentType[];
  text: { maxChars: number; maxHashtags: number | null; maxMentions: number | null };
  image: { maxSizeMb: number; minWidthPx: number; aspectRatios: readonly string[]; maxPerPost: number } | null;
  video: { maxSizeMb: number; maxDurationSec: number; codecs: readonly string[]; aspectRatios: readonly string[] } | null;
  supports: Record<PublishAction, boolean> & { draftHandoff: boolean };
  /** OAuth scopes the action set above requires. Displayed as granted/missing after connect. */
  requiredScopes: readonly string[];
  accountType: string;
  appReview: { status: AppReviewStatus; reviewedAt: string | null; note: string };
  rateLimits: { postsPerDay: number | null; note: string };
  requirements: { altText: 'required' | 'recommended' | 'none'; disclosureForPaid: boolean };
  linkBehavior: 'inline' | 'first_comment_recommended' | 'no_clickable_links' | 'attachment';
}

export const LIMITS_STALE_AFTER_DAYS = 90;

const ALL_FALSE: Record<PublishAction, boolean> & { draftHandoff: boolean } = {
  publish: false, firstComment: false, reply: false, edit: false, delete: false,
  analytics: false, ads: false, webhooks: false, draftHandoff: true,
};

/**
 * The registry. Values checked against provider developer documentation on the `asOf` date.
 * Where a limit is uncertain the CONSERVATIVE figure is used - a post that passes here must
 * not be rejected by the network.
 */
export const PROVIDER_CAPABILITIES: Record<ProviderKey, ProviderCapabilities> = {
  meta_facebook_page: {
    provider: 'meta_facebook_page',
    displayName: 'Facebook Page',
    version: '2026.09.1',
    asOf: '2026-09-11',
    contentTypes: ['text', 'image', 'video', 'carousel', 'link'],
    text: { maxChars: 63206, maxHashtags: null, maxMentions: null },
    image: { maxSizeMb: 4, minWidthPx: 600, aspectRatios: ['1.91:1', '1:1', '4:5'], maxPerPost: 10 },
    video: { maxSizeMb: 1024, maxDurationSec: 14400, codecs: ['h264'], aspectRatios: ['16:9', '1:1', '4:5', '9:16'] },
    supports: { ...ALL_FALSE, publish: true, firstComment: true, reply: true, edit: true, delete: true, analytics: true, ads: true, webhooks: true },
    requiredScopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'pages_manage_engagement'],
    accountType: 'Facebook Page administered by the connected user',
    appReview: {
      status: 'not_submitted',
      reviewedAt: null,
      note: 'App Review package prepared (docs/marketing/APP_REVIEW_META.md); submission is Ali\'s. Until approved, publishing is Handoff.',
    },
    rateLimits: { postsPerDay: null, note: 'Graph API rate limits are per-app and per-page; not a fixed post count.' },
    requirements: { altText: 'recommended', disclosureForPaid: true },
    linkBehavior: 'inline',
  },

  meta_instagram: {
    provider: 'meta_instagram',
    displayName: 'Instagram (professional account)',
    version: '2026.09.1',
    asOf: '2026-09-11',
    contentTypes: ['image', 'video', 'carousel'],
    text: { maxChars: 2200, maxHashtags: 30, maxMentions: 20 },
    image: { maxSizeMb: 8, minWidthPx: 320, aspectRatios: ['4:5', '1:1', '1.91:1'], maxPerPost: 10 },
    video: { maxSizeMb: 1024, maxDurationSec: 900, codecs: ['h264'], aspectRatios: ['9:16', '1:1', '4:5'] },
    supports: { ...ALL_FALSE, publish: true, firstComment: true, reply: true, delete: true, analytics: true, ads: true, webhooks: true },
    requiredScopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_insights', 'pages_show_list'],
    accountType: 'Instagram Business or Creator account linked to a Facebook Page',
    appReview: {
      status: 'not_submitted',
      reviewedAt: null,
      note: 'Shares the Meta App Review package. Instagram has NO text-only post type: a text draft cannot be published here at all.',
    },
    rateLimits: { postsPerDay: 50, note: 'Content Publishing API: 50 posts per 24 hours per account.' },
    requirements: { altText: 'recommended', disclosureForPaid: true },
    linkBehavior: 'no_clickable_links',
  },

  linkedin_organization: {
    provider: 'linkedin_organization',
    displayName: 'LinkedIn Page (organization)',
    version: '2026.09.1',
    asOf: '2026-09-11',
    contentTypes: ['text', 'image', 'video', 'carousel', 'link'],
    text: { maxChars: 3000, maxHashtags: null, maxMentions: null },
    image: { maxSizeMb: 8, minWidthPx: 552, aspectRatios: ['1.91:1', '1:1', '4:5'], maxPerPost: 20 },
    video: { maxSizeMb: 200, maxDurationSec: 600, codecs: ['h264'], aspectRatios: ['16:9', '1:1', '9:16'] },
    supports: { ...ALL_FALSE, publish: true, reply: true, delete: true, analytics: true, ads: true },
    requiredScopes: ['w_organization_social', 'r_organization_social', 'rw_organization_admin', 'r_organization_admin'],
    accountType: 'LinkedIn Page where the connected member is an admin',
    appReview: {
      status: 'not_submitted',
      reviewedAt: null,
      note: 'Requires the Community Management API, which is access-reviewed (docs/marketing/APP_REVIEW_LINKEDIN.md). Until approved, publishing is Handoff.',
    },
    rateLimits: { postsPerDay: null, note: 'Per-app daily call limits; not a fixed post count.' },
    requirements: { altText: 'recommended', disclosureForPaid: true },
    linkBehavior: 'inline',
  },

  linkedin_member: {
    provider: 'linkedin_member',
    displayName: 'LinkedIn (personal profile)',
    version: '2026.09.1',
    asOf: '2026-09-11',
    contentTypes: ['text', 'image', 'video', 'link'],
    text: { maxChars: 3000, maxHashtags: null, maxMentions: null },
    image: { maxSizeMb: 8, minWidthPx: 552, aspectRatios: ['1.91:1', '1:1', '4:5'], maxPerPost: 1 },
    video: { maxSizeMb: 200, maxDurationSec: 600, codecs: ['h264'], aspectRatios: ['16:9', '1:1', '9:16'] },
    // No edit and no analytics on member posts through the API. Delete is available.
    supports: { ...ALL_FALSE, publish: true, delete: true },
    requiredScopes: ['w_member_social', 'openid', 'profile'],
    accountType: 'The connected member\'s own profile',
    appReview: {
      status: 'self_serve',
      reviewedAt: null,
      note: 'Share on LinkedIn + Sign In with LinkedIn are self-serve products needing no review. This is the one direct-publish path available today - once an account can be connected, which waits on ESC-001.',
    },
    rateLimits: { postsPerDay: null, note: 'Per-member throttling applies; not published as a fixed count.' },
    requirements: { altText: 'recommended', disclosureForPaid: true },
    linkBehavior: 'inline',
  },

  youtube: {
    provider: 'youtube',
    displayName: 'YouTube',
    version: '2026.09.1',
    asOf: '2026-09-11',
    contentTypes: ['video'],
    text: { maxChars: 5000, maxHashtags: 15, maxMentions: null },
    image: null,
    video: { maxSizeMb: 262144, maxDurationSec: 43200, codecs: ['h264', 'vp9', 'av1'], aspectRatios: ['16:9', '9:16'] },
    supports: { ...ALL_FALSE, publish: true, edit: true, delete: true, analytics: true, reply: true },
    requiredScopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'],
    accountType: 'YouTube channel owned by the connected Google account',
    appReview: {
      status: 'not_submitted',
      reviewedAt: null,
      note: 'Google OAuth verification is required for the upload scope in production. Not started.',
    },
    rateLimits: { postsPerDay: null, note: 'Quota-based: an upload costs ~1,600 units of a 10,000/day default quota, so ~6 uploads/day without a quota increase.' },
    requirements: { altText: 'none', disclosureForPaid: true },
    linkBehavior: 'inline',
  },

  tiktok: {
    provider: 'tiktok',
    displayName: 'TikTok',
    version: '2026.09.1',
    asOf: '2026-09-11',
    contentTypes: ['video', 'image', 'carousel'],
    text: { maxChars: 2200, maxHashtags: null, maxMentions: null },
    image: { maxSizeMb: 20, minWidthPx: 360, aspectRatios: ['9:16', '1:1'], maxPerPost: 35 },
    video: { maxSizeMb: 4096, maxDurationSec: 600, codecs: ['h264', 'h265'], aspectRatios: ['9:16'] },
    // Unaudited apps may only post as PRIVATE. That is not publishing in any useful sense, so
    // publish is false until the audit passes rather than true with a footnote.
    supports: { ...ALL_FALSE, analytics: false },
    requiredScopes: ['video.publish', 'video.upload', 'user.info.basic'],
    accountType: 'TikTok account of the connected user',
    appReview: {
      status: 'not_submitted',
      reviewedAt: null,
      note: 'Content Posting API requires an app audit; unaudited apps are restricted to private-only posts. Enforced as unsupported, not as supported-with-caveat.',
    },
    rateLimits: { postsPerDay: null, note: 'Per-user daily posting caps apply after audit.' },
    requirements: { altText: 'none', disclosureForPaid: true },
    linkBehavior: 'no_clickable_links',
  },

  x: {
    provider: 'x',
    displayName: 'X',
    version: '2026.09.1',
    asOf: '2026-09-11',
    contentTypes: ['text', 'image', 'video', 'thread', 'link'],
    text: { maxChars: 280, maxHashtags: null, maxMentions: null },
    image: { maxSizeMb: 5, minWidthPx: 0, aspectRatios: ['16:9', '1:1', '4:5'], maxPerPost: 4 },
    video: { maxSizeMb: 512, maxDurationSec: 140, codecs: ['h264'], aspectRatios: ['16:9', '1:1', '9:16'] },
    // Discovery first, per spec section 9 item 5. Nothing is supported until access and cost
    // are approved - the paid API tiers are a cost decision, not an engineering one.
    supports: { ...ALL_FALSE },
    requiredScopes: ['tweet.write', 'tweet.read', 'users.read', 'offline.access'],
    accountType: 'X account of the connected user',
    appReview: {
      status: 'not_submitted',
      reviewedAt: null,
      note: 'Paid API access tier required; cost approval outstanding. Discovery only.',
    },
    rateLimits: { postsPerDay: null, note: 'Tier-dependent.' },
    requirements: { altText: 'recommended', disclosureForPaid: true },
    linkBehavior: 'inline',
  },
};

export const PROVIDER_KEYS = Object.keys(PROVIDER_CAPABILITIES) as ProviderKey[];

export function getProviderCapabilities(provider: ProviderKey): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}

/** Are these limits older than we are willing to trust without re-checking? */
export function isStale(caps: ProviderCapabilities, now: number): boolean {
  const age = (now - Date.parse(caps.asOf)) / 86_400_000;
  return Number.isNaN(age) || age > LIMITS_STALE_AFTER_DAYS;
}

// ── The decision ────────────────────────────────────────────────────────────────────────────

export type PublishMode =
  | { mode: 'direct' }
  | { mode: 'handoff'; reasons: string[] };

/**
 * Providers with a LIVE connector implemented in this codebase - an adapter that actually
 * calls the network. Empty today: ESC-001 blocks account connection and no provider adapter
 * exists beyond DryRun and Handoff. A provider the registry marks approved/self-serve but
 * that is not in this set still resolves to handoff, because "the platform could publish
 * this directly" is only true when something can carry the request. The first dev deploy
 * showed LinkedIn (personal profile) as "Direct publish" for exactly this gap: its jobs would
 * have dead-lettered as no_live_adapter instead of giving the operator a handoff package.
 * Add a key here in the same commit that adds its adapter to adapterRegistry.
 */
export const LIVE_CONNECTORS: ReadonlySet<ProviderKey> = new Set<ProviderKey>([]);

/**
 * May this action run directly against the network, or must it be handed off?
 *
 * Handoff whenever the capability is missing, OR the app is not approved for it, OR no live
 * connector is implemented for the provider. Every applicable reason is reported, so the
 * operator sees "not supported", "not approved" and "not built yet" as different problems
 * with different fixes. There is no third answer: nothing here returns "direct, but" - a
 * Publish button either publishes or does not exist.
 */
export function decidePublishMode(
  caps: ProviderCapabilities,
  action: PublishAction,
  liveConnectors: ReadonlySet<ProviderKey> = LIVE_CONNECTORS,
): PublishMode {
  const reasons: string[] = [];

  if (!caps.supports[action]) {
    reasons.push(`${caps.displayName} does not support "${action}" through its API.`);
  }

  // Analytics, ads and webhooks are read/side channels, not publication; an unapproved app is
  // still a Handoff for them, but the reason reads differently.
  const approved = caps.appReview.status === 'approved' || caps.appReview.status === 'self_serve';
  if (!approved) {
    reasons.push(`The app is not approved for ${caps.displayName} (status: ${caps.appReview.status}). ${caps.appReview.note}`);
  }

  if (!liveConnectors.has(caps.provider)) {
    reasons.push(`No live connector is implemented for ${caps.displayName} yet; the platform produces a handoff package to post by hand.`);
  }

  return reasons.length === 0 ? { mode: 'direct' } : { mode: 'handoff', reasons };
}

/**
 * The label a button may carry. This is the only function the UI should use to decide, and it
 * has no `publish` outcome for a handoff - the type makes rendering a Publish button for an
 * unsupported action a compile error, not a code-review catch.
 */
export function publishButtonFor(mode: PublishMode): { label: 'Publish' | 'Handoff required'; enabled: boolean } {
  return mode.mode === 'direct'
    ? { label: 'Publish', enabled: true }
    : { label: 'Handoff required', enabled: true };
}
