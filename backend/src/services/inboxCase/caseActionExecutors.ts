import InboxCaseItem from '../../models/InboxCaseItem';
import InboxCaseAction from '../../models/InboxCaseAction';
import { getColaberryGmailClient, getPersonalGmailClient } from '../inbox/inboxSyncService';
import { archiveMessage as archiveHotmailMessage, isConfigured as isHotmailConfigured } from '../inbox/graphMailService';
import { bcPost, bcPut } from '../ops/basecampClient';

// Per-action-type executors for the durable-outbox action executor
// (caseExecutionService.ts). Each function performs exactly ONE external
// side effect and returns a JSON-serializable receipt, or throws a
// ClassifiedExecutionError. Nothing here decides ordering, retries, or
// idempotency — that is caseExecutionService's job; these functions are
// intentionally "dumb," which is what makes them safe to unit test with a
// mocked provider client and safe to retry from the outer loop.

export class ClassifiedExecutionError extends Error {
  constructor(public error_class: string, message: string) {
    super(message);
    this.name = 'ClassifiedExecutionError';
  }
}

function snapshotOf(item: InboxCaseItem | null): Record<string, any> {
  return (item?.snapshot as Record<string, any>) || {};
}

// Builds a base64url-encoded RFC 2822 message for gmail.users.messages.send,
// threaded via In-Reply-To/References when the original message-id is known.
function buildRawMimeReply(params: { to: string; subject: string; body: string; inReplyTo?: string | null }): string {
  const headers = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`, `References: ${params.inReplyTo}`);
  }
  const message = `${headers.join('\r\n')}\r\n\r\n${params.body}`;
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function executeEmailSend(action: InboxCaseAction, item: InboxCaseItem | null): Promise<Record<string, unknown>> {
  if (!item) throw new ClassifiedExecutionError('ValidationError', 'EMAIL_SEND action has no target item');
  const gmail = item.provider === 'gmail_personal' ? getPersonalGmailClient() : getColaberryGmailClient();
  if (!gmail) throw new ClassifiedExecutionError('ProviderNotConfiguredError', `Gmail client not configured for ${item.provider}`);

  const snap = snapshotOf(item);
  // For an inbound email, the customer is the sender we reply to. For a
  // sent_email item (the reply-target fallback in caseActionPlanner.ts for
  // cases with no included inbound item), Ali/Colaberry was the sender, so
  // the customer is the recipient instead.
  const to = item.source_type === 'sent_email' ? (Array.isArray(snap.to_addresses) ? snap.to_addresses[0] : undefined) : snap.from_address;
  if (!to) throw new ClassifiedExecutionError('ValidationError', 'Reply target has no resolvable recipient on record');

  const raw = buildRawMimeReply({
    to,
    subject: String(action.payload.subject || `Re: ${item.title}`),
    body: String(action.payload.body || ''),
    inReplyTo: snap.message_id,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: snap.thread_id || undefined },
  });

  return { message_id: res.data.id, thread_id: res.data.threadId, sent_to: to };
}

const RESOLVED_LABEL = 'Inbox Intel/Resolved';

async function ensureGmailLabel(gmail: any, labelName: string): Promise<string> {
  const list = await gmail.users.labels.list({ userId: 'me' });
  const existing = (list.data.labels || []).find((l: any) => l.name === labelName);
  if (existing?.id) return existing.id;
  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  });
  return created.data.id;
}

export async function executeEmailLabel(action: InboxCaseAction, item: InboxCaseItem | null): Promise<Record<string, unknown>> {
  if (!item) throw new ClassifiedExecutionError('ValidationError', 'EMAIL_LABEL action has no target item');
  const gmail = item.provider === 'gmail_personal' ? getPersonalGmailClient() : getColaberryGmailClient();
  if (!gmail) throw new ClassifiedExecutionError('ProviderNotConfiguredError', `Gmail client not configured for ${item.provider}`);

  const labelName = String(action.payload.label || RESOLVED_LABEL);
  const labelId = await ensureGmailLabel(gmail, labelName);

  await gmail.users.messages.modify({
    userId: 'me',
    id: item.source_id,
    requestBody: { removeLabelIds: ['INBOX'], addLabelIds: [labelId] },
  });

  return { message_id: item.source_id, label_applied: labelName };
}

export async function executeEmailArchive(action: InboxCaseAction, item: InboxCaseItem | null): Promise<Record<string, unknown>> {
  if (!item) throw new ClassifiedExecutionError('ValidationError', 'EMAIL_ARCHIVE action has no target item');
  if (item.provider !== 'hotmail') {
    // Gmail providers use label-based state (EMAIL_LABEL); this path is Hotmail-only.
    return executeEmailLabel(action, item);
  }
  if (!isHotmailConfigured()) throw new ClassifiedExecutionError('ProviderNotConfiguredError', 'Hotmail/Graph not configured');
  await archiveHotmailMessage(item.source_id);
  return { message_id: item.source_id, archived: true };
}

export async function executeBasecampComment(action: InboxCaseAction, item: InboxCaseItem | null): Promise<Record<string, unknown>> {
  const projectId = (action.payload.project_id as string) || (item?.snapshot as any)?.project_id;
  const recordingId = action.target_id || item?.source_id;
  if (!projectId || !recordingId) {
    throw new ClassifiedExecutionError('ValidationError', 'BASECAMP_COMMENT action missing project_id or recording id');
  }
  const content = String(action.payload.comment || '');
  const res = await bcPost<{ id: number; created_at: string }>(`/buckets/${projectId}/recordings/${recordingId}/comments.json`, { content });
  return { comment_id: res.id, created_at: res.created_at };
}

export async function executeBasecampUpdateTodo(action: InboxCaseAction, item: InboxCaseItem | null): Promise<Record<string, unknown>> {
  const projectId = (action.payload.project_id as string) || (item?.snapshot as any)?.project_id;
  const todoId = action.target_id || item?.source_id;
  if (!projectId || !todoId) throw new ClassifiedExecutionError('ValidationError', 'BASECAMP_UPDATE_TODO missing project_id or todo id');
  await bcPut(`/buckets/${projectId}/todos/${todoId}.json`, action.payload.updates || {});
  return { todo_id: todoId, updated: true };
}

export async function executeBasecampCompleteTodo(action: InboxCaseAction, item: InboxCaseItem | null): Promise<Record<string, unknown>> {
  const projectId = (action.payload.project_id as string) || (item?.snapshot as any)?.project_id;
  const todoId = action.target_id || item?.source_id;
  if (!projectId || !todoId) throw new ClassifiedExecutionError('ValidationError', 'BASECAMP_COMPLETE_TODO missing project_id or todo id');
  await bcPut(`/buckets/${projectId}/todos/${todoId}/completion.json`);
  return { todo_id: todoId, completed: true };
}

// Internal, non-external actions: always succeed deterministically, no
// network call, verification is trivial (re-read the row).
export async function executeInternalAction(action: InboxCaseAction): Promise<Record<string, unknown>> {
  return { action_type: action.action_type, applied_at: new Date().toISOString(), payload: action.payload };
}

export type ActionExecutor = (action: InboxCaseAction, item: InboxCaseItem | null) => Promise<Record<string, unknown>>;

export const ACTION_EXECUTORS: Partial<Record<string, ActionExecutor>> = {
  EMAIL_SEND: executeEmailSend,
  EMAIL_LABEL: executeEmailLabel,
  EMAIL_ARCHIVE: executeEmailArchive,
  BASECAMP_COMMENT: executeBasecampComment,
  BASECAMP_UPDATE_TODO: executeBasecampUpdateTodo,
  BASECAMP_COMPLETE_TODO: executeBasecampCompleteTodo,
  MARK_WAITING: executeInternalAction,
  MARK_DELEGATED: executeInternalAction,
  CREATE_FOLLOWUP: executeInternalAction,
  NO_ACTION: executeInternalAction,
  EMAIL_DRAFT: executeInternalAction, // a draft "executes" by existing in payload for review; nothing external happens
};
