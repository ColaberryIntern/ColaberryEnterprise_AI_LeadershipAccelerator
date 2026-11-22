/**
 * CH10.1 The WhatsApp provider port (W1). Everything in the hub talks to this interface; only
 * whapiProvider.ts knows Whapi.Cloud. Swapping to Meta's official API or a self-hosted gateway means
 * a new implementation of this file's interface, nothing else.
 */
export interface ProviderHealth {
  /** The provider's raw state string (Whapi: NOT_INIT, INIT, LAUNCH, QR, AUTH, ERROR, SYNC_ERROR). */
  state: string;
  /** The connected number's digits, when the provider reports one. Never sent to the browser in full. */
  number: string | null;
}

export interface ProviderParticipant { id: string; rank: 'admin' | 'member' | 'creator' | string }

export interface ProviderGroup {
  id: string;
  name: string;
  participants: ProviderParticipant[];
  participants_count: number;
  /** Only admins may post. */
  announcements: boolean;
  suspended: boolean;
  terminated: boolean;
}

export interface ProviderGroupPage { groups: ProviderGroup[]; total: number }

export interface ProviderSentMessage {
  id: string;
  /** The text body, or the image caption; null for other kinds. */
  text: string | null;
  /** Unix seconds, as the provider reports it. */
  timestamp: number;
}

export interface WhatsAppProvider {
  health(): Promise<ProviderHealth>;
  listGroups(count: number, offset: number): Promise<ProviderGroupPage>;
  getGroup(groupId: string): Promise<ProviderGroup>;
  sendText(to: string, body: string): Promise<{ id: string }>;
  sendImage(to: string, mediaUrl: string, caption: string): Promise<{ id: string }>;
  /** Messages this number sent to the chat at or after `sinceUnixSeconds`. */
  listSentSince(chatId: string, sinceUnixSeconds: number): Promise<ProviderSentMessage[]>;
}

/** Every provider failure carries a stable error_class for logs and the worker's mapping (W7). */
export class WhatsAppProviderError extends Error {
  constructor(message: string, readonly errorClass: string, readonly status: number | null) { super(message); this.name = errorClass; }
}
/** 401: the channel is not linked or the token is wrong. Retry later (a hold), never a failure. */
export class NotConnectedError extends WhatsAppProviderError {
  constructor(message = 'WhatsApp is not connected.', status: number | null = 401) { super(message, 'NotConnectedError', status); }
}
/** 403: this number may not send to this group. Permanent for the delivery. */
export class ForbiddenError extends WhatsAppProviderError {
  constructor(message = 'WhatsApp refused to send to this group.') { super(message, 'ForbiddenError', 403); }
}
/** 402: the plan's quota (for example the trial) is used up. Permanent for the delivery, plus an alert. */
export class QuotaExceededError extends WhatsAppProviderError {
  constructor(message = 'The WhatsApp plan has no messages left.') { super(message, 'QuotaExceededError', 402); }
}
/** 429: WhatsApp is rate-limiting the number. Treated as a soft ban: the breaker opens for 48 hours. */
export class RateLimitedError extends WhatsAppProviderError {
  constructor(message = 'WhatsApp is limiting this number.') { super(message, 'RateLimitError', 429); }
}
/** 5xx, a timeout, or no answer. Retryable; the next attempt checks for the message first (W5). */
export class UnavailableError extends WhatsAppProviderError {
  constructor(message = 'The WhatsApp service did not answer.', status: number | null = null) { super(message, 'UpstreamUnavailable', status); }
}
/** 400 or an answer in the wrong shape. Permanent: retrying the same request cannot help. */
export class BadRequestError extends WhatsAppProviderError {
  constructor(message = 'The WhatsApp service rejected the request.', status: number | null = 400) { super(message, 'ContractViolation', status); }
}
