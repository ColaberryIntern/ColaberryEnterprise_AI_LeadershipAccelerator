const m = { query: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));

import {
  EvidenceLinkRejected,
  getEvidenceCounts,
  getEvidenceTimeline,
  linkEvidence,
  relinkEvidence,
  unlinkEvidence,
  validateLink,
  MEMBERSHIP_KEYS,
} from '../evidenceLinkService';
import type { EvidenceLinkInput } from '../evidenceLinkService';
import { REVENUE_HYPOTHESES } from '../../commercialization/hypothesisRegister';

/**
 * R3's four rules, each tested in both directions.
 *
 * WHAT THESE PROVE AND WHAT THEY DO NOT. `sequelize.query` is mocked, so these prove the
 * decision logic: what gets rejected, which SQL shape is issued, how a conflict is
 * interpreted. They do NOT prove the SQL executes, because a mocked query never reaches
 * Postgres. The schema test covers the DDL's structure; the statements themselves are
 * ordinary parameterized INSERT/UPDATE/SELECT against one table.
 *
 * The most important test in this file is "automation cannot resurrect a human's unlink".
 * A correction that gets undone by a cron job teaches people to stop making corrections,
 * and that failure is silent.
 */
const HYP_KEY = `hypothesis_${REVENUE_HYPOTHESES[0].key}`;
const BID = '3867b241-0761-4f1f-9a32-ffe3b47bf186';

const input = (over: Partial<EvidenceLinkInput> = {}): EvidenceLinkInput => ({
  sourceSystem: 'basecamp_todo',
  sourceId: '10470892379',
  sourceUrl: 'https://app.basecamp.com/3945211/buckets/7463955/todos/10470892379',
  title: 'R1 - The Revenue Room shell',
  initiativeType: 'hypothesis',
  initiativeKey: HYP_KEY,
  relation: 'produced',
  observedAt: new Date('2026-11-03T12:00:00Z'),
  linkedBy: 'ali@colaberry.com',
  linkMethod: 'human',
  ...over,
});

/** Default: the INSERT creates a row. Individual tests override. */
function mockDb(opts: {
  inserted?: boolean;
  existingUnlinkedAt?: Date | null;
  tableExists?: boolean;
  rows?: Array<Record<string, unknown>>;
  updated?: boolean;
  counts?: Array<{ initiative_type: string; initiative_key: string; n: number }>;
} = {}) {
  const { inserted = true, existingUnlinkedAt = null, tableExists = true } = opts;
  m.query.mockImplementation((sql: string) => {
    if (/FROM information_schema\.tables/.test(sql)) {
      return Promise.resolve([{ n: tableExists ? 1 : 0 }]);
    }
    if (/^\s*INSERT INTO revenue_evidence_links/.test(sql)) {
      return Promise.resolve(inserted ? [{ id: 'link-new' }] : []);
    }
    if (/SELECT id, unlinked_at FROM revenue_evidence_links/.test(sql)) {
      return Promise.resolve([{ id: 'link-existing', unlinked_at: existingUnlinkedAt }]);
    }
    if (/^\s*UPDATE revenue_evidence_links/.test(sql)) {
      return Promise.resolve(opts.updated === false ? [] : [{ id: 'link-1' }]);
    }
    if (/GROUP BY 1, 2/.test(sql)) return Promise.resolve(opts.counts ?? []);
    if (/FROM revenue_evidence_links/.test(sql)) return Promise.resolve(opts.rows ?? []);
    return Promise.resolve([]);
  });
}

beforeEach(() => { jest.clearAllMocks(); mockDb(); });

describe('rule 4 — an unknown initiative is rejected at write time', () => {
  it('accepts a hypothesis key derived from the C0.1 register', () => {
    expect(() => validateLink(input())).not.toThrow();
  });

  it('REJECTS a hypothesis key that is not in the register', () => {
    // There is no foreign key on initiative_key, so this function IS the guarantee.
    expect(() => validateLink(input({ initiativeKey: 'hypothesis_typo' })))
      .toThrow(/not a known hypothesis/);
  });

  it('derives the known set from the register rather than a retyped list', () => {
    // If a bet is renamed in C0.1, this validator must follow automatically. That is the
    // whole reason the lead scanner's hardcoded stage list could never match.
    for (const h of REVENUE_HYPOTHESES) {
      expect(() => validateLink(input({ initiativeKey: `hypothesis_${h.key}` }))).not.toThrow();
    }
  });

  it('requires a gov_bid key to look like a delivery_project_id', () => {
    expect(() => validateLink(input({ initiativeType: 'gov_bid', initiativeKey: BID })))
      .not.toThrow();
    expect(() => validateLink(input({ initiativeType: 'gov_bid', initiativeKey: 'saratoga' })))
      .toThrow(/must be a delivery_project_id UUID/);
  });

  it('accepts the declared membership key', () => {
    expect(() => validateLink(input({
      initiativeType: 'membership', initiativeKey: MEMBERSHIP_KEYS[0],
    }))).not.toThrow();
  });

  it('rejects every vocabulary value that is not declared', () => {
    expect(() => validateLink(input({ sourceSystem: 'slack' as never })))
      .toThrow(/unknown source_system/);
    expect(() => validateLink(input({ relation: 'mentioned' as never })))
      .toThrow(/unknown relation/);
    expect(() => validateLink(input({ initiativeType: 'kpi' as never })))
      .toThrow(/unknown initiative_type/);
  });
});

