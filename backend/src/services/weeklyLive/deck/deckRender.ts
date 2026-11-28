import { createHash } from 'crypto';
import type { DeckSlide, SessionBlueprint } from './deckBlueprint';
import { deckScript } from './deckScript';
import { esc, PHOTO_KINDS, section, type SlideContext } from './deckSlides';
import { deckCss } from './deckStyles';

/**
 * Blueprint -> the two files the Present kit stores as kit_config_json.customDeck (WL4.2):
 *   html       the deck: slides, #deckdata (do, say, read, clip, follow card, prompt, reveal per slide)
 *              and the in-deck script, so Present, the presenter side window, the follow-along
 *              broadcast, the QR dock and Run-it-here work exactly as on the hand-built decks;
 *   guideHtml  the teaching guide: run of show with clock times, what to do, say and read, every
 *              prompt and poll, and the clip sheet for Piyush.
 *
 * Deterministic: the same blueprint, session and site address always give byte-identical files (no
 * clock, no randomness; the photo order is seeded from the blueprint itself). Photos are site URLs,
 * at most one per slide and never repeated; when the set runs out a slide is drawn without one.
 */
export interface RenderInput { blueprint: SessionBlueprint; title: string; episode: string; dateLabel: string; siteUrl: string; }
export interface RenderedDeck { html: string; guideHtml: string; photos: string[]; }

/**
 * Photos already served by the site (frontend/public), each looked at and described as it is. Left out
 * on purpose: img/data-dashboard.jpg (a chart of percentages: no statistics on graphics),
 * img/architect-plan.jpg (a screen capture with a person on video), img/certificate.jpg (same shoot as
 * workshop.jpg), img/book-cover.jpg (too small). Ali's portrait opens the deck; the .png is the sharp one.
 */
export const HOST_PHOTO = { path: '/ali-muwwakkil.png', alt: 'Ali Muwwakkil' };
export const PHOTO_SET: readonly { path: string; alt: string }[] = [
  { path: '/img/team-collab.jpg', alt: 'Three people working together on laptops at a table' },
  { path: '/img/developer-code.jpg', alt: 'Someone writing code on a laptop' },
  { path: '/img/workshop.jpg', alt: 'A small team gathered around a laptop' },
  { path: '/img/mentor-coaching.jpg', alt: 'A mentor going over work on a laptop with a group' },
  { path: '/img/online-presentation.jpg', alt: 'A woman explaining something on a video call from home' },
  { path: '/img/ai-network.jpg', alt: 'A close-up of a circuit board' },
  { path: '/img/handshake-deal.jpg', alt: 'Two people shaking hands' },
  { path: '/img/presentation.jpg', alt: 'A man speaking into a microphone' },
  { path: '/img/outcome-builder.jpg', alt: 'A man working at his desk' },
  { path: '/img/member-home.jpg', alt: 'A woman working at a laptop' },
  { path: '/hero-bg-team.jpg', alt: 'Two colleagues looking at code on a laptop' },
];

const seedOf = (bp: SessionBlueprint) => parseInt(createHash('sha256').update(bp.promise + bp.slides.map((s) => s.title).join('|')).digest('hex').slice(0, 8), 16);

/** Which photo each slide gets. Exported so the "never repeated" rule is tested on its own. */
export function assignPhotos(bp: SessionBlueprint): ({ path: string; alt: string } | null)[] {
  const start = seedOf(bp) % PHOTO_SET.length;
  const pool = [...PHOTO_SET.slice(start), ...PHOTO_SET.slice(0, start)];
  return bp.slides.map((s, k) => {
    if (k === 0 && s.kind === 'title') return HOST_PHOTO;
    return PHOTO_KINDS.has(s.kind) && s.kind !== 'title' ? pool.shift() ?? null : null;
  });
}

/** Agenda rows: consecutive slides of the same kind merge; the deck's own chrome is left out. */
export function agendaRows(slides: DeckSlide[]): SlideContext['agenda'] {
  const rows: SlideContext['agenda'] = [];
  let last: DeckSlide['kind'] | null = null;
  for (const s of slides) {
    if (s.kind === 'title' || s.kind === 'lobby' || s.kind === 'agenda') continue;
    const kind: DeckSlide['kind'] | null = s.kind === 'poll' ? last : s.kind;
    const prev = rows[rows.length - 1];
    if (prev && kind === last) { prev.min += s.min; continue; }
    rows.push({ title: s.title, sub: s.kicker, min: s.min, hot: s.kind === 'handson' || s.kind === 'hotseat' });
    last = kind;
  }
  return rows;
}

