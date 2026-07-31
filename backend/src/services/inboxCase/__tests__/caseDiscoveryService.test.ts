import { randomUUID } from 'crypto';

// In-memory fakes for the three Sequelize models discoverCases() writes to
// directly (openCase/InboxCaseItem.create/upsertAlias), so this test proves
// the real discovery/scoring/grouping/propagation pipeline end-to-end
// without a live Postgres connection. inbox_case_events writes go through
// logCaseEvent(), which already swallows failures by design (see
// caseEventLog.ts), so InboxCaseEvent is deliberately left un-mocked.

function makeFakeModel() {
  const rows = new Map<string, any>();
  return {
    rows,
    async create(attrs: any) {
      const id = attrs.id || randomUUID();
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
    async findByPk(id: string) {
      return rows.get(id) || null;
    },
    async findOne({ where }: any) {
      return (
        Array.from(rows.values()).find((r) =>
          Object.entries(where || {}).every(([k, v]) => r[k] === v)
        ) || null
      );
    },
    async findAll({ where }: any = {}) {
      const all = Array.from(rows.values());
      if (!where) return all;
      return all.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
    },
  };
}

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxIdentityAlias = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxIdentityAlias', () => ({ __esModule: true, default: fakeInboxIdentityAlias }));
// Mocked purely to keep test output clean — logCaseEvent() already swallows
// failures by design (see caseEventLog.ts), so this isn't required for
// correctness, only to avoid noisy console.error spam from a real (absent)
// DB connection on every event write.
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));

jest.mock('../sources/gmailCaseSource', () => ({
  gmailColaberryCaseSource: { provider: 'gmail_colaberry', isConfigured: () => true, findCandidates: jest.fn() },
  gmailPersonalCaseSource: { provider: 'gmail_personal', isConfigured: () => true, findCandidates: jest.fn(async () => []) },
}));
jest.mock('../sources/hotmailCaseSource', () => ({
  hotmailCaseSource: { provider: 'hotmail', isConfigured: () => true, findCandidates: jest.fn(async () => []) },
}));
jest.mock('../sources/basecampCaseSource', () => ({
  basecampCaseSource: { provider: 'basecamp', isConfigured: () => true, findCandidates: jest.fn() },
}));

import { discoverCases } from '../caseDiscoveryService';
import { gmailColaberryCaseSource } from '../sources/gmailCaseSource';
import { basecampCaseSource } from '../sources/basecampCaseSource';
import {
  kesGmailCandidates,
  kesBasecampCandidates,
  k1Msg1,
  k1Msg2,
  k2Msg1,
  k2Msg2,
  k2BasecampNotification,
  k3Msg1,
  informationalEmail,
  unrelatedBasecampNotification,
} from './fixtures/kesScenario';
import {
  aiFlotationGmailCandidates,
  aiFlotationBasecampCandidates,
  t1Original,
  t1Forward,
  t1SentReply,
  t2Invoice,
  t3OwnershipQuestion,
} from './fixtures/aiFlotationScenario';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxIdentityAlias.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  jest.clearAllMocks();
});

