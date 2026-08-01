import { randomUUID } from 'crypto';
import { Op } from 'sequelize';

// Mirrors testHelpers/fakeModel.ts's Op-symbol handling with Op.gt and
// Op.ne added — see caseActionPlanner.test.ts for why test files in this
// directory each keep their own local copy tailored to what they need.
function matchesWhere(row: any, where: any): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const symbolKeys = Object.getOwnPropertySymbols(value as object);
      if (symbolKeys.includes(Op.in)) { if (!(value as any)[Op.in].includes(row[key])) return false; continue; }
      if (symbolKeys.includes(Op.gt)) { if (!(row[key] > (value as any)[Op.gt])) return false; continue; }
      if (symbolKeys.includes(Op.ne)) { if (row[key] === (value as any)[Op.ne]) return false; continue; }
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function makeFakeModel() {
  const rows = new Map<string, any>();
  return {
    rows,
    async create(attrs: any) {
      const id = attrs.id || attrs.bc_id || randomUUID();
      const row: any = {
        id,
        ...attrs,
        toJSON() {
          const { toJSON, update, ...rest } = row;
          return rest;
        },
        async update(patch: any) {
          Object.assign(row, patch);
          return row;
        },
      };
      rows.set(id, row);
      return row;
    },
    async upsert(attrs: any) {
      const existing = Array.from(rows.values()).find((r) => r.key === attrs.key);
      if (existing) {
        Object.assign(existing, attrs);
        return [existing, false];
      }
      return [await this.create(attrs), true];
    },
    async findByPk(id: string) {
      return rows.get(id) || null;
    },
    async findOne({ where }: any = {}) {
      return Array.from(rows.values()).find((r) => matchesWhere(r, where)) || null;
    },
    async findAll({ where }: any = {}) {
      return Array.from(rows.values()).filter((r) => matchesWhere(r, where));
    },
  };
}

const fakeSystemSetting = makeFakeModel();
const fakeInboxEmail = makeFakeModel();
const fakeInboxClassification = makeFakeModel();
const fakeInboxDeletedEmail = makeFakeModel();
const fakeOpsBcTodo = makeFakeModel();
const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxIdentityAlias = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/SystemSetting', () => ({ __esModule: true, default: fakeSystemSetting }));
jest.mock('../../../models/InboxEmail', () => ({ __esModule: true, default: fakeInboxEmail }));
jest.mock('../../../models/InboxClassification', () => ({ __esModule: true, default: fakeInboxClassification }));
jest.mock('../../../models/InboxDeletedEmail', () => ({ __esModule: true, default: fakeInboxDeletedEmail }));
jest.mock('../../../models/OpsBcTodo', () => ({ __esModule: true, default: fakeOpsBcTodo }));
jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxIdentityAlias', () => ({ __esModule: true, default: fakeInboxIdentityAlias }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));

jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

const mockSearchAndNormalize = jest.fn(async () => [] as any[]);
jest.mock('../sources/gmailCaseSource', () => ({
  searchAndNormalize: (...args: any[]) => mockSearchAndNormalize(...args),
}));

const mockFetchFolderMessages = jest.fn(async () => [] as any[]);
let hotmailConfigured = false;
jest.mock('../../inbox/graphMailService', () => ({
  isConfigured: () => hotmailConfigured,
  fetchFolderMessages: (...args: any[]) => mockFetchFolderMessages(...args),
}));
jest.mock('../sources/hotmailCaseSource', () => ({
  toCandidate: (msg: any, sourceType: string) => ({
    source_type: sourceType,
    source_id: msg.id,
    provider: 'hotmail',
    source_url: msg.webLink || null,
    title: msg.subject || '(no subject)',
    occurred_at: new Date(msg.receivedDateTime),
    participants: [],
    subject_normalized: (msg.subject || '').toLowerCase(),
    thread_id: msg.conversationId || null,
    message_id: null,
    in_reply_to: [],
    basecamp_refs: [],
    attachment_names: [],
    body_excerpt: '',
    snapshot: {},
  }),
}));
jest.mock('../sources/basecampCaseSource', () => ({
  todoToCandidate: (todo: any) => ({
    source_type: 'basecamp_todo',
    source_id: todo.bc_id,
    provider: 'basecamp',
    source_url: todo.bc_app_url,
    title: todo.title,
    occurred_at: new Date(todo.bc_updated_at),
    participants: [],
    subject_normalized: (todo.title || '').toLowerCase(),
    thread_id: null,
    message_id: null,
    in_reply_to: [],
    basecamp_refs: [],
    attachment_names: [],
    body_excerpt: '',
    snapshot: { project_id: todo.project_id },
  }),
}));

