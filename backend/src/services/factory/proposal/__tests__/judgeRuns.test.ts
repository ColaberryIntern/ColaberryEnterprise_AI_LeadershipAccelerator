import { JUDGES, judgeCacheKey, newJudgeRun, judgeRunIds } from '../judgeRuns';

describe('judgeCacheKey', () => {
  it('is DISTINCT per judge on identical content (the independence rail)', () => {
    const keys = JUDGES.map((j) => judgeCacheKey(j, 'technical', '<p>same content</p>', 'gpt'));
    expect(new Set(keys).size).toBe(JUDGES.length); // no two judges share a key
  });

  it('is stable for identical inputs and changes when the content changes', () => {
    const a = judgeCacheKey('proof', 'd', 'content A', 'gpt');
    expect(judgeCacheKey('proof', 'd', 'content A', 'gpt')).toBe(a);
    expect(judgeCacheKey('proof', 'd', 'content B', 'gpt')).not.toBe(a);
  });
});

describe('newJudgeRun', () => {
  it('produces a per-judge run id, stable for identical inputs, distinct across judges', () => {
    const ev1 = newJudgeRun('evaluator', 'd', 'c', 'gpt', '2026-11-06T00:00:00Z');
    const ev2 = newJudgeRun('evaluator', 'd', 'c', 'gpt', '2026-11-06T00:00:00Z');
    const pr = newJudgeRun('proof', 'd', 'c', 'gpt', '2026-11-06T00:00:00Z');
    expect(ev1.runId).toBe(ev2.runId);
    expect(ev1.runId).not.toBe(pr.runId);
    expect(ev1.runId.startsWith('jr:evaluator:')).toBe(true);
    expect(ev1).toMatchObject({ judge: 'evaluator', model: 'gpt', at: '2026-11-06T00:00:00Z' });
  });
});

describe('judgeRunIds', () => {
  it('returns one id per judge in JUDGES order, deduped, dropping junk', () => {
    const runs = [
      newJudgeRun('clarity', 'd', 'c', 'gpt'),
      newJudgeRun('evaluator', 'd', 'c', 'gpt'),
      newJudgeRun('evaluator', 'd', 'c', 'gpt'), // dupe judge
      newJudgeRun('proof', 'd', 'c', 'gpt'),
    ];
    const ids = judgeRunIds(runs);
    expect(ids).toHaveLength(3);
    expect(ids[0].startsWith('jr:evaluator:')).toBe(true); // JUDGES order: evaluator, proof, clarity
    expect(ids[1].startsWith('jr:proof:')).toBe(true);
    expect(ids[2].startsWith('jr:clarity:')).toBe(true);
  });

  it('is total on empty / junk', () => {
    expect(judgeRunIds(undefined)).toEqual([]);
    expect(judgeRunIds([{ judge: 'x' } as any])).toEqual([]);
  });
});
