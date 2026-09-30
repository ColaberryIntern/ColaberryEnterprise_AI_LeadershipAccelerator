import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCaseItem from '../../models/InboxCaseItem';
import { getColaberryGmailClient, getPersonalGmailClient } from '../inbox/inboxSyncService';
import { isConfigured as isHotmailConfigured, isMessageInInbox as isHotmailMessageInInbox } from '../inbox/graphMailService';
import { bcGet } from '../ops/basecampClient';
import { classifyError } from '../../utils/errorClassifier';

// Live re-fetch verifiers for the external action types (/inbox-zero T5).
//
// caseVerificationService used to verify an EMAIL_SEND by checking that its
// receipt carried a message_id — the SHAPE of success, not success. Its own
// header documented the live re-fetch as a known gap. These functions close
// it: each one goes back to the provider and asks whether the effect the
// executor claimed actually landed. Three outcomes, and the distinction
// matters downstream:
//   verified     — the provider confirms it. Action -> VERIFIED.
//   missing      — the provider definitively says no (404, todo not
//                  completed, message still in the inbox). Action -> FAILED,
//                  so Retry Failed can run. This is a real failure.
//   unverifiable — we could not ASK (no credentials, timeout, 5xx). Not a
//                  failure of the send; a failure to check. Action stays
//                  SUCCEEDED with verification PENDING and a bounded retry.
// Never collapse "could not check" into either "verified" or "failed".

export type VerifyOutcome =
  | { kind: 'verified'; detail: string }
  | { kind: 'missing'; detail: string }
  | { kind: 'unverifiable'; error_class: string; detail: string };

const verified = (detail: string): VerifyOutcome => ({ kind: 'verified', detail });
const missing = (detail: string): VerifyOutcome => ({ kind: 'missing', detail });
const unverifiable = (err: unknown, detail: string): VerifyOutcome => ({
  kind: 'unverifiable',
  error_class: (err as { error_class?: string })?.error_class || classifyError(err),
  detail: `${detail}: ${(err as Error)?.message ?? String(err)}`,
});

// external_receipt is typed Record<string, unknown> | null on the model; read
// the executor's known keys through one place rather than casting at each site.
function receiptOf(action: InboxCaseAction): Record<string, unknown> {
  return (action.external_receipt as Record<string, unknown> | null) ?? {};
}

// basecampClient throws `Error("BC GET <url> -> <status> <body>")` on non-ok;
// the status is the only structured thing in it.
function bcStatusOf(err: unknown): number | null {
  const m = /-> (\d{3})/.exec((err as Error)?.message ?? '');
  return m ? Number(m[1]) : null;
}

function isGoogle404(err: unknown): boolean {
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  return e?.code === 404 || e?.status === 404 || e?.response?.status === 404;
}

function gmailFor(item: InboxCaseItem | null) {
  return item?.provider === 'gmail_personal' ? getPersonalGmailClient() : getColaberryGmailClient();
}

async function verifyGmailMessageState(
  item: InboxCaseItem | null,
  messageId: string,
  expect: { hasLabel?: string; lacksLabel?: string; hasLabelNamed?: string },
  what: string,
): Promise<VerifyOutcome> {
  const gmail = gmailFor(item);
  if (!gmail) return unverifiable({ error_class: 'ProviderNotConfiguredError', message: `Gmail client not configured for ${item?.provider ?? 'unknown'}` }, what);
  let labelIds: string[];
  try {
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'minimal' });
    labelIds = (res.data.labelIds as string[] | undefined) ?? [];
  } catch (err) {
    if (isGoogle404(err)) return missing(`${what}: message ${messageId} not found`);
    return unverifiable(err, what);
  }
  if (expect.hasLabel && !labelIds.includes(expect.hasLabel)) return missing(`${what}: message ${messageId} lacks label ${expect.hasLabel}`);
  if (expect.lacksLabel && labelIds.includes(expect.lacksLabel)) return missing(`${what}: message ${messageId} still carries ${expect.lacksLabel}`);
  if (expect.hasLabelNamed) {
    // The receipt carries the label NAME; the message carries ids.
    try {
      const list = await gmail.users.labels.list({ userId: 'me' });
      const id = (list.data.labels || []).find((l: { name?: string | null }) => l.name === expect.hasLabelNamed)?.id;
      if (!id) return missing(`${what}: label "${expect.hasLabelNamed}" does not exist`);
      if (!labelIds.includes(id)) return missing(`${what}: message ${messageId} lacks label "${expect.hasLabelNamed}"`);
    } catch (err) {
      return unverifiable(err, what);
    }
  }
  return verified(`${what}: message ${messageId} confirmed`);
}

async function verifyEmailSend(action: InboxCaseAction, item: InboxCaseItem | null): Promise<VerifyOutcome> {
  const messageId = String(receiptOf(action).message_id ?? '');
  return verifyGmailMessageState(item, messageId, { hasLabel: 'SENT' }, 'EMAIL_SEND');
}

