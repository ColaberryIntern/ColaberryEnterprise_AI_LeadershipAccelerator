const m = { query: jest.fn() };
const e = { linkEvidence: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));
jest.mock('../evidenceLinkService', () => ({
  linkEvidence: (...a: unknown[]) => e.linkEvidence(...a),
}));

import { BACKFILL_ACTOR, backfillGovProposalEvidence } from '../govProposalEvidenceBackfill';

/**
 * The spine's first producer, and it runs on every boot, so the properties that matter are
 * the ones that make repetition harmless and refusal visible.
 */
const PROJ = '3867b241-0761-4f1f-9a32-ffe3b47bf186';

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1', delivery_project_id: PROJ, title: 'Technical Approach',
  doc_key: 'tech_approach', observed_at: new Date('2026-10-21T10:00:00Z'), drafted: true,
  ...over,
});

function mockDb(opts: { tables?: Record<string, boolean>; docs?: Array<Record<string, unknown>> } = {}) {
  const tables = {
    gov_proposal_documents: true, gov_qualifications: true, evidence_links: true,
    ...(opts.tables ?? {}),
  };
  m.query.mockImplementation((sql: string, o?: { replacements?: Record<string, string> }) => {
    if (/FROM information_schema\.tables/.test(sql)) {
      const name = o?.replacements?.name ?? '';
      return Promise.resolve([{ n: tables[name as keyof typeof tables] ? 1 : 0 }]);
    }
    if (/FROM gov_proposal_documents d/.test(sql)) return Promise.resolve(opts.docs ?? []);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb({ docs: [doc()] });
  e.linkEvidence.mockResolvedValue({ created: true, blockedByUnlink: false, id: 'l1' });
});

describe('a missing table stops it, and says so rather than reporting nothing to do', () => {
  it.each(['gov_proposal_documents', 'gov_qualifications', 'evidence_links'])(
    'returns absent when %s is missing', async (missing) => {
      mockDb({ tables: { [missing]: false }, docs: [doc()] });
      const r = await backfillGovProposalEvidence();
      expect(r.state).toBe('absent');
      expect(r.considered).toBe(0);
      expect(e.linkEvidence).not.toHaveBeenCalled();
    },
  );

  it('distinguishes absent from a real run that found nothing', async () => {
    mockDb({ docs: [] });
    const r = await backfillGovProposalEvidence();
    expect(r.state).toBe('ran');
    expect(r.considered).toBe(0);
  });
});

describe('what it links, and with what claim', () => {
  it('links a document to its bid as produced, by foreign key', async () => {
    await backfillGovProposalEvidence();
    const arg = e.linkEvidence.mock.calls[0][0];
    expect(arg.sourceSystem).toBe('gov_proposal_document');
    expect(arg.sourceId).toBe('doc-1');
    expect(arg.initiativeType).toBe('gov_bid');
    expect(arg.initiativeKey).toBe(PROJ);
    expect(arg.relation).toBe('produced');
  });

  it('claims confidence 1, because this is a foreign key and not an inference', async () => {
    await backfillGovProposalEvidence();
    const arg = e.linkEvidence.mock.calls[0][0];
    expect(arg.linkMethod).toBe('automatic');
    expect(arg.confidence).toBe(1);
  });

  it('attributes the link, so it can be audited and unlinked', async () => {
    await backfillGovProposalEvidence();
    expect(e.linkEvidence.mock.calls[0][0].linkedBy).toBe(BACKFILL_ACTOR);
  });

  it('uses the drafted date as observed_at, not the row creation date', async () => {
    // The document list is materialized, so created_at is when a button was pressed.
    await backfillGovProposalEvidence();
    expect(e.linkEvidence.mock.calls[0][0].observedAt).toEqual(new Date('2026-10-21T10:00:00Z'));
    const sql = m.query.mock.calls.map((c) => String(c[0])).find((s) => /gov_proposal_documents d/.test(s))!;
    expect(sql).toMatch(/COALESCE\(d\.drafted_at, d\.created_at\) AS observed_at/);
  });

  it('marks an undrafted document as listed rather than claiming it was written', async () => {
    mockDb({ docs: [doc({ drafted: false })] });
    await backfillGovProposalEvidence();
    expect(e.linkEvidence.mock.calls[0][0].title).toBe('Technical Approach (listed, not yet drafted)');
  });

  it('supplies no source URL rather than constructing a guessed one', async () => {
    await backfillGovProposalEvidence();
    expect(e.linkEvidence.mock.calls[0][0].sourceUrl).toBeNull();
  });

  it('only considers documents whose project is actually a bid in pursuit', async () => {
    await backfillGovProposalEvidence();
    const sql = m.query.mock.calls.map((c) => String(c[0])).find((s) => /gov_proposal_documents d/.test(s))!;
    expect(sql).toMatch(/approved_bid_pursuit/);
    expect(sql).toMatch(/EXISTS/);
  });
});

describe('it is safe on every boot', () => {
  it('reports already-linked rather than creating a duplicate on a second run', async () => {
    e.linkEvidence.mockResolvedValue({ created: false, blockedByUnlink: false, id: 'l1' });
    const r = await backfillGovProposalEvidence();
    expect(r.created).toBe(0);
    expect(r.alreadyLinked).toBe(1);
  });

  it('counts a refusal when a human had unlinked the document, instead of calling it done', async () => {
    // The distinction that matters: "nothing to do" and "I was correctly refused" are
    // different facts, and only one of them is boring.
    e.linkEvidence.mockResolvedValue({ created: false, blockedByUnlink: true, id: 'l1' });
    const r = await backfillGovProposalEvidence();
    expect(r.refusedByUnlink).toBe(1);
    expect(r.alreadyLinked).toBe(0);
    expect(r.created).toBe(0);
  });

  it('goes through linkEvidence rather than writing its own INSERT', async () => {
    // So R3's guarantees apply unchanged instead of being re-implemented here.
    await backfillGovProposalEvidence();
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).not.toMatch(/INSERT INTO evidence_links/);
    expect(e.linkEvidence).toHaveBeenCalled();
  });

  it('issues no write of its own at all', async () => {
    await backfillGovProposalEvidence();
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });
});

describe('one bad row does not stop the rest', () => {
  it('records a rejection and carries on', async () => {
    mockDb({ docs: [doc({ id: 'bad' }), doc({ id: 'good' })] });
    e.linkEvidence
      .mockRejectedValueOnce(new Error('initiative_key is not a known gov_bid'))
      .mockResolvedValueOnce({ created: true, blockedByUnlink: false, id: 'l2' });
    const r = await backfillGovProposalEvidence();
    expect(r.considered).toBe(2);
    expect(r.created).toBe(1);
    expect(r.rejected).toEqual([{ sourceId: 'bad', reason: 'initiative_key is not a known gov_bid' }]);
  });

  it('never reports success while silently dropping a row', async () => {
    mockDb({ docs: [doc({ id: 'bad' })] });
    e.linkEvidence.mockRejectedValue(new Error('nope'));
    const r = await backfillGovProposalEvidence();
    expect(r.created).toBe(0);
    expect(r.rejected).toHaveLength(1);
    // considered counts what it looked at, so considered != created + alreadyLinked is
    // itself detectable by a caller.
    expect(r.considered).toBe(1);
  });
});
