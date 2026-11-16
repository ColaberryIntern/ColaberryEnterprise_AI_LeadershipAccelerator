import fs from 'fs';
import path from 'path';
import { fromPublishedCaseStudy, fromQuizAttempt, fromVideoCoaching, fromWeeklyInterview } from '../observationAdapters';

const E = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const AT = new Date('2026-11-16T01:35:15Z');

const coaching = {
  version: 2,
  scores: [
    { key: 'length', score: 90 }, { key: 'pace', score: 42 }, { key: 'fillers', score: 88 }, { key: 'repetition', score: 100 },
  ],
  content: { points: [{ key: 'proof', level: 'strong' }, { key: 'specific', level: 'work_on' }, { key: 'opening', level: 'ok' }], topTip: 'x' },
};

describe('fromVideoCoaching', () => {
  it('maps pace and fillers scores and the proof/specific content points, nothing else', () => {
    const { rows, skipped } = fromVideoCoaching({ enrollmentId: E, assetId: 'a1', updatedAt: AT, coaching });
    expect(skipped).toBeNull();
    expect(rows.map((r) => [r.skill, r.value])).toEqual([
      ['pace_clarity', 42], ['few_fillers', 88], ['proof_of_work', 85], ['ending_with_number', 40],
    ]);
    expect(new Set(rows.map((r) => r.sourceRef))).toEqual(new Set(['hire-intro:a1']));
    expect(rows.every((r) => r.source === 'video' && r.observedAt === AT && r.enrollmentId === E)).toBe(true);
  });

  it('writes delivery skills only when there is no content review', () => {
    const { rows } = fromVideoCoaching({ enrollmentId: E, assetId: 'a1', updatedAt: AT, coaching: { ...coaching, content: null } });
    expect(rows.map((r) => r.skill)).toEqual(['pace_clarity', 'few_fillers']);
  });

  it.each([
    ['an older notes-only record', { notes: ['x'], seconds: 50 }],
    ['a failed run', { status: 'failed', error_class: 'UpstreamUnavailable' }],
    ['null', null],
  ])('skips %s with a reason, never a guessed number', (_n, c) => {
    const m = fromVideoCoaching({ enrollmentId: E, assetId: 'a1', updatedAt: AT, coaching: c });
    expect(m.rows).toEqual([]);
    expect(m.skipped?.reason).toBeTruthy();
  });

  it('drops an out-of-range score rather than clamping it', () => {
    const { rows } = fromVideoCoaching({ enrollmentId: E, assetId: 'a1', updatedAt: AT, coaching: { version: 2, scores: [{ key: 'pace', score: 140 }] } });
    expect(rows).toEqual([]);
  });
});

describe('fromQuizAttempt', () => {
  it('scales 0..1 to a percentage, one row per mapped skill', () => {
    const { rows } = fromQuizAttempt({ id: 'q1', enrollmentId: E, cardId: 'c1', score: 0.875, createdAt: AT }, ['explaining_ai']);
    expect(rows).toEqual([{ enrollmentId: E, skill: 'explaining_ai', value: 87.5, source: 'training', sourceRef: 'assessment:q1', observedAt: AT }]);
  });
  it('writes nothing for a card with no mapping', () => {
    expect(fromQuizAttempt({ id: 'q1', enrollmentId: E, cardId: 'c1', score: 0.5, createdAt: AT }, []).rows).toEqual([]);
  });
  it.each([[1.5], [-0.1], ['0.5'], [null]])('skips a score of %j', (score) => {
    expect(fromQuizAttempt({ id: 'q1', enrollmentId: E, cardId: 'c1', score, createdAt: AT }, ['x']).skipped).not.toBeNull();
  });
});

describe('fromWeeklyInterview', () => {
  it('maps the 0-100 topic-coverage total to role knowledge as training evidence', () => {
    expect(fromWeeklyInterview({ id: 's1', enrollmentId: E, totalScore: 72, updatedAt: AT }).rows)
      .toEqual([{ enrollmentId: E, skill: 'role_knowledge', value: 72, source: 'training', sourceRef: 'interview-session:s1', observedAt: AT }]);
  });
  it('skips an unscored session', () => {
    expect(fromWeeklyInterview({ id: 's1', enrollmentId: E, totalScore: null, updatedAt: AT }).skipped).not.toBeNull();
  });
});

describe('fromPublishedCaseStudy', () => {
  it('records verified proof of work at the published date', () => {
    expect(fromPublishedCaseStudy({ enrollmentId: E, slug: 'kes-rag', publishedAt: '2026-11-01T00:00:00Z' }).rows)
      .toEqual([{ enrollmentId: E, skill: 'proof_of_work', value: 100, source: 'project', sourceRef: 'case-study:kes-rag', observedAt: new Date('2026-11-01T00:00:00Z') }]);
  });
  it('skips a case study with no usable date', () => {
    expect(fromPublishedCaseStudy({ enrollmentId: E, slug: 'x', publishedAt: 'not a date' }).skipped).not.toBeNull();
  });
});

describe('no face analysis anywhere in Career Prep', () => {
  it('has no eye-contact, expression or accent scoring in the careerPrep service code', () => {
    const dir = path.join(__dirname, '..');
    const code = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
      .map((s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')).join('\n');
    expect(code).not.toMatch(/eye.?contact|expression|accent/i);
  });
});
