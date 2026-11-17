const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'skill-sources-test-secret' } }));

import { CASE_STUDIES_PATH, describe as describeRow, INTRO_VIDEO_PATH, skillSources } from '../skillSources';

const at = new Date('2026-11-16T23:00:00Z');
const row = (source_ref: string, extra: Record<string, unknown> = {}) => ({ value: 31.46, source: 'video' as const, source_ref, observed_at: at, question: null, asset_id: null, ...extra });

describe('describe (what each result was, from its stored ref only)', () => {
  it('the intro video links to Portfolio > Hire > Video', () => {
    expect(describeRow(row('hire-intro:d9e66839891df998fb8e0e01'))).toEqual({ at: at.toISOString(), value: 31.5, kind: 'intro_video', label: 'Your intro video', link: INTRO_VIDEO_PATH });
  });
  it('a Try answer plays when saved, and says "not kept" when it was not', () => {
    const saved = describeRow(row('attempt:a1', { question: 'Tell me about a project.', asset_id: 'abcdefabcdefabcdefabcdef' }));
    expect(saved.label).toBe('Try answer: Tell me about a project.');
    expect(saved.video?.streamUrl).toMatch(/answer-video\/abcdefabcdefabcdefabcdef\/stream\?t=/);
    const gone = describeRow(row('attempt:a2'));
    expect(gone).toMatchObject({ kind: 'try_answer', label: 'A Try answer in Career Prep', notKept: true });
    expect(gone.video).toBeUndefined();
  });
  it('a case study names its slug and links to the case studies', () => {
    expect(describeRow({ ...row('case-study:e1:stress-test-review-app'), source: 'project' })).toMatchObject({ kind: 'case_study', label: 'Published case study: stress-test-review-app', link: CASE_STUDIES_PATH });
  });
  it('anything else is named by its source, never invented', () => {
    expect(describeRow({ ...row('quiz:9'), source: 'training' })).toMatchObject({ kind: 'other', label: 'A lesson quiz' });
  });
});

it("reads only this student's results for that skill and source, over 90 days, newest first", async () => {
  mockQuery.mockResolvedValueOnce([[row('hire-intro:x')], 1]);
  const items = await skillSources('e1', 'pace_clarity', 'video', at);
  expect(items).toHaveLength(1);
  const [sql, opts] = mockQuery.mock.calls[0];
  expect(String(sql)).toContain("o.enrollment_id = :e AND o.skill_key = :k AND o.source = :s AND o.observed_at > :now::timestamptz - INTERVAL '90 days'");
  expect(String(sql)).toContain('ORDER BY o.observed_at DESC');
  expect(opts.replacements).toEqual({ e: 'e1', k: 'pace_clarity', s: 'video', now: at });
});
