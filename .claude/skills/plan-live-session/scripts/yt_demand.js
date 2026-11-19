#!/usr/bin/env node
/**
 * yt_demand.js: Stage 1.4 demand evidence from YouTube's public pages. YouTube renders with
 * JavaScript, so a web-fetch tool sees an empty page; the data is in the `ytInitialData` JSON the
 * page embeds, which a plain HTTP GET returns. No API key.
 *
 *   node yt_demand.js search "mcp server tutorial" [--limit=10]
 *        videos for the query: title, channel handle, views, age, URL (last-90-days filter is yours:
 *        read `age`; YouTube's relative ages like "3 weeks ago" are what the page gives)
 *   node yt_demand.js channel @TechWithTim [--n=10] [--min-age-days=14]
 *        the channel's N most recent uploads at least 14 days old, and their median views (the
 *        "channel median"); newer uploads are still accruing views and would skew it low
 *   node yt_demand.js video <videoId|url>
 *        exact view count and publish date for one video
 *   add --json for machine-readable output
 *
 * Record every URL this prints that you rely on in `sources` (fetchedThisRun: true) and in `demand[]`.
 * Exit 1 when YouTube returns no ytInitialData (blocked, consent page, layout change): then say so
 * and fall back to the "no tool returns view counts" rule in SKILL.md.
 */
'use strict';

const args = process.argv.slice(2);
const [cmd, target] = args;
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const asJson = args.includes('--json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', cookie: 'CONSENT=YES+1' } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}
function initialData(html, url) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) { console.error(`yt_demand: no ytInitialData at ${url} (blocked or layout changed)`); process.exit(1); }
  return JSON.parse(m[1]);
}
const txt = (x) => (x ? x.simpleText || (x.runs || []).map((r) => r.text).join('') : '');

/** "1.2M views", "18 thousand views", "134,322 views", "No views" → number or null */
function parseViews(s) {
  if (!s) return null;
  const t = String(s).toLowerCase().replace(/,/g, '');
  if (/no views/.test(t)) return 0;
  const m = t.match(/([\d.]+)\s*(k|m|b|thousand|million|billion)?/);
  if (!m) return null;
  const mult = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 }[m[2]] || 1;
  return Math.round(Number(m[1]) * mult);
}

function collect(data) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      const own = v.ownerText && v.ownerText.runs && v.ownerText.runs[0];
      const handle = own && own.navigationEndpoint && own.navigationEndpoint.browseEndpoint ? own.navigationEndpoint.browseEndpoint.canonicalBaseUrl : '';
      out.push({ id: v.videoId, title: txt(v.title), channel: own ? own.text : '', handle: (handle || '').replace(/^\//, ''),
        viewsText: txt(v.viewCountText), views: parseViews(txt(v.viewCountText)), age: txt(v.publishedTimeText), length: txt(v.lengthText) });
      return;
    }
    if (o.lockupViewModel) {
      const l = o.lockupViewModel;
      const md = l.metadata && l.metadata.lockupMetadataViewModel;
      const rows = (md && md.metadata && md.metadata.contentMetadataViewModel && md.metadata.contentMetadataViewModel.metadataRows) || [];
      const parts = rows.flatMap((r) => r.metadataParts || []).map((p) => ({ text: (p.text && p.text.content) || '', label: p.accessibilityLabel || '' }));
      const v = parts.find((p) => /views?$/i.test(p.label) || /views?$/i.test(p.text)) || {};
      const a = parts.find((p) => /ago$/i.test(p.text) || /ago$/i.test(p.label)) || {};
      out.push({ id: l.contentId, title: md && md.title && md.title.content, viewsText: v.label || v.text || '', views: parseViews(v.label || v.text), age: a.text || '' });
      return;
    }
    for (const k of Object.keys(o)) walk(o[k]);
  })(data);
  return out.filter((v) => v.id && v.title);
}
/** "1d ago", "12 days ago", "2w ago", "3 months ago", "1y ago" → approximate days, or null */
function ageDays(s) {
  const m = String(s || '').toLowerCase().match(/(\d+)\s*(minute|min|hour|h|day|d|week|w|month|mo|year|y)/);
  if (!m) return null;
  const per = { minute: 0, min: 0, hour: 0, h: 0, day: 1, d: 1, week: 7, w: 7, month: 30, mo: 30, year: 365, y: 365 }[m[2]];
  return Number(m[1]) * per;
}
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); if (!s.length) return null; const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2); };

(async () => {
  if (cmd === 'search' && target) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(target)}`;
    const vids = collect(initialData(await get(url), url)).slice(0, Number(opt('limit', '10')))
      .map((v) => ({ ...v, url: `https://www.youtube.com/watch?v=${v.id}` }));
    if (asJson) return console.log(JSON.stringify({ query: target, source: url, videos: vids }, null, 2));
    console.log(`source: ${url}`);
    for (const v of vids) console.log(`${String(v.views ?? '?').padStart(10)}  ${v.age.padEnd(14)} ${v.handle || v.channel}  ${v.title}  ${v.url}`);
  } else if (cmd === 'channel' && target) {
    const h = target.startsWith('@') ? target : `@${target.replace(/^\//, '')}`;
    const url = `https://www.youtube.com/${h}/videos`;
    // Uploads younger than --min-age-days (default 14) have not finished accruing views and drag
    // the median down, which would make an older video look like an outlier.
    const minAge = Number(opt('min-age-days', '14'));
    const all = collect(initialData(await get(url), url));
    const vids = all.filter((v) => ageDays(v.age) == null || ageDays(v.age) >= minAge).slice(0, Number(opt('n', '10')));
    const res = { channel: h, source: url, minAgeDays: minAge, skippedTooNew: all.slice(0, all.indexOf(vids[0])).length, uploads: vids.length, medianViews: median(vids.map((v) => v.views)), videos: vids };
    if (asJson) return console.log(JSON.stringify(res, null, 2));
    console.log(`source: ${url}`);
    for (const v of vids) console.log(`${String(v.views ?? '?').padStart(10)}  ${v.age.padEnd(14)} ${v.title}`);
    console.log(`median of the ${vids.length} most recent uploads at least ${minAge} days old: ${res.medianViews}`);
  } else if (cmd === 'video' && target) {
    const id = (target.match(/(?:v=|youtu\.be\/)([\w-]{11})/) || [null, target])[1];
    const url = `https://www.youtube.com/watch?v=${id}`;
    const html = await get(url);
    const views = (html.match(/"viewCount":"(\d+)"/) || [])[1];
    const date = (html.match(/"publishDate":"([^"]+)"/) || [])[1];
    const title = ((html.match(/<title>(.*?) - YouTube<\/title>/) || [])[1] || '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (!views) { console.error(`yt_demand: no viewCount at ${url}`); process.exit(1); }
    const res = { id, url, title, views: Number(views), publishDate: date || null };
    console.log(asJson ? JSON.stringify(res, null, 2) : `${res.views} views · published ${res.publishDate} · ${title} · ${url}`);
  } else {
    console.error('usage: yt_demand.js search "<query>" [--limit=10] | channel @handle [--n=10] | video <id|url>   [--json]');
    process.exit(1);
  }
})().catch((e) => { console.error(`yt_demand: ${e.message}`); process.exit(1); });

module.exports = { parseViews, median };
