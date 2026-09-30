// /inbox-zero T5 (CC-20260910-3q7x). Each external action type's live
// re-fetch, with the provider mocked at the package/module boundary. The
// property under test is the THREE-WAY split: "the provider confirms it",
// "the provider definitively says no", and "we could not ask" — and that
// the last one is never collapsed into either of the first two.

const gmailGet = jest.fn();
const gmailLabelsList = jest.fn();
const gmailClient = { users: { messages: { get: (...a: any[]) => gmailGet(...a) }, labels: { list: (...a: any[]) => gmailLabelsList(...a) } } };
let gmailAvailable = true;

jest.mock('../../inbox/inboxSyncService', () => ({
  getColaberryGmailClient: () => (gmailAvailable ? gmailClient : null),
  getPersonalGmailClient: () => (gmailAvailable ? gmailClient : null),
}));

const isMessageInInbox = jest.fn();
let hotmailConfigured = true;
jest.mock('../../inbox/graphMailService', () => ({
  isConfigured: () => hotmailConfigured,
  isMessageInInbox: (...a: any[]) => isMessageInInbox(...a),
}));

const bcGet = jest.fn();
jest.mock('../../ops/basecampClient', () => ({ bcGet: (...a: any[]) => bcGet(...a) }));

import { verifyExternalEffect } from '../externalVerifiers';

function action(action_type: string, external_receipt: any, payload: any = {}, executed_at: Date | null = null): any {
  return { action_type, external_receipt, payload, executed_at, item_id: 'i1' };
}
function item(provider: string, snapshot: any = {}): any {
  return { id: 'i1', provider, snapshot };
}
const bcErr = (status: number) => new Error(`BC GET https://x -> ${status} nope`);

beforeEach(() => {
  gmailGet.mockReset();
  gmailLabelsList.mockReset();
  isMessageInInbox.mockReset();
  bcGet.mockReset();
  gmailAvailable = true;
  hotmailConfigured = true;
});

describe('EMAIL_SEND', () => {
  it('verified when the message exists and carries SENT', async () => {
    gmailGet.mockResolvedValue({ data: { labelIds: ['SENT'] } });
    const r = await verifyExternalEffect(action('EMAIL_SEND', { message_id: 'm1' }), item('gmail_colaberry'));
    expect(r.kind).toBe('verified');
    expect(gmailGet).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'minimal' });
  });
  it('missing when Gmail 404s the message', async () => {
    gmailGet.mockRejectedValue(Object.assign(new Error('Not Found'), { code: 404 }));
    expect((await verifyExternalEffect(action('EMAIL_SEND', { message_id: 'm1' }), item('gmail_colaberry'))).kind).toBe('missing');
  });
  it('missing when the message exists but was never sent', async () => {
    gmailGet.mockResolvedValue({ data: { labelIds: ['DRAFT'] } });
    expect((await verifyExternalEffect(action('EMAIL_SEND', { message_id: 'm1' }), item('gmail_colaberry'))).kind).toBe('missing');
  });
  it('unverifiable when the Gmail client is not configured', async () => {
    gmailAvailable = false;
    const r = await verifyExternalEffect(action('EMAIL_SEND', { message_id: 'm1' }), item('gmail_personal'));
    expect(r).toMatchObject({ kind: 'unverifiable', error_class: 'ProviderNotConfiguredError' });
  });
  it('unverifiable on a transport error, classified', async () => {
    gmailGet.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
    const r = await verifyExternalEffect(action('EMAIL_SEND', { message_id: 'm1' }), item('gmail_colaberry'));
    expect(r.kind).toBe('unverifiable');
    expect((r as any).error_class).not.toBe('Error');
  });
});

describe('EMAIL_LABEL and the Gmail archive path', () => {
  it('verified when INBOX is gone and the named label is present', async () => {
    gmailGet.mockResolvedValue({ data: { labelIds: ['Label_175'] } });
    gmailLabelsList.mockResolvedValue({ data: { labels: [{ id: 'Label_175', name: 'Inbox Intel/Resolved' }] } });
    const r = await verifyExternalEffect(action('EMAIL_LABEL', { message_id: 'm1', label_applied: 'Inbox Intel/Resolved' }), item('gmail_colaberry'));
    expect(r.kind).toBe('verified');
  });
  it('missing when the message still carries INBOX', async () => {
    gmailGet.mockResolvedValue({ data: { labelIds: ['INBOX', 'Label_175'] } });
    const r = await verifyExternalEffect(action('EMAIL_LABEL', { message_id: 'm1', label_applied: 'Inbox Intel/Resolved' }), item('gmail_colaberry'));
    expect(r.kind).toBe('missing');
  });
  it('missing when the named label is not on the message', async () => {
    gmailGet.mockResolvedValue({ data: { labelIds: [] } });
    gmailLabelsList.mockResolvedValue({ data: { labels: [{ id: 'Label_175', name: 'Inbox Intel/Resolved' }] } });
    const r = await verifyExternalEffect(action('EMAIL_LABEL', { message_id: 'm1', label_applied: 'Inbox Intel/Resolved' }), item('gmail_colaberry'));
    expect(r.kind).toBe('missing');
  });
  it('EMAIL_ARCHIVE on a Gmail item is verified through the label path, not Graph', async () => {
    gmailGet.mockResolvedValue({ data: { labelIds: ['Label_175'] } });
    gmailLabelsList.mockResolvedValue({ data: { labels: [{ id: 'Label_175', name: 'Inbox Intel/Resolved' }] } });
    const r = await verifyExternalEffect(action('EMAIL_ARCHIVE', { message_id: 'm1', label_applied: 'Inbox Intel/Resolved' }), item('gmail_colaberry'));
    expect(r.kind).toBe('verified');
    expect(isMessageInInbox).not.toHaveBeenCalled();
  });
});