describe('observed_at is the timeline, so it is checked hard', () => {
  it('rejects an invalid date rather than defaulting it to now', () => {
    expect(() => validateLink(input({ observedAt: new Date('not a date') })))
      .toThrow(/must be a real date, and is never defaulted to now/);
  });

  it('rejects a missing date', () => {
    expect(() => validateLink(input({ observedAt: undefined as never })))
      .toThrow(/must be a real date/);
  });
});

describe('a confidence score only means something on a machine-made link', () => {
  it('rejects a human link carrying confidence', () => {
    expect(() => validateLink(input({ linkMethod: 'human', confidence: 0.7 })))
      .toThrow(/must not carry a confidence score/);
  });

  it('rejects an automatic link with no confidence', () => {
    expect(() => validateLink(input({ linkMethod: 'automatic' })))
      .toThrow(/must state its confidence/);
  });

  it('rejects confidence outside 0..1', () => {
    expect(() => validateLink(input({ linkMethod: 'automatic', confidence: 1.4 })))
      .toThrow(/between 0 and 1/);
  });

  it('accepts the boundaries', () => {
    for (const c of [0, 1]) {
      expect(() => validateLink(input({ linkMethod: 'automatic', confidence: c }))).not.toThrow();
    }
  });
});

describe('attribution is required, because an unaudited link gets argued about', () => {
  it('rejects a link with no linked_by', () => {
    expect(() => validateLink(input({ linkedBy: '   ' })))
      .toThrow(/linked_by is required/);
  });

  it('rejects a link to nothing', () => {
    expect(() => validateLink(input({ sourceId: '' })))
      .toThrow(/a link to nothing is not evidence/);
  });
});

describe('rule 1 — linking is idempotent', () => {
  it('reports created on the first call', async () => {
    const r = await linkEvidence(input());
    expect(r).toEqual({ created: true, blockedByUnlink: false, id: 'link-new' });
  });

  it('reports not-created when an equivalent live link already exists', async () => {
    mockDb({ inserted: false, existingUnlinkedAt: null });
    const r = await linkEvidence(input());
    expect(r.created).toBe(false);
    expect(r.blockedByUnlink).toBe(false);
    expect(r.id).toBe('link-existing');
  });

  it('leans on ON CONFLICT rather than a read-then-write two runs could both pass', async () => {
    await linkEvidence(input());
    const sql = String(m.query.mock.calls[0][0]);
    expect(sql).toMatch(/ON CONFLICT \(source_system, source_id, initiative_type, initiative_key\) DO NOTHING/);
  });

  it('parameterizes every value rather than interpolating it', async () => {
    await linkEvidence(input());
    const [sql, opts] = m.query.mock.calls[0] as [string, { replacements: Record<string, unknown> }];
    expect(sql).toMatch(/:sourceId/);
    expect(sql).not.toContain('10470892379');
    expect(opts.replacements.sourceId).toBe('10470892379');
  });
});

describe('rule 2 — automation cannot resurrect a human unlink', () => {
  it('reports blockedByUnlink when the conflicting row was unlinked by a human', async () => {
    // THE test in this file. A cron run that silently undid Ali's correction would teach
    // him to stop correcting, and nothing would report that it had happened.
    mockDb({ inserted: false, existingUnlinkedAt: new Date('2026-11-01T00:00:00Z') });
    const r = await linkEvidence(input({ linkMethod: 'automatic', confidence: 0.9 }));
    expect(r.created).toBe(false);
    expect(r.blockedByUnlink).toBe(true);
  });

  it('issues no UPDATE when it is refused, so the unlinked row is untouched', async () => {
    mockDb({ inserted: false, existingUnlinkedAt: new Date('2026-11-01T00:00:00Z') });
    await linkEvidence(input({ linkMethod: 'automatic', confidence: 0.9 }));
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).not.toMatch(/UPDATE revenue_evidence_links/);
  });

  it('gives a human an explicit door to restore it', async () => {
    const ok = await relinkEvidence('link-1', 'ali@colaberry.com');
    expect(ok).toBe(true);
    const sql = String(m.query.mock.calls[0][0]);
    expect(sql).toMatch(/SET unlinked_at = NULL/);
    // The restored link becomes a human link: a machine score must not survive a human
    // overriding the machine.
    expect(sql).toMatch(/link_method = 'human', confidence = NULL/);
    expect(sql).toMatch(/WHERE id = :id AND unlinked_at IS NOT NULL/);
  });

  it('refuses an unattributed relink', async () => {
    await expect(relinkEvidence('link-1', '  ')).rejects.toThrow(EvidenceLinkRejected);
  });
});