let colaberryConfigured = true;
let personalConfigured = false;
jest.mock('../../inbox/inboxSyncService', () => ({
  getColaberryGmailClient: () => (colaberryConfigured ? {} : null),
  getPersonalGmailClient: () => (personalConfigured ? {} : null),
}));

import { runAutoSync, getSyncStatus } from '../caseAutoSyncService';

beforeEach(() => {
  fakeSystemSetting.rows.clear();
  fakeInboxEmail.rows.clear();
  fakeInboxClassification.rows.clear();
  fakeInboxDeletedEmail.rows.clear();
  fakeOpsBcTodo.rows.clear();
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseQuestion.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxIdentityAlias.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  mockSearchAndNormalize.mockReset().mockResolvedValue([]);
  mockFetchFolderMessages.mockReset().mockResolvedValue([]);
  hotmailConfigured = false;
  colaberryConfigured = true;
  personalConfigured = false;
});

function rawEmailCandidate(overrides: Partial<any> = {}) {
  return {
    source_type: 'email',
    source_id: randomUUID(),
    provider: 'gmail_colaberry',
    source_url: null,
    title: 'Some email',
    occurred_at: new Date(),
    participants: ['someone@example.com'],
    subject_normalized: 'some email',
    thread_id: null,
    message_id: null,
    in_reply_to: [],
    basecamp_refs: [],
    attachment_names: [],
    body_excerpt: '',
    snapshot: {},
    ...overrides,
  };
}

async function seedClassifiedEmail(provider: string, providerMessageId: string, state: string) {
  const email = await fakeInboxEmail.create({ provider, provider_message_id: providerMessageId, received_at: new Date() });
  await fakeInboxClassification.create({ email_id: email.id, state, classified_at: new Date() });
  return email;
}

describe('runAutoSync — classification filter', () => {
  it('keeps an email Inbox COS classified INBOX', async () => {
    const candidate = rawEmailCandidate();
    await seedClassifiedEmail('gmail_colaberry', candidate.source_id, 'INBOX');
    mockSearchAndNormalize.mockResolvedValue([candidate]);

    const result = await runAutoSync('cron', 'system');

    expect(result.newCasesCreated).toBe(1);
    expect(result.emailsSkippedUnclassified).toBe(0);
  });

  it('drops an email Inbox COS classified AUTOMATION', async () => {
    const candidate = rawEmailCandidate();
    await seedClassifiedEmail('gmail_colaberry', candidate.source_id, 'AUTOMATION');
    mockSearchAndNormalize.mockResolvedValue([candidate]);

    const result = await runAutoSync('cron', 'system');

    expect(result.newCasesCreated).toBe(0);
  });

  it('skips (not includes) an email Inbox COS has not classified yet', async () => {
    const candidate = rawEmailCandidate();
    mockSearchAndNormalize.mockResolvedValue([candidate]); // no matching InboxEmail/InboxClassification seeded

    const result = await runAutoSync('cron', 'system');

    expect(result.newCasesCreated).toBe(0);
    expect(result.emailsSkippedUnclassified).toBe(1);
  });
});

