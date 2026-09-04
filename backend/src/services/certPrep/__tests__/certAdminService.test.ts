/**
 * certAdminService — item statistics and cohort operations.
 *
 * The load-bearing behaviour is the item-quality signals: a miskeyed question
 * marks competent students wrong forever and looks exactly like a hard one, so
 * negative discrimination has to surface, and a statistic computed from three
 * answers must NOT be presented as if it meant something.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CertQuestion', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../../models/CertQuestionRevision', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/CertReadinessSnapshot', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/CertEvidenceMapping', () => ({ __esModule: true, default: { findAll: jest.fn() } }));

import { sequelize } from '../../../config/database';
import CertQuestion from '../../../models/CertQuestion';
import CertQuestionRevision from '../../../models/CertQuestionRevision';
import CertEvidenceMapping from '../../../models/CertEvidenceMapping';
import {
  getItemStatistics, getBankHealth, getCohortReadiness, getNotStarted, getAuditTrail,
  P_VALUE_BROKEN, P_VALUE_TOO_EASY, MIN_EXPOSURES_FOR_STATS,
} from '../certAdminService';

const mQuery = sequelize.query as unknown as jest.Mock;
const mRevisions = CertQuestionRevision.findAll as unknown as jest.Mock;
const mCount = CertQuestion.count as unknown as jest.Mock;
const mMappings = CertEvidenceMapping.findAll as unknown as jest.Mock;

/** One aggregate row as the SQL returns it. */
const agg = (over: any = {}) => ({
  question_key: 'A1', revision: 1, domain_id: 'D1',
  exposures: 20, correct: 12, mean_when_right: 800, mean_when_wrong: 600, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mRevisions.mockResolvedValue([
    { question_key: 'A1', revision: 1, difficulty: 'medium', blueprint_version: '1.0-2026-07' },
  ]);
  mCount.mockResolvedValue(20);
  mMappings.mockResolvedValue([]);
});

describe('getItemStatistics', () => {
  it('computes p-value and discrimination from real exposures', async () => {
    mQuery.mockResolvedValue([agg()]);
    const [item] = await getItemStatistics();
    expect(item.p_value).toBe(0.6);           // 12/20
    expect(item.discrimination).toBe(200);    // 800 - 600
    expect(item.flags).toEqual([]);           // healthy
  });

  it('flags an item almost everyone gets right — it is not discriminating', async () => {
    mQuery.mockResolvedValue([agg({ correct: 19, exposures: 20 })]);
    const [item] = await getItemStatistics();
    expect(item.p_value).toBeGreaterThanOrEqual(P_VALUE_TOO_EASY);
    expect(item.flags).toContain('too_easy');
  });

  it('flags an item almost nobody gets right as possibly broken, not merely hard', async () => {
    mQuery.mockResolvedValue([agg({ correct: 3, exposures: 20 })]);
    const [item] = await getItemStatistics();
    expect(item.p_value).toBeLessThanOrEqual(P_VALUE_BROKEN);
    expect(item.flags).toContain('possibly_miskeyed_or_broken');
  });

  it('NEGATIVE DISCRIMINATION is surfaced — strong students failing an item is a wrong key', async () => {
    // Students who got it "right" score WORSE overall than those who got it wrong.
    mQuery.mockResolvedValue([agg({ mean_when_right: 500, mean_when_wrong: 820 })]);
    const [item] = await getItemStatistics();
    expect(item.discrimination).toBe(-320);
    expect(item.flags).toContain('negative_discrimination');
  });

  it('refuses to compute a statistic from too few exposures', async () => {
    mQuery.mockResolvedValue([agg({ exposures: MIN_EXPOSURES_FOR_STATS - 1, correct: 1 })]);
    const [item] = await getItemStatistics();
    expect(item.discrimination).toBeNull();
    expect(item.flags).toEqual(['insufficient_exposures']);
    // and it must NOT also claim the item is broken on that thin evidence
    expect(item.flags).not.toContain('possibly_miskeyed_or_broken');
  });

  it('sorts the worst signals first — a miskeyed item is what to read today', async () => {
    mQuery.mockResolvedValue([
      agg({ question_key: 'HEALTHY' }),
      agg({ question_key: 'MISKEYED', mean_when_right: 400, mean_when_wrong: 900 }),
      agg({ question_key: 'BROKEN', correct: 2, exposures: 20 }),
    ]);
    mRevisions.mockResolvedValue(['HEALTHY', 'MISKEYED', 'BROKEN'].map((k) => ({
      question_key: k, revision: 1, difficulty: 'medium', blueprint_version: '1.0-2026-07',
    })));
    const items = await getItemStatistics();
    expect(items[0].question_key).toBe('MISKEYED');
  });

  it('boundary: no responses yields no statistics rather than zeroes', async () => {
    mQuery.mockResolvedValue([]);
    await expect(getItemStatistics()).resolves.toEqual([]);
  });
});