describe('unlinking is a soft delete and is idempotent', () => {
  it('keeps the row and stamps who and why', async () => {
    const ok = await unlinkEvidence('link-1', 'ali@colaberry.com', 'wrong deal');
    expect(ok).toBe(true);
    const sql = String(m.query.mock.calls[0][0]);
    expect(sql).toMatch(/SET unlinked_at = NOW\(\)/);
    expect(sql).not.toMatch(/DELETE FROM/);
  });

  it('does not overwrite who unlinked it first when called twice', async () => {
    mockDb({ updated: false });
    expect(await unlinkEvidence('link-1', 'someone@else.com', 'again')).toBe(false);
    expect(String(m.query.mock.calls[0][0])).toMatch(/AND unlinked_at IS NULL/);
  });

  it('refuses an unattributed unlink', async () => {
    await expect(unlinkEvidence('link-1', '', 'x')).rejects.toThrow(/unlinked_by is required/);
  });
});

describe('rule 3 — a missing table is not an empty one', () => {
  it('reports absent, with a note saying so, when the table does not exist', async () => {
    mockDb({ tableExists: false });
    const t = await getEvidenceTimeline('hypothesis', HYP_KEY);
    expect(t.state).toBe('absent');
    expect(t.links).toEqual([]);
    expect(t.note).toMatch(/a missing source is not an empty one/i);
  });

  it('reports ready with a measured-zero note when the table is present and empty', async () => {
    mockDb({ rows: [] });
    const t = await getEvidenceTimeline('hypothesis', HYP_KEY);
    expect(t.state).toBe('ready');
    expect(t.links).toEqual([]);
    expect(t.note).toMatch(/measured zero/);
  });

  it('distinguishes the two by more than an empty array', async () => {
    mockDb({ tableExists: false });
    const absent = await getEvidenceTimeline('hypothesis', HYP_KEY);
    mockDb({ rows: [] });
    const empty = await getEvidenceTimeline('hypothesis', HYP_KEY);
    expect(absent.links).toEqual(empty.links);
    expect(absent.state).not.toBe(empty.state);
    expect(absent.note).not.toBe(empty.note);
  });

  it('reports absent from the counts read too', async () => {
    mockDb({ tableExists: false });
    expect(await getEvidenceCounts()).toEqual({ state: 'absent', counts: {} });
  });
});

describe('reading a timeline', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'l1', source_system: 'basecamp_todo', source_id: '1', source_url: 'https://x',
    title: 'A todo', initiative_type: 'hypothesis', initiative_key: HYP_KEY,
    relation: 'produced', observed_at: new Date('2026-11-03T12:00:00Z'),
    linked_by: 'ali@colaberry.com', link_method: 'human', confidence: null, notes: null,
    ...over,
  });

  it('returns live links newest first, excluding unlinked rows', async () => {
    mockDb({ rows: [row()] });
    const t = await getEvidenceTimeline('hypothesis', HYP_KEY);
    expect(t.links).toHaveLength(1);
    expect(t.links[0].observedAt).toBe('2026-11-03T12:00:00.000Z');
    const sql = String(m.query.mock.calls.find((c) => /ORDER BY observed_at DESC/.test(String(c[0])))![0]);
    expect(sql).toMatch(/AND unlinked_at IS NULL/);
  });

  it('preserves a null confidence instead of turning it into zero', async () => {
    // Number(null) is 0, and "0.00 confidence" is a real claim about a human judgment.
    mockDb({ rows: [row({ link_method: 'human', confidence: null })] });
    const t = await getEvidenceTimeline('hypothesis', HYP_KEY);
    expect(t.links[0].confidence).toBeNull();
  });

  it('converts a NUMERIC string from pg into a number', async () => {
    mockDb({ rows: [row({ link_method: 'automatic', confidence: '0.85' })] });
    const t = await getEvidenceTimeline('hypothesis', HYP_KEY);
    expect(t.links[0].confidence).toBe(0.85);
  });

  it('keys the counts by type and key together, so two initiatives cannot collide', async () => {
    mockDb({ counts: [
      { initiative_type: 'hypothesis', initiative_key: HYP_KEY, n: 3 },
      { initiative_type: 'gov_bid', initiative_key: BID, n: 5 },
    ] });
    const { state, counts } = await getEvidenceCounts();
    expect(state).toBe('ready');
    expect(counts[`hypothesis:${HYP_KEY}`]).toBe(3);
    expect(counts[`gov_bid:${BID}`]).toBe(5);
  });
});

describe('it never deletes evidence', () => {
  it('issues no DELETE or TRUNCATE on any path', async () => {
    mockDb({ rows: [] });
    await linkEvidence(input());
    await unlinkEvidence('link-1', 'ali@colaberry.com', 'wrong');
    await relinkEvidence('link-1', 'ali@colaberry.com');
    await getEvidenceTimeline('hypothesis', HYP_KEY);
    await getEvidenceCounts();
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/i);
  });
});
