/**
 * R4 - Maya remembers a PERSON, not a browser.
 *
 * These are the first tests this module has ever had, which is itself part of why the
 * identity bug survived: `loadMemory` keyed on a browser fingerprint for its whole life and
 * nothing asserted otherwise.
 *
 * WHAT IS MOCKED, AND WHY BOTH. The service imports `AdmissionsMemory` from the model file
 * directly and the rest from the models index, so both are mocked. Mocking only one leaves the
 * other to build a real Sequelize from `config/database` at import time and the suite dies
 * before a test runs — the failure mode documented in src/__tests__/testSupport/configMocks.ts.
 *
 * The mocks are a small in-memory table rather than bare `jest.fn()`s, because the thing under
 * test is RESOLUTION: which row comes back for which identity. A stub returning a fixed object
 * cannot distinguish "found the person's row" from "made a new one", which is the entire
 * question.
 */

interface Row {
  id: string;
  visitor_id: string;
  lead_id: number | null;
  conversation_count: number;
  visitor_type: string;
  created_at: Date;
  interests: string[];
  questions_asked: string[];
  conversation_summaries: unknown[];
  personality_notes?: string | null;
  recommended_next_action?: string | null;
  update: (patch: Partial<Row>) => Promise<Row>;
}

const table: Row[] = [];
let created = 0;

function makeRow(seed: Partial<Row>): Row {
  const row: Row = {
    id: seed.id ?? `mem-${table.length + 1}`,
    visitor_id: seed.visitor_id ?? 'v?',
    lead_id: seed.lead_id ?? null,
    conversation_count: seed.conversation_count ?? 0,
    visitor_type: seed.visitor_type ?? 'new',
    created_at: seed.created_at ?? new Date('2026-01-01'),
    interests: seed.interests ?? [],
    questions_asked: seed.questions_asked ?? [],
    conversation_summaries: seed.conversation_summaries ?? [],
    personality_notes: seed.personality_notes ?? null,
    recommended_next_action: seed.recommended_next_action ?? null,
    update: async (patch: Partial<Row>) => Object.assign(row, patch),
  };
  return row;
}

const AdmissionsMemoryMock = {
  findOne: jest.fn(async ({ where, order }: any) => {
    let found = table.filter((r) => {
      if (where.lead_id !== undefined) return r.lead_id === where.lead_id;
      if (where.visitor_id !== undefined) return r.visitor_id === where.visitor_id;
      return false;
    });
    // Honour ORDER BY created_at ASC, because the determinism of that order is one of the
    // things being asserted: without it the mock would pass a test the database would fail.
    if (order && order[0] && order[0][0] === 'created_at') {
      found = [...found].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
      if (order[0][1] === 'DESC') found.reverse();
    }
    return found[0] ?? null;
  }),
  findOrCreate: jest.fn(async ({ where, defaults }: any) => {
    const existing = table.find((r) => r.visitor_id === where.visitor_id);
    if (existing) return [existing, false];
    created += 1;
    const row = makeRow({ ...defaults, created_at: new Date(`2026-06-0${Math.min(created, 9)}`) });
    table.push(row);
    return [row, true];
  }),
};

jest.mock('../../models/AdmissionsMemory', () => ({
  __esModule: true,
  default: AdmissionsMemoryMock,
}));

