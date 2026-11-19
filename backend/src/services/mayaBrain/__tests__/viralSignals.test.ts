/**
 * OH1i (T3): one comparable virality number per platform, and the GitHub + Show HN
 * collectors, with an injected fetch (no live API is ever called from here).
 */
import {
  viralityScore, isBuildSignal, mapHnHit, collectGithubBuildSignals, collectShowHnSignals, saveBuildSignals,
  type FetchJson, type SignalWriter,
} from '../viralSignals';

const NOW = new Date('2026-11-18T12:00:00Z');

describe('viralityScore', () => {
  it('scores each platform from its own count, and "viral" on each scores 1', () => {
    expect(viralityScore('hackernews', { points: 300 })).toBe(1);
    expect(viralityScore('devto', { positive_reactions_count: 100 })).toBe(1);
    expect(viralityScore('producthunt', { votes_count: 500 })).toBe(1);
    expect(viralityScore('youtube', { view_count: 100000 })).toBe(1);
    expect(viralityScore('github', { stars: 1000 })).toBe(1);
  });
  it('is comparable across platforms: 30 HN points ranks with 10 dev.to reactions, below 300 points', () => {
    const hn = viralityScore('hackernews', { points: 30 });
    const dev = viralityScore('devto', { positive_reactions_count: 10 });
    expect(Math.abs(hn - dev)).toBeLessThan(0.1);
    expect(hn).toBeLessThan(viralityScore('hackernews', { points: 300 }));
  });
  it('caps at 1 and reads numeric strings', () => {
    expect(viralityScore('hackernews', { points: 5000 })).toBe(1);
    expect(viralityScore('youtube', { view_count: '1000' })).toBeGreaterThan(0);
  });
  it('is 0, never a guess, for missing, zero, negative, junk counts or unknown platforms', () => {
    expect(viralityScore('hackernews', {})).toBe(0);
    expect(viralityScore('hackernews', { points: 0 })).toBe(0);
    expect(viralityScore('devto', { positive_reactions_count: -3 })).toBe(0);
    expect(viralityScore('producthunt', { votes_count: 'lots' })).toBe(0);
    expect(viralityScore('linkedin', { likes: 900 })).toBe(0);
    expect(viralityScore('hackernews', null)).toBe(0);
  });
});

describe('isBuildSignal ("someone built X")', () => {
  const s = (platform: string, title: string, content_excerpt = '') => ({ platform, title, content_excerpt, details: {} });
  it('accepts Show HN, repos, launches and "I built" posts', () => {
    expect(isBuildSignal(s('hackernews', 'Show HN: A local agent that triages my inbox'))).toBe(true);
    expect(isBuildSignal(s('github', 'someone/agent-kit'))).toBe(true);
    expect(isBuildSignal(s('producthunt', 'Shipwright AI'))).toBe(true);
    expect(isBuildSignal(s('devto', 'I built a private video-to-GIF converter that runs in the browser'))).toBe(true);
  });
  it('rejects opinion and news posts, and empty titles', () => {
    expect(isBuildSignal(s('hackernews', 'Ask HN: Is AI overhyped?'))).toBe(false);
    expect(isBuildSignal(s('devto', 'Why agents will change everything'))).toBe(false);
    expect(isBuildSignal(s('github', ''))).toBe(false);
  });
});

describe('mapHnHit (shared with the market-signal agent)', () => {
  it('keeps points and comments, and falls back to the HN item URL', () => {
    const r = mapHnHit({ objectID: '42', title: 'Show HN: X', author: 'pg', points: 120, num_comments: 9 });
    expect(r.source_url).toBe('https://news.ycombinator.com/item?id=42');
    expect(r.details).toMatchObject({ points: 120, num_comments: 9, hn_url: 'https://news.ycombinator.com/item?id=42' });
  });
});

