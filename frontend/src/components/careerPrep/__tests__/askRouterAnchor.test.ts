import { routeAsk } from '../logic/askRouter';
import { anchorCards, ADD_ID, CREATE_ID, insightLines, typeCards } from '../logic/anchorOptions';
import type { PrepDashboard, PrepInterview } from '../careerPrepApi';

describe('routeAsk (no model call for the common asks)', () => {
  it.each([
    ['Suggest a plan', 'plan'], ['make me a plan', 'plan'], ['What should I work on?', 'weak'], ['how do I improve', 'weak'],
    ['I have 10 minutes', 'quick'], ['something quick', 'quick'], ['Add an interview', 'add'], ['please add my Acme interview', 'add'],
    ['show my progress', 'progress'], ['open the dashboard', 'progress'],
  ])('%s -> %s', (text, kind) => expect(routeAsk(text).kind).toBe(kind));

  it.each([['my offers', 'offers'], ['is my inbox working', 'inbox'], ['applications', 'applications'], ['my résumé', 'resume'], ['show my interviews', 'interviews']])(
    '%s opens the %s sheet', (text, sheet) => expect(routeAsk(text)).toEqual({ kind: 'sheet', sheet }));

  it('sends anything else to Cora, trimmed', () => {
    expect(routeAsk('  How do I explain RAG to a recruiter?  ')).toEqual({ kind: 'open', text: 'How do I explain RAG to a recruiter?' });
  });
});

const iv = (o: Partial<PrepInterview>): PrepInterview => ({ id: 'x', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', target: 75, ...o });

describe('anchorCards', () => {
  it('with no real interviews: just Add and Create', () => {
    expect(anchorCards([]).map((c) => c.id)).toEqual([ADD_ID, CREATE_ID]);
  });
  it('one card per real interview, soonest first, with a readiness bar only when there is one', () => {
    const cards = anchorCards([
      iv({ id: 'b', company: 'Beta', startsAt: '2026-11-25T20:00:00Z' }),
      iv({ id: 'a', company: 'Acme', startsAt: '2026-11-19T20:00:00Z', readiness: 64 }),
      iv({ id: 'p', source: 'practice', company: 'Practice interview' }),
    ]);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'p', ADD_ID, CREATE_ID]); // practice after the dated ones, so Change can pick it again
    expect(cards[2].line).toBe('Practice · made by Cora');
    expect(cards[0]).toMatchObject({ title: 'Acme · AI Engineer', line: 'Thursday at 2:00 PM · A real interview', bar: { value: 64, target: 75 } });
    expect(cards[1].bar).toBeUndefined();
  });
  it('offers the four interview types for a practice interview', () => {
    expect(typeCards().map((c) => c.id)).toEqual(['type:recruiter', 'type:hiring_manager', 'type:technical', 'type:behavioral']);
  });
});

describe('insightLines (only from real metrics)', () => {
  const base: PrepDashboard = { interviews: [], skills: [], sources: { video: 0, phone_mock: 0, real_interview: 0, training: 0, project: 0, read_aloud: 0 }, weeklyMinutes: [], streak: 0, thisWeek: 0 };
  it('is empty with no data', () => expect(insightLines(base)).toEqual([]));
  it('cites readiness, the two weakest skills and the biggest gain', () => {
    const d: PrepDashboard = { ...base, readiness: { value: 64, target: 75, trend: [] }, skills: [
      { key: 'p', label: 'Pace and clarity', score: 41, change30: -2, count: 4, sources: ['video'] },
      { key: 'f', label: 'Few filler words', score: 48, change30: 9, count: 4, sources: ['video'] },
      { key: 'r', label: 'Role knowledge', score: 80, change30: 3, count: 3, sources: ['training'] },
      { key: 'e', label: 'Proof of work', count: 0, sources: [] },
    ] };
    expect(insightLines(d)).toEqual([
      'Readiness 64, ready at 75.',
      'Pace and clarity: 41, your lowest so far (from your videos).',
      'Few filler words: 48, your lowest so far (from your videos).',
      'Few filler words is up 9 in 30 days.',
    ]);
  });
});
