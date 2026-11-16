const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { addInterview, createPractice, linkHireInterviews, practiceUntil } from '../interviews';
import { questionsFromJd } from '../jdQuestions';

const JD = 'We need an AI engineer to build retrieval-augmented generation pipelines in Python, deploy them on AWS, and work with product managers on evaluation.';
const QS = ['Walk me through a RAG pipeline you built end to end.', 'How do you evaluate retrieval quality?', 'Tell me about deploying a model on AWS.',
  'How do you work with a product manager on scope?', 'Describe a time an evaluation changed your design.'];

beforeEach(() => { mockQuery.mockReset(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('linkHireInterviews', () => {
  it('links only confirmed, upcoming Hire interviews, idempotently (ON CONFLICT on hire_interview_id)', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'c1' }], 1]).mockResolvedValueOnce([[], 0]);
    expect(await linkHireInterviews('e1', new Date('2026-11-16T18:00:00Z'))).toBe(1);
    expect(await linkHireInterviews('e1', new Date('2026-11-16T18:00:00Z'))).toBe(0);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("h.status = 'confirmed'");
    expect(sql).toContain('h.starts_at > :now');
    expect(sql).toContain('ON CONFLICT (hire_interview_id) DO NOTHING');
    expect(mockQuery.mock.calls[0][1].replacements.e).toBe('e1');
  });
});

describe('addInterview', () => {
  it('saves source=added with the questions from the job description', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'i1' }], 1]);
    const r = await addInterview('e1', { company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: '2026-11-19T20:00:00Z', jdText: JD },
      async () => JSON.stringify({ questions: QS }));
    expect(r).toEqual({ id: 'i1', questions: QS });
    expect(String(mockQuery.mock.calls[0][0])).toContain("'added'");
    expect(mockQuery.mock.calls[0][1].replacements.q).toBe(JSON.stringify(QS));
  });

  it('still saves the interview, without questions, when the generator fails', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'i2' }], 1]);
    const r = await addInterview('e1', { company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: null, jdText: JD },
      async () => { throw Object.assign(new Error('timeout'), { status: 504 }); });
    expect(r).toEqual({ id: 'i2', questions: null });
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('"error_class":"UpstreamUnavailable"');
  });

  it('makes no model call without a job description', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'i3' }], 1]);
    const call = jest.fn();
    expect((await addInterview('e1', { company: 'Acme', role: 'R', type: 'behavioral', startsAt: null }, call)).questions).toBeNull();
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

describe('practice interviews', () => {
  it('get a 4-day window counted in Central days, including today', () => {
    expect(practiceUntil(new Date('2026-11-16T18:00:00Z'))).toBe('2026-11-19');
    expect(practiceUntil(new Date('2026-11-17T05:30:00Z'))).toBe('2026-11-19'); // still Mon 16 Nov in Central
  });
  it('are saved with source=practice and no date', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'p1' }], 1]);
    expect(await createPractice('e1', { role: 'AI Engineer', type: 'behavioral' }, new Date('2026-11-16T18:00:00Z'))).toEqual({ id: 'p1', practiceUntil: '2026-11-19' });
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("'practice'");
    expect(sql).toContain('NULL');
  });
});
