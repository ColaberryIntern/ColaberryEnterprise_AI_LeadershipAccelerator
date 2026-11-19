/**
 * OH1i (T3): what is going viral, as a number, and the two collectors that feed the
 * build-prompt factory.
 *
 * The OpenClaw market-signal agent already stores thousands of posts a month in
 * openclaw_signals, with each platform's raw counts in `details` (HN points, dev.to reactions,
 * Product Hunt votes, YouTube views). It never turned those counts into one comparable number,
 * and it never collected the two places builders show what they built: new GitHub repos and
 * Show HN. This module adds both, read by buildPromptFactory.
 *
 * Collected rows are written with status 'skipped' and details.purpose = 'build_idea'. That is
 * deliberate: the OpenClaw conversation-detection agent picks up status 'discovered' rows and
 * queues public replies to them. A build idea is something we learn from, never something we
 * reply to, so these rows are invisible to that pipeline.
 *
 * Every network call goes through an injected `fetchJson`; tests never touch a live API.
 */

/** platform -> the details key holding its popularity count, and the count we call "viral". */
export const VIRALITY_REFERENCE: Record<string, { key: string; viralAt: number }> = {
  hackernews: { key: 'points', viralAt: 300 },
  devto: { key: 'positive_reactions_count', viralAt: 100 },
  hashnode: { key: 'positive_reactions_count', viralAt: 100 },
  producthunt: { key: 'votes_count', viralAt: 500 },
  youtube: { key: 'view_count', viralAt: 100_000 },
  github: { key: 'stars', viralAt: 1000 },
  reddit: { key: 'score', viralAt: 1000 },
  bluesky: { key: 'like_count', viralAt: 500 },
  twitter: { key: 'like_count', viralAt: 1000 },
  discourse: { key: 'like_count', viralAt: 50 },
};

/**
 * 0..1, comparable across platforms: log-scaled against what counts as viral on THAT platform
 * (300 HN points ~ 100 dev.to reactions ~ 500 PH votes ~ 100k YouTube views ~ 1000 new-repo
 * stars all score 1). Unknown platform, missing or non-numeric count -> 0, never a guess.
 */
export function viralityScore(platform: string, details: Record<string, any> | null | undefined): number {
  const ref = VIRALITY_REFERENCE[String(platform || '').toLowerCase()];
  if (!ref || !details) return 0;
  const raw = details[ref.key];
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  const s = Math.log10(1 + n) / Math.log10(1 + ref.viralAt);
  return Math.round(Math.min(1, s) * 10000) / 10000;
}

export interface SignalRow {
  platform: string;
  source_url: string;
  author: string;
  title: string;
  content_excerpt: string;
  details: Record<string, any>;
}

const BUILT_RE = /\b(i|we)\s+(just\s+)?(built|made|created|shipped|launched|open[- ]sourced)\b|\bbuilt\s+(a|an|my)\b|^show hn\b/i;
const AI_RE = /\b(ai|agent|agents|agentic|llm|llms|gpt|claude|mcp|rag|copilot|openai|anthropic|gemini|chatbot|ml)\b/i;

/** "Someone built X" - the only kind of signal a build prompt can be made from. */
export function isBuildSignal(s: Pick<SignalRow, 'platform' | 'title' | 'content_excerpt' | 'details'>): boolean {
  const title = String(s.title || '');
  if (!title.trim()) return false;
  if (s.platform === 'github') return true; // a repo is a built thing by definition
  if (s.platform === 'producthunt') return true; // a launch is a built thing
  if (s.platform === 'hackernews') return /^show hn\b/i.test(title) || BUILT_RE.test(title);
  return BUILT_RE.test(title) || BUILT_RE.test(String(s.content_excerpt || '').slice(0, 200));
}

/** The one Hacker News hit mapper, shared by the market-signal agent and the Show HN collector. */
export function mapHnHit(hit: any): SignalRow {
  const hnUrl = `https://news.ycombinator.com/item?id=${hit?.objectID}`;
  return {
    platform: 'hackernews',
    source_url: hit?.url || hnUrl,
    author: hit?.author || '',
    title: hit?.title || '',
    content_excerpt: String(hit?.story_text || '').slice(0, 500),
    details: {
      objectID: hit?.objectID,
      points: hit?.points,
      num_comments: hit?.num_comments,
      created_at: hit?.created_at,
      hn_url: hnUrl,
    },
  };
}

export type FetchJson = (url: string, init?: { headers?: Record<string, string> }) => Promise<any>;

/** Default fetch: a 15 s timeout, a generic client name, JSON or throw. */
export const defaultFetchJson: FetchJson = async (url, init = {}) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'build-signal-collector', ...(init.headers || {}) }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
};

