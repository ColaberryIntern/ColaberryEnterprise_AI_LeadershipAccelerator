import { createHash } from 'crypto';
import { decidePublishMode, getProviderCapabilities, type ProviderCapabilities, type ProviderKey } from './providerCapabilities';
import {
  AdapterUnsupportedError,
  type ActionReceipt,
  type CommentPage,
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
 * DryRunAdapter — the transport for tests, dev, and any environment with no connected account.
 *
 * It performs no I/O. `publish` records the payload it was given and returns a receipt whose
 * external id is DERIVED from the idempotency key, so publishing the same key twice yields the
 * same id - which is exactly what a correct live provider does, and what lets the worker's
 * reconciliation be exercised without a network. Receipts are marked `mode: 'dry_run'` and the
 * worker writes that mode onto the publication row; nothing downstream can mistake one for a
 * live post.
 *
 * `connect` and `refreshCredential` throw: a dry run has no credential, and an adapter that
 * silently "connected" would let a test pass a flow that cannot work in production.
 */

export class DryRunAdapter implements SocialProviderAdapter {
  readonly calls: Array<{ payload: PublishPayload; idempotencyKey: string; at: string }> = [];
  private readonly issued = new Map<string, PublishReceipt>();

  constructor(
    readonly provider: ProviderKey,
    private readonly clock: () => Date = () => new Date(),
    /** Inject a failure for BREAK tests: thrown on the next publish, then cleared. */
    private failNext: Error | null = null,
  ) {}

  failNextPublishWith(err: Error): void { this.failNext = err; }

  async connect(_input: ConnectInput): Promise<ConnectionResult> {
    throw new AdapterUnsupportedError('connect', this.provider);
  }

  async refreshCredential(_accountId: string): Promise<void> {
    throw new AdapterUnsupportedError('refreshCredential', this.provider);
  }

  async capabilities(_accountId: string): Promise<ProviderCapabilities> {
    return getProviderCapabilities(this.provider);
  }

  async validate(content: PublishPayload): Promise<ValidationResult> {
    const caps = getProviderCapabilities(this.provider);
    const reasons: string[] = [];
    if (content.text.trim() === '' && content.mediaRefs.length === 0) reasons.push('Nothing to publish: no text and no media.');
    if (content.text.length > caps.text.maxChars) reasons.push(`${caps.displayName}: ${content.text.length} of ${caps.text.maxChars} characters.`);
    return reasons.length === 0 ? { ok: true } : { ok: false, permanent: true, reasons };
  }

  async publish(content: PublishPayload, idempotencyKey: string): Promise<PublishReceipt> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    const at = this.clock().toISOString();
    this.calls.push({ payload: content, idempotencyKey, at });
    const existing = this.issued.get(idempotencyKey);
    if (existing) return existing;

    const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16);
    const receipt: PublishReceipt = {
      externalId: `dryrun:${this.provider}:${digest}`,
      permalink: null,
      publishedAt: at,
      mode: 'dry_run',
      httpStatus: null,
      providerCode: 'dry_run',
      requestMetadata: {
        transport: 'dry_run',
        publishMode: decidePublishMode(getProviderCapabilities(this.provider), 'publish').mode,
        textChars: content.text.length,
        mediaCount: content.mediaRefs.length,
        hasLink: content.linkUrl !== null,
      },
    };
    this.issued.set(idempotencyKey, receipt);
    return receipt;
  }

  async getPublication(externalId: string): Promise<PublicationState> {
    const known = Array.from(this.issued.values()).some((r) => r.externalId === externalId);
    return { externalId, status: known ? 'live' : 'unknown', checkedAt: this.clock().toISOString() };
  }

  async deletePublication(externalId: string): Promise<ActionReceipt> {
    for (const [k, r] of this.issued) if (r.externalId === externalId) this.issued.delete(k);
    return { ok: true, providerCode: 'dry_run', message: null };
  }

  async fetchOrganicMetrics(_range: DateRange, _cursor?: string): Promise<MetricPage> {
    return { items: [], cursor: null };
  }

  async fetchComments(_cursor?: string): Promise<CommentPage> {
    return { items: [], cursor: null };
  }
}