jest.mock('../../models', () => ({
  __esModule: true,
  AdmissionsMemory: AdmissionsMemoryMock,
  ChatConversation: { findByPk: jest.fn() },
  ChatMessage: { findAll: jest.fn(async () => []) },
  Visitor: { findByPk: jest.fn(async () => null) },
  Lead: { findByPk: jest.fn(async () => null) },
  IntentScore: { findOne: jest.fn(async () => null) },
  BehavioralSignal: { findAll: jest.fn(async () => []) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadMemory, buildMemoryContext, classifyVisitorType } = require('../admissionsMemoryService');

beforeEach(() => {
  table.length = 0;
  created = 0;
  jest.clearAllMocks();
});

describe('R4: memory resolves by person, not by browser', () => {
  it('TWO visitor ids belonging to ONE lead resolve to the SAME memory', async () => {
    // The person signs up on their laptop. One memory row exists, linked to lead 42.
    const first = await loadMemory('visitor-laptop', 42);
    expect(table).toHaveLength(1);
    expect(first.lead_id).toBe(42);

    // The same human opens the site on their phone: a different fingerprint, so a different
    // visitor id. This is the exact case the ticket describes, and before the fix it minted a
    // second row and Maya greeted them as a stranger.
    const second = await loadMemory('visitor-phone', 42);

    expect(second.id).toBe(first.id);
    expect(table).toHaveLength(1); // the before/after count: ONE row, not two
  });

  it('writes the link the first time a person becomes known, so the second device can find it', async () => {
    // Anonymous first touch: no person yet, so the browser is all there is.
    const anon = await loadMemory('visitor-laptop');
    expect(anon.lead_id).toBeNull();

    // They identify themselves. The same browser, now with a person attached.
    const known = await loadMemory('visitor-laptop', 42);
    expect(known.id).toBe(anon.id);
    expect(known.lead_id).toBe(42);

    // And that link is what lets a different browser find the same memory.
    const otherDevice = await loadMemory('visitor-phone', 42);
    expect(otherDevice.id).toBe(anon.id);
    expect(table).toHaveLength(1);
  });

  it('still falls back to the browser for a genuinely anonymous visitor', async () => {
    // The fallback has to survive: most first touches have no person, and refusing to make a
    // memory for them would be a worse bug than the one being fixed.
    const a = await loadMemory('visitor-a');
    const b = await loadMemory('visitor-b');
    expect(a.id).not.toBe(b.id);
    expect(table).toHaveLength(2);
  });

  it('picks the OLDEST row when a person already has more than one, every time', async () => {
    // 2 leads are in this state in production today. An unordered findOne returns whichever
    // row Postgres hands back first, which can differ between two calls for the same person;
    // callTranscriptProcessor.ts:87 has exactly that bug.
    table.push(makeRow({ id: 'newer', visitor_id: 'v2', lead_id: 42, created_at: new Date('2026-09-01') }));
    table.push(makeRow({ id: 'older', visitor_id: 'v1', lead_id: 42, created_at: new Date('2026-03-01') }));

    expect((await loadMemory('v2', 42)).id).toBe('older');
    expect((await loadMemory('v1', 42)).id).toBe('older');
    expect((await loadMemory('v-unseen', 42)).id).toBe('older');
  });

  it('does not invent a person: an unknown lead never matches a row', async () => {
    // CONTROL. If the person lookup matched loosely, every assertion above would pass for the
    // wrong reason, so a lead nobody has must fall through to the browser path.
    table.push(makeRow({ id: 'someone-else', visitor_id: 'v9', lead_id: 7, created_at: new Date('2026-02-01') }));
    const mem = await loadMemory('visitor-new', 999);
    expect(mem.id).not.toBe('someone-else');
    expect(mem.visitor_id).toBe('visitor-new');
  });
});

describe('R4: the memory block survives a change of device', () => {
  it('buildMemoryContext finds the person history from an unseen browser', async () => {
    table.push(makeRow({
      id: 'theirs', visitor_id: 'v-laptop', lead_id: 42, conversation_count: 3,
      visitor_type: 'engaged', interests: ['data engineering'],
      created_at: new Date('2026-03-01'),
    }));

    const fromNewDevice = await buildMemoryContext('v-phone', 42);
    expect(fromNewDevice).toContain('VISITOR MEMORY');
    expect(fromNewDevice).toContain('Conversations to date: 3');
    expect(fromNewDevice).toContain('data engineering');

    // And the old behaviour, for contrast: without the person, the unseen browser has nothing.
    expect(await buildMemoryContext('v-phone')).toBe('');
  });
});

describe('R4: visitor_type stops reporting a returning person as new', () => {
  it('classifies a person with history as returning, from a browser never seen before', async () => {
    table.push(makeRow({
      id: 'theirs', visitor_id: 'v-laptop', lead_id: 42, conversation_count: 1,
      created_at: new Date('2026-03-01'),
    }));

    // This is criterion (4). In production every one of the 114 memory rows has
    // conversation_count = 0 and the distribution is 84 new / 26 high_intent / 4 ceo, with
    // ZERO returning and ZERO engaged, because those branches need a count this row never had.
    expect(await classifyVisitorType('v-phone', 42)).toBe('returning');
  });

  it('classifies as engaged at two or more conversations', async () => {
    table.push(makeRow({
      id: 'theirs', visitor_id: 'v-laptop', lead_id: 42, conversation_count: 2,
      created_at: new Date('2026-03-01'),
    }));
    expect(await classifyVisitorType('v-phone', 42)).toBe('engaged');
  });

  it('still says new when there genuinely is no history — the two-way control', async () => {
    // Without this, "returning" above could be a function that always returns 'returning'.
    expect(await classifyVisitorType('v-nobody', 999)).toBe('new');
  });
});