describe('collectGithubBuildSignals', () => {
  const repo = (n: number, stars: number, extra: any = {}) => ({
    id: n, html_url: `https://github.com/dev/repo${n}`, full_name: `dev/repo${n}`, owner: { login: 'dev' },
    description: 'An MCP server for X', stargazers_count: stars, forks_count: 2, language: 'TypeScript',
    topics: ['mcp'], created_at: '2026-11-15T00:00:00Z', ...extra,
  });
  it('searches new repos per topic since 7 days ago and maps stars into details', async () => {
    const urls: string[] = [];
    const fetchJson: FetchJson = async (url) => { urls.push(url); return { items: [repo(1, 340), repo(2, 50)] }; };
    const { rows, errors } = await collectGithubBuildSignals({ fetchJson, now: NOW, topics: ['mcp'] });
    expect(errors).toEqual([]);
    expect(decodeURIComponent(urls[0])).toContain('topic:mcp created:>=2026-11-11 stars:>=20');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ platform: 'github', title: 'dev/repo1', details: { stars: 340, purpose: 'build_idea' } });
  });
  it('de-duplicates across topics and skips forks and archived repos', async () => {
    const fetchJson: FetchJson = async () => ({ items: [repo(1, 340), repo(3, 80, { fork: true }), repo(4, 80, { archived: true })] });
    const { rows } = await collectGithubBuildSignals({ fetchJson, now: NOW, topics: ['mcp', 'ai-agents'] });
    expect(rows.map((r) => r.title)).toEqual(['dev/repo1']);
  });
  it('one failing topic is reported and the others still return', async () => {
    const fetchJson: FetchJson = async (url) => {
      if (url.includes('claude-code')) throw new Error('HTTP 403 from api.github.com');
      return { items: [repo(5, 25)] };
    };
    const { rows, errors } = await collectGithubBuildSignals({ fetchJson, now: NOW, topics: ['claude-code', 'mcp'] });
    expect(rows).toHaveLength(1);
    expect(errors[0]).toMatch(/claude-code: HTTP 403/);
  });
});

describe('collectShowHnSignals', () => {
  it('asks for Show HN with a points floor and keeps only AI-related posts', async () => {
    let asked = '';
    const fetchJson: FetchJson = async (url) => {
      asked = url;
      return { hits: [
        { objectID: '1', title: 'Show HN: An agent that writes my SQL migrations', points: 210, url: 'https://example.dev/a' },
        { objectID: '2', title: 'Show HN: A woodworking calculator', points: 400 },
      ] };
    };
    const { rows } = await collectShowHnSignals({ fetchJson, now: NOW });
    expect(decodeURIComponent(asked)).toContain('tags=show_hn');
    expect(decodeURIComponent(asked)).toContain('points>=20');
    expect(rows.map((r) => r.title)).toEqual(['Show HN: An agent that writes my SQL migrations']);
    expect(rows[0].details).toMatchObject({ points: 210, show_hn: true, purpose: 'build_idea' });
  });
  it('a failed call is an error and no rows, not a throw', async () => {
    const r = await collectShowHnSignals({ fetchJson: async () => { throw new Error('timeout'); }, now: NOW });
    expect(r).toEqual({ rows: [], errors: ['show_hn: timeout'] });
  });
});

describe('saveBuildSignals', () => {
  it('writes only new URLs, always as status skipped so no public reply is ever queued', async () => {
    const created: any[] = [];
    const writer: SignalWriter = {
      exists: async (u) => u.endsWith('/old'),
      create: async (r) => { created.push(r); },
    };
    const base = { platform: 'github', author: 'a', title: 't', content_excerpt: '', details: {} };
    const out = await saveBuildSignals([{ ...base, source_url: 'https://github.com/a/old' }, { ...base, source_url: 'https://github.com/a/new' }, { ...base, source_url: '' }], writer);
    expect(out).toEqual({ created: 1, existing: 1 });
    expect(created[0]).toMatchObject({ source_url: 'https://github.com/a/new', status: 'skipped', topic_tags: ['build_idea'] });
  });
});
