import type { CommsHubChannel } from '../../../models/CommsHubDraft';

/**
 * A channel connector (CH7.1): the one place a hub message leaves the hub. The sending worker (CH7.2)
 * calls `send` once per delivery row, after its pre-send checks, and records what comes back.
 *
 * A connector must be safe to call again with the same delivery (a retry, or a restart mid-send): it
 * looks for what an earlier call already did and returns that instead of doing it twice.
 */
export interface ConnectorDelivery {
  /** comms_hub_deliveries.id: the unit of work and of retries. */
  deliveryId: string;
  messageId: string;
  /** The first time this delivery was claimed; an earlier attempt's work is looked for from here. */
  since: Date;
  destination: { target_type: string; target_id: string };
  /** The approved draft for this channel (in_app has a title; a community post does not). */
  draft: { title: string | null; body: string };
  /** A banner or other media for a community post (http(s) or an uploaded media path). */
  media_urls?: string[];
}

export interface ConnectorResult {
  /** What the channel made: a community post id, or the message id for in-app notifications. */
  provider_message_id: string;
  /** How many people it reached (in-app: notifications written; a post: 1). */
  reached: number;
  /** True when an earlier attempt had already done it and nothing new was written. */
  already_done: boolean;
}

export interface Connector {
  channel: CommsHubChannel;
  send(d: ConnectorDelivery): Promise<ConnectorResult>;
}

/** A refusal the worker must not retry (bad destination, missing cohort): the delivery fails. */
export class ConnectorPermanentError extends Error {
  constructor(message: string, public readonly reason: string) { super(message); }
}
