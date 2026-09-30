/**
 * teachingGuideSlides.ts — renders ONE slide of a KitSpec as a teaching-guide
 * card: what is on the screen, what kind of moment it is, the instructor's own
 * direction split out of the authored script, the prompt (if any), and the
 * vocabulary the slide uses.
 *
 * Split out of teachingGuideHtml.ts so that file stays a composer of sections
 * and both stay under the size ceiling — same split as kitHtml/kitBuildBay.
 *
 * Everything here is DERIVED from fields the deck already authors. Nothing is
 * invented and nothing is a second copy of content that lives elsewhere, so a
 * guide can never drift away from the class it describes.
 */
import { KitSlide, KitSpec, SlideKind } from './kitSpec';
import { esc } from './kitRenderUtils';
import { GuideTerm, termsIn } from './teachingGuideTerms';

/**
 * One plain-English sentence per slide kind — the "what are we actually doing
 * on this one" line. Written for someone reading before class who wants to
 * know what this type of moment asks of them, not what this specific slide says.
 */
export const KIND_EXPLAINER: Record<SlideKind, string> = {
  cover: 'The title card. Nothing to teach — this is where you press Start class so the pace bar begins tracking you.',
  rules: 'The one-minute housekeeping slide. Everyone scans the QR and their phone becomes the class controller. Wait until you see people scanning before moving on.',
  segment: 'A segment opener. It frames the next block of the class in one line — say it, do not read the whole thing out.',
  bullets: 'A straight teaching slide. Talk to the points; do not read them aloud one by one.',
  architecture: 'An architecture slide. Walk the diagram node by node — the picture is the lesson, the words are the caption.',
  example: 'A worked example, pulled apart. Show what works, then show exactly where it fails and why.',
  microbuild: 'A short hands-on step inside a teaching block. Everyone does it at once; it should take minutes, not the whole segment.',
  teach: 'A deep teaching slide: a paragraph of real explanation, the key points, and usually a diagram or a prompt attached.',
  prompt: 'A guided-build step. Paste the prompt on screen, narrate the decision rather than every character, run it, then show the result.',
  checkpoint: 'A checkpoint. The whole room clears this before anybody moves on — verify it out loud rather than assuming.',
  buildmap: 'The map of the build. Walk the boxes left to right, then point at the rescue branch so nobody feels stranded later.',
  interaction: 'A question that appears on everyone’s phone. Take the responses, read the spread out loud, then reveal.',
  failure: 'A deliberate break. Do not hide the error — this controlled failure is the highest-retention moment of the class.',
  recovery: 'The repair. Narrate the diagnosis out loud; this is where architecture thinking gets taught, not syntax.',
  demos: 'Student demonstrations. Call on the people who tapped “I finished” — peer proof lands harder than another slide from you.',
  broadcast: 'The Builder Broadcast. Everyone records 30–60 seconds on their phone using the sentence-starters on screen.',
  break: 'The break. Use it to clear the “stuck” queue on your phone rail — this is the only unscheduled repair window in the class.',
  cta: 'The close. The last thing the room sees, so say it deliberately rather than trailing off.',
  presenterOnly: 'A presenter-only note. This never goes on the shared screen — it is direction for you.',
  assignment: 'The assignment brief. Read the proof line off the slide rather than from memory; that is the part people get wrong.',
  hook: 'The opening hook. One headline that earns the next two hours. Say it, pause, then move.',
  beforeafter: 'The transformation slide. Let the two columns sit on screen and pause — narrating every row is what kills it.',
  storybeat: 'A full-screen story card. Step back from the keyboard and tell it. Sixty seconds, then move — the build is the argument, not the story.',
};

/**
 * The tagged presenter vocabulary. Mirrors the tag set `splitScript` in
 * kitHtml.ts recognises (SAY/DO/NOTE/SITUATION/ROOM/MOOD/OPEN); if a tag is
 * added there, add it here too. Split into what you SAY and what you DO,
 * because a guide read before class wants those in different places.
 */
