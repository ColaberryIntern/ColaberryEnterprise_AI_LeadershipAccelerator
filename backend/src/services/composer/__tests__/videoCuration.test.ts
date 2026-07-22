/**
 * videoCuration tests — the YouTube gap-filler's deterministic core. No network:
 * duration parsing, ranking, and budget-packing are exercised with an injected
 * fake search. Proves budget is respected, dropped gaps are recorded (no silent
 * truncation), and failures degrade instead of throwing.
 */
import { iso8601ToSeconds, secondsToLabel, VideoCandidate } from '../youtubeClient';
import { rankCandidates, curateVideosForGaps, curateTopicPack, curatedVideoToCard, CuratedVideo } from '../videoCurationService';
import { CoverageGap } from '../coverageGapEngine';

const vid = (id: string, seconds: number, views: number, title: string): VideoCandidate => ({
  video_id: id, title, channel: `ch-${id}`, url: `https://www.youtube.com/watch?v=${id}`,
  duration_seconds: seconds, duration_label: secondsToLabel(seconds), thumbnail_url: null, view_count: views,
});

const gap = (competency: string, label: string): CoverageGap => ({ competency, label });

describe('youtubeClient pure helpers', () => {
  it('parses ISO-8601 durations', () => {
    expect(iso8601ToSeconds('PT6M42S')).toBe(402);
    expect(iso8601ToSeconds('PT10M')).toBe(600);
    expect(iso8601ToSeconds('PT1H2M3S')).toBe(3723);
    expect(iso8601ToSeconds('garbage')).toBe(0);
  });
  it('labels seconds', () => {
    expect(secondsToLabel(402)).toBe('6:42');
    expect(secondsToLabel(600)).toBe('10:00');
    expect(secondsToLabel(3723)).toBe('1:02:03');
  });
});

describe('rankCandidates', () => {
  it('prefers title relevance, then popularity, deterministically', () => {
    const cands = [
      vid('a', 360, 100, 'Random unrelated clip'),
      vid('b', 360, 50, 'Agentic Loop explained for beginners'),
      vid('c', 360, 5000, 'Agentic Loop deep tutorial'),
    ];
    const ranked = rankCandidates(cands, 'Agentic Loop');
    expect(ranked[0].video_id).toBe('c'); // relevant + most views
    expect(ranked[2].video_id).toBe('a'); // irrelevant last
  });
});

describe('curateVideosForGaps', () => {
  const fake = (byGap: Record<string, VideoCandidate[]>) =>
    ({ search: async (q: string) => Object.entries(byGap).find(([label]) => q.includes(label))?.[1] || [] });

  it('fills gaps within budget and tags each video with its competency', async () => {
    const res = await curateVideosForGaps(
      [gap('agentic_loops', 'Agentic Loop'), gap('plan_mode', 'Plan Mode')],
      { budgetMinutes: 30, topic: 'Claude Code' },
      fake({ 'Agentic Loop': [vid('a', 300, 900, 'Agentic Loop tutorial')], 'Plan Mode': [vid('p', 300, 900, 'Plan Mode tutorial')] }),
    );
    expect(res.videos.map((v) => v.competency)).toEqual(['agentic_loops', 'plan_mode']);
    expect(res.videos[0].url).toContain('youtube.com');
    expect(res.filled).toEqual(['agentic_loops', 'plan_mode']);
    expect(res.source).toBe('youtube');
    expect(res.used_minutes).toBe(10);
  });

  it('respects the time budget and RECORDS the dropped gap (no silent truncation)', async () => {
    const res = await curateVideosForGaps(
      [gap('a1', 'One'), gap('a2', 'Two')],
      { budgetMinutes: 8 }, // 480s; each video is 360s → only the first fits
      fake({ One: [vid('x', 360, 10, 'One tutorial')], Two: [vid('y', 360, 10, 'Two tutorial')] }),
    );
    expect(res.videos.map((v) => v.competency)).toEqual(['a1']);
    expect(res.unfilled).toEqual([{ competency: 'a2', label: 'Two', reason: 'budget' }]);
    expect(res.notes.some((n) => /unfilled/.test(n))).toBe(true);
  });

  it('degrades on no candidates and on search errors — never throws', async () => {
    const res = await curateVideosForGaps(
      [gap('a1', 'None'), gap('a2', 'Boom')],
      {},
      { search: async (q: string) => { if (q.includes('Boom')) throw new Error('429'); return []; } },
    );
    expect(res.videos).toEqual([]);
    expect(res.source).toBe('none');
    expect(res.unfilled.map((u) => u.reason).sort()).toEqual(['no_candidates', 'search_error']);
  });

  it('is deterministic — same inputs, identical result', async () => {
    const deps = fake({ 'Agentic Loop': [vid('a', 300, 900, 'Agentic Loop tutorial'), vid('b', 360, 900, 'Agentic Loop explained')] });
    const g = [gap('agentic_loops', 'Agentic Loop')];
    const a = await curateVideosForGaps(g, { budgetMinutes: 30 }, deps);
    const b = await curateVideosForGaps(g, { budgetMinutes: 30 }, deps);
    expect(a).toEqual(b);
  });
});

describe('curateTopicPack', () => {
  it('collects up to count, de-duped across themes, all tagged one competency', async () => {
    const res = await curateTopicPack(
      ['ai news', 'ai tools'], 'ai_literacy', 'Latest in AI', { count: 2 },
      { search: async (q: string) => [vid('a', 300, 10, `AI ${q}`), vid('b', 400, 5, `More ${q}`)] },
    );
    expect(res.videos.length).toBe(2);                       // count cap respected
    expect(new Set(res.videos.map((v) => v.video_id)).size).toBe(2); // de-duped
    expect(res.videos.every((v) => v.competency === 'ai_literacy')).toBe(true);
    expect(res.source).toBe('youtube');
  });
  it('degrades to source none when nothing comes back', async () => {
    const res = await curateTopicPack(['x'], 'ai_literacy', 'Latest in AI', {}, { search: async () => [] });
    expect(res.videos).toEqual([]);
    expect(res.source).toBe('none');
  });
});

describe('curatedVideoToCard', () => {
  it('maps a curated video to a competency-tagged draft video card', () => {
    const cv: CuratedVideo = { ...vid('z', 300, 10, 'Plan Mode in 5 minutes'), competency: 'plan_mode', competency_label: 'Plan Mode' };
    const card = curatedVideoToCard(cv, 1);
    expect(card.type).toBe('video');
    expect(card.competencies).toEqual(['plan_mode']);   // ← why coverage moves for a real reason
    expect(card.video_url).toContain('youtube.com');
    expect(card.estimated_time).toBe(5);
  });
});
