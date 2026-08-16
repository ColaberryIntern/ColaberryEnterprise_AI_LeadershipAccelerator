/**
 * Agent tool contracts.
 *
 * A "tool" here is a capability an LLM-backed agent (Cory, Reese, ...) is
 * GRANTED rather than one it inherits by being a chat surface. The grant is the
 * point: three different chat surfaces call the same coach, so a per-surface
 * feature flag would drift immediately. A tool is declared once, granted to
 * named agents, and every call site asks the registry before using it.
 */

/** Every tool that exists. Adding one means adding it here first. */
export type AgentToolName = 'read_attachments';

/** Every agent that can hold a tool grant. */
export type AgentKey = 'cory' | 'reese';

/**
 * A client-side reference to an uploaded attachment. The client never sends
 * bytes to the chat endpoint — it uploads first, then references the id. That
 * keeps the chat request small, lets the same file be reused across turns, and
 * means the ownership check happens against a row rather than a payload.
 */
export interface AttachmentRef {
  id: string;
  /** Optional client-supplied label, shown back to the agent as the filename. */
  name?: string | null;
}

/**
 * Provider-neutral content parts. Modelled on the OpenAI chat shape because
 * that is the default provider; anthropicClient converts these to Claude
 * content blocks. Call sites never build provider-specific payloads.
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** A turn's content: plain text, or text plus images. */
export type TurnContent = string | ContentPart[];

/** One attachment the tool could not turn into image content, and why. */
export interface SkippedAttachment {
  id: string;
  name: string | null;
  /**
   * Stable classification, so the caller can phrase this for a student without
   * string-matching a message: 'not_found' covers both "no such id" and "not
   * yours" (they must be indistinguishable from outside).
   */
  reason: 'not_found' | 'unreadable' | 'unsupported_type' | 'over_limit';
  /** One short sentence safe to show a student. */
  detail: string;
}

/** What readAttachmentsTool returns. */
export interface ReadAttachmentsResult {
  /** Image parts to append to the user turn. Empty when nothing was readable. */
  parts: ContentPart[];
  /** Attachments that did not make it, so the agent can say so out loud. */
  skipped: SkippedAttachment[];
  /** Count actually handed to the model — for logging and tests. */
  attached: number;
}