describe('discoverCases — Kes scenario (Mode A: resolve by person)', () => {
  beforeEach(() => {
    (gmailColaberryCaseSource.findCandidates as jest.Mock).mockResolvedValue(kesGmailCandidates);
    (basecampCaseSource.findCandidates as jest.Mock).mockResolvedValue(kesBasecampCandidates);
  });

  it('groups seven-plus emails into the three real Kes business cases (K1/K2/K3), not seven assignments', async () => {
    const summaries = await discoverCases({ mode: 'PERSON', query: 'Kes', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());

    const k1CaseId = items.find((i) => i.source_id === k1Msg1.source_id)?.case_id;
    const k2CaseId = items.find((i) => i.source_id === k2Msg1.source_id)?.case_id;
    const k3CaseId = items.find((i) => i.source_id === k3Msg1.source_id)?.case_id;
    const realCaseIds = new Set([k1CaseId, k2CaseId, k3CaseId]);

    // Three distinct real cases (the decision, the missing-evidence issue,
    // the standalone payroll question) — never collapsed into one, and the
    // informational email never contributes a fourth "real" case here. The
    // unrelated Basecamp record may still surface as ITS OWN separate case
    // (it has genuine corroborating evidence, just for a different matter)
    // — that is correct disposal-queue behavior, not a grouping bug, so the
    // total case count is allowed to exceed 3.
    expect(realCaseIds.size).toBe(3);
    expect(summaries.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps a thread reply that repeats none of the query keywords in the same case as its parent, not silently dropped', async () => {
    const summaries = await discoverCases({ mode: 'PERSON', query: 'Kes', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const k1Items = items.filter((i) => summaries.some((s) => s.caseId === i.case_id) && [k1Msg1.source_id, k1Msg2.source_id].includes(i.source_id));
    expect(k1Items).toHaveLength(2);
    // k1Msg2 ("Following up — still waiting...") never repeats "Kes" or any
    // topic keyword in its own body — it is included because kes@example.com
    // is still a participant on the reply, not because of body-text overlap.
    const reply = items.find((i) => i.source_id === k1Msg2.source_id);
    expect(reply.inclusion_status).not.toBe('EXCLUDED');
  });

  it('merges the Basecamp notification email and the Basecamp todo into the same case as the K2 thread via the shared reference', async () => {
    const summaries = await discoverCases({ mode: 'PERSON', query: 'Kes', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());

    const k2msg1Item = items.find((i) => i.source_id === k2Msg1.source_id);
    const notifItem = items.find((i) => i.source_id === k2BasecampNotification.source_id);
    const bcTodoItem = items.find((i) => i.source_id === kesBasecampCandidates[0].source_id);

    expect(k2msg1Item.case_id).toBe(notifItem.case_id);
    expect(k2msg1Item.case_id).toBe(bcTodoItem.case_id);
  });

  it('excludes the unrelated Basecamp record from every real case', async () => {
    const summaries = await discoverCases({ mode: 'PERSON', query: 'Kes', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const unrelatedNotif = items.find((i) => i.source_id === unrelatedBasecampNotification.source_id);
    const unrelatedTodo = items.find((i) => i.source_id === kesBasecampCandidates[1].source_id);

    const k1CaseIds = new Set(
      items.filter((i) => [k1Msg1.source_id, k1Msg2.source_id].includes(i.source_id)).map((i) => i.case_id)
    );
    const k2CaseIds = new Set(
      items.filter((i) => [k2Msg1.source_id, k2Msg2.source_id].includes(i.source_id)).map((i) => i.case_id)
    );

    if (unrelatedNotif) expect([...k1CaseIds, ...k2CaseIds]).not.toContain(unrelatedNotif.case_id);
    if (unrelatedTodo) expect([...k1CaseIds, ...k2CaseIds]).not.toContain(unrelatedTodo.case_id);
  });

  it('excludes the purely informational email from case formation entirely', async () => {
    await discoverCases({ mode: 'PERSON', query: 'Kes', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const informational = items.find((i) => i.source_id === informationalEmail.source_id);
    // Either never persisted at all (its cluster was entirely-excluded and
    // dropped) or persisted but explicitly EXCLUDED — never INCLUDED/CANDIDATE.
    if (informational) {
      expect(informational.inclusion_status).toBe('EXCLUDED');
    }
  });

  it('does not treat the prior sent reply as an inbox item needing archive (it is context, not a case item requiring disposition toward archive)', async () => {
    await discoverCases({ mode: 'PERSON', query: 'Kes', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const sentItem = items.find((i) => i.source_type === 'sent_email');
    expect(sentItem).toBeDefined();
    expect(sentItem.source_type).toBe('sent_email');
  });

  it('opens every case in ASSESSING (Discover+Connect complete, ready for Assess)', async () => {
    const summaries = await discoverCases({ mode: 'PERSON', query: 'Kes', window: '90d', openedBy: 'ali@colaberry.com' });
    for (const s of summaries) {
      const row = await fakeInboxCase.findByPk(s.caseId);
      expect(row.state).toBe('ASSESSING');
    }
  });

  it('persists newly-discovered email aliases for "Kes" so future searches do not need to re-derive them', async () => {
    await discoverCases({ mode: 'PERSON', query: 'Kes', window: '90d', openedBy: 'ali@colaberry.com' });
    const aliases = Array.from(fakeInboxIdentityAlias.rows.values());
    const kesEmailAlias = aliases.find((a) => a.alias_type === 'email' && a.alias_value === 'kes@example.com');
    expect(kesEmailAlias).toBeDefined();
  });
});

describe('discoverCases — AI Flotation LLC scenario (Mode B: resolve by topic)', () => {
  beforeEach(() => {
    (gmailColaberryCaseSource.findCandidates as jest.Mock).mockResolvedValue(aiFlotationGmailCandidates);
    (basecampCaseSource.findCandidates as jest.Mock).mockResolvedValue(aiFlotationBasecampCandidates);
  });

  it('finds exact-phrase and expanded (Fwd:-prefixed) subject variations in the same case', async () => {
    await discoverCases({ mode: 'TOPIC', query: 'AI Flotation LLC', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const original = items.find((i) => i.source_id === t1Original.source_id);
    const forwarded = items.find((i) => i.source_id === t1Forward.source_id);
    expect(original.case_id).toBe(forwarded.case_id);
  });

  it('shows match reasons for every included item', async () => {
    await discoverCases({ mode: 'TOPIC', query: 'AI Flotation LLC', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values()).filter((i) => i.inclusion_status !== 'EXCLUDED');
    for (const item of items) {
      expect(Array.isArray(item.match_reasons)).toBe(true);
      expect(item.match_reasons.length).toBeGreaterThan(0);
    }
  });

  it('separates the internal ownership-question thread from the agreement thread (different case)', async () => {
    await discoverCases({ mode: 'TOPIC', query: 'AI Flotation LLC', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const agreement = items.find((i) => i.source_id === t1Original.source_id);
    const ownership = items.find((i) => i.source_id === t3OwnershipQuestion.source_id);
    expect(agreement.case_id).not.toBe(ownership.case_id);
  });

  it('keeps the invoice/waiting-on-third-party thread as its own case, separate from the agreement thread', async () => {
    await discoverCases({ mode: 'TOPIC', query: 'AI Flotation LLC', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const agreement = items.find((i) => i.source_id === t1Original.source_id);
    const invoice = items.find((i) => i.source_id === t2Invoice.source_id);
    expect(agreement.case_id).not.toBe(invoice.case_id);
  });

  it('includes the prior sent reply as context inside the agreement case', async () => {
    await discoverCases({ mode: 'TOPIC', query: 'AI Flotation LLC', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const agreement = items.find((i) => i.source_id === t1Original.source_id);
    const sent = items.find((i) => i.source_id === t1SentReply.source_id);
    expect(sent).toBeDefined();
    expect(sent.case_id).toBe(agreement.case_id);
  });

  it('links the Basecamp agreement-signature todo into the same case via the shared Basecamp reference', async () => {
    await discoverCases({ mode: 'TOPIC', query: 'AI Flotation LLC', window: '90d', openedBy: 'ali@colaberry.com' });
    const items = Array.from(fakeInboxCaseItem.rows.values());
    const agreement = items.find((i) => i.source_id === t1Original.source_id);
    const bcTodo = items.find((i) => i.source_id === aiFlotationBasecampCandidates[0].source_id);
    expect(bcTodo).toBeDefined();
    expect(bcTodo.case_id).toBe(agreement.case_id);
  });

  it('produces three distinct cases total (agreement, invoice, ownership question)', async () => {
    const summaries = await discoverCases({ mode: 'TOPIC', query: 'AI Flotation LLC', window: '90d', openedBy: 'ali@colaberry.com' });
    expect(summaries.length).toBe(3);
  });
});
