import type { BriefCopy } from './briefSchema';
import type { PromoSlot } from './briefCalendar';

/**
 * Jackie's event brief as one HTML page (WL4.4), in the layout of the approved Ep 2 brief
 * (visual-decisions/2026-11-30-jackie-event-brief-ep2): the event at a glance, paste-ready copy, four
 * thumbnail mock-ups on Ali's approved photos, export sizes, the promotion week and the posts. Light
 * theme only: it is printed to the PDF attached to Jackie's to-do. Deterministic for the same input.
 */
export interface BriefFacts {
  title: string; airLabel: string; times: { zone: string; time: string }[]; episodeLabel: string;
  zoomLink: string; nextLabel: string; siteUrl: string; slots: PromoSlot[]; generatedFor: string;
}

/** Ali's four approved photos (from the approved Ep 2 brief), served by the site. Calm or smiling frames only. */
export const APPROVED_PHOTOS: readonly { path: string; label: string }[] = [
  { path: '/weekly-live/ali-photo-1.jpg', label: 'Warm smile (use for the event)' },
  { path: '/weekly-live/ali-photo-2.jpg', label: 'Calm and confident' },
  { path: '/weekly-live/ali-photo-3.jpg', label: 'Friendly smile' },
  { path: '/weekly-live/ali-photo-4.jpg', label: 'Big smile, close-up' },
];

const esc = (s: unknown): string => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const THEMES: Record<string, { bg: string; fade: string; big: string }> = {
  night: { bg: '#0b1530', fade: 'linear-gradient(90deg,#0b1530 42%,rgba(11,21,48,.6) 62%,rgba(11,21,48,0) 85%)', big: 'font-size:52px' },
  clock: { bg: '#111111', fade: 'linear-gradient(90deg,#111 44%,rgba(17,17,17,.55) 64%,rgba(17,17,17,0) 85%)', big: 'font-size:58px;color:#ff3b30;font-variant-numeric:tabular-nums' },
  event: { bg: '#101a2e', fade: 'linear-gradient(90deg,#101a2e 44%,rgba(16,26,46,.55) 64%,rgba(16,26,46,0) 85%)', big: 'font-size:40px' },
  dawn: { bg: '#1b2550', fade: 'linear-gradient(90deg,#1b2550 0%,#7a3b6b 40%,rgba(240,140,90,.55) 64%,rgba(240,140,90,0) 85%)', big: 'font-size:44px' },
};
const CHIPS = ['c-g', 'c-b', 'c-a', 'c-p'];