const SPOKEN_TAGS = ['SAY', 'OPEN'];
const DIRECTION_TAGS = ['SITUATION', 'ROOM', 'MOOD', 'DO', 'NOTE'];
const ALL_TAGS = [...SPOKEN_TAGS, ...DIRECTION_TAGS];
const TAG_RE = new RegExp(`^(${ALL_TAGS.join('|')}):\\s*`, 'i');

export interface ParsedScript {
  spoken: { tag: string; text: string }[];
  direction: { tag: string; text: string }[];
}

/**
 * Split an authored presenter tip into words-you-say and direction-you-follow.
 * An untagged tip is all direction — the same assumption splitScript makes,
 * for the same reason: the spoken words of an untagged slide are its own body.
 */
export function parseScript(tip: string | undefined): ParsedScript {
  const out: ParsedScript = { spoken: [], direction: [] };
  const lines = (tip || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return out;
  const tagged = lines.filter((l) => TAG_RE.test(l));
  if (!tagged.length) {
    out.direction.push({ tag: 'NOTE', text: lines.join(' ') });
    return out;
  }
  for (const line of tagged) {
    const m = line.match(TAG_RE);
    if (!m) continue;
    const tag = m[1].toUpperCase();
    const text = line.slice(m[0].length).trim();
    if (!text) continue;
    (SPOKEN_TAGS.includes(tag) ? out.spoken : out.direction).push({ tag, text });
  }
  return out;
}

/** Factual, derived-only badges. Nothing here is a judgement about the slide. */
export function flagsFor(slide: KitSlide): string[] {
  const f: string[] = [];
  if (slide.prompt) f.push(slide.prompt.kind === 'review' ? 'read' : 'run');
  if (slide.interaction?.theater) f.push('theater');
  if (slide.interaction && slide.interaction.answer != null) f.push('answer');
  if (slide.diagram) f.push('diagram');
  return f;
}

/** Everything the term matcher should look at for one slide. */
export function slideText(slide: KitSlide): string {
  return [
    slide.eyebrow, slide.title, slide.subtitle, slide.body,
    ...(slide.bullets || []),
    slide.prompt?.label, slide.prompt?.prompt, slide.prompt?.expectedResult,
    slide.prompt?.stopCondition, slide.prompt?.rescue,
    slide.interaction?.q, ...(slide.interaction?.options || []), slide.interaction?.reveal,
    slide.checkpoint?.label, slide.checkpoint?.detail,
    slide.punch, slide.presenterTip,
    ...(slide.beforeAfter?.before || []), ...(slide.beforeAfter?.after || []),
  ].filter(Boolean).join(' \n ');
}

function tagBlock(t: { tag: string; text: string }): string {
  return `<div class="tag t-${t.tag.toLowerCase()}"><span class="tk">${esc(t.tag)}</span>${esc(t.text)}</div>`;
}

/** "What is on the screen" — the room's view, assembled from the slide's own fields. */
function screenHtml(slide: KitSlide): string {
  const parts: string[] = [];
  if (slide.subtitle) parts.push(`<p>${esc(slide.subtitle)}</p>`);
  if (slide.body) parts.push(`<p>${esc(slide.body)}</p>`);
  if (slide.bullets?.length) {
    parts.push('<ul class="bul">' + slide.bullets.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>');
  }
  if (slide.checkpoint) {
    parts.push(`<div class="kv"><div class="kk">Checkpoint ${esc(slide.checkpoint.n)}</div>` +
      `<div><b>${esc(slide.checkpoint.label)}</b> — ${esc(slide.checkpoint.detail)}</div></div>`);
  }
  if (slide.beforeAfter) {
    const col = (label: string, items: string[], good: boolean) =>
      `<div><div class="kk">${esc(label)}</div><ul class="bul" style="padding-left:18px">` +
      items.map((i) => `<li${good ? ' style="color:#2F7A3E;font-weight:600"' : ''}>${esc(i)}</li>`).join('') +
      '</ul></div>';
    parts.push('<div class="ba">' + col('Before', slide.beforeAfter.before, false) +
      col('After', slide.beforeAfter.after, true) + '</div>');
  }
  if (slide.brief) {
    const b = slide.brief;
    const rows: [string, string][] = [
      ['Deliverable', b.steps.map((s) => s.text).join(' · ')],
      ['Proof', b.proof],
      ['Formula', b.formula],
      ['Difficulty', `${b.difficulty}${b.timeLabel ? ' · ' + b.timeLabel : ''} · ${b.points} pts`],
    ];
    parts.push('<div class="kv">' + rows.filter((r) => r[1])
      .map((r) => `<div class="kk">${esc(r[0])}</div><div>${esc(r[1])}</div>`).join('') + '</div>');
  }
  if (slide.interaction) {
    const q = slide.interaction;
    parts.push(`<p><b>${esc(q.q)}</b></p><div class="opts">` +
      q.options.map((o, i) =>
        `<div class="opt${q.answer === i ? ' right' : ''}">${esc(o)}</div>`).join('') + '</div>');
    if (q.reveal) parts.push(`<div class="tag t-say"><span class="tk">On reveal</span>${esc(q.reveal)}</div>`);
  }
  if (slide.punch) parts.push(`<div class="tag t-say"><span class="tk">Punch line</span>${esc(slide.punch)}</div>`);
  if (!parts.length) parts.push('<p>A title-only slide — the words are yours.</p>');
  return parts.join('');
}

/** The Build Bay content, read as a page rather than as a panel. */
function promptHtmlBlock(slide: KitSlide): string {
  const p = slide.prompt;
  if (!p) return '';
  const isPaste = p.kind !== 'review';
  const chip = isPaste
    ? `<span class="b f-run">Paste into ${esc(p.pasteWhere || 'Claude Code')}${p.ccMode ? ' · ' + esc(p.ccMode) : ''}</span>`
    : '<span class="b f-read">Read together — nobody pastes this</span>';
  const rows: [string, string | undefined][] = [
    ['You should see', p.expectedResult],
    ['Stop when', p.stopCondition],
    ['If it misfires', p.rescue],
  ];
  const kv = rows.filter((r) => r[1]);
  return `<div class="codelab">${chip} ${esc(p.label)}</div>` +
    `<pre class="code ${isPaste ? 'paste' : 'review'}">${esc(p.prompt)}</pre>` +
    (kv.length
      ? '<div class="kv">' + kv.map((r) => `<div class="kk">${esc(r[0])}</div><div>${esc(r[1])}</div>`).join('') + '</div>'
      : '');
}

export interface SlideCardResult {
  html: string;
  terms: GuideTerm[];
}

/**
 * Render one slide card. `n` is the 1-based position in the deck, which is what
 * the instructor actually counts by when they are looking for "the slide after
 * the break" — slide ids are not unique across kinds and never should be
 * renumbered (the live poll key IS the slide id).
 */
export function renderSlideCard(slide: KitSlide, n: number, spec: KitSpec): SlideCardResult {
  const seg = spec.segments.find((s) => s.id === slide.segmentId);
  const script = parseScript(slide.presenterTip);
  const flags = flagsFor(slide);
  const authored = slide.definitions || [];
  // Authored per-slide definitions win; the shared dictionary fills the gap for
  // every week that does not author any (which, today, is all of them but W5).
  const matched = termsIn(slideText(slide), authored.length ? 4 : 8)
    .filter((t) => !authored.some((d) => d.term.toLowerCase() === t.term.toLowerCase()));

  const body: string[] = [];
  body.push(`<div class="kindline">${esc(KIND_EXPLAINER[slide.kind] || 'A slide in the deck.')}</div>`);
  body.push(`<div class="blk screen"><div class="k">What is on the screen</div>${screenHtml(slide)}</div>`);

  if (script.direction.length) {
    body.push('<div class="blk doing"><div class="k">Your direction — before you click</div>' +
      script.direction.map(tagBlock).join('') + '</div>');
  }
  if (script.spoken.length) {
    body.push('<div class="blk"><div class="k">Words you say out loud</div>' +
      script.spoken.map(tagBlock).join('') + '</div>');
  }
  if (seg) {
    const purpose = seg.purpose.replace(/\.\s*$/, '');
    body.push(`<div class="blk why"><div class="k">Why it sits here</div><p>` +
      `<b>${esc(seg.label)}</b> · ${Math.round(seg.startMin)}–${Math.round(seg.endMin)} min — ` +
      `${esc(purpose)}.</p></div>`);
  }
  if (slide.diagram) {
    body.push(`<div class="mer"><div class="cap">${esc(slide.diagramCaption || 'On screen: the diagram')}</div>` +
      `<pre class="mermaid">${esc(slide.diagram)}</pre></div>`);
  }
  body.push(promptHtmlBlock(slide));

  if (authored.length || matched.length) {
    const chips = [
      ...authored.map((d) => `<button class="term" data-term="${esc(slugify(d.term))}">${esc(d.term)}</button>`),
      ...matched.map((t) => `<button class="term" data-term="${esc(slugify(t.term))}">${esc(t.term)}</button>`),
    ].join('');
    body.push(`<div class="blk"><div class="k">Terms on this slide</div><div class="terms">${chips}</div></div>`);
  }
  if (slide.evidence?.length) {
    body.push('<div class="call info"><div class="k">Sourced claims on this slide</div><p>' +
      slide.evidence.map((e) => `${esc(e.claim)} <i>(${esc(e.publisher)}${e.publicationDate ? ', ' + esc(e.publicationDate) : ''})</i>`)
        .join('<br/>') + '</p></div>');
  }

  const flagHtml = flags.map((f) => `<span class="b f-${f}">${esc(FLAG_LABEL[f] || f)}</span>`).join('');
  const html =
    `<article class="card" id="s${n}" data-kind="${esc(slide.kind)}" data-flags="${esc(flags.join(' '))}"` +
    ` style="border-left-color:${segColor(slide.segmentId)}">` +
    '<div class="chead">' +
    `<div class="num">${n}</div>` +
    '<div class="ctitle">' +
    `<div class="eb">${slide.eyebrow ? esc(slide.eyebrow) + ' · ' : ''}${esc(seg?.label || slide.segmentLabel)}` +
    ` · ${Math.round(slide.segStartMin)}–${Math.round(slide.segEndMin)} min</div>` +
    `<h3>${esc(slide.title)}</h3>` +
    `<div class="badges"><span class="b k-${esc(slide.kind)}">${esc(KIND_BADGE[slide.kind] || slide.kind)}</span>${flagHtml}</div>` +
    '</div><div class="caret">›</div></div>' +
    `<div class="cbody">${body.filter(Boolean).join('')}</div></article>`;

  return { html, terms: matched };
}

const FLAG_LABEL: Record<string, string> = {
  run: 'Prompt to run', read: 'Read together', answer: 'Has a right answer',
  theater: 'Full-screen vote', diagram: 'Diagram',
};

const KIND_BADGE: Record<string, string> = {
  cover: 'Cover', rules: 'House rules', segment: 'Segment opener', bullets: 'Teaching',
  architecture: 'Architecture', example: 'Worked example', microbuild: 'Micro-build',
  teach: 'Teaching slide', prompt: 'Guided prompt', checkpoint: 'Checkpoint', buildmap: 'Build map',
  interaction: 'Phone question', failure: 'Deliberate break', recovery: 'Recovery',
  demos: 'Student demos', broadcast: 'Broadcast', break: 'Break', cta: 'Close',
  presenterOnly: 'Presenter only', assignment: 'Assignment', hook: 'Hook',
  beforeafter: 'Before / after', storybeat: 'Story card',
};

/** Stable per-segment accent, so a card's left edge says which block it is in. */
const SEG_COLORS: Record<string, string> = {
  'cold-open': '#7C4DBE', checkin: '#2E6B84', 'business-problem': '#C20E1E',
  architecture: '#2563EB', deconstruct: '#B5710A', reset: '#94A3B8',
  'micro-build': '#2563EB', challenge: '#B5710A', trivia: '#B5710A', trailer: '#7C4DBE',
  'result-preview': '#7C4DBE', readiness: '#2E6B84', 'build-map': '#FB2832',
  'guided-build': '#2563EB', failure: '#B5710A', demos: '#2F7A3E', broadcast: '#2F7A3E',
  cta: '#C20E1E', welcome: '#2E6B84', 'big-picture': '#C20E1E', platform: '#2563EB', setup: '#2F7A3E',
};
export function segColor(id: string): string { return SEG_COLORS[id] || '#94A3B8'; }

export function slugify(t: string): string {
  return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