describe('getBankHealth', () => {
  it('names domains with NO approved items — the silent cause of short forms', async () => {
    mRevisions.mockResolvedValue([
      { question_key: 'a', revision: 1, domain_id: 'D1', review_status: 'approved' },
      { question_key: 'b', revision: 1, domain_id: 'D1', review_status: 'draft' },
      { question_key: 'c', revision: 1, domain_id: 'D3', review_status: 'approved' },
    ]);
    const health = await getBankHealth('1.0-2026-07', ['D1', 'D2', 'D3', 'D4', 'D5']);
    expect(health.approved_by_domain).toEqual({ D1: 1, D3: 1 });
    expect(health.domains_with_no_approved).toEqual(['D2', 'D4', 'D5']);
    expect(health.by_status).toEqual({ approved: 2, draft: 1 });
  });

  it('boundary: an empty bank reports every domain as unapproved', async () => {
    mRevisions.mockResolvedValue([]);
    const health = await getBankHealth('1.0-2026-07', ['D1', 'D2']);
    expect(health.domains_with_no_approved).toEqual(['D1', 'D2']);
  });
});

describe('cohort queries', () => {
  it('getCohortReadiness LEFT JOINs so never-measured students still appear', async () => {
    mQuery.mockResolvedValue([]);
    await getCohortReadiness('c1');
    const sql = String(mQuery.mock.calls[0][0]);
    expect(sql).toMatch(/LEFT JOIN LATERAL/);
    expect(sql).toMatch(/COALESCE\(s\.overall_state, 'not_measured'\)/);
    // an INNER JOIN would hide exactly the students an instructor most needs
    expect(sql).not.toMatch(/\bINNER JOIN\b/);
  });

  it('getNotStarted asks for absence of responses, not a zero score', async () => {
    mQuery.mockResolvedValue([]);
    await getNotStarted('c1');
    const sql = String(mQuery.mock.calls[0][0]);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).toMatch(/cert_responses/);
  });

  it('domain weakness reports the student count behind each figure', async () => {
    mQuery.mockResolvedValue([]);
    const { getCohortDomainWeakness } = await import('../certAdminService');
    await getCohortDomainWeakness('c1');
    const sql = String(mQuery.mock.calls[mQuery.mock.calls.length - 1][0]);
    expect(sql).toMatch(/count\(DISTINCT cr\.enrollment_id\)/);
  });
});

/**
 * The audit trail exists so that "who let this reach a student?" has an answer.
 * There are exactly two moments where a named human changes what a student
 * sees, and an audit that carries only one of them looks complete while being
 * half a record - which is worse than obviously missing.
 */
describe('getAuditTrail', () => {
  const review = (over: any = {}) => ({
    question_key: 'A1', revision: 1, review_status: 'approved',
    reviewer: 'kes@colaberry.com', reviewed_at: new Date('2026-09-01T10:00:00Z'), ...over,
  });
  const decision = (over: any = {}) => ({
    id: 'm1', enrollment_id: 'e1', domain_id: 'D2', objective_id: 'D2.1',
    source_type: 'portfolio_artifact', mapping_state: 'verified', rejected_reason: null,
    verified_by: 'farhat@colaberry.com', verified_at: new Date('2026-09-02T10:00:00Z'), ...over,
  });

  it('carries EVIDENCE decisions, not only question approvals', async () => {
    mRevisions.mockResolvedValue([review()]);
    mMappings.mockResolvedValue([decision()]);
    const entries = await getAuditTrail();
    expect(entries.map((e) => e.kind).sort()).toEqual(['evidence_decision', 'question_review']);
  });

  it('records a REJECTION and its reason - the entry somebody comes looking for', async () => {
    mRevisions.mockResolvedValue([]);
    mMappings.mockResolvedValue([decision({ mapping_state: 'rejected', rejected_reason: 'artifact is a plan, not a build' })]);
    const [entry] = await getAuditTrail();
    expect(entry.state).toBe('rejected');
    expect(entry.reason).toBe('artifact is a plan, not a build');
    expect(entry.actor).toBe('farhat@colaberry.com');
  });

  it('interleaves both kinds newest-first rather than listing one kind then the other', async () => {
    mRevisions.mockResolvedValue([
      review({ question_key: 'A9', reviewed_at: new Date('2026-09-03T10:00:00Z') }),
      review({ question_key: 'A1', reviewed_at: new Date('2026-09-01T10:00:00Z') }),
    ]);
    mMappings.mockResolvedValue([decision({ verified_at: new Date('2026-09-02T10:00:00Z') })]);
    const kinds = (await getAuditTrail()).map((e) => e.kind);
    expect(kinds).toEqual(['question_review', 'evidence_decision', 'question_review']);
  });

  it('trims the MERGED list to the limit, so one busy kind cannot crowd out the other', async () => {
    mRevisions.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => review({ reviewed_at: new Date(2026, 8, 1, 0, i) })),
    );
    mMappings.mockResolvedValue([decision({ verified_at: new Date('2026-09-30T00:00:00Z') })]);
    const entries = await getAuditTrail();
    expect(entries).toHaveLength(50);
    expect(entries[0].kind).toBe('evidence_decision'); // newest overall survives the trim
  });

  it('boundary: no decisions of either kind is an empty list, not a throw', async () => {
    mRevisions.mockResolvedValue([]);
    mMappings.mockResolvedValue([]);
    await expect(getAuditTrail()).resolves.toEqual([]);
  });
});
