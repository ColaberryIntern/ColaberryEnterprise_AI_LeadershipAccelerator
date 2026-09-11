import type { Request } from 'express';
import type { ProviderCapabilities, ProviderKey } from './providerCapabilities';

/**
 * SocialProviderAdapter — spec section 9, verbatim in shape.
 *
 * The core workflow (queue, worker, receipts, reconciliation) depends on THIS and never on a
 * vendor SDK. An adapter owns one provider's wire format and nothing else: no scheduling, no
 * retry policy, no idempotency bookkeeping - those live in the worker, once, so that a Meta
 * adapter and a LinkedIn adapter cannot disagree about what "already published" means.
 *
 * Two implementations exist today and neither talks to a network:
 *   - DryRunAdapter   - records the call and returns a synthetic receipt. Tests and dev.
 *   - HandoffAdapter  - for providers the registry says cannot be published to directly
 *                       (unsupported action, or app review not approved). Produces a handoff
 *                       package for an operator and a receipt that is completed BY HAND.
 * There is no live adapter. ESC-001 (credential storage) blocks account connection, and app
 * review (T027) is prepared, not submitted. `resolveAdapter` refuses a live transport rather
 * than pretending.
 *
 * ERRORS CARRY THEIR RETRYABILITY. `ProviderPublishError.permanent` is what the worker reads
 * to decide between backoff and dead-letter. A validation or permission failure is permanent;
 * a 5xx or timeout is not. An adapter that throws a bare Error is treated as transient, which
 * is the safe default - retrying a permanent failure wastes attempts, but NOT retrying a
 * transient one loses the post.
 */

export interface ConnectInput {
  provider: ProviderKey;
  /** OAuth authorization code, or whatever the provider's flow yields. Never logged. */
  code: string;
  state: string;
  redirectUri: string;
}

export interface ConnectionResult {
  accountId: string;
  externalAccountId: string;
  displayName: string;
  grantedScopes: string[];
  missingScopes: string[];
  expiresAt: string | null;
}

export interface PublishPayload {
  jobId: string;
  provider: ProviderKey;
  contentItemId: string;
  variantId: string | null;
  /** Null until T003 - no account is connected. Adapters must tolerate it. */
  accountId: string | null;
  text: string;
  /** Storage keys of attached media, in order. */
  mediaRefs: string[];
  linkUrl: string | null;
  disclosureText: string | null;
  /** The UTC instant the job was due. */
  scheduledFor: string;
  contentRevision: number;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; permanent: boolean; reasons: string[] };

export type ReceiptMode = 'live' | 'dry_run' | 'handoff';

export interface PublishReceipt {
  externalId: string;
  permalink: string | null;
  publishedAt: string;
  mode: ReceiptMode;
  httpStatus: number | null;
  providerCode: string | null;
  /** Sanitized. Never a token, never a full request body. */
  requestMetadata: Record<string, unknown>;
}

export interface PublicationState {
  externalId: string;
  status: 'live' | 'removed' | 'unknown';
  checkedAt: string;
}

export interface ActionReceipt {
  ok: boolean;
  providerCode: string | null;
  message: string | null;
}

export interface DateRange { start: string; end: string }

export interface MetricPage {
  items: Array<{ externalId: string; metric: string; value: number; asOf: string }>;
  cursor: string | null;
}

export interface CommentPage {
  items: Array<{ externalId: string; author: string; text: string; postedAt: string }>;
  cursor: string | null;
}

export interface ReplyInput { commentExternalId: string; text: string }

export interface VerifiedWebhook { ok: boolean; eventType: string | null; payload: unknown }

export interface SocialProviderAdapter {
  readonly provider: ProviderKey;
  connect(input: ConnectInput): Promise<ConnectionResult>;
  refreshCredential(accountId: string): Promise<void>;
  capabilities(accountId: string): Promise<ProviderCapabilities>;
  validate(content: PublishPayload): Promise<ValidationResult>;
  publish(content: PublishPayload, idempotencyKey: string): Promise<PublishReceipt>;
  getPublication(externalId: string): Promise<PublicationState>;
  deletePublication?(externalId: string): Promise<ActionReceipt>;
  fetchOrganicMetrics(range: DateRange, cursor?: string): Promise<MetricPage>;
  fetchPaidMetrics?(range: DateRange, cursor?: string): Promise<MetricPage>;
  fetchComments?(cursor?: string): Promise<CommentPage>;
  replyToComment?(input: ReplyInput): Promise<ActionReceipt>;
  verifyWebhook?(request: Request): VerifiedWebhook;
}

export class ProviderPublishError extends Error {
  constructor(
    message: string,
    /** True for validation/permission failures the worker must NOT retry. */
    public readonly permanent: boolean,
    public readonly providerCode: string | null = null,
    public readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'ProviderPublishError';
  }
}

/** Something that is not an adapter concern was asked of an adapter (e.g. connect on dry-run). */
export class AdapterUnsupportedError extends ProviderPublishError {
  constructor(what: string, provider: ProviderKey) {
    super(`${what} is not supported by the ${provider} adapter in this transport.`, true, 'unsupported');
    this.name = 'AdapterUnsupportedError';
  }
}