describe('runAutoSync — per-source failure isolation', () => {
  it('a broken gmail_personal credential does not prevent healthy gmail_colaberry results from being processed', async () => {
    personalConfigured = true;
    const goodCandidate = rawEmailCandidate({ provider: 'gmail_colaberry' });
    await seedClassifiedEmail('gmail_colaberry', goodCandidate.source_id, 'INBOX');

    mockSearchAndNormalize.mockImplementation(async (_client: any, provider: string) => {
      if (provider === 'gmail_personal') throw new Error('invalid_grant');
      if (provider === 'gmail_colaberry') return [goodCandidate];
      return [];
    });

    const result = await runAutoSync('cron', 'system');

    // The healthy source's case is still created despite the other source failing.
    expect(result.newCasesCreated).toBe(1);
  });

  it('a broken Hotmail fetch does not prevent healthy Basecamp results from being processed', async () => {
    hotmailConfigured = true;
    mockFetchFolderMessages.mockRejectedValue(new Error('400 Bad Request'));
    await fakeOpsBcTodo.create({ bc_id: 'still-works', project_id: 'p1', title: 'Still works', bc_updated_at: new Date(), bc_app_url: 'https://x' });

    const result = await runAutoSync('cron', 'system');

    expect(result.newCasesCreated).toBe(1);
  });

  it('a broken Basecamp fetch does not prevent healthy email results from being processed', async () => {
    const candidate = rawEmailCandidate();
    await seedClassifiedEmail('gmail_colaberry', candidate.source_id, 'INBOX');
    mockSearchAndNormalize.mockResolvedValue([candidate]);

    const originalFindAll = fakeOpsBcTodo.findAll;
    fakeOpsBcTodo.findAll = jest.fn().mockRejectedValue(new Error('DB connection lost'));
    try {
      const result = await runAutoSync('cron', 'system');
      expect(result.newCasesCreated).toBe(1);
    } finally {
      fakeOpsBcTodo.findAll = originalFindAll; // never leak this override into later tests
    }
  });
});

describe('runAutoSync — Basecamp recent-activity window', () => {
  it('includes a todo updated after the cursor, excludes one updated before it', async () => {
    const now = new Date();
    const before = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3h ago, older than the 2h default lookback
    await fakeOpsBcTodo.create({ bc_id: 'recent-1', project_id: 'p1', title: 'Recent todo', bc_updated_at: now, bc_app_url: 'https://x' });
    await fakeOpsBcTodo.create({ bc_id: 'old-1', project_id: 'p1', title: 'Old todo', bc_updated_at: before, bc_app_url: 'https://x' });

    const result = await runAutoSync('cron', 'system');

    expect(result.newCasesCreated).toBe(1);
    const items = Array.from(fakeInboxCaseItem.rows.values());
    expect(items).toHaveLength(1);
    expect(items[0].source_id).toBe('recent-1');
  });
});

describe('runAutoSync — global dedup', () => {
  it('drops a candidate whose source_hash already exists in some OTHER case', async () => {
    const candidate = rawEmailCandidate();
    await seedClassifiedEmail('gmail_colaberry', candidate.source_id, 'INBOX');
    mockSearchAndNormalize.mockResolvedValue([candidate]);

    // Pre-seed an InboxCaseItem with the same (provider, source_id) hash, as if some earlier discovery already pulled it in.
    const { computeSourceHash } = require('../textNormalization');
    await fakeInboxCaseItem.create({
      case_id: randomUUID(),
      source_hash: computeSourceHash(candidate.provider, candidate.source_id),
    });

    const result = await runAutoSync('cron', 'system');

    expect(result.newCasesCreated).toBe(0);
  });
});

