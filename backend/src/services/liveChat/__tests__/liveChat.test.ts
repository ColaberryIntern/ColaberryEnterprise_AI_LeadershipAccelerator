jest.mock('../../sessionGuestService', () => {
  const actual = jest.requireActual('../../sessionGuestService');
  return { ...actual, verifyGuestPass: jest.fn() };
});
jest.mock('../../sessionGuestStore', () => ({ findGuest: jest.fn() }));
jest.mock('../../sessionLiveStateService', () => ({ getBroadcast: jest.fn().mockResolvedValue(null) }));
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: jest.fn() }));
jest.mock('../liveChatStore', () => ({
  insertMessage: jest.fn(), listMessages: jest.fn(), insertEscalation: jest.fn(),
  listPendingEscalations: jest.fn(), resolveEscalation: jest.fn(),
}));

import { verifyGuestPass, GuestError } from '../../sessionGuestService';
import { findGuest } from '../../sessionGuestStore';
import { chatJson } from '../../runtime/runtimeAi';
import * as store from '../liveChatStore';
import { sanitizeVerdict, handleAttendeeMessage, ASSISTANT_NAME } from '../liveChatAgent';
import { postChatAsGuest, answerEscalation, resetChatCounters, CHAT_LIMITS } from '../liveChatService';

const mockVerify = verifyGuestPass as unknown as jest.Mock;
const mockFind = findGuest as unknown as jest.Mock;
const mockChat = chatJson as unknown as jest.Mock;
const S = store as unknown as Record<string, jest.Mock>;
const SID = '5b8a95b7-1a88-42d5-b257-fd786d071f6e';
const MSG = { id: 'm1', kind: 'attendee', display_name: 'Ana R.', content: 'Where do I save the skill?', reply_to: null, created_at: 'now' };

async function status(p: Promise<unknown>): Promise<number> {
  try { await p; return 200; } catch (e) { return e instanceof GuestError ? e.status : -1; }
}

beforeEach(() => {
  jest.clearAllMocks();
  resetChatCounters();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockVerify.mockReturnValue('g1');
  mockFind.mockResolvedValue({ id: 'g1', name: 'Ana Ruiz' });
  S.insertMessage.mockImplementation(async (_s, kind, name, content) => ({ id: 'new', kind, display_name: name, content, reply_to: null, created_at: 'now' }));
});

describe('sanitizeVerdict', () => {
  it('keeps a confident answer and a non-question', () => {
    expect(sanitizeVerdict({ kind: 'question', confident: true, answer: 'In a note.', options: [] })).toEqual({ kind: 'question', confident: true, answer: 'In a note.', options: [] });
    expect(sanitizeVerdict({ kind: 'other' })).toEqual({ kind: 'other', confident: false, answer: '', options: [] });
  });
  it('treats an unsure question as an escalation, with options only when there are at least two', () => {
    expect(sanitizeVerdict({ kind: 'question', confident: false, options: ['A', 'B', 'C', 'D'] })!.options).toEqual(['A', 'B', 'C']);
    // Too few options: still escalated, with none, so the instructor sees the question and can skip it.
    expect(sanitizeVerdict({ kind: 'question', confident: false, options: ['A'] })).toEqual({ kind: 'question', confident: false, answer: '', options: [] });
  });
  it('does not trust "confident" without an answer, or an unknown kind', () => {
    expect(sanitizeVerdict({ kind: 'question', confident: true, answer: '', options: ['A', 'B'] })!.confident).toBe(false);
    expect(sanitizeVerdict({ kind: 'spam' })).toBeNull();
    expect(sanitizeVerdict(null)).toBeNull();
  });
});

describe('handleAttendeeMessage', () => {
  it('answers in the chat when confident, addressed to the asker', async () => {
    mockChat.mockResolvedValue({ parsed: { kind: 'question', confident: true, answer: 'Copy it into a note.' }, cost_usd: 0 });
    expect(await handleAttendeeMessage(SID, MSG as never)).toBe('answered');
    expect(S.insertMessage).toHaveBeenCalledWith(SID, 'assistant', ASSISTANT_NAME, '@Ana R. Copy it into a note.', { replyTo: 'm1' });
  });
  it('escalates with options when unsure, and posts nothing', async () => {
    mockChat.mockResolvedValue({ parsed: { kind: 'question', confident: false, options: ['A', 'B', 'C'] }, cost_usd: 0 });
    expect(await handleAttendeeMessage(SID, MSG as never)).toBe('escalated');
    expect(S.insertEscalation).toHaveBeenCalledWith(SID, 'm1', MSG.content, ['A', 'B', 'C']);
    expect(S.insertMessage).not.toHaveBeenCalled();
  });
  it('ignores a non-question, and never throws when the model fails', async () => {
    mockChat.mockResolvedValueOnce({ parsed: { kind: 'other' }, cost_usd: 0 });
    expect(await handleAttendeeMessage(SID, MSG as never)).toBe('ignored');
    mockChat.mockRejectedValueOnce(new Error('upstream'));
    expect(await handleAttendeeMessage(SID, MSG as never)).toBe('failed');
    expect(S.insertMessage).not.toHaveBeenCalled();
  });
});

describe('postChatAsGuest', () => {
  it('saves the message under the redacted name and hands it to the assistant', async () => {
    const agent = jest.fn().mockResolvedValue('answered');
    const r = await postChatAsGuest(SID, 'pass', '  hello  ', agent);
    expect(S.insertMessage).toHaveBeenCalledWith(SID, 'attendee', 'Ana R.', 'hello', { guestId: 'g1' });
    expect(agent).toHaveBeenCalledWith(SID, r.message);
  });
  it('refuses no pass (401), empty or long text (400) and fast repeats (429)', async () => {
    const agent = jest.fn();
    mockVerify.mockReturnValueOnce(null);
    expect(await status(postChatAsGuest(SID, undefined, 'hi', agent))).toBe(401);
    expect(await status(postChatAsGuest(SID, 'pass', '   ', agent))).toBe(400);
    expect(await status(postChatAsGuest(SID, 'pass', 'a'.repeat(CHAT_LIMITS.chars + 1), agent))).toBe(400);
    expect(await status(postChatAsGuest(SID, 'pass', 'one', agent))).toBe(200);
    expect(await status(postChatAsGuest(SID, 'pass', 'two', agent))).toBe(429);
  });
});

describe('answerEscalation', () => {
  it('posts the chosen option to the chat, addressed to the asker', async () => {
    S.resolveEscalation.mockResolvedValue({ message_id: 'm1', options: ['A', 'B', 'C'], asked_by: 'Ana R.' });
    expect(await answerEscalation(SID, 'e1', 1)).toEqual({ posted: true });
    expect(S.resolveEscalation).toHaveBeenCalledWith(SID, 'e1', 'answered', 1);
    expect(S.insertMessage).toHaveBeenCalledWith(SID, 'assistant', ASSISTANT_NAME, '@Ana R. B', { replyTo: 'm1' });
  });
  it('skip posts nothing; a second answer is refused (409); a bad choice is 400', async () => {
    S.resolveEscalation.mockResolvedValueOnce({ message_id: 'm1', options: ['A', 'B'], asked_by: 'Ana R.' });
    expect(await answerEscalation(SID, 'e1', 'skip')).toEqual({ posted: false });
    S.resolveEscalation.mockResolvedValueOnce(null);
    expect(await status(answerEscalation(SID, 'e1', 0))).toBe(409);
    expect(await status(answerEscalation(SID, 'e1', 7))).toBe(400);
    expect(S.insertMessage).not.toHaveBeenCalled();
  });
});