const CSS = `:root{--bg:#f6f5f3;--card:#fff;--ink:#15171c;--muted:#5d6370;--line:#e6e3de;--red:#e3202b;--red-soft:#fde8e9;--green:#137a43;--green-soft:#e3f4ea;--amber:#a35a00;--amber-soft:#fdf0dc;--purple:#6b3fd1;--purple-soft:#efe8fd;--blue:#1d4fd8;--blue-soft:#e6edfd}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Inter,system-ui,"Segoe UI",sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:22px 16px 48px}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-top:12px}
h1{font-size:40px;line-height:1.08;margin:8px 0 10px;font-weight:800;letter-spacing:-.02em}h2{font-size:21px;margin:0 0 4px;font-weight:800}
.sub{color:var(--muted);font-size:16px;margin:0;max-width:800px}.sowhat{color:var(--muted);margin:0 0 14px}
section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin-top:16px;break-inside:avoid-page}
.for{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;margin-bottom:10px;background:var(--purple-soft);color:var(--purple)}
.glance{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
.g{border-radius:14px;padding:12px 14px;border-left:6px solid var(--red);background:var(--red-soft)}.g b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--red)}
.g span{font-weight:700;display:block;overflow-wrap:anywhere}.g small{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{font-size:12px;text-transform:uppercase;color:var(--muted);letter-spacing:.06em}td:first-child{font-weight:700;width:210px}
.copy-label{margin:14px 0 6px;font-weight:700}pre{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px;font:14px/1.6 Inter,system-ui,sans-serif;margin:0;overflow-wrap:anywhere}
.thumbs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.th{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);break-inside:avoid}
.th.rec{border:3px solid var(--green)}.frame{position:relative;aspect-ratio:16/9;overflow:hidden;color:#fff}
.frame img{position:absolute;right:0;top:0;height:100%;width:auto}.frame .fade{position:absolute;inset:0}
.frame .txt{position:absolute;left:5%;top:9%;bottom:9%;width:58%;display:flex;flex-direction:column;justify-content:space-between}
.frame .ep{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.9}.frame .ep.tag{background:#e3202b;align-self:flex-start;padding:2px 8px;border-radius:4px;opacity:1}
.frame .big{font-weight:900;line-height:.95;letter-spacing:-.02em}.frame .title{font-weight:800;font-size:16px;line-height:1.15}.frame .when{font-size:11px;font-weight:700}
.frame .logo{position:absolute;right:3%;bottom:5%;font-weight:800;font-size:11px;background:rgba(255,255,255,.92);color:#101a2e;padding:3px 8px;border-radius:6px}
.hl{background:#e3202b;padding:0 .15em;display:inline-block}.th .body{padding:12px 14px;font-size:14px}.th .body b{font-size:15px}
.chip{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;margin:0 4px 4px 0}
.c-g{background:var(--green-soft);color:var(--green)}.c-b{background:var(--blue-soft);color:var(--blue)}.c-a{background:var(--amber-soft);color:var(--amber)}.c-p{background:var(--purple-soft);color:var(--purple)}
.stills{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.stills figure{margin:0;font-size:13px;color:var(--muted)}.stills img{width:100%;border-radius:10px;display:block;margin-bottom:4px}
.week{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.day{border-radius:12px;padding:12px;border-top:6px solid var(--purple);background:var(--purple-soft);font-size:14px;break-inside:avoid}
.day .d{font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--purple)}.day.live{border-color:var(--green);background:var(--green-soft)}.day.live .d{color:var(--green)}
.day.hot{border-color:var(--red);background:var(--red-soft)}.day.hot .d{color:var(--red)}.day p{margin:4px 0 0;color:var(--muted)}.rules li{margin:4px 0}`;

function thumb(t: BriefCopy['thumbnails'][number], k: number, f: BriefFacts): string {
  const th = THEMES[t.theme]; const photo = APPROVED_PHOTOS[k % APPROVED_PHOTOS.length];
  const when = `${f.airLabel} · 6:30 PM CT · Live`;
  return `<div class="th${k === 0 ? ' rec' : ''}"><div class="frame" style="background:${th.bg}"><img src="${esc(f.siteUrl + photo.path)}" alt="Ali Muwwakkil">
    <div class="fade" style="background:${th.fade}"></div><div class="txt"><div class="ep${t.theme === 'event' ? ' tag' : ''}">${esc(t.kicker)}</div>
    <div class="big" style="${th.big}">${esc(t.bigWord)}${t.accent ? `<br><span class="hl">${esc(t.accent)}</span>` : ''}</div>
    <div><div class="title">${esc(t.line)}</div><div class="when">${esc(when)}</div></div></div><div class="logo">colaberry</div></div>
    <div class="body"><span class="chip ${CHIPS[k]}">${k === 0 ? 'Recommended for the event' : esc(`Best for ${t.bestFor}`)}</span><br><b>${k + 1}. "${esc(t.name)}"</b><br>${esc(t.why)} Photo ${k + 1}.</div></div>`;
}