async function verifyEmailLabel(action: InboxCaseAction, item: InboxCaseItem | null): Promise<VerifyOutcome> {
  const receipt = receiptOf(action);
  const messageId = String(receipt.message_id ?? '');
  const labelName = String(receipt.label_applied ?? action.payload?.label ?? 'Inbox Intel/Resolved');
  return verifyGmailMessageState(item, messageId, { lacksLabel: 'INBOX', hasLabelNamed: labelName }, 'EMAIL_LABEL');
}

async function verifyEmailArchive(action: InboxCaseAction, item: InboxCaseItem | null): Promise<VerifyOutcome> {
  // The executor routes non-Hotmail archives through the label path.
  if (item?.provider !== 'hotmail') return verifyEmailLabel(action, item);
  if (!isHotmailConfigured()) return unverifiable({ error_class: 'ProviderNotConfiguredError', message: 'Hotmail/Graph not configured' }, 'EMAIL_ARCHIVE');
  const messageId = String(receiptOf(action).message_id ?? '');
  try {
    const stillInInbox = await isHotmailMessageInInbox(messageId);
    return stillInInbox ? missing(`EMAIL_ARCHIVE: message ${messageId} is still in the Hotmail inbox`) : verified(`EMAIL_ARCHIVE: message ${messageId} no longer in inbox`);
  } catch (err) {
    return unverifiable(err, 'EMAIL_ARCHIVE');
  }
}

function basecampBucket(action: InboxCaseAction, item: InboxCaseItem | null): string | null {
  const fromPayload = action.payload?.project_id;
  const fromSnapshot = (item?.snapshot as Record<string, unknown> | undefined)?.project_id;
  const v = fromPayload ?? fromSnapshot;
  return v == null ? null : String(v);
}

async function verifyBasecampComment(action: InboxCaseAction, item: InboxCaseItem | null): Promise<VerifyOutcome> {
  const bucket = basecampBucket(action, item);
  const commentId = receiptOf(action).comment_id;
  if (!bucket || commentId == null) return missing('BASECAMP_COMMENT: receipt or item lacks project_id/comment_id');
  try {
    await bcGet(`/buckets/${bucket}/comments/${commentId}.json`);
    return verified(`BASECAMP_COMMENT: comment ${commentId} exists in bucket ${bucket}`);
  } catch (err) {
    if (bcStatusOf(err) === 404) return missing(`BASECAMP_COMMENT: comment ${commentId} not found in bucket ${bucket}`);
    return unverifiable(err, 'BASECAMP_COMMENT');
  }
}

async function verifyBasecampTodo(action: InboxCaseAction, item: InboxCaseItem | null, requireCompleted: boolean): Promise<VerifyOutcome> {
  const what = action.action_type;
  const bucket = basecampBucket(action, item);
  const todoId = receiptOf(action).todo_id;
  if (!bucket || todoId == null) return missing(`${what}: receipt or item lacks project_id/todo_id`);
  try {
    const todo = await bcGet<{ id: number; completed?: boolean; updated_at?: string }>(`/buckets/${bucket}/todos/${todoId}.json`);
    if (requireCompleted && todo.completed !== true) return missing(`${what}: todo ${todoId} is not completed`);
    if (!requireCompleted && action.executed_at && todo.updated_at && new Date(todo.updated_at) < new Date(action.executed_at)) {
      return missing(`${what}: todo ${todoId} was not updated after the action executed`);
    }
    return verified(`${what}: todo ${todoId} confirmed`);
  } catch (err) {
    if (bcStatusOf(err) === 404) return missing(`${what}: todo ${todoId} not found in bucket ${bucket}`);
    return unverifiable(err, what);
  }
}

/**
 * Re-fetch the external effect an executed action claims. Only called for
 * external action types; internal ones verify by receipt alone.
 */
export async function verifyExternalEffect(action: InboxCaseAction, item: InboxCaseItem | null): Promise<VerifyOutcome> {
  switch (action.action_type) {
    case 'EMAIL_SEND':
      return verifyEmailSend(action, item);
    case 'EMAIL_LABEL':
      return verifyEmailLabel(action, item);
    case 'EMAIL_ARCHIVE':
      return verifyEmailArchive(action, item);
    case 'BASECAMP_COMMENT':
      return verifyBasecampComment(action, item);
    case 'BASECAMP_UPDATE_TODO':
      return verifyBasecampTodo(action, item, false);
    case 'BASECAMP_COMPLETE_TODO':
      return verifyBasecampTodo(action, item, true);
    default:
      return unverifiable({ error_class: 'ContractViolation', message: `no external verifier for ${action.action_type}` }, action.action_type);
  }
}
