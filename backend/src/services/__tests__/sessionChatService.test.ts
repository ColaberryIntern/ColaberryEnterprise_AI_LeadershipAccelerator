/**
 * The live-class chat thread — first tests, written because it is getting its first reader.
 *
 * This endpoint has been live for months with nothing on the other end of it, so the two
 * defects covered here had never once been observable: the response carried `enrollment_id`
 * to every classmate, and `limit` with `ORDER BY ASC` returned the OLDEST hundred messages,
 * which would have frozen a busy class's thread on its first hour. Both are the kind of bug
 * that only a consumer surfaces, which is exactly why they are pinned now rather than after
 * the desktop workspace ships.
 */

jest.mock('../../models/LiveSession', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../../models/SessionChatMessage', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), create: jest.fn() },
}));

import { Op } from 'sequelize';
import LiveSession from '../../models/LiveSession';
import SessionChatMessage from '../../models/SessionChatMessage';
import {
  getSessionChatMessages,
  postSessionChatMessage,
  MAX_CHAT_LENGTH,
  type SessionChatThread,
} from '../sessionChatService';

const findSession = LiveSession.findOne as unknown as jest.Mock;
const findMessages = SessionChatMessage.findAll as unknown as jest.Mock;
const createMessage = SessionChatMessage.create as unknown as jest.Mock;

const SID = 'session-1';
const CID = 'cohort-1';

/** A row as the driver hands it back — every column the model declares. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    session_id: SID,
    enrollment_id: 'enr-1',
    sender_name: 'Dara',
    content: 'how do I run that?',
    created_at: new Date('2026-10-31T15:00:00.000Z'),
    ...over,
  };
}

/** `findAll` is called twice: the thread, then the active-sender window. */
function wire(thread: unknown[], recent: unknown[] = []) {
  findSession.mockResolvedValue({ id: SID });
  findMessages.mockReset();
  findMessages.mockResolvedValueOnce(thread).mockResolvedValueOnce(recent);
}

async function read(since?: string): Promise<SessionChatThread> {
  const result = await getSessionChatMessages(SID, CID, since);
  if (!result) throw new Error('expected a thread');
  return result;
}

afterEach(() => { jest.clearAllMocks(); });

describe('who may read the thread', () => {
  it('answers null for a session outside the caller\'s cohort', async () => {
    // The controller turns this into a 404, so a viewer outside the cohort never learns
    // the session exists — the same posture the rest of the live surface takes.
    findSession.mockResolvedValue(null);

    expect(await getSessionChatMessages(SID, 'someone-elses-cohort')).toBeNull();
    expect(findMessages).not.toHaveBeenCalled();
  });

  it('scopes the lookup on BOTH the session and the cohort', async () => {
    wire([]);
    await read();

    expect(findSession).toHaveBeenCalledWith({ where: { id: SID, cohort_id: CID } });
  });
});

describe('what the thread exposes', () => {
  it('does not hand a classmate the author\'s enrollment id', async () => {
    wire([row()]);
    const thread = await read();

    expect(thread.messages[0]).toEqual({
      id: 'm1',
      sender_name: 'Dara',
      content: 'how do I run that?',
      created_at: '2026-10-31T15:00:00.000Z',
    });
    expect(Object.keys(thread.messages[0])).not.toContain('enrollment_id');
  });

  it('asks the database for only those columns, rather than filtering after the fact', async () => {
    wire([]);
    await read();

    expect(findMessages.mock.calls[0][0].attributes)
      .toEqual(['id', 'sender_name', 'content', 'created_at']);
  });

  it('renders a timestamp the driver returned as a string', async () => {
    // A raw read, or another dialect, hands back what it read rather than a Date.
    wire([row({ created_at: '2026-10-31T15:00:00Z' })]);

    expect((await read()).messages[0].created_at).toBe('2026-10-31T15:00:00.000Z');
  });

  it('passes an unparseable timestamp through instead of blanking it', async () => {
    // Blanking would destroy the only ordering signal the client has.
    wire([row({ created_at: 'not a date' })]);

    expect((await read()).messages[0].created_at).toBe('not a date');
  });
});

describe('the tail, not the archive', () => {
  it('reads the NEWEST hundred', async () => {
    // The defect this pins: ASC + limit takes the oldest hundred, so message 101 onward
    // never appears and the thread looks frozen.
    wire([]);
    await read();

    const [{ order, limit }] = findMessages.mock.calls[0];
    expect(order).toEqual([['created_at', 'DESC']]);
    expect(limit).toBe(100);
  });

  it('displays them oldest-first, which is how a thread reads', async () => {
    wire([
      row({ id: 'newest', content: 'third' }),
      row({ id: 'middle', content: 'second' }),
      row({ id: 'oldest', content: 'first' }),
    ]);

    expect((await read()).messages.map((m) => m.id)).toEqual(['oldest', 'middle', 'newest']);
  });
});

describe('the since filter', () => {
  it('compares against a real instant when given one', async () => {
    wire([]);
    await read('2026-10-31T14:00:00Z');

    const { where } = findMessages.mock.calls[0][0];
    expect(where.created_at[Op.gt]).toEqual(new Date('2026-10-31T14:00:00Z'));
  });

  it('IGNORES a value it cannot parse rather than letting it reach the comparison', async () => {
    // `since` is caller-supplied and lands in a timestamp comparison. Passing garbage down
    // is a 500 in the middle of a class; dropping it costs the caller one redundant page.
    wire([]);
    await read('yesterday-ish');

    const { where } = findMessages.mock.calls[0][0];
    expect(where.created_at).toBeUndefined();
    expect(where.session_id).toBe(SID);
  });
});

describe('who is talking', () => {
  it('counts distinct senders, not messages', async () => {
    wire([], [
      { enrollment_id: 'a' }, { enrollment_id: 'a' }, { enrollment_id: 'b' },
    ]);

    expect((await read()).active_count).toBe(2);
  });

  it('is zero in a quiet room', async () => {
    wire([row()], []);

    expect((await read()).active_count).toBe(0);
  });
});

describe('writing a message', () => {
  it('refuses one longer than the declared maximum', async () => {
    findSession.mockResolvedValue({ id: SID });

    await expect(
      postSessionChatMessage(SID, 'enr-1', CID, 'Dara', 'x'.repeat(MAX_CHAT_LENGTH + 1)),
    ).rejects.toThrow(/500 characters or fewer/);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('CONTROL: accepts one exactly at the maximum', async () => {
    findSession.mockResolvedValue({ id: SID });
    createMessage.mockResolvedValue(row());

    await postSessionChatMessage(SID, 'enr-1', CID, 'Dara', 'x'.repeat(MAX_CHAT_LENGTH));

    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it('refuses a session outside the cohort without writing', async () => {
    findSession.mockResolvedValue(null);

    expect(await postSessionChatMessage(SID, 'enr-1', 'other', 'Dara', 'hi')).toBeNull();
    expect(createMessage).not.toHaveBeenCalled();
  });
});
