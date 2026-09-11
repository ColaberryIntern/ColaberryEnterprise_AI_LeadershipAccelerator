import { createHash } from 'crypto';
import { decidePublishMode, getProviderCapabilities, type ProviderCapabilities, type ProviderKey } from './providerCapabilities';
import {
  AdapterUnsupportedError,
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
 * HandoffAdapter — for providers the registry says we cannot publish to directly.
 *
 * Spec 8.2: "show Handoff Required with downloadable/copyable content and a completion
 * receipt - not a fake Publish button." This adapter is the queue-side half of that. It
 * makes NO network call. Its receipt is a handoff PACKAGE: the exact text, link, media
 * references and disclosure an operator pastes into the network by hand, plus the reason
 * the platform could not do it. The publication row it produces starts in
 * `handoff_pending` and becomes `live` only when a person completes it and records the
 * external id (`completeHandoff` in publishingReceiptService).
 *
 * Why this is an adapter and not a branch in the worker: the worker's contract is "give
 * every job to an adapter, record what comes back". A handoff that bypassed the adapter
 * would have to duplicate the idempotency, event and publication bookkeeping, and would be
 * the one path with no receipt. Modelling it as an adapter keeps a manual post accountable
 * to the same ledger as an API one.
 */

export interface HandoffPackage {
  provider: ProviderKey;
  displayName: string;
  reasons: string[];
  text: string;
  linkUrl: string | null;
  disclosureText: string | null;
  mediaRefs: string[];
  instructions: string;
}

export class HandoffAdapter implements SocialProviderAdapter {
  constructor(readonly provider: ProviderKey, private readonly clock: () => Date = () => new Date()) {}

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
    if (content.text.trim() === '' && content.mediaRefs.length === 0) {
      return { ok: false, permanent: true, reasons: ['Nothing to hand off: no text and no media.'] };
    }
    return { ok: true };
  }

  buildPackage(content: PublishPayload): HandoffPackage {
    const caps = getProviderCapabilities(this.provider);
    const decision = decidePublishMode(caps, 'publish');
    const reasons = decision.mode === 'handoff' ? decision.reasons : ['Handoff transport selected.'];
    const steps = [
      `1. Open ${caps.displayName} as the brand account.`,
      '2. Paste the text exactly as shown. Do not edit; edits belong in the composer so the record matches the post.',
      content.mediaRefs.length > 0 ? `3. Attach the ${content.mediaRefs.length} media item(s) listed, in order.` : '3. No media to attach.',
      content.linkUrl
        ? (caps.linkBehavior === 'no_clickable_links'
          ? `4. Put the link in the bio or a first comment (links are not clickable in ${caps.displayName} captions): ${content.linkUrl}`
          : `4. Include the tracked link: ${content.linkUrl}`)
        : '4. No link.',
      content.disclosureText ? `5. Include the disclosure: ${content.disclosureText}` : '5. No disclosure required.',
      '6. Publish, then paste the post URL back into the platform to complete the receipt.',
    ];
    return {
      provider: this.provider,
      displayName: caps.displayName,
      reasons,
      text: content.text,
      linkUrl: content.linkUrl,
      disclosureText: content.disclosureText,
      mediaRefs: content.mediaRefs,
      instructions: steps.join('\n'),
    };
  }

  async publish(content: PublishPayload, idempotencyKey: string): Promise<PublishReceipt> {
    const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16);
    const pkg = this.buildPackage(content);
    return {
      // A placeholder id the completion step REPLACES with the real one. Prefixed so it can
      // never be mistaken for a provider id, and derived so a re-run yields the same row.
      externalId: `handoff:${this.provider}:${digest}`,
      permalink: null,
      publishedAt: this.clock().toISOString(),
      mode: 'handoff',
      httpStatus: null,
      providerCode: 'handoff_pending',
      requestMetadata: { transport: 'handoff', handoff: pkg },
    };
  }

  async getPublication(externalId: string): Promise<PublicationState> {
    return { externalId, status: 'unknown', checkedAt: this.clock().toISOString() };
  }

  async fetchOrganicMetrics(_range: DateRange, _cursor?: string): Promise<MetricPage> {
    return { items: [], cursor: null };
  }
}