describe('EMAIL_ARCHIVE on Hotmail', () => {
  it('verified when the message is no longer in the inbox', async () => {
    isMessageInInbox.mockResolvedValue(false);
    expect((await verifyExternalEffect(action('EMAIL_ARCHIVE', { message_id: 'h1', archived: true }), item('hotmail'))).kind).toBe('verified');
  });
  it('missing when it is still sitting in the inbox', async () => {
    isMessageInInbox.mockResolvedValue(true);
    expect((await verifyExternalEffect(action('EMAIL_ARCHIVE', { message_id: 'h1', archived: true }), item('hotmail'))).kind).toBe('missing');
  });
  it('unverifiable when Graph is not configured or throws', async () => {
    hotmailConfigured = false;
    expect((await verifyExternalEffect(action('EMAIL_ARCHIVE', { message_id: 'h1' }), item('hotmail'))).kind).toBe('unverifiable');
    hotmailConfigured = true;
    isMessageInInbox.mockRejectedValue(Object.assign(new Error('throttled'), { status: 429 }));
    const r = await verifyExternalEffect(action('EMAIL_ARCHIVE', { message_id: 'h1' }), item('hotmail'));
    expect(r).toMatchObject({ kind: 'unverifiable', error_class: 'RateLimitError' });
  });
});

describe('BASECAMP_COMMENT', () => {
  it('verified when the comment can be fetched from the right bucket', async () => {
    bcGet.mockResolvedValue({ id: 99 });
    const r = await verifyExternalEffect(action('BASECAMP_COMMENT', { comment_id: 99 }, { project_id: '123' }), item('basecamp'));
    expect(r.kind).toBe('verified');
    expect(bcGet).toHaveBeenCalledWith('/buckets/123/comments/99.json');
  });
  it('falls back to the item snapshot for the bucket', async () => {
    bcGet.mockResolvedValue({ id: 99 });
    await verifyExternalEffect(action('BASECAMP_COMMENT', { comment_id: 99 }), item('basecamp', { project_id: 456 }));
    expect(bcGet).toHaveBeenCalledWith('/buckets/456/comments/99.json');
  });
  it('missing on a Basecamp 404, unverifiable on anything else', async () => {
    bcGet.mockRejectedValueOnce(bcErr(404));
    expect((await verifyExternalEffect(action('BASECAMP_COMMENT', { comment_id: 99 }, { project_id: '1' }), item('basecamp'))).kind).toBe('missing');
    bcGet.mockRejectedValueOnce(Object.assign(new Error('timed out'), { error_class: 'TimeoutError', name: 'BcTimeoutError' }));
    const r = await verifyExternalEffect(action('BASECAMP_COMMENT', { comment_id: 99 }, { project_id: '1' }), item('basecamp'));
    expect(r).toMatchObject({ kind: 'unverifiable', error_class: 'TimeoutError' });
  });
  it('missing (not unverifiable) when the receipt has no comment_id or bucket to look up', async () => {
    expect((await verifyExternalEffect(action('BASECAMP_COMMENT', {}, { project_id: '1' }), item('basecamp'))).kind).toBe('missing');
    expect(bcGet).not.toHaveBeenCalled();
  });
});

describe('BASECAMP todos', () => {
  it('COMPLETE_TODO is verified only when the todo reads completed', async () => {
    bcGet.mockResolvedValueOnce({ id: 7, completed: true });
    expect((await verifyExternalEffect(action('BASECAMP_COMPLETE_TODO', { todo_id: 7 }, { project_id: '1' }), item('basecamp'))).kind).toBe('verified');
    bcGet.mockResolvedValueOnce({ id: 7, completed: false });
    expect((await verifyExternalEffect(action('BASECAMP_COMPLETE_TODO', { todo_id: 7 }, { project_id: '1' }), item('basecamp'))).kind).toBe('missing');
  });
  it('UPDATE_TODO is missing when the todo was not touched after the action executed', async () => {
    const executed = new Date('2026-09-11T10:00:00Z');
    bcGet.mockResolvedValueOnce({ id: 7, updated_at: '2026-09-11T09:00:00Z' });
    expect((await verifyExternalEffect(action('BASECAMP_UPDATE_TODO', { todo_id: 7 }, { project_id: '1' }, executed), item('basecamp'))).kind).toBe('missing');
    bcGet.mockResolvedValueOnce({ id: 7, updated_at: '2026-09-11T10:00:05Z' });
    expect((await verifyExternalEffect(action('BASECAMP_UPDATE_TODO', { todo_id: 7 }, { project_id: '1' }, executed), item('basecamp'))).kind).toBe('verified');
  });
});

describe('unknown type', () => {
  it('is unverifiable with ContractViolation, never silently verified', async () => {
    const r = await verifyExternalEffect(action('BASECAMP_CREATE_TODO', { todo_id: 1 }, { project_id: '1' }), item('basecamp'));
    expect(r).toMatchObject({ kind: 'unverifiable', error_class: 'ContractViolation' });
  });
});