const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export function renderDeck(input: RenderInput): RenderedDeck {
  const { blueprint: bp, siteUrl } = input;
  const asset = (p: string) => `${siteUrl.replace(/\/+$/, '')}${p}`;
  const photos = assignPhotos(bp);
  const used = photos.filter((p): p is { path: string; alt: string } => p !== null).map((p) => p.path);
  if (new Set(used).size !== used.length) throw new Error('a photo was used twice'); // the build-time check
  const handsOnTotal = bp.slides.filter((s) => s.kind === 'handson').length;
  const agenda = agendaRows(bp.slides);
  let n = 0;
  const sections = bp.slides.map((s, k) => {
    const p = photos[k];
    return section(s, k, {
      dateLabel: input.dateLabel, episode: input.episode, agenda, nextWeek: bp.nextWeek,
      photo: p ? { src: asset(p.path), alt: p.alt } : null,
      handsOn: s.kind === 'handson' ? { n: ++n, of: handsOnTotal } : null,
    });
  });
  const data = bp.slides.map((s) => ({
    title: s.title, min: s.min, do: s.do, say: s.say, read: s.read, clip: s.clip,
    follow: { heading: s.follow.heading, ...(s.follow.step ? { step: s.follow.step } : {}), ...(s.follow.icon ? { icon: s.follow.icon } : {}), ...(s.follow.body ? { body: s.follow.body } : {}), ...(s.follow.bullets.length ? { bullets: s.follow.bullets } : {}) },
    prompt: s.prompt ? { label: s.prompt.label, text: s.prompt.text, expect: s.prompt.expect } : null,
    reveal: s.poll?.reveal ?? '',
  }));
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="weekly-live-studio">
<title>Weekly Live · ${esc(input.title)}</title>
<style>${deckCss(asset)}</style>
</head>
<body>
<div id="progress"></div>
<div id="counter"></div>
<div id="hint">← → navigate · P presenter window · N notes · Q show QR</div>
<div id="livepill">REHEARSAL · LIVE OFF</div>
<button id="pnbtn" type="button">🗒️ Open presenter window (P)</button>
<div id="notes"></div>
${sections.join('\n')}
<script type="application/json" id="deckdata">${safeJson(data)}</script>
${deckScript()}
</body>
</html>
`;
  return { html, guideHtml: renderGuide(input), photos: used };
}

const GUIDE_CSS = `body{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#1a202c;max-width:980px;margin:0 auto;padding:28px 18px 60px;background:#faf7f5}
h1{font-size:30px;margin:0 0 6px} .lead{color:#64748b;margin:0 0 22px}
.row{display:grid;grid-template-columns:90px 1fr;gap:16px;background:#fff;border:1px solid #e8e2de;border-radius:16px;padding:16px;margin:12px 0}
.row.poll{border-left:6px solid #367895} .row.prompt{border-left:6px solid #FB2832}
.when{font-weight:800;font-size:20px} .when span{display:block;font-size:12px;color:#64748b;font-weight:600}
.tag{font-size:11px;font-weight:800;letter-spacing:2px;color:#E5121D;text-transform:uppercase} h2{font-size:20px;margin:4px 0 8px}
.do{color:#1d4fd8} .read{background:#f1f5f9;border-radius:10px;padding:10px 12px} .clip{background:#fdf0dd;border-radius:10px;padding:10px 12px;color:#5f3803}
pre{background:#0f1720;color:#e7eef6;border-radius:10px;padding:12px;white-space:pre-wrap;font-size:13px}
li.right{font-weight:800;color:#2f6b16} .ph{color:#64748b;font-size:14px}
.clips{background:#fff;border:2px solid #E8920C;border-radius:16px;padding:16px 20px} .clips li{margin:10px 0}`;

function renderGuide(input: RenderInput): string {
  const s = input.blueprint.slides;
  let clock = 0;
  const rows = s.map((x, k) => {
    const at = clock; clock += x.min;
    return `<section class="row${x.poll ? ' poll' : ''}${x.prompt ? ' prompt' : ''}"><div class="when">${at}:00<span>~${x.min} min</span></div><div class="b">
    <div class="tag">Slide ${k + 1}${x.poll ? ` · ${x.poll.kind.toUpperCase()}` : ''}${x.prompt ? ' · HANDS-ON' : ''}</div><h2>${esc(x.title)}</h2>
    ${x.do ? `<p class="do"><b>Do:</b> ${esc(x.do)}</p>` : ''}
    <ul>${x.say.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    ${x.read ? `<p class="read"><b>Read:</b> ${esc(x.read)}</p>` : ''}
    ${x.clip ? `<p class="clip"><b>🎬 Clip line:</b> “${esc(x.clip)}”</p>` : ''}
    ${x.prompt ? `<pre>${esc(x.prompt.text)}</pre>` : ''}
    ${x.poll ? `<p><b>On their phones:</b> ${esc(x.poll.q)}</p><ol type="A">${x.poll.options.map((o, j) => `<li${j === x.poll!.answer ? ' class="right"' : ''}>${esc(o)}</li>`).join('')}</ol>${x.poll.reveal ? `<p class="read"><b>Reveal:</b> ${esc(x.poll.reveal)}</p>` : ''}` : ''}
    <p class="ph"><b>Their screen says:</b> ${esc(x.follow.heading)}</p>
  </div></section>`;
  }).join('\n');
  const clips = s.map((x, k) => (x.clip ? `<li><b>Slide ${k + 1} · ${esc(x.title)}</b><br>“${esc(x.clip)}”</li>` : '')).filter(Boolean).join('');
  const prompts = s.filter((x) => x.prompt).length; const polls = s.filter((x) => x.poll).length;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teaching Guide · ${esc(input.title)}</title><style>${GUIDE_CSS}</style></head><body>
<h1>Teaching Guide: ${esc(input.title)}</h1>
<p class="lead">Weekly Live · ${esc(input.episode)} · ${esc(input.dateLabel)}, 6:30 PM Central · ${clock} minutes · ${s.length} slides, ${prompts} hands-on prompts, ${polls} live votes. Press P in the deck for the presenter window.</p>
<h2>🎬 Clip sheet for Piyush</h2><ol class="clips">${clips}</ol>
<h2>Sound bites</h2><ol>${input.blueprint.soundBites.map((b) => `<li>${esc(b.text)} <span class="ph">(slide ${b.slide + 1})</span></li>`).join('')}</ol>
<h2 style="margin-top:28px">Run of show</h2>
${rows}
</body></html>
`;
}
