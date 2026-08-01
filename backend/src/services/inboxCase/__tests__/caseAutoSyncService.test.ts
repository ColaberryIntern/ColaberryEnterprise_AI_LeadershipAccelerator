import { randomUUID } from 'crypto';
import { Op } from 'sequelize';

// Mirrors testHelpers/fakeModel.ts's Op-symbol handling with Op.gt added —
// see caseActionPlanner.test.ts for why test files in this directory each
// keep their own local copy tailored to what they need.
function matchesWhere(row: any, where: any): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const symbolKeys = Object.getOwnPropertySymbols(value as object);
      if (symbolKeys.includes(Op.in)) { if (!(value as any)[Op.in].includes(row[key])) return false; continue; }
      if (symbolKeys.includes(Op.gt)) { if (!(row[key] > (value as any)[Op.gt])) return false; continue; }
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
const fakeOpsBcTodo = makeFakeModel();
const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxIdentityAlias = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/SystemSetting', () => ({ __esModule: true, default: fakeSystemSetting }));
jest.mock('../../../models/InboxEmail', () => ({ __esModule: true, default: fakeInboxEmail }));
jest.mock('../../../models/InboxClassification', () => ({ __esModule: true, default: fakeInboxClassification }));
jest.mock('../../../models/OpsBcTodo', () => ({ __esModule: true, default: fakeOpsBcTodo }));
jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
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

import { runAutoSync } from '../caseAutoSyncService';

beforeEach(() => {
  fakeSystemSetting.rows.clear();
  fakeInboxEmail.rows.clear();
  fakeInboxClassification.rows.clear();
  fakeOpsBcTodo.rows.clear();
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
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
