/**
 * The substance guard in `saveConversationToMemory` (R4 follow-up).
 *
 * THE DEFECT THESE PIN. Before the guard, closing a conversation with no readable transcript
 * still wrote memory: `conversation_count` incremented and a summary entry reading
 * "0 messages exchanged" appended, which `buildMemoryContext()` injects into Maya's system
 * prompt. Measured in production on 2026-11-11, 8 such entries existed across 7 memory rows and
 * 5 of those rows held nothing else.
 *
 * WHY A TRANSCRIPT GOES MISSING. `ChatMessageCleanup` deletes chat_messages older than 180
 * days. Nothing closed conversations for eight months, so by the time the idle sweep closed
 * them, 113 of 145 conversations had no message rows left. Retention worked; closing did not.
 *
 * THE CASE THAT MATTERS MOST is the second test. `visitor_message_count` is NOT trustworthy:
 * of the 17 conversations closed that day, 5 carried a non-zero counter while having zero
 * `role='visitor'` message rows. A guard written against the counter would have caught 3 of
 * the 8. These tests therefore drive the counter and the rows APART on purpose, so a future
 * rewrite that reaches for the convenient counter fails here.
 *
 * Both model surfaces are mocked, as in admissionsMemoryPerson.test.ts: the service imports
 * AdmissionsMemory from the model file directly and the rest from the models index, and
 * mocking only one lets the other build a real Sequelize at import time and kill the suite.
 */

// Scopes this file as a module. `tsconfig.test.json` compiles every test file together, and a
// file with no top-level import or export is a SCRIPT sharing one global scope: without this,
// the `updates` and `AdmissionsMemoryMock` declared below collide with identically named
// declarations in admissionsMemoryPerson.test.ts and backfillExplorerEnteredAt.test.ts, and
// the test-typecheck ratchet fails all three files. Jest still hoists the jest.mock calls.
export {};

interface MemRow {
  id: string;
  visitor_id: string;
  lead_id: number | null;
  conversation_count: number;
  interests: string[];
  questions_asked: string[];
  conversation_summaries: Array<Record<string, unknown>>;
  last_conversation_id?: string | null;
  update: (patch: Partial<MemRow>) => Promise<MemRow>;
}

const updates: Array<Partial<MemRow>> = [];
let memRow: MemRow;

function freshRow(): MemRow {
  const row: MemRow = {
    id: 'mem-1',
    visitor_id: 'v-1',
    lead_id: 7,
    conversation_count: 0,
    interests: [],
    questions_asked: [],
    conversation_summaries: [],
    last_conversation_id: null,
    update: async (patch: Partial<MemRow>) => {
      updates.push(patch);
      return Object.assign(row, patch);
    },
  };
  return row;
}

const AdmissionsMemoryMock = {
  findOne: jest.fn(async () => memRow),
  findOrCreate: jest.fn(async () => [memRow, false]),
};

const conversationHolder: { current: Record<string, unknown> | null } = { current: null };
const messagesHolder: { current: Array<{ role: string; content: string }> } = { current: [] };

jest.mock('../../models/AdmissionsMemory', () => ({
  __esModule: true,
  default: AdmissionsMemoryMock,
}));

jest.mock('../../models', () => ({
  __esModule: true,
  AdmissionsMemory: AdmissionsMemoryMock,
  ChatConversation: { findByPk: jest.fn(async () => conversationHolder.current) },
  ChatMessage: { findAll: jest.fn(async () => messagesHolder.current) },
  Visitor: { findByPk: jest.fn(async () => null) },
  Lead: { findByPk: jest.fn(async () => null) },
  IntentScore: { findOne: jest.fn(async () => null) },
  BehavioralSignal: { findAll: jest.fn(async () => []) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { saveConversationToMemory } = require('../admissionsMemoryService');

/** Builds the conversation under test. `counter` is deliberately independent of `visitorSaid`. */
function given(opts: { visitorSaid: string[]; counter: number; summary?: string | null }) {
  conversationHolder.current = {
    id: 'conv-1',
    visitor_id: 'v-1',
    lead_id: 7,
    summary: opts.summary ?? null,
    page_category: 'pricing',
    visitor_message_count: opts.counter,
  };
  messagesHolder.current = [
    { role: 'assistant', content: 'Hi, I am Maya. I am an AI assistant.' },
    ...opts.visitorSaid.map((content) => ({ role: 'visitor', content })),
  ];
}

beforeEach(() => {
  updates.length = 0;
  memRow = freshRow();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('saveConversationToMemory refuses to remember a conversation nobody had', () => {
  it('writes nothing when the visitor never spoke and nothing was summarized', async () => {
    given({ visitorSaid: [], counter: 0 });

    await saveConversationToMemory('conv-1');

    expect(updates).toHaveLength(0);
    expect(memRow.conversation_count).toBe(0);
    expect(memRow.conversation_summaries).toHaveLength(0);
  });

  it('writes nothing even when visitor_message_count CLAIMS the visitor spoke', async () => {
    // The exact production shape: 5 of 17 closed conversations had a non-zero counter and zero
    // visitor message rows. A guard on the counter would wave all five through.
    given({ visitorSaid: [], counter: 3 });

    await saveConversationToMemory('conv-1');

    expect(updates).toHaveLength(0);
    expect(memRow.conversation_count).toBe(0);
  });

  it('never appends the "0 messages exchanged" entry that reached Maya\'s prompt', async () => {
    given({ visitorSaid: [], counter: 2 });

    await saveConversationToMemory('conv-1');

    const written = JSON.stringify(updates);
    expect(written).not.toContain('0 messages exchanged');
  });

  it('logs the skip rather than returning silently', async () => {
    const logSpy = jest.spyOn(console, 'log');
    given({ visitorSaid: [], counter: 1 });

    await saveConversationToMemory('conv-1');

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).toContain('memory_write_skipped_no_substance');
    expect(logged).toContain('conv-1');
  });
});

describe('saveConversationToMemory still records real conversations', () => {
  it('writes memory when the visitor actually said something', async () => {
    given({ visitorSaid: ['How much does the program cost?'], counter: 1 });

    await saveConversationToMemory('conv-1');

    expect(updates).toHaveLength(1);
    expect(updates[0].conversation_count).toBe(1);
    expect(updates[0].conversation_summaries).toHaveLength(1);
  });

  it('keeps the question the visitor asked, so Maya can follow it up', async () => {
    given({ visitorSaid: ['How much does the program cost?'], counter: 1 });

    await saveConversationToMemory('conv-1');

    expect(updates[0].questions_asked).toContain('How much does the program cost?');
    expect(updates[0].interests).toContain('pricing');
  });

  it('treats a generated summary as substance even with no visitor rows', async () => {
    // A model-written summary means something was worth summarizing, so this is kept
    // deliberately rather than swept up by the guard.
    given({ visitorSaid: [], counter: 0, summary: 'Visitor asked about enrollment dates.' });

    await saveConversationToMemory('conv-1');

    expect(updates).toHaveLength(1);
    expect(JSON.stringify(updates[0].conversation_summaries))
      .toContain('Visitor asked about enrollment dates.');
  });

  it('records a count that means what it says: one real conversation, one increment', async () => {
    given({ visitorSaid: ['hello', 'is there a payment plan?'], counter: 2 });

    await saveConversationToMemory('conv-1');

    expect(updates[0].conversation_count).toBe(1);
    expect(updates[0].last_conversation_id).toBe('conv-1');
  });
});
