/**
 * kitHtml.ts — renders a KitSpec (kitSpec.ts) into a single self-contained HTML
 * document: the interactive Class Kit teaching deck. No external assets — CSS
 * (kitDeckStyles) and JS (kitDeckScript) are inlined, and the QR is an inline
 * SVG — so the deck opens from a blob URL, a file, or a served endpoint and runs
 * offline. Only the optional live-pulse poll talks to the network.
 *
 * Each slide is a <section> tagged with its segment window + presenter note, so
 * the client's pace tracker and presenter panel work purely from the DOM. All
 * text is HTML-escaped; the QR SVG is our own trusted output and inserted raw.
 */
import { KitSpec, KitSlide } from './kitSpec';
import { DECK_CSS } from './kitDeckStyles';
import { deckScript } from './kitDeckScript';

export interface KitLiveConfig {
  enabled: boolean;
  /** Absolute URL returning the aggregate live state (deck reads). */
  endpoint?: string;
  /** Absolute URL the deck POSTs its current view to (phones mirror it). */
  broadcastEndpoint?: string;
  token?: string;
  pollMs?: number;
}

export interface RenderKitOptions {
  live?: KitLiveConfig;
}

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}
function attr(s: unknown): string { return esc(s); }

function bulletsHtml(bullets: string[] | undefined, cls = 'kpoints'): string {
  if (!bullets || !bullets.length) return '';
  return `<ul class="${cls}">` + bullets.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>';
}

function architectureHtml(bullets: string[] | undefined): string {
  if (!bullets || !bullets.length) return '';
  return '<div class="karch">' + bullets.map((b, i) =>
    `<div class="karch-item"><div class="kn">${i + 1}</div><p>${esc(b)}</p></div>`).join('') + '</div>';
}

function promptHtml(label: string, prompt: string): string {
  return (
    '<div class="kprompt">' +
    '<div class="kprompt-bar"><span class="dots"><i></i><i></i><i></i></span>' +
    `<span>${esc(label)}</span><button class="kcopy" type="button">Copy prompt</button></div>` +
    `<pre data-raw="${attr(prompt)}">${esc(prompt)}</pre>` +
    '</div>'
  );
}

function interactionHtml(slide: KitSlide): string {
  const it = slide.interaction;
  if (!it) return '';
  const kindLabel = it.kind === 'trivia' ? 'Trivia' : it.kind === 'prediction' ? 'Predict' : 'Live poll';
  const opts = it.options
    .map((o, idx) => {
      const letter = String.fromCharCode(65 + idx);
      const isCorrect = typeof it.answer === 'number' && it.answer === idx;
      return `<div class="kopt" data-correct="${isCorrect ? 1 : 0}"><span class="kletter">${letter}</span><span>${esc(o)}</span></div>`;
    })
    .join('');
  const reveal = it.reveal
    ? `<div class="kreveal-line">${esc(it.reveal)}</div><button class="kreveal-btn" type="button">Reveal ${it.kind === 'trivia' ? 'answer' : 'takeaway'}</button>`
    : '';
  return (
    `<div class="keyebrow">${esc(kindLabel)}</div>` +
    `<h2 class="ktitle">${esc(it.q)}</h2>` +
    `<div class="kopts">${opts}</div>` +
    reveal
  );
}

function coverHtml(spec: KitSpec, slide: KitSlide): string {
  const m = spec.meta;
  const chips: string[] = [];
  chips.push(`<div class="kchip"><b>${esc(m.dayLabel)}</b><span>${m.week != null ? 'Week ' + m.week : 'Kickoff'}</span></div>`);
  if (m.intensive) chips.push(`<div class="kchip"><b>${esc(m.intensive.replace(/^Intensive \d+ · /, ''))}</b><span>Focus</span></div>`);
  chips.push(`<div class="kchip"><b>${esc(m.timeRange || (m.durationMin + ' min'))}</b><span>${esc(m.dateLabel.split(',')[0] || 'Class')}</span></div>`);
  const left =
    `<div><div class="keyebrow">${esc(slide.eyebrow || m.cohortName)}</div>` +
    `<h1 class="ktitle">${esc(slide.title)}</h1>` +
    (slide.subtitle ? `<p class="ksub">${esc(slide.subtitle)}</p>` : '') +
    (slide.body ? `<p class="kbody" style="margin-top:1.4vh">${esc(slide.body)}</p>` : '') +
    `<div class="kmeta-row">${chips.join('')}</div></div>`;
  const right =
    `<div><div class="kcover-qr">${m.qrSvg}</div>` +
    `<div class="kcover-qr-label">Scan to check in</div></div>`;
  return `<div class="kcover-grid">${left}${right}</div>`;
}