describe('runAutoSync — created items', () => {
  it('persists auto-synced items as INCLUDED, never CANDIDATE', async () => {
    const candidate = rawEmailCandidate();
    await seedClassifiedEmail('gmail_colaberry', candidate.source_id, 'ASK_USER');
    mockSearchAndNormalize.mockResolvedValue([candidate]);

    await runAutoSync('cron', 'system');

    const items = Array.from(fakeInboxCaseItem.rows.values());
    expect(items).toHaveLength(1);
    expect(items[0].inclusion_status).toBe('INCLUDED');
  });

  it('marks the created case source_query.auto_synced true', async () => {
    const candidate = rawEmailCandidate();
    await seedClassifiedEmail('gmail_colaberry', candidate.source_id, 'INBOX');
    mockSearchAndNormalize.mockResolvedValue([candidate]);

    await runAutoSync('admin', 'ali@colaberry.com');

    const cases = Array.from(fakeInboxCase.rows.values());
    expect(cases).toHaveLength(1);
    expect(cases[0].source_query.auto_synced).toBe(true);
    expect(cases[0].source_query.triggered_by).toBe('admin');
  });

  it('clusters two emails sharing a thread_id into one case', async () => {
    const threadId = 'thread-abc';
    const a = rawEmailCandidate({ thread_id: threadId, title: 'Re: Topic' });
    const b = rawEmailCandidate({ thread_id: threadId, title: 'Re: Topic' });
    await seedClassifiedEmail('gmail_colaberry', a.source_id, 'INBOX');
    await seedClassifiedEmail('gmail_colaberry', b.source_id, 'INBOX');
    mockSearchAndNormalize.mockResolvedValue([a, b]);

    const result = await runAutoSync('cron', 'system');

    expect(result.newCasesCreated).toBe(1);
    expect(result.itemsAdded).toBe(2);
  });

  it('produces zero cases and does not error when nothing survives filtering', async () => {
    mockSearchAndNormalize.mockResolvedValue([]);
    const result = await runAutoSync('cron', 'system');
    expect(result.newCasesCreated).toBe(0);
    expect(result.itemsAdded).toBe(0);
  });
});

