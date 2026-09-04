/**
 * teachingGuideHtml.ts — renders a KitSpec as the pre-class TEACHING GUIDE:
 * a long-form document an instructor reads (or prints) before teaching, that
 * walks every slide in order and says, in plain language, what is on screen,
 * what they are doing on it, why it sits where it does, and which terms it uses.
 *
 * It is the third view of one session's content, and deliberately a different
 * job from the other two:
 *   • the DECK (kitHtml.ts)      — what the room sees while you teach
 *   • the OUTLINE (outlineHtml)  — a one-line-per-slide lesson plan to scan
 *   • the GUIDE (this file)      — the full pre-class read, slide by slide
 *
 * Pure and deterministic: KitSpec in, HTML string out. No DB, no I/O, no clock.
 * The same session always renders the same document, so it is safe to cache,
 * diff, download, and unit test.
 */
import { KitSpec, KitSlide } from './kitSpec';
import { esc } from './kitRenderUtils';
import { GUIDE_CSS, guideScript } from './teachingGuideStyles';
import { renderSlideCard, segColor, slugify } from './teachingGuideSlides';
import { GuideTerm, TERM_CATEGORY_LABEL } from './teachingGuideTerms';
import { WEEK_CLASS_CONTENT } from '../../data/classSessionPlan';
import { weekPack } from '../../data/weekPacks';

