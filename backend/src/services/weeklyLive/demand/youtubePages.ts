/**
 * YouTube's public pages as data (WL3.2), ported from .claude/skills/plan-live-session/scripts/yt_demand.js.
 * No API key (M0): the numbers are in the ytInitialData JSON each page embeds. Parsing is pure; the
 * one network call has a 15 s timeout and one retry on 429/5xx, and the caller spaces requests out.
 */
export interface Video { id: string; title: string; channel: string; handle: string; views: number | null; ageDays: number | null; }
export type GetPage = (url: string) => Promise<string>;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 15_000;

export const getPage: GetPage = async (url) => {
  for (let attempt = 0; ; attempt += 1) {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', cookie: 'CONSENT=YES+1' } });
    if (r.ok) return r.text();
    if (attempt >= 1 || (r.status !== 429 && r.status < 500)) throw Object.assign(new Error(`YouTube HTTP ${r.status}`), { status: r.status });
    await new Promise((res) => setTimeout(res, 3000));
  }
};

/** "1.2M views", "18 thousand views", "134,322 views", "No views" to a number, or null. */
export function parseViews(s: string | null | undefined): number | null {
  const t = String(s || '').toLowerCase().replace(/,/g, '');
  if (/no views/.test(t)) return 0;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?\b/);
  if (!m) return null;
  const mult: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };
  return Math.round(Number(m[1]) * (mult[m[2]] || 1));
}

/** "12 days ago", "2w ago", "3 months ago" to days, or null. */
export function parseAgeDays(s: string | null | undefined): number | null {
  const m = String(s || '').toLowerCase().match(/(\d+)\s*(minute|min|hour|month|mo|week|year|day|h|d|w|y)/);
  if (!m) return null;
  const per: Record<string, number> = { minute: 0, min: 0, hour: 0, h: 0, day: 1, d: 1, week: 7, w: 7, month: 30, mo: 30, year: 365, y: 365 };
  return Number(m[1]) * per[m[2]];
}

export function median(xs: (number | null)[]): number | null {
  const s = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2);
}

type Obj = Record<string, unknown>;
const at = (o: unknown, ...path: (string | number)[]): unknown => path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Obj)[k] : undefined), o);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const text = (v: unknown): string => str(at(v, 'simpleText')) || (Array.isArray(at(v, 'runs')) ? (at(v, 'runs') as unknown[]).map((r) => str(at(r, 'text'))).join('') : '');

/** Every video on a search or channel page. Throws when the page carries no data (blocked or changed). */
export function parseVideos(html: string): Video[] {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw Object.assign(new Error('YouTube page had no data (blocked, or its layout changed)'), { name: 'ContractViolation' });
  const out: Video[] = [];
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const v = at(o, 'videoRenderer'); const l = at(o, 'lockupViewModel');
    if (v) {
      const own = at(v, 'ownerText', 'runs', 0);
      out.push({ id: str(at(v, 'videoId')), title: text(at(v, 'title')), channel: str(at(own, 'text')),
        handle: str(at(own, 'navigationEndpoint', 'browseEndpoint', 'canonicalBaseUrl')).replace(/^\//, ''),
        views: parseViews(text(at(v, 'viewCountText'))), ageDays: parseAgeDays(text(at(v, 'publishedTimeText'))) });
      return;
    }
    if (l) {
      const md = at(l, 'metadata', 'lockupMetadataViewModel');
      const rows = at(md, 'metadata', 'contentMetadataViewModel', 'metadataRows');
      const parts = (Array.isArray(rows) ? rows : []).flatMap((r) => (at(r, 'metadataParts') as unknown[] | undefined) || [])
        .map((p) => ({ t: str(at(p, 'text', 'content')), label: str(at(p, 'accessibilityLabel')) }));
      const views = parts.find((p) => /views?$/i.test(p.label) || /views?$/i.test(p.t));
      const age = parts.find((p) => /ago$/i.test(p.t) || /ago$/i.test(p.label));
      out.push({ id: str(at(l, 'contentId')), title: str(at(md, 'title', 'content')), channel: '', handle: '',
        views: views ? parseViews(views.label || views.t) : null, ageDays: parseAgeDays(age?.t || age?.label) });
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(JSON.parse(m[1]));
  return out.filter((x) => x.id && x.title);
}

/** The exact view count on a watch page, or null. */
export function parseWatchViews(html: string): number | null {
  const m = html.match(/"viewCount":"(\d+)"/);
  return m ? Number(m[1]) : null;
}