describe('runAutoSync — cursor', () => {
  it('advances the cursor only after a successful run, readable on the next call', async () => {
    mockSearchAndNormalize.mockResolvedValue([]);
    await runAutoSync('cron', 'system');

    const setting = await fakeSystemSetting.findOne({ where: { key: 'inbox_case_auto_sync_cursor' } });
    expect(setting).not.toBeNull();
    expect(new Date(setting.value.cursor).getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});

describe('runAutoSync — auto-dispose items deleted at the source', () => {
  it('dispositions an open item NO_ACTION when its source message shows up in InboxDeletedEmail', async () => {
    const c = await fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state: 'ASSESSING', correlation_id: randomUUID(), reopen_count: 0 });
    const item = await fakeInboxCaseItem.create({
      case_id: c.id, source_type: 'email', source_id: 'msg-1', provider: 'gmail_colaberry',
      inclusion_status: 'INCLUDED', disposition: null, title: 'Deleted email',
    });
    await fakeInboxDeletedEmail.create({ provider: 'gmail_colaberry', provider_message_id: 'msg-1', folder: 'trash' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    await runAutoSync('cron', 'system');

    expect(item.disposition).toBe('NO_ACTION');
    expect(item.disposition_reason).toContain('deleted');
  });

  it('closes the case when the deleted-at-source item was the last remaining blocker', async () => {
    // EXECUTING, not ASSESSING — only EXECUTING/WAITING/DELEGATED have a
    // legal path to RESOLVED (CASE_STATE_TRANSITIONS); a fresh ASSESSING
    // case genuinely cannot close directly even with a clean item guard,
    // per the real state machine (see caseClosureService.test.ts's own
    // "case_not_in_closable_state" regression test for that exact case).
    const c = await fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state: 'EXECUTING', correlation_id: randomUUID(), reopen_count: 0 });
    await fakeInboxCaseItem.create({
      case_id: c.id, source_type: 'email', source_id: 'msg-2', provider: 'gmail_colaberry',
      inclusion_status: 'INCLUDED', disposition: null, title: 'Deleted email',
    });
    await fakeInboxDeletedEmail.create({ provider: 'gmail_colaberry', provider_message_id: 'msg-2', folder: 'spam' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    await runAutoSync('cron', 'system');

    expect(c.state).toBe('RESOLVED');
    expect(c.closed_at).toBeInstanceOf(Date);
  });

  it('leaves the case open, with the item still correctly dispositioned, when another real blocker remains', async () => {
    const c = await fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state: 'ASSESSING', correlation_id: randomUUID(), reopen_count: 0 });
    const item = await fakeInboxCaseItem.create({
      case_id: c.id, source_type: 'email', source_id: 'msg-3', provider: 'gmail_colaberry',
      inclusion_status: 'INCLUDED', disposition: null, title: 'Deleted email',
    });
    // A second, still-undispositioned item on the same case blocks closure.
    await fakeInboxCaseItem.create({
      case_id: c.id, source_type: 'email', source_id: 'msg-4', provider: 'gmail_colaberry',
      inclusion_status: 'INCLUDED', disposition: null, title: 'Still needs a look',
    });
    await fakeInboxDeletedEmail.create({ provider: 'gmail_colaberry', provider_message_id: 'msg-3', folder: 'trash' });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    await runAutoSync('cron', 'system');

    expect(item.disposition).toBe('NO_ACTION'); // still correctly dispositioned
    expect(c.state).toBe('ASSESSING'); // case itself stays open — the OTHER item still blocks it
  });

  it('leaves an item untouched when no matching InboxDeletedEmail row exists', async () => {
    const c = await fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state: 'ASSESSING', correlation_id: randomUUID(), reopen_count: 0 });
    const item = await fakeInboxCaseItem.create({
      case_id: c.id, source_type: 'email', source_id: 'msg-5', provider: 'gmail_colaberry',
      inclusion_status: 'INCLUDED', disposition: null, title: 'Still in inbox',
    });
    await fakeInboxCaseEvent.create({ case_id: c.id, event_type: 'case_discovery_started' });

    await runAutoSync('cron', 'system');

    expect(item.disposition).toBeNull();
  });

  it('does not re-process an item that already has a disposition', async () => {
    const c = await fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state: 'RESOLVED', correlation_id: randomUUID(), reopen_count: 0 });
    const item = await fakeInboxCaseItem.create({
      case_id: c.id, source_type: 'email', source_id: 'msg-6', provider: 'gmail_colaberry',
      inclusion_status: 'INCLUDED', disposition: 'RESOLVED', title: 'Already handled',
    });
    await fakeInboxDeletedEmail.create({ provider: 'gmail_colaberry', provider_message_id: 'msg-6', folder: 'trash' });

    await runAutoSync('cron', 'system');

    expect(item.disposition).toBe('RESOLVED'); // untouched — was never open to begin with
  });
});

describe('runAutoSync — sync-status tracker and concurrency guard', () => {
  it('reports inProgress:false with a populated lastResult after a normal completed run', async () => {
    mockSearchAndNormalize.mockResolvedValue([]);
    await runAutoSync('cron', 'system');

    const status = getSyncStatus();
    expect(status.inProgress).toBe(false);
    expect(status.stage).toBeNull();
    expect(status.lastResult).not.toBeNull();
    expect(status.lastCompletedAt).not.toBeNull();
  });

  it('a call arriving while a run is already in progress returns immediately without starting a second run', async () => {
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });
    mockSearchAndNormalize.mockImplementation(async () => {
      await firstCallGate; // hold the first call open until we release it below
      return [];
    });

    const firstRun = runAutoSync('cron', 'system'); // deliberately not awaited yet
    await new Promise((r) => setTimeout(r, 10)); // let the first call actually start and set inProgress

    const secondRun = await runAutoSync('admin', 'ali@colaberry.com'); // arrives while the first is still in flight
    expect(secondRun).toEqual({ newCasesCreated: 0, itemsAdded: 0, emailsSkippedUnclassified: 0 });
    expect(mockSearchAndNormalize).toHaveBeenCalledTimes(1); // the second call never actually fetched anything

    releaseFirstCall();
    await firstRun; // let the first call finish so it doesn't leak into the next test
  });
});