function assignmentHtml(slide: KitSlide): string {
  const b = slide.brief;
  if (!b) return '';
  const chips = [
    `<span class="kbrf-chip kbrf-diff">🎓 ${esc(b.difficulty)}</span>`,
    b.timeLabel ? `<span class="kbrf-chip">⏱️ ${esc(b.timeLabel)}</span>` : '',
    `<span class="kbrf-chip kbrf-pts">🏆 ${b.points} XP</span>`,
  ].join('');
  const steps = b.steps
    .map((s) => `<div class="kbrf-step"><span class="kbrf-emoji">${esc(s.emoji)}</span><span>${esc(s.text)}</span></div>`)
    .join('');
  const tags = b.tags.length
    ? '<div class="kbrf-tags">' + b.tags.map((t) => `<span class="kbrf-tag">${esc(t)}</span>`).join('') + '</div>'
    : '';
  return (
    `<div class="keyebrow">🎯 Prove it by Friday</div>` +
    `<h2 class="ktitle">${esc(b.headline)}</h2>` +
    `<div class="kbrf-formula">${esc(b.formula)}</div>` +
    `<div class="kbrf-chips">${chips}</div>` +
    `<div class="kbrf-steps">${steps}</div>` +
    `<div class="kbrf-proof">📸 <b>Your proof:</b> ${esc(b.proof)}</div>` +
    tags
  );
}

