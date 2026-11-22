const mockQuery = jest.fn();
const mockTransaction = jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn('tx'));
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a), transaction: (fn: (t: unknown) => Promise<unknown>) => mockTransaction(fn) } }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { addInterview, createPractice, linkHireInterviews, practiceUntil } from '../interviews';
import { questionsFromJd } from '../jdQuestions';
import { linkPlacementInterview } from '../placementLink';

const JD = 'We need an AI engineer to build retrieval-augmented generation pipelines in Python, deploy them on AWS, and work with product managers on evaluation.';
const QS = ['Walk me through a RAG pipeline you built end to end.', 'How do you evaluate retrieval quality?', 'Tell me about deploying a model on AWS.',
  'How do you work with a product manager on scope?', 'Describe a time an evaluation changed your design.'];
const ADD = { company: 'Acme', role: 'AI Engineer', type: 'technical' as const, startsAt: '2026-11-19T20:00:00Z', jdText: JD };

/** Sequence for a first save: lock, no duplicate found, insert returns the id. */
const firstSave = (id: string) => mockQuery.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[{ id }], 1]);
/** Sequence for a repeat: lock, the duplicate is found. */
const repeatSave = (id: string, questions: unknown = null) => mockQuery.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[{ id, questions }], 1]);

beforeEach(() => { mockQuery.mockReset(); mockTransaction.mockClear(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('linkHireInterviews', () => {
  it('links only confirmed, upcoming Hire interviews, idempotently, cutting long names to the column width', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'c1' }], 1]).mockResolvedValueOnce([[], 0]);
    expect(await linkHireInterviews('e1', new Date('2026-11-16T18:00:00Z'))).toBe(1);
    expect(await linkHireInterviews('e1', new Date('2026-11-16T18:00:00Z'))).toBe(0);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("h.status = 'confirmed'");
    expect(sql).toContain('ON CONFLICT (hire_interview_id) DO NOTHING');
    expect(sql).toContain('LEFT(h.employer_company, 120)');
    expect(sql).toContain('LEFT(h.employer_role, 120)');
  });
});

describe('addInterview', () => {
  it('saves source=added under a per-student lock, then writes the questions from the job description', async () => {
    firstSave('i1');
    mockQuery.mockResolvedValueOnce([[], 1]); // the questions UPDATE
    const call = jest.fn(async () => JSON.stringify({ questions: QS }));
    const r = await addInterview('e1', ADD, call);
    expect(r).toEqual({ id: 'i1', questions: QS, duplicate: false });
    expect(String(mockQuery.mock.calls[0][0])).toContain('pg_advisory_xact_lock');
    expect(String(mockQuery.mock.calls[2][0])).toContain("'added'");
    expect(String(mockQuery.mock.calls[3][0])).toContain('UPDATE career_interviews SET questions');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('is retry-safe: the same interview again returns the first row and does not call the model', async () => {
    repeatSave('i1', QS);
    const call = jest.fn();
    const r = await addInterview('e1', ADD, call);
    expect(r).toEqual({ id: 'i1', questions: QS, duplicate: true });
    expect(call).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(2); // lock + lookup, no insert, no update
  });

  it('still saves the interview, without questions, when the generator fails', async () => {
    firstSave('i2');
    const r = await addInterview('e1', ADD, async () => { throw Object.assign(new Error('timeout'), { status: 504 }); });
    expect(r).toEqual({ id: 'i2', questions: null, duplicate: false });
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('"error_class":"UpstreamUnavailable"');
  });

  it('makes no model call without a job description', async () => {
    firstSave('i3');
    const call = jest.fn();
    expect((await addInterview('e1', { ...ADD, jdText: undefined }, call)).questions).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('questionsFromJd', () => {
  it('rejects output that is not 5 to 8 questions', async () => {
    expect(await questionsFromJd(JD, 'R', 'technical', async () => JSON.stringify({ questions: QS.slice(0, 2) }))).toBeNull();
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('"error_class":"ValidationError"');
  });
  it('rejects malformed JSON and a missing key', async () => {
    expect(await questionsFromJd(JD, 'R', 'technical', async () => 'not json')).toBeNull();
    expect(await questionsFromJd(JD, 'R', 'technical', async () => null)).toBeNull();
  });
  it('does not call the model for a job description too short to ground on', async () => {
    const call = jest.fn();
    expect(await questionsFromJd('AI job', 'R', 'technical', call)).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('linkPlacementInterview (CP8.3)', () => {
  const LINK = { placementInterviewId: 'pi-1', enrollmentId: 'e1', company: '  Acme  ', position: 'Data Analyst', type: 'technical' as const, startsAt: new Date('2026-11-23T15:00:00Z') };
  it('one keyed upsert: the partial unique index as the conflict target, the same learner only, columns cut to their width', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'c1' }], 1]);
    expect(await linkPlacementInterview(LINK)).toBe('c1');
    const [sql, opts] = mockQuery.mock.calls[0] as [string, { replacements: Record<string, unknown> }];
    expect(sql).toContain("VALUES (:e, 'real', LEFT(:company, 120), LEFT(:role, 120), :type, :start, :pid)");
    expect(sql).toContain('ON CONFLICT (placement_interview_id) WHERE placement_interview_id IS NOT NULL');
    expect(sql).toContain('DO UPDATE SET starts_at = EXCLUDED.starts_at');
    expect(sql).toContain('WHERE career_interviews.enrollment_id = EXCLUDED.enrollment_id');
    expect(opts.replacements).toEqual({ e: 'e1', company: 'Acme', role: 'Data Analyst', type: 'technical', start: LINK.startsAt, pid: 'pi-1' });
    expect(mockTransaction).not.toHaveBeenCalled(); // one statement: no lock, no window between a check and an insert
  });
  it('what the email did not say gets plain words, never a blank: An employer, Interview, recruiter', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'c2' }], 1]);
    await linkPlacementInterview({ ...LINK, company: null, position: '  ', type: null });
    expect((mockQuery.mock.calls[0][1] as { replacements: Record<string, unknown> }).replacements).toMatchObject({ company: 'An employer', role: 'Interview', type: 'recruiter' });
  });
  it('returns null when no row comes back (the id is linked to another learner)', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    expect(await linkPlacementInterview(LINK)).toBeNull();
  });
});

describe('practice interviews', () => {
  it('get a 4-day window counted in Central days, including today', () => {
    expect(practiceUntil(new Date('2026-11-16T18:00:00Z'))).toBe('2026-11-19');
    expect(practiceUntil(new Date('2026-11-17T05:30:00Z'))).toBe('2026-11-19'); // still Mon 16 Nov in Central
  });
  it('are saved with source=practice and no date, once per 10 minutes', async () => {
    firstSave('p1');
    expect(await createPractice('e1', { role: 'AI Engineer', type: 'behavioral' }, new Date('2026-11-16T18:00:00Z'))).toEqual({ id: 'p1', practiceUntil: '2026-11-19', duplicate: false });
    expect(String(mockQuery.mock.calls[2][0])).toContain("'practice'");
    repeatSave('p1');
    expect((await createPractice('e1', { role: 'AI Engineer', type: 'behavioral' }, new Date('2026-11-16T18:00:00Z'))).duplicate).toBe(true);
  });
});