export function renderBrief(copy: BriefCopy, f: BriefFacts): string {
  const posts = new Map(copy.posts.map((p) => [p.slot, p.text]));
  const description = [...copy.description.slice(0, 2), copy.bullets.map((b) => `• ${b}`).join('\n'), ...copy.description.slice(2)].join('\n\n');
  const times = f.times.map((t) => `${t.time} ${t.zone}`);
  const promo = f.slots.map((s) => `<div class="day${s.who === 'Ali' ? ' live' : s.holiday ? ' hot' : ''}"><div class="d">${esc(s.when)}${s.holiday ? ` · ${esc(s.holiday)}` : ''}</div><b>${esc(s.who)}</b><p>${esc(s.task)}</p></div>`).join('');
  const postBlocks = f.slots.filter((s) => posts.has(s.id)).map((s) => `<div class="copy-label">${esc(s.when)}${s.holiday ? ` (${esc(s.holiday)})` : ''}</div><pre>${esc(posts.get(s.id))}</pre>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="weekly-live-studio">
<title>${esc(copy.eventName)} · Event brief</title><style>${CSS}</style></head><body><div class="wrap">
<div class="eyebrow">Colaberry Weekly Live · ${esc(f.episodeLabel)} · ${esc(f.airLabel)}</div>
<h1>${esc(copy.eventName)}</h1><p class="sub">For Jackie: everything to create the Eventbrite event, make the thumbnail and promote the live this week.</p>
<section><span class="for">For Jackie</span><h2>The event at a glance</h2><p class="sowhat">Everything needed to set it up on Eventbrite.</p>
<div class="glance"><div class="g"><b>Event name</b><span>${esc(copy.eventName)}</span><small>Colaberry Weekly Live · ${esc(f.episodeLabel)}</small></div>
<div class="g"><b>When</b><span>${esc(f.airLabel)}</span><small>${esc(times.join(' · '))} · 60 min</small></div>
<div class="g"><b>Where</b><span>Online, live on Zoom</span><small>${esc(f.zoomLink.replace(/^https?:\/\//, ''))}</small></div>
<div class="g"><b>Host</b><span>Ali Muwwakkil</span><small>Live build</small></div></div>
<table><tr><td>Full title for Eventbrite</td><td>${esc(copy.fullTitle)}</td></tr><tr><td>Category / format</td><td>Science &amp; Tech · Online · Class / workshop</td></tr>
<tr><td>Who it is for</td><td>${esc(copy.whoFor)}</td></tr><tr><td>What to bring</td><td>${esc(copy.whatToBring)}</td></tr>
<tr><td>Zoom link (same every week)</td><td>${esc(f.zoomLink)} · Ali's room. The waiting room is on, so people are let in at 6:30.</td></tr>
<tr><td>Registration</td><td>Eventbrite (our record of who registered)</td></tr><tr><td>Next episode</td><td>${esc(f.nextLabel)}, 6:30 PM CT</td></tr></table></section>
<section><span class="for">For Jackie</span><h2>Event description</h2><p class="sowhat">Paste as is. The short version is the Eventbrite summary; the long one is the body.</p>
<div class="copy-label">Summary</div><pre>${esc(copy.summary)}</pre><div class="copy-label">Full description</div><pre>${esc(description)}</pre>
<div class="copy-label">Tags</div><pre>${esc(copy.tags.join(', '))}</pre></section>
<section><span class="for">For Jackie</span><h2>Four thumbnail ideas</h2><p class="sowhat">Each one is a big word, the title, the date and Ali's face. Pick one for the event; the others work as feed posts during the week. Mock-ups to recreate in Canva, not final files.</p>
<div class="thumbs">${copy.thumbnails.map((t, k) => thumb(t, k, f)).join('')}</div>
<div class="copy-label">Sizes to export</div><table><tr><th>Where</th><th>Size</th><th>Notes</th></tr>
<tr><td>Eventbrite banner</td><td>2160 × 1080</td><td>Keep text in the middle 80%; Eventbrite crops the edges on mobile</td></tr>
<tr><td>YouTube / LinkedIn event</td><td>1280 × 720</td><td>The mock-ups above</td></tr><tr><td>Instagram / LinkedIn feed</td><td>1080 × 1080</td><td>Face on top, big word at the bottom</td></tr>
<tr><td>Stories / Reels cover</td><td>1080 × 1920</td><td>Face in the center, title above, date below</td></tr></table>
<div class="copy-label">Photos of Ali (attached to the to-do, full size)</div><div class="stills">${APPROVED_PHOTOS.map((p, k) => `<figure><img src="${esc(f.siteUrl + p.path)}" alt="Ali Muwwakkil">${k + 1} · ${esc(p.label)}</figure>`).join('')}</div></section>
<section><span class="for">For Jackie</span><h2>Promotion week</h2><p class="sowhat">One post a day, then the reminders on the day.</p><div class="week">${promo}</div></section>
<section><span class="for">For Jackie</span><h2>Posts to copy</h2>${postBlocks}</section>
<section><h2>Rules</h2><ul class="rules"><li>Never say the class is free or costs nothing; never show a price.</li><li>No Anthropic or Claude logos, and nothing that suggests a partnership.</li><li>No statistics on graphics. No attendee faces, names or chat in anything public.</li><li>Use the Zoom link above every week; never make a new meeting.</li></ul>
<p class="sowhat" style="margin-top:10px">Generated by Weekly Live Studio for ${esc(f.generatedFor)}.</p></section>
</div></body></html>
`;
}
