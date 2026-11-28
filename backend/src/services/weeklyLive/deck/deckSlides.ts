import type { DeckSlide } from './deckBlueprint';

/**
 * One slide's HTML for a generated Weekly Live deck (WL4.2), generalized from the hand-built Session 3
 * deck's body() (backend/src/scripts/session-decks/nov2026-session3-followalong/build.js). The markup
 * and class names are the same, so deckStyles.ts styles both and the in-deck script finds the same
 * hooks ([data-qr], [data-checkin], [data-present], data-poll, [data-claude], [data-copy], data-oh).
 *
 * Content comes from the blueprint; the only fixed copy is the platform's own how-to (check in, copy a
 * prompt, vote). Photos are handed in by the renderer, at most one per slide, never repeated.
 */
export const esc = (s: unknown): string => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export interface SlideContext {
  /** "Monday, December 7" */
  dateLabel: string;
  episode: string;
  photo: { src: string; alt: string } | null;
  /** Hands-on position: 1-based number and the total. */
  handsOn: { n: number; of: number } | null;
  agenda: { title: string; sub: string; min: number; hot: boolean }[];
  nextWeek: { question: string; promise: string };
}

const brand = (sec: string, white = false) => `<div class="brandbar"><div class="wordmark${white ? ' white' : ''}"></div><span class="bsec">${esc(sec)}</span></div>`;
const kicker = (s: DeckSlide) => (s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : '');
const head = (s: DeckSlide, tag: 'h1' | 'h2' = 'h2') => `<${tag}>${esc(s.headline)}${s.highlight ? `<br><span class="red">${esc(s.highlight)}</span>` : ''}</${tag}>`;
const sub = (t: string) => (t ? `<p class="sub">${esc(t)}</p>` : '');
const points = (xs: string[]) => (xs.length ? `<ul class="points">${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const photoBox = (c: SlideContext, h = '66vh') => (c.photo ? `<div class="photo" style="height:${h}"><img src="${esc(c.photo.src)}" alt="${esc(c.photo.alt)}"></div>` : '');
/** Two columns when there is a photo, one when the set has run out. */
const split = (left: string, c: SlideContext, h?: string) => (c.photo ? `<div class="split"><div>${left}</div>${photoBox(c, h)}</div>` : `<div>${left}</div>`);
const promptCard = (s: DeckSlide) => (s.prompt ? `<div class="pcard"><div class="ph"><span>${esc(s.prompt.label)}</span><span class="expect">On everyone's phone too</span></div><pre>${esc(s.prompt.text)}</pre>
  <div class="pf"><a class="runbtn" data-claude target="_blank" rel="noopener">▶ Open in Claude</a><button class="runbtn ghost" data-copy>Copy</button>${s.prompt.expect ? `<span class="expect">You should see: ${esc(s.prompt.expect)}</span>` : ''}</div></div>` : '');
const HOWTO = '<div class="howto"><div><b>1</b>Copy it on your phone, or click Open in Claude</div><div><b>2</b>Paste it into a new Claude chat and send</div><div><b>3</b>Tap <b style="display:inline;font-size:1em">Finished</b> when Claude answers</div></div>';
const LOBBY = `<div class="ways">
        <div class="way"><div class="big">📱</div><h3>On your phone</h3><div class="bigqr" data-qr style="width:min(26vh,250px);height:min(26vh,250px)"></div>
          <ol><li>Point your camera at the code</li><li>Type your name and email</li><li>Keep the page open all class</li></ol></div>
        <div class="way"><div class="big">💻</div><h3>On your computer</h3><div class="url" data-checkin></div>
          <ol><li>Click the link in the Zoom chat</li><li>Type your name and email</li><li>Click <b>Open as a side window</b> so the class keeps the rest of your screen</li></ol>
          <div class="counter-row"><span>In the room</span><div class="count" data-present>0</div></div></div>
      </div>`;
const CHAIN_COLORS = ['var(--cherry)', 'var(--berry)', 'var(--leaf)'];

function body(s: DeckSlide, c: SlideContext): string {
  switch (s.kind) {
    case 'title': return `${brand(`Weekly Live · ${c.episode}`)}${split(`<div class="kicker">${esc(c.dateLabel)} · 6:30 PM Central</div>${head(s, 'h1')}${sub(s.body)}`, c)}`;
    case 'lobby': return `${brand('Get connected')}${kicker(s)}${head(s)}${LOBBY}`;
    case 'agenda': return `${brand("Tonight's plan")}<div class="center" style="max-width:1080px;width:100%;margin:0 auto">${kicker(s)}<h2 style="margin-bottom:1.4vh">${esc(s.headline)}</h2><div style="width:100%">${c.agenda
      .map((r, k) => `<div class="agrow${r.hot ? ' hot' : ''}"><span class="n">${k + 1}</span><span class="t">${esc(r.title)}${r.sub ? `<span>${esc(r.sub)}</span>` : ''}</span><span class="mins">${r.min} min</span></div>`).join('')}</div></div>`;
    case 'story': return `${brand('A story')}${split(`${kicker(s)}${head(s)}${s.bullets.length ? `<ul class="storybox">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}${sub(s.body)}`, c)}`;
    case 'statement': return `<div class="center mid">${kicker(s)}<h1>${esc(s.headline)}${s.highlight ? `<br><u>${esc(s.highlight)}</u>` : ''}</h1>${s.body ? `<p class="sub" style="margin-top:4vh">${esc(s.body)}</p>` : ''}</div>`;
    case 'teach': return `${brand(s.title)}${split(`${kicker(s)}${head(s)}${sub(s.body)}${points(s.bullets)}`, c)}`;
    case 'handson': {
      const pos = c.handsOn ? `Hands-on ${c.handsOn.n} of ${c.handsOn.of}` : 'Hands-on';
      return `${brand(pos)}<div class="split"><div class="hstack"><div><div class="stepbadge">✋ ${esc(pos)}</div>${head(s)}${HOWTO}${s.body ? `<div class="raffle" style="margin-top:2vh">${esc(s.body)}</div>` : ''}</div>${photoBox(c, 'auto')}</div>${promptCard(s)}</div>`;
    }
    case 'mistake': return `${brand(s.title)}${kicker(s)}${head(s)}${s.pair ? `<div class="vs"><div class="desc no"><small>❌ Not this</small><p>${esc(s.pair.no)}</p></div><div class="desc yes"><small>✅ This</small><p>${esc(s.pair.yes)}</p></div></div>` : ''}${sub(s.body)}`;
    case 'chain': return `${brand(s.title)}${kicker(s)}${head(s)}<div class="chain">${s.steps
      .map((x, k) => `<div class="link" style="background:${CHAIN_COLORS[k % 3]}"><div class="ic">${esc(x.icon)}</div><b>${esc(x.label)}</b><span>${esc(x.text)}</span></div>`).join('<div class="arrow">→</div>')}</div>`;
    case 'hotseat': return `${brand('Your turn')}<div class="split"><div class="hstack"><div><div class="stepbadge">🙋 Hot seat</div>${head(s)}${sub(s.body)}</div>${photoBox(c, 'auto')}</div>${promptCard(s)}</div>`;
    case 'recap': return `${brand('Recap')}${kicker(s)}<h2>${esc(s.headline)}</h2><div class="three">${s.bullets.map((b, k) => `<div><div class="n">${k + 1}</div><p>${esc(b)}</p></div>`).join('')}</div>`;
    case 'next': return `${brand('Next Monday')}${split(`<div class="kicker">Next Monday · 6:30 PM Central</div><h2>${esc(c.nextWeek.question)}</h2><p class="sub">${esc(c.nextWeek.promise)}</p><ul class="points"><li>Questions now? <b>Type them on your phone or computer</b>, they show up here</li></ul>`, c)}`;
    default: return '';
  }
}

/** The <section> for one slide. Poll slides are drawn by the in-deck script from their data attributes. */
export function section(s: DeckSlide, k: number, c: SlideContext): string {
  if (s.kind === 'poll' && s.poll) {
    const p = s.poll;
    return `<section class="slide poll" data-idx="${k}" data-poll="${esc(p.key)}" data-kind="${esc(p.kind)}" data-q="${esc(p.q)}" data-options='${esc(JSON.stringify(p.options)).replace(/'/g, '&#39;')}'${p.answer !== null ? ` data-answer="${p.answer}"` : ''}${p.reveal ? ` data-reveal="${esc(p.reveal)}"` : ''}></section>`;
  }
  const cls = s.kind === 'statement' ? 'slide statement wm' : 'slide wm';
  return `<section class="${cls}" data-idx="${k}"${s.kind === 'lobby' ? ' data-oh="lobby"' : ''}>${body(s, c)}</section>`;
}

/** Slide kinds that show a photo when one is left. */
export const PHOTO_KINDS: ReadonlySet<DeckSlide['kind']> = new Set(['title', 'story', 'teach', 'handson', 'hotseat', 'next']);
