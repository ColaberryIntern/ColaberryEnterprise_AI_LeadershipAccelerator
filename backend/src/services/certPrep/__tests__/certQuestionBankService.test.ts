/**
 * certQuestionBankService — the two acceptance guarantees:
 *   6. only approved question revisions reach students
 *   7. correct answers are not delivered before submission
 *
 * The pure core is tested directly. The DB-backed loaders are tested with the
 * models mocked, matching the repo's service-test convention.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CertQuestion', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOrCreate: jest.fn() },
}));
jest.mock('../../../models/CertQuestionRevision', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));

import CertQuestion from '../../../models/CertQuestion';
import CertQuestionRevision from '../../../models/CertQuestionRevision';
import {
  toSafeItem,
  toRevealedItem,
  scoreSelection,
  isRevisionServable,
  pickServableRevision,
  loadServableRevisions,
  validateRevision,
  setReviewStatus,
  RevisionLike,
} from '../certQuestionBankService';

const mockQuestionFindAll = CertQuestion.findAll as unknown as jest.Mock;
const mockRevFindAll = CertQuestionRevision.findAll as unknown as jest.Mock;
const mockRevFindOne = CertQuestionRevision.findOne as unknown as jest.Mock;

const rev = (over: Partial<RevisionLike> = {}): RevisionLike => ({
  question_key: 'A1',
  revision: 1,
  domain_id: 'D1',
  objective_id: 'D1.2',
  stem: 'Why route each researcher into its own subagent?',
  options: [
    { key: 'A', text: 'Parallelism' },
    { key: 'B', text: 'Isolated context; only the summary returns' },
    { key: 'C', text: 'Shared context' },
  ],
  select_count: 1,
  difficulty: 'medium',
  correct_keys: ['B'],
  rationale: 'The isolation is the point.',
  distractor_rationales: { A: 'not the architectural reason', C: 'the opposite' },
  review_status: 'approved',
  active_from: null,
  active_to: null,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('toSafeItem — answer protection (criterion 7)', () => {
  it('happy path: returns the student-facing fields', () => {
    const safe = toSafeItem(rev());
    expect(safe).toEqual({
      question_key: 'A1',
      revision: 1,
      domain_id: 'D1',
      objective_id: 'D1.2',
      stem: 'Why route each researcher into its own subagent?',
      options: [
        { key: 'A', text: 'Parallelism' },
        { key: 'B', text: 'Isolated context; only the summary returns' },
        { key: 'C', text: 'Shared context' },
      ],
      select_count: 1,
      difficulty: 'medium',
    });
  });

  it('carries NO answer data whatsoever', () => {
    const safe = toSafeItem(rev()) as Record<string, unknown>;
    ['correct_keys', 'rationale', 'distractor_rationales', 'review_status', 'reviewer'].forEach((f) => {
      expect(safe).not.toHaveProperty(f);
    });
    // and nothing in the serialized payload spells the answer out either
    expect(JSON.stringify(safe)).not.toContain('isolation is the point');
  });

  it('an option carries only key and text — a future answer flag on the option cannot ride along', () => {
    const withFlag = rev({
      options: [{ key: 'A', text: 'Parallelism', is_correct: true } as any],
    });
    const [option] = toSafeItem(withFlag).options as any[];
    expect(option).toEqual({ key: 'A', text: 'Parallelism' });
    expect(option.is_correct).toBeUndefined();
  });

  it('boundary: missing options/select_count/difficulty degrade to safe defaults', () => {
    const safe = toSafeItem({ ...rev(), options: undefined, select_count: undefined, difficulty: undefined } as any);
    expect(safe.options).toEqual([]);
    expect(safe.select_count).toBe(1);
    expect(safe.difficulty).toBe('medium');
  });
});

describe('scoreSelection — server-authoritative correctness', () => {
  it('single-response: exact match only', () => {
    expect(scoreSelection(['B'], ['B'])).toBe(true);
    expect(scoreSelection(['B'], ['A'])).toBe(false);
  });

  it('multi-response: set equality, no partial credit', () => {
    expect(scoreSelection(['A', 'B'], ['B', 'A'])).toBe(true);   // order-insensitive
    expect(scoreSelection(['A', 'B'], ['A'])).toBe(false);        // under-selection
    expect(scoreSelection(['A', 'B'], ['A', 'B', 'C'])).toBe(false); // over-selection
  });

  it('duplicate selections are normalised, not counted twice', () => {
    expect(scoreSelection(['A', 'B'], ['A', 'A', 'B'])).toBe(true);
    expect(scoreSelection(['A'], ['A', 'A'])).toBe(true);
  });

  it('failure path: an empty or missing key is never correct', () => {
    expect(scoreSelection([], ['A'])).toBe(false);
    expect(scoreSelection(undefined, ['A'])).toBe(false);
    expect(scoreSelection(['A'], [])).toBe(false);
    expect(scoreSelection(undefined, undefined)).toBe(false);
  });
});

describe('isRevisionServable / pickServableRevision — approval gate (criterion 6)', () => {
  const now = new Date('2026-09-03T12:00:00Z');

  it.each(['draft', 'in_review', 'retired'] as const)('a %s revision is never servable', (status) => {
    expect(isRevisionServable(rev({ review_status: status }), now)).toBe(false);
  });

  it('an approved revision is servable', () => {
    expect(isRevisionServable(rev(), now)).toBe(true);
  });

  it('boundary: respects the active window on both edges', () => {
    expect(isRevisionServable(rev({ active_from: new Date('2026-09-04T00:00:00Z') }), now)).toBe(false);
    expect(isRevisionServable(rev({ active_to: new Date('2026-09-03T11:59:00Z') }), now)).toBe(false);
    expect(isRevisionServable(rev({
      active_from: new Date('2026-09-01T00:00:00Z'),
      active_to: new Date('2026-09-30T00:00:00Z'),
    }), now)).toBe(true);
  });

  it('picks the highest approved revision, ignoring a newer draft', () => {
    const picked = pickServableRevision([
      rev({ revision: 1 }),
      rev({ revision: 2 }),
      rev({ revision: 3, review_status: 'draft' }),
    ], now);
    expect(picked?.revision).toBe(2);
  });

  it('returns null when nothing is approved — the caller must omit, never fall back', () => {
    const picked = pickServableRevision([
      rev({ revision: 1, review_status: 'draft' }),
      rev({ revision: 2, review_status: 'in_review' }),
    ], now);
    expect(picked).toBeNull();
  });
});

describe('loadServableRevisions', () => {
  it('queries only approved revisions and returns the servable one per key', async () => {
    mockQuestionFindAll.mockResolvedValue([{ question_key: 'A1', provenance: 'colaberry_authored' }]);
    mockRevFindAll.mockResolvedValue([rev({ revision: 1 }), rev({ revision: 2 })]);

    const map = await loadServableRevisions(['A1']);
    expect(map.get('A1')?.revision).toBe(2);

    // the approval gate is enforced in the query, not only in memory
    expect(mockRevFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ review_status: 'approved' }) }),
    );
    // and retired identities are excluded at the identity level
    expect(mockQuestionFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ is_retired: false }) }),
    );
  });

  it('excludes any question whose provenance is not Colaberry-authored', async () => {
    mockQuestionFindAll.mockResolvedValue([{ question_key: 'A1', provenance: 'imported' }]);
    const map = await loadServableRevisions(['A1']);
    expect(map.size).toBe(0);
    expect(mockRevFindAll).not.toHaveBeenCalled();
  });

  it('boundary: an empty request does no queries', async () => {
    const map = await loadServableRevisions([]);
    expect(map.size).toBe(0);
    expect(mockQuestionFindAll).not.toHaveBeenCalled();
  });
});

describe('toRevealedItem — post-submission', () => {
  it('attaches the key, rationale and the student’s own result', () => {
    const revealed = toRevealedItem(rev(), ['B']);
    expect(revealed.correct_keys).toEqual(['B']);
    expect(revealed.rationale).toBe('The isolation is the point.');
    expect(revealed.distractor_rationales.C).toBe('the opposite');
    expect(revealed.your_selection).toEqual(['B']);
    expect(revealed.is_correct).toBe(true);
  });

  it('reports an incorrect answer honestly', () => {
    expect(toRevealedItem(rev(), ['A']).is_correct).toBe(false);
  });
});

describe('validateRevision', () => {
  const good = {
    question_key: 'A1', track_id: 'ccar-f', blueprint_version: '2026-07', domain_id: 'D1',
    stem: 'stem', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }],
    correct_keys: ['B'], select_count: 1, rationale: 'because',
  };

  it('happy path: a well-formed item has no problems', () => {
    expect(validateRevision(good)).toEqual([]);
  });

  it('catches a correct key that is not one of the options', () => {
    expect(validateRevision({ ...good, correct_keys: ['Z'] }))
      .toContain('correct key Z is not one of the options');
  });

  it('catches select_count disagreeing with the key — the item would be unanswerable', () => {
    expect(validateRevision({ ...good, correct_keys: ['A', 'B'], select_count: 1 }))
      .toContain('select_count must equal the number of correct keys');
  });

  it('catches duplicate option keys, a missing rationale, and too few options', () => {
    const problems = validateRevision({
      ...good,
      options: [{ key: 'A', text: 'a' }, { key: 'A', text: 'b' }],
      rationale: '   ',
    });
    expect(problems).toContain('option keys must be unique');
    expect(problems).toContain('rationale is required');
    expect(validateRevision({ ...good, options: [{ key: 'A', text: 'a' }] }))
      .toContain('at least 2 options are required');
  });
});

describe('setReviewStatus', () => {
  it('refuses to approve without a named reviewer — an unattributed approval is not an audit trail', async () => {
    mockRevFindOne.mockResolvedValue({ save: jest.fn() });
    await expect(setReviewStatus('A1', 1, 'approved')).rejects.toMatchObject({
      status: 400,
      code: 'CERT_APPROVAL_NEEDS_REVIEWER',
    });
  });

  it('stamps reviewer and reviewed_at on approval', async () => {
    const row: any = { save: jest.fn().mockResolvedValue(undefined) };
    mockRevFindOne.mockResolvedValue(row);
    await setReviewStatus('A1', 1, 'approved', 'kes@colaberry.com');
    expect(row.review_status).toBe('approved');
    expect(row.reviewer).toBe('kes@colaberry.com');
    expect(row.reviewed_at).toBeInstanceOf(Date);
    expect(row.save).toHaveBeenCalled();
  });

  it('non-approval transitions do not require a reviewer', async () => {
    const row: any = { save: jest.fn().mockResolvedValue(undefined) };
    mockRevFindOne.mockResolvedValue(row);
    await setReviewStatus('A1', 1, 'in_review');
    expect(row.review_status).toBe('in_review');
    expect(row.reviewer).toBeUndefined();
  });

  it('returns null for an unknown revision rather than throwing', async () => {
    mockRevFindOne.mockResolvedValue(null);
    await expect(setReviewStatus('nope', 1, 'in_review')).resolves.toBeNull();
  });
});