const daysAgo = (now: Date, d: number) => new Date(now.getTime() - d * 864e5);

/** Topics GitHub repos are searched under. Kept short: unauthenticated search allows 10 calls a minute. */
export const GITHUB_TOPICS = ['claude-code', 'ai-agents', 'mcp'] as const;

/**
 * New GitHub repos (created in the last `days`) under agent/Claude topics, most-starred first.
 * One topic failing is logged and skipped; the others still return.
 */
export async function collectGithubBuildSignals(
  opts: { fetchJson?: FetchJson; now?: Date; days?: number; minStars?: number; perTopic?: number; topics?: readonly string[] } = {},
): Promise<{ rows: SignalRow[]; errors: string[] }> {
  const fetchJson = opts.fetchJson ?? defaultFetchJson;
  const since = daysAgo(opts.now ?? new Date(), opts.days ?? 7).toISOString().slice(0, 10);
  const rows: SignalRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const topic of opts.topics ?? GITHUB_TOPICS) {
    const q = `topic:${topic} created:>=${since} stars:>=${opts.minStars ?? 20}`;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${opts.perTopic ?? 20}`;
    try {
      const data = await fetchJson(url, { headers: { Accept: 'application/vnd.github+json' } });
      for (const r of data?.items || []) {
        if (!r?.html_url || seen.has(r.html_url) || r.fork || r.archived) continue;
        seen.add(r.html_url);
        rows.push({
          platform: 'github',
          source_url: r.html_url,
          author: r.owner?.login || '',
          title: r.full_name || r.name || '',
          content_excerpt: String(r.description || '').slice(0, 500),
          details: {
            purpose: 'build_idea',
            repo_id: r.id,
            stars: Number(r.stargazers_count) || 0,
            forks: Number(r.forks_count) || 0,
            language: r.language || null,
            topics: Array.isArray(r.topics) ? r.topics : [],
            created_at: r.created_at,
            searched_topic: topic,
          },
        });
      }
    } catch (err: any) {
      errors.push(`github ${topic}: ${err?.message}`);
    }
  }
  return { rows, errors };
}

/** Show HN posts from the last `days` with at least `minPoints`, AI-related only. */
export async function collectShowHnSignals(
  opts: { fetchJson?: FetchJson; now?: Date; days?: number; minPoints?: number } = {},
): Promise<{ rows: SignalRow[]; errors: string[] }> {
  const fetchJson = opts.fetchJson ?? defaultFetchJson;
  const sinceSec = Math.floor(daysAgo(opts.now ?? new Date(), opts.days ?? 7).getTime() / 1000);
  const filters = encodeURIComponent(`created_at_i>${sinceSec},points>=${opts.minPoints ?? 20}`);
  const url = `https://hn.algolia.com/api/v1/search?tags=show_hn&numericFilters=${filters}&hitsPerPage=100`;
  try {
    const data = await fetchJson(url);
    const rows = (data?.hits || [])
      .map(mapHnHit)
      .filter((r: SignalRow) => AI_RE.test(`${r.title} ${r.content_excerpt}`))
      .map((r: SignalRow) => ({ ...r, details: { ...r.details, purpose: 'build_idea', show_hn: true } }));
    return { rows, errors: [] };
  } catch (err: any) {
    return { rows: [], errors: [`show_hn: ${err?.message}`] };
  }
}

/** Writes one row per new source_url (the same de-dup key the market-signal agent uses). */
export type SignalWriter = {
  exists: (sourceUrl: string) => Promise<boolean>;
  create: (row: SignalRow & { status: 'skipped'; topic_tags: string[] }) => Promise<void>;
};

export const defaultSignalWriter: SignalWriter = {
  exists: async (sourceUrl) => {
    const { OpenclawSignal } = await import('../../models');
    return !!(await OpenclawSignal.findOne({ where: { source_url: sourceUrl } }));
  },
  create: async (row) => {
    const { OpenclawSignal } = await import('../../models');
    await OpenclawSignal.create({
      platform: row.platform as any,
      source_url: row.source_url.slice(0, 1000),
      author: row.author.slice(0, 200),
      title: row.title.slice(0, 500),
      content_excerpt: row.content_excerpt,
      topic_tags: row.topic_tags,
      status: row.status,
      discovered_at: new Date(),
      details: row.details,
      created_at: new Date(),
    });
  },
};

export async function saveBuildSignals(rows: SignalRow[], writer: SignalWriter = defaultSignalWriter): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;
  for (const r of rows) {
    if (!r.source_url) continue;
    if (await writer.exists(r.source_url)) { existing++; continue; }
    await writer.create({ ...r, status: 'skipped', topic_tags: ['build_idea'] });
    created++;
  }
  return { created, existing };
}