/** Minutes as an HH:mm offset from the start of class, for the gantt. */
function clock(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * The workload badge for a segment.
 *
 * Slides ÷ minutes was the obvious metric and it is actively misleading: it
 * called Week 6's 50-minute guided build (12 slides) "roomy" and the 5-minute
 * opening (5 slides) "dense", which is the exact inverse of where a build day
 * actually runs long. What costs time is not slides, it is the room having to
 * make something work — so the badge counts PROMPTS TO RUN, and falls back to
 * the run-of-show mode for segments that have none.
 */
function workload(slides: KitSlide[], mode: string): { label: string; color: string } {
  const runs = slides.filter((s) => s.prompt && s.prompt.kind !== 'review').length;
  if (runs >= 3) return { label: `${runs} prompts · crunch`, color: '#C20E1E' };
  if (runs > 0) return { label: `${runs} prompt${runs === 1 ? '' : 's'} · hands on`, color: '#B5710A' };
  return { label: MODE_LABEL[mode] || mode, color: '#2F7A3E' };
}

const MODE_LABEL: Record<string, string> = {
  open: 'Open', present: 'You talk', interact: 'They answer',
  build: 'They build', break: 'Break', close: 'Close',
};

/** The "what is this class about" paragraph, from the authored week content. */
function overviewHtml(spec: KitSpec): string {
  const { week, dayKind } = spec.meta;
  const wc = week != null ? WEEK_CLASS_CONTENT.find((w) => w.week === week) : undefined;
  const parts: string[] = [];
  if (!wc) {
    parts.push('<p>This session has no week content pack, so the guide below is built from the ' +
      'run of show and the slides themselves. Read the segment purposes — they carry the intent.</p>');
    return parts.join('');
  }
  if (dayKind === 'architecture') {
    parts.push(`<p>${esc(wc.monday.tension)}</p>`);
    parts.push(`<p><b>Where it lands:</b> ${esc(wc.monday.payoffPreview)}</p>`);
    parts.push('<p><b>The five beats you are teaching:</b></p><ul class="bul">' +
      wc.monday.architectureBeats.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>');
    parts.push(`<p><b>The example you pull apart:</b> ${esc(wc.monday.realExample)}</p>`);
  } else if (dayKind === 'build') {
    parts.push(`<p><b>What every student leaves with:</b> ${esc(wc.thursday.resultPreview)}</p>`);
    parts.push(`<p><b>They are ready to build if:</b> ${esc(wc.thursday.readinessCheck)}</p>`);
    parts.push('<p><b>The checkpoints:</b></p><ul class="bul">' +
      wc.thursday.buildMap.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>');
    parts.push(`<p><b>What you break on purpose:</b> ${esc(wc.thursday.failureInjection)} ` +
      `<b>And the repair:</b> ${esc(wc.thursday.recovery)}</p>`);
  }
  parts.push(`<p><b>Owed by Friday:</b> ${esc(wc.assignment.title)}. <b>Proof:</b> ${esc(wc.assignment.proof)}</p>`);
  return parts.join('');
}

/** A mermaid flow of this session's own segments — generated, never authored. */
function segmentFlow(spec: KitSpec): string {
  const segs = spec.segments.filter((s) => s.id !== 'reset');
  const nodes = segs.map((s, i) => {
    const n = spec.slides.filter((x) => x.segmentId === s.id).length;
    return `  S${i}["${esc(s.label)}<br/>${Math.round(s.startMin)}-${Math.round(s.endMin)} min · ${n} slides"]`;
  });
  const edges = segs.slice(1).map((_, i) => `  S${i} --> S${i + 1}`);
  return ['flowchart LR', ...nodes, ...edges].join('\n');
}

/**
 * Duration picture of the run of show. Deliberately unstyled — an earlier
 * version marked build segments `crit`, which rendered the whole chart in
 * alarm red and made the one genuinely tight block impossible to pick out.
 * Colour lives on the rail above, where it means something.
 */
function ganttChart(spec: KitSpec): string {
  const rows = spec.segments.map((s, i) => {
    const label = s.label.replace(/[:#,]/g, ' ').replace(/\s+/g, ' ').trim();
    return `  ${label} :t${i}, ${clock(s.startMin)}, ${Math.max(1, Math.round(s.endMin - s.startMin))}m`;
  });
  return ['gantt', '  dateFormat HH:mm', '  axisFormat %H:%M', '  todayMarker off',
    '  title How the minutes are actually divided', '  section Run of show', ...rows].join('\n');
}

function statsHtml(spec: KitSpec): string {
  const s = spec.slides;
  const cells: [string, number, string][] = [
    ['Slides', s.length, 'sig'],
    ['Segments', spec.segments.length, ''],
    ['Minutes', spec.totalMinutes, ''],
    ['Prompts to run', s.filter((x) => x.prompt && x.prompt.kind !== 'review').length, 'ok'],
    ['Read together', s.filter((x) => x.prompt && x.prompt.kind === 'review').length, ''],
    ['Phone questions', s.filter((x) => x.interaction).length, 'warn'],
    ['Story cards', s.filter((x) => x.kind === 'storybeat').length, ''],
    ['Diagrams', s.filter((x) => x.diagram).length, ''],
  ];
  return '<div class="stats">' + cells.map(([l, n, c]) =>
    `<div class="stat ${c}"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`).join('') + '</div>';
}

function railHtml(spec: KitSpec): string {
  return '<div class="rail" id="rail">' + spec.segments.map((seg) => {
    const slides = spec.slides.filter((x) => x.segmentId === seg.id);
    if (!slides.length) return '';
    const first = spec.slides.indexOf(slides[0]) + 1;
    const d = workload(slides, seg.mode);
    return `<button class="rnode" data-first="s${first}" style="border-top-color:${segColor(seg.id)}">` +
      `<div class="t">${Math.round(seg.startMin)}–${Math.round(seg.endMin)} min</div>` +
      `<div class="v">${esc(seg.label)}</div>` +
      `<div class="m">${slides.length} slide${slides.length === 1 ? '' : 's'} · ${Math.round(seg.endMin - seg.startMin)} min</div>` +
      `<div class="c" style="color:${d.color}">${esc(d.label)}</div></button>`;
  }).join('') + '</div>';
}

/** The glossary: only the terms this session actually uses. */
function glossaryHtml(used: Map<string, { plain: string; cat: string }>): string {
  if (!used.size) return '';
  const rows = [...used.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return '<div class="gloss">' + rows.map(([term, v]) =>
    `<div class="gcard" id="g-${esc(slugify(term))}">` +
    `<span class="cat">${esc(v.cat)}</span><div class="t">${esc(term)}</div>` +
    `<div class="plain">${esc(v.plain)}</div></div>`).join('') + '</div>';
}

const FILTERS: [string, string][] = [
  ['all', 'All slides'], ['teach', 'Teaching'], ['run', 'Prompts to run'],
  ['interaction', 'Phone questions'], ['storybeat', 'Story cards'],
  ['checkpoint', 'Checkpoints'], ['diagram', 'Diagrams'],
];

function chipsHtml(spec: KitSpec): string {
  const count = (f: string): number => {
    if (f === 'all') return spec.slides.length;
    if (f === 'run') return spec.slides.filter((s) => s.prompt && s.prompt.kind !== 'review').length;
    if (f === 'diagram') return spec.slides.filter((s) => s.diagram).length;
    return spec.slides.filter((s) => s.kind === f).length;
  };
  return '<div class="chips" id="chips">' +
    FILTERS.filter(([f]) => count(f) > 0).map(([f, label]) =>
      `<button class="chip${f === 'all' ? ' active' : ''}" data-f="${f}">${esc(label)}<span class="ct">${count(f)}</span></button>`).join('') +
    '<span class="spacer"></span>' +
    '<button class="chip" id="expandAll">Expand all</button>' +
    '<button class="chip" id="collapseAll">Collapse all</button></div>';
}

/**
 * Render the full teaching guide for one session.
 *
 * @param spec the built KitSpec — the same one the deck renders from, so the
 *   guide and the deck can never describe different classes.
 */
export function renderTeachingGuide(spec: KitSpec): string {
  const m = spec.meta;
  const pack = weekPack(m.week);
  const arc = pack?.arcBeat || '';

  // Render the cards first: they tell us which terms this session actually uses,
  // so the glossary carries only what is on the page rather than the whole
  // dictionary. Authored per-slide definitions are folded in the same way.
  const used = new Map<string, { plain: string; cat: string }>();
  const cards = spec.slides.map((slide: KitSlide, i: number) => {
    const r = renderSlideCard(slide, i + 1, spec);
    for (const t of r.terms as GuideTerm[]) {
      if (!used.has(t.term)) used.set(t.term, { plain: t.plain, cat: TERM_CATEGORY_LABEL[t.category] });
    }
    for (const d of slide.definitions || []) {
      if (!used.has(d.term)) used.set(d.term, { plain: d.meaning, cat: 'This session' });
    }
    return r.html;
  }).join('');

  const title = `Session ${m.sessionNumber} · Teaching Guide — ${m.title}`;
  const subtitle = [m.dateLabel, m.timeRange].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${GUIDE_CSS}</style></head>
<body>

<div class="bar"><div class="wrap">
  <div class="brand"><span class="mark"></span><span>Session ${esc(m.sessionNumber)} · Teaching Guide<small>${esc(m.cohortName)}</small></span></div>
  <nav class="barnav">
    <a href="#overview">The class</a>
    <a href="#timeline">Timeline</a>
    <a href="#walkthrough">Slide by slide</a>
    ${used.size ? '<a href="#glossary">Terms</a>' : ''}
  </nav>
</div><div class="pline" id="pline"></div></div>

<header class="hero"><div class="wrap">
  <div class="eyebrow">${esc([m.cohortName, m.dayLabel, subtitle].filter(Boolean).join(' · '))}</div>
  <h1>${esc(m.title)}</h1>
  ${arc ? `<p class="thesis">${esc(arc)}</p>` : ''}
  <div class="metaline">
    <span class="pill on">${esc(m.dayLabel)}</span>
    ${m.week != null ? `<span class="pill">Week ${esc(m.week)}</span>` : ''}
    ${m.intensive ? `<span class="pill">${esc(m.intensive)}</span>` : ''}
    <span class="pill">Read this before class</span>
  </div>
  ${statsHtml(spec)}
</div></header>

<section id="overview"><div class="wrap">
  <div class="head">
    <div class="eyebrow">Read this first</div>
    <h2>What this class is, in one screen</h2>
    <p class="lede">Everything below is detail. If you read only one section before you walk in, read this one.</p>
  </div>
  <div class="prose">${overviewHtml(spec)}</div>
  <div class="mer"><div class="cap">The shape of the session</div>
    <pre class="mermaid">${esc(segmentFlow(spec))}</pre></div>
</div></section>

<section id="timeline"><div class="wrap">
  <div class="head">
    <div class="eyebrow">Pacing</div>
    <h2>The ${esc(spec.totalMinutes)} minutes, and where you will lose them</h2>
    <p class="lede">Click a segment to jump to its first slide. The badge counts the prompts the room has
      to actually get working in that block — so “crunch” is where you will run long, and everything else
      is you talking or them answering.</p>
  </div>
  ${railHtml(spec)}
  <div class="mer"><div class="cap">Run of show</div>
    <pre class="mermaid">${esc(ganttChart(spec))}</pre></div>
</div></section>

<section id="walkthrough" style="padding-bottom:16px"><div class="wrap">
  <div class="head">
    <div class="eyebrow">The main event</div>
    <h2>Slide by slide, in the order they appear</h2>
    <p class="lede">One card per slide. Click to open it: what is on screen, what that kind of moment asks
      of you, your own direction split out of the script, the prompt if there is one, and the terms it uses.</p>
  </div>
</div></section>

<div class="controls"><div class="wrap">${chipsHtml(spec)}</div></div>
<div class="wrap"><div class="deck" id="deck">${cards}</div></div>

${used.size ? `<section id="glossary"><div class="wrap">
  <div class="head">
    <div class="eyebrow">Plain English</div>
    <h2>Every term this session uses, explained once</h2>
    <p class="lede">If a student asks “what does that word mean”, this is the sentence to give them.
      Clicking a term chip in the walkthrough jumps here.</p>
  </div>
  ${glossaryHtml(used)}
</div></section>` : ''}

<footer><div class="wrap">
  <p><b>${esc(title)}</b>${subtitle ? ' · ' + esc(subtitle) : ''}.
  Generated from this session's own Class Kit — the same spec the ▶ Present deck renders from, including any
  Customize overrides saved for this session. Nothing here is a second copy of the content, so the guide
  cannot drift away from the class it describes.</p>
  <p style="margin-top:9px">Read it before class. During class, your phone still carries the live presenter notes.</p>
</div></footer>

<button class="backtop" id="backtop" title="Back to top">&#8593;</button>
<script type="module">${guideScript()}</script>
</body></html>`;
}
