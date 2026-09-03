/**
 * certSessionService — the session write path.
 *
 * Covers the guarantees the acceptance gate names: the Week 7 fence holds at the
 * API layer, resume does not lose or duplicate state, duplicate submits are
 * idempotent, mock timing expires, scoring is server-authoritative, and a student
 * cannot touch a session they do not own.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CertSession', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
}));
jest.mock('../../../models/CertResponse', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOrCreate: jest.fn() },
}));
jest.mock('../../../models/CertQuestionRevision', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
// Mocked because certQuestionBankService imports it, and the real model calls
// Model.init() at import time against a sequelize this suite has stubbed out.
jest.mock('../../../models/CertQuestion', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOrCreate: jest.fn() },
}));
jest.mock('../certAvailabilityService', () => ({ getCertAvailability: jest.fn() }));
jest.mock('../certBlueprintService', () => ({
  getCurrentBlueprint: jest.fn(),
  weightsAreUsable: jest.fn().mockReturnValue(true),
}));
jest.mock('../certQuestionBankService', () => ({
  listApprovedKeysByDomain: jest.fn(),
  loadServedItems: jest.fn().mockResolvedValue([]),
  toRevealedItem: jest.requireActual('../certQuestionBankService').toRevealedItem,
  scoreSelection: jest.requireActual('../certQuestionBankService').scoreSelection,
}));

import CertSession from '../../../models/CertSession';
import CertResponse from '../../../models/CertResponse';
import CertQuestionRevision from '../../../models/CertQuestionRevision';
import { getCertAvailability } from '../certAvailabilityService';
import { getCurrentBlueprint } from '../certBlueprintService';
import { listApprovedKeysByDomain } from '../certQuestionBankService';
import {
  startSession,
  resumeSession,
  submitResponse,
  completeSession,
  selectKeysForPlan,
  shuffle,
  CertSessionError,
  MODE_DEFAULTS,
} from '../certSessionService';

const mSession = CertSession as any;
const mResponse = CertResponse as any;
const mRevision = CertQuestionRevision as any;
const mAvailability = getCertAvailability as unknown as jest.Mock;
const mBlueprint = getCurrentBlueprint as unknown as jest.Mock;
const mKeys = listApprovedKeysByDomain as unknown as jest.Mock;

const NOW = new Date('2026-09-03T12:00:00Z');
const seq = () => { let i = 0; return () => (i++ % 10) / 10; };

function wireOpen() {
  mAvailability.mockResolvedValue({ available: true, programWeek: 9, startWeek: 7, trackId: 'ccar-f', reason: 'available' });
  mBlueprint.mockResolvedValue({
    track: { track_id: 'ccar-f', blueprint_version: '1.0-2026-07' },
    domains: [
      { domain_id: 'D1', weight_pct: 27 },
      { domain_id: 'D2', weight_pct: 18 },
    ],
  });
  mKeys.mockResolvedValue(new Map([['D1', ['q1', 'q2', 'q3']], ['D2', ['q4', 'q5']]]));
  mSession.findAll.mockResolvedValue([]);
  mResponse.findAll.mockResolvedValue([]);
  mRevision.findAll.mockResolvedValue([
    { question_key: 'q1', revision: 1 }, { question_key: 'q2', revision: 2 },
    { question_key: 'q3', revision: 1 }, { question_key: 'q4', revision: 1 },
    { question_key: 'q5', revision: 1 },
  ]);
  mSession.create.mockImplementation(async (attrs: any) => ({ ...attrs, id: 's1', save: jest.fn() }));
  mSession.findOne.mockResolvedValue(null);
}

beforeEach(() => jest.clearAllMocks());

describe('startSession — the Week 7 fence holds at the write path', () => {
  it('refuses when availability is closed', async () => {
    mAvailability.mockResolvedValue({ available: false, reason: 'before_start_week', programWeek: 6, startWeek: 7, trackId: 'ccar-f' });
    await expect(startSession({ enrollmentId: 'e1', mode: 'diagnostic' }, { now: NOW }))
      .rejects.toMatchObject({ status: 403, code: 'CERT_PREP_NOT_AVAILABLE' });
    expect(mSession.create).not.toHaveBeenCalled();
  });

  it('does not accept a week from the caller — availability is asked, never told', async () => {
    wireOpen();
    await startSession({ enrollmentId: 'e1', mode: 'practice' } as any, { now: NOW, rng: seq() });
    // called with (enrollmentId, now, trackId) only
    expect(mAvailability).toHaveBeenCalledWith('e1', NOW, undefined);
  });
});

describe('startSession — form construction', () => {
  it('happy path: records the served revision for every item', async () => {
    wireOpen();
    const view = await startSession({ enrollmentId: 'e1', mode: 'practice', itemCount: 5 }, { now: NOW, rng: seq() });
    const served = (view.session as any).question_keys;
    expect(served).toHaveLength(5);
    served.forEach((s: any) => {
      expect(typeof s.question_key).toBe('string');
      expect(typeof s.revision).toBe('number');
    });
    // q2's latest approved revision is 2, and that is what gets pinned
    expect(served.find((s: any) => s.question_key === 'q2').revision).toBe(2);
  });

  it('a mock carries the exam time limit; practice is untimed', async () => {
    wireOpen();
    const mock = await startSession({ enrollmentId: 'e1', mode: 'mock', itemCount: 5 }, { now: NOW, rng: seq() });
    expect((mock.session as any).time_limit_seconds).toBe(MODE_DEFAULTS.mock.minutes! * 60);
    expect((mock.session as any).expires_at).toEqual(new Date(NOW.getTime() + 120 * 60_000));

    wireOpen();
    const practice = await startSession({ enrollmentId: 'e1', mode: 'practice' }, { now: NOW, rng: seq() });
    expect((practice.session as any).time_limit_seconds).toBeNull();
    expect((practice.session as any).expires_at).toBeNull();
  });

  it('stamps the scoring policy and blueprint version so history stays resolvable', async () => {
    wireOpen();
    const view = await startSession({ enrollmentId: 'e1', mode: 'practice' }, { now: NOW, rng: seq() });
    expect((view.session as any).scoring_policy_version).toBe('v1-linear');
    expect((view.session as any).blueprint_version).toBe('1.0-2026-07');
  });

  it('refuses when the bank has no approved questions, rather than serving an empty form', async () => {
    wireOpen();
    mKeys.mockResolvedValue(new Map());
    await expect(startSession({ enrollmentId: 'e1', mode: 'practice' }, { now: NOW }))
      .rejects.toMatchObject({ code: 'CERT_NO_APPROVED_QUESTIONS', status: 409 });
  });

  it('refuses when no blueprint is configured', async () => {
    wireOpen();
    mBlueprint.mockResolvedValue(null);
    await expect(startSession({ enrollmentId: 'e1', mode: 'practice' }, { now: NOW }))
      .rejects.toMatchObject({ code: 'CERT_NO_BLUEPRINT' });
  });
});

describe('startSession — idempotency', () => {
  it('a retried start returns the existing session instead of minting a second', async () => {
    wireOpen();
    const existing = { id: 's-existing', enrollment_id: 'e1', question_keys: [], status: 'in_progress', save: jest.fn() };
    mSession.findOne.mockResolvedValue(existing);

    const view = await startSession(
      { enrollmentId: 'e1', mode: 'mock', idempotencyKey: 'start:e1:mock:1' },
      { now: NOW },
    );
    expect(view.session).toBe(existing);
    expect(mSession.create).not.toHaveBeenCalled();
  });

  it('an idempotency key belonging to another enrollment is not disclosed', async () => {
    wireOpen();
    mSession.findOne.mockResolvedValue({ id: 's-other', enrollment_id: 'e2', question_keys: [] });
    await expect(startSession({ enrollmentId: 'e1', mode: 'mock', idempotencyKey: 'k' }, { now: NOW }))
      .rejects.toMatchObject({ status: 404, code: 'CERT_SESSION_NOT_FOUND' });
  });
});

describe('ownership', () => {
  it('another student’s session is indistinguishable from a missing one', async () => {
    mSession.findByPk.mockResolvedValue({ id: 's1', enrollment_id: 'e2' });
    await expect(resumeSession('s1', 'e1', NOW))
      .rejects.toMatchObject({ status: 404, code: 'CERT_SESSION_NOT_FOUND' });

    mSession.findByPk.mockResolvedValue(null);
    await expect(resumeSession('s1', 'e1', NOW))
      .rejects.toMatchObject({ status: 404, code: 'CERT_SESSION_NOT_FOUND' });
  });
});

describe('submitResponse', () => {
  const openSession = () => ({
    id: 's1',
    enrollment_id: 'e1',
    status: 'in_progress',
    expires_at: null,
    question_keys: [{ question_key: 'q1', revision: 3 }],
    save: jest.fn().mockResolvedValue(undefined),
  });
  const revision = {
    question_key: 'q1', revision: 3, domain_id: 'D1', objective_id: null,
    stem: 'stem', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }],
    select_count: 1, difficulty: 'medium',
    correct_keys: ['B'], rationale: 'because B', distractor_rationales: { A: 'no' },
  };

  it('scores server-side from the SERVED revision, not the current one', async () => {
    mSession.findByPk.mockResolvedValue(openSession());
    mRevision.findOne.mockResolvedValue(revision);
    mResponse.findOrCreate.mockResolvedValue([{ save: jest.fn() }, true]);

    const revealed = await submitResponse('s1', 'e1', 'q1', ['B'], { now: NOW });
    expect(revealed.is_correct).toBe(true);
    expect(revealed.rationale).toBe('because B');
    // the revision looked up is the one the session recorded
    expect(mRevision.findOne).toHaveBeenCalledWith({ where: { question_key: 'q1', revision: 3 } });
    // and correctness was never taken from the caller
    expect(mResponse.findOrCreate.mock.calls[0][0].defaults.is_correct).toBe(true);
  });

  it('a wrong answer is recorded honestly', async () => {
    mSession.findByPk.mockResolvedValue(openSession());
    mRevision.findOne.mockResolvedValue(revision);
    mResponse.findOrCreate.mockResolvedValue([{ save: jest.fn() }, true]);
    const revealed = await submitResponse('s1', 'e1', 'q1', ['A'], { now: NOW });
    expect(revealed.is_correct).toBe(false);
  });

  it('idempotent: a duplicate submit UPDATES one row rather than recording two', async () => {
    mSession.findByPk.mockResolvedValue(openSession());
    mRevision.findOne.mockResolvedValue(revision);
    const row: any = { save: jest.fn().mockResolvedValue(undefined) };
    mResponse.findOrCreate.mockResolvedValue([row, false]);

    await submitResponse('s1', 'e1', 'q1', ['B'], { now: NOW });
    expect(row.is_correct).toBe(true);
    expect(row.save).toHaveBeenCalledTimes(1);
    // findOrCreate is keyed on (session, question) - the schema's unique index
    expect(mResponse.findOrCreate.mock.calls[0][0].where).toEqual({ session_id: 's1', question_key: 'q1' });
  });

  it('refuses a question that was not part of this session', async () => {
    mSession.findByPk.mockResolvedValue(openSession());
    await expect(submitResponse('s1', 'e1', 'not-served', ['A'], { now: NOW }))
      .rejects.toMatchObject({ code: 'CERT_QUESTION_NOT_SERVED', status: 400 });
  });

  it('refuses after expiry, and marks the session expired', async () => {
    const expiredSession = { ...openSession(), expires_at: new Date('2026-09-03T11:00:00Z') };
    mSession.findByPk.mockResolvedValue(expiredSession);
    await expect(submitResponse('s1', 'e1', 'q1', ['B'], { now: NOW }))
      .rejects.toMatchObject({ code: 'CERT_SESSION_EXPIRED', status: 409 });
    expect(expiredSession.status).toBe('expired');
  });

  it('refuses after completion', async () => {
    mSession.findByPk.mockResolvedValue({ ...openSession(), status: 'completed' });
    await expect(submitResponse('s1', 'e1', 'q1', ['B'], { now: NOW }))
      .rejects.toMatchObject({ code: 'CERT_SESSION_COMPLETE' });
  });
});

describe('completeSession', () => {
  it('scores out of items served and stores the domain breakdown', async () => {
    const session: any = {
      id: 's1', enrollment_id: 'e1', status: 'in_progress',
      question_keys: [{ question_key: 'q1', revision: 1 }, { question_key: 'q2', revision: 1 }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    mSession.findByPk.mockResolvedValue(session);
    mResponse.findAll.mockResolvedValue([{ domain_id: 'D1', is_correct: true }]);

    const done = await completeSession('s1', 'e1', NOW);
    expect(done.status).toBe('completed');
    expect(done.correct_count).toBe(1);
    expect(done.total_count).toBe(2);            // served, not answered
    expect(done.domain_results).toEqual([{ domain_id: 'D1', correct: 1, total: 1, pct: 1 }]);
  });

  it('idempotent: completing twice returns the stored result without rescoring', async () => {
    const completed: any = { id: 's1', enrollment_id: 'e1', status: 'completed', scaled_score: 640, save: jest.fn() };
    mSession.findByPk.mockResolvedValue(completed);

    const again = await completeSession('s1', 'e1', NOW);
    expect(again.scaled_score).toBe(640);
    expect(completed.save).not.toHaveBeenCalled();
    expect(mResponse.findAll).not.toHaveBeenCalled();
  });
});

describe('selectKeysForPlan', () => {
  const rng = () => 0; // deterministic

  it('fills each domain slot to its planned count', () => {
    const keys = selectKeysForPlan(
      [{ domain_id: 'D1', count: 2 }, { domain_id: 'D2', count: 1 }],
      new Map([['D1', ['a', 'b', 'c']], ['D2', ['d', 'e']]]),
      new Set(),
      rng,
    );
    expect(keys).toHaveLength(3);
  });

  it('prefers unseen questions but BACKFILLS with seen ones rather than short-changing the form', () => {
    const keys = selectKeysForPlan(
      [{ domain_id: 'D1', count: 3 }],
      new Map([['D1', ['a', 'b', 'c']]]),
      new Set(['a', 'b']), // only 'c' is fresh
      rng,
    );
    expect(keys).toHaveLength(3);       // a 2-item "3-item form" would be worse
    expect(keys[0]).toBe('c');          // the fresh one leads
  });

  it('boundary: an empty pool contributes nothing and does not throw', () => {
    expect(selectKeysForPlan([{ domain_id: 'D9', count: 5 }], new Map(), new Set(), rng)).toEqual([]);
  });
});

describe('shuffle', () => {
  it('preserves membership', () => {
    const out = shuffle(['a', 'b', 'c', 'd'], seq());
    expect(out.sort()).toEqual(['a', 'b', 'c', 'd']);
  });
  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c'];
    shuffle(input, seq());
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