function slideInnerHtml(spec: KitSpec, slide: KitSlide): string {
  switch (slide.kind) {
    case 'cover':
      return coverHtml(spec, slide);
    case 'assignment':
      return assignmentHtml(slide);
    case 'interaction':
      return interactionHtml(slide);
    case 'rules':
      return (
        (slide.eyebrow ? `<div class="keyebrow">${esc(slide.eyebrow)}</div>` : '') +
        `<h1 class="ktitle">${esc(slide.title)}</h1>` +
        (slide.subtitle ? `<p class="ksub">${esc(slide.subtitle)}</p>` : '') +
        bulletsHtml(slide.bullets, 'kpoints krules')
      );
    case 'architecture':
      return (
        (slide.eyebrow ? `<div class="keyebrow">${esc(slide.eyebrow)}</div>` : '') +
        `<h2 class="ktitle">${esc(slide.title)}</h2>` +
        architectureHtml(slide.bullets)
      );
    case 'prompt': {
      const head = (slide.eyebrow ? `<div class="keyebrow">${esc(slide.eyebrow)}</div>` : '') + `<h2 class="ktitle">${esc(slide.title)}</h2>`;
      return head + (slide.prompt ? promptHtml(slide.prompt.label, slide.prompt.prompt) : '');
    }
    case 'checkpoint': {
      const cp = slide.checkpoint;
      const badge = cp
        ? `<div class="kcp"><div class="kcp-badge"><span>CP</span><b>${cp.n}</b></div><div><h2 class="ktitle" style="font-size:clamp(22px,1.3vw+1.3vh,40px)">${esc(cp.label)}</h2><p class="kbody" style="margin-top:1vh">${esc(cp.detail)}</p></div></div>`
        : '';
      return (slide.eyebrow ? `<div class="keyebrow">${esc(slide.eyebrow)}</div>` : '') + badge;
    }
    case 'broadcast':
      return (
        (slide.eyebrow ? `<div class="keyebrow">${esc(slide.eyebrow)}</div>` : '') +
        `<h2 class="ktitle">${esc(slide.title)}</h2>` +
        (slide.body ? `<p class="kbody">${esc(slide.body)}</p>` : '') +
        (slide.bullets ? '<ul class="kbroadcast">' + slide.bullets.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>' : '')
      );
    case 'buildmap':
      return (
        (slide.eyebrow ? `<div class="keyebrow">${esc(slide.eyebrow)}</div>` : '') +
        `<h2 class="ktitle">${esc(slide.title)}</h2>` +
        bulletsHtml(slide.bullets)
      );
    case 'break':
    case 'cta':
    case 'bullets':
    case 'example':
    case 'microbuild':
    case 'failure':
    case 'recovery':
    case 'demos':
    case 'segment':
    default:
      return (
        (slide.eyebrow ? `<div class="keyebrow">${esc(slide.eyebrow)}</div>` : '') +
        `<h2 class="ktitle">${esc(slide.title)}</h2>` +
        (slide.subtitle ? `<p class="ksub">${esc(slide.subtitle)}</p>` : '') +
        (slide.body ? `<p class="kbody">${esc(slide.body)}</p>` : '') +
        bulletsHtml(slide.bullets)
      );
  }
}

function slideSection(spec: KitSpec, slide: KitSlide): string {
  return (
    `<section class="kslide ${esc(slide.kind)}" ` +
    `data-segstart="${attr(slide.segStartMin)}" data-segend="${attr(slide.segEndMin)}" ` +
    `data-seglabel="${attr(slide.segmentLabel)}" data-slidetitle="${attr(slide.title)}" ` +
    `data-tip="${attr(slide.presenterTip || '')}" data-pub="${attr(slide.publicValue || '')}">` +
    `<div class="kinner">${slideInnerHtml(spec, slide)}</div>` +
    '</section>'
  );
}

function timelineHtml(spec: KitSpec): string {
  const total = spec.totalMinutes || 120;
  const colorFor: Record<string, string> = {
    open: '#367895', present: '#5595C8', interact: '#E8920C', build: '#FB2832', break: '#94a3b8', close: '#3C7A26',
  };
  const bars = spec.segments
    .map((s) => {
      const w = ((s.endMin - s.startMin) / total) * 100;
      return `<span class="seg" style="width:${w.toFixed(2)}%;background:${colorFor[s.mode] || '#5595C8'}"></span>`;
    })
    .join('');
  return `<div class="kpace-timeline">${bars}<span class="now" id="kpacenow" style="left:0%"></span></div>`;
}

/** Render the full self-contained Class Kit deck for a session. */
export function renderKitHtml(spec: KitSpec, opts: RenderKitOptions = {}): string {
  const m = spec.meta;
  const live = opts.live || { enabled: false };
  // Per-slide broadcast metadata: what each phone should show when the deck is on
  // this slide (status controller by default; the active question; or the Builder
  // Broadcast prompts). poll key = the slide id (deterministic across re-renders).
  const slidesMeta = spec.slides.map((s) => {
    const phase = s.kind === 'interaction' && s.interaction ? 'question' : s.kind === 'broadcast' ? 'broadcast' : 'status';
    const question = s.kind === 'interaction' && s.interaction
      ? {
          key: s.id, kind: s.interaction.kind, q: s.interaction.q, options: s.interaction.options,
          answer: typeof s.interaction.answer === 'number' ? s.interaction.answer : null, revealed: false,
        }
      : null;
    return {
      id: s.id, phase, title: s.title, segment_label: s.segmentLabel,
      question,
      broadcast_prompts: s.kind === 'broadcast' ? spec.builderBroadcastPrompts : undefined,
    };
  });

  const data = {
    meta: { sessionId: m.sessionId, sessionNumber: m.sessionNumber, dayLabel: m.dayLabel },
    segments: spec.segments.map((s) => ({ id: s.id, label: s.label, startMin: s.startMin, endMin: s.endMin, mode: s.mode })),
    slides: slidesMeta,
    totalMinutes: spec.totalMinutes,
    live,
  };

  const slidesHtml = spec.slides.map((s) => slideSection(spec, s)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Class Kit · ${esc(m.dayLabel)} · ${esc(m.title)}</title>
<style>${DECK_CSS}</style>
</head>
<body>
<div id="kprogress"></div>

<div class="ktoggles">
  <button class="ktoggle" id="t-rail" title="Toggle the live pulse rail">Pulse</button>
  <button class="ktoggle" id="t-notes" title="Presenter notes (N)">Notes</button>
  <button class="ktoggle" id="t-compact" title="Compact for side-by-side with Claude Code (C)">Compact</button>
  <button class="ktoggle" id="t-qr" title="Full-screen QR (Q)">QR</button>
  <button class="ktoggle" id="t-mark" title="Mark this moment (M)">Mark</button>
  <button class="ktoggle" id="t-download" title="Download clip list (D)">Clips</button>
  <button class="ktoggle" id="t-print" title="Print (P)">Print</button>
</div>

<div class="kstage">
${slidesHtml}
</div>

<aside id="krail">
  <div class="krail-head"><span>Class pulse</span><span class="krail-live off" id="kraillive">STANDBY</span></div>
  <div class="krail-stats"><b id="kp-present">0</b> checked in · <b id="kp-participated">0</b> participating</div>
  <div class="kpulse-grid">
    <div class="kpulse here"><b id="kp-here">0</b><span>here</span></div>
    <div class="kpulse building"><b id="kp-building">0</b><span>building</span></div>
    <div class="kpulse stuck"><b id="kp-stuck">0</b><span>stuck</span></div>
    <div class="kpulse finished"><b id="kp-finished">0</b><span>finished</span></div>
  </div>
  <div class="kpoll" id="kpoll" style="display:none"></div>
  <div class="kfeedback go" id="kfeedback">Start the class clock and share your screen.</div>
  <div class="kq-head">Questions from the room</div>
  <div class="kq-list" id="kqlist"><div class="kq-empty">No questions yet. Students ask from their phones.</div></div>
</aside>

<div id="kpace">
  <button class="kstart" id="kstart" type="button">Start class</button>
  <div class="kpace-clock" id="kpaceclock">00:00</div>
  <div class="kpace-seg" id="kpaceseg"><b>Not started</b>press Start class when you begin</div>
  ${timelineHtml(spec)}
  <div class="kpace-status idle" id="kpacestatus">READY</div>
</div>

<div id="knotes"></div>
<div id="ktoast"></div>

<div id="kqr-overlay">
  <div class="box">${m.qrSvg}</div>
  <div class="u">Scan to check in &amp; connect your phone</div>
  <div class="hint">${esc(m.checkinUrl)} · tap anywhere to close</div>
</div>

<div id="kcounter">1 / ${spec.slides.length}</div>
<div id="khint">→ next · N notes · C compact · Q qr · M mark · S start</div>

<script>window.__KIT__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
<script>${deckScript()}</script>
</body>
</html>`;
}
