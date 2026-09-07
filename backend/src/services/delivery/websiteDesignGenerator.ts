/**
 * websiteDesignGenerator — one real design of their product, not three abstract dashboards.
 *
 * ## What changed and why
 *
 * The first version generated §20's three concepts: Operational, Command Center, Executive.
 * They were product-specific and passed every gate, and they were still the wrong artifact -
 * three variations on an internal dashboard, when what a prospect wants to see is THEIR
 * THING, as a page they could navigate.
 *
 *   "I should see the website design where a user can navigate a one page design. They
 *    should also have a smaller, smart phone view as well. We only need one QR code just
 *    so they can view it on their phone."  (Ali, 2026-09-06)
 *
 * So: one design, generated once, shown at two widths. The two views are the SAME document
 * at different viewports, which is what responsive means - generating two files would let
 * them drift, and a phone view that disagrees with the desktop view is worse than none.
 *
 * ## It has to work without JavaScript
 *
 * A generated document is served under a sandbox CSP that executes nothing, so in-page
 * navigation is anchors and `:target`, not script. That is a real constraint on the design
 * and it is stated in the prompt rather than discovered at render time.
 */

import { chatJson } from '../runtime/runtimeAi';
import {
  executableViolation,
  contactLeakViolation,
  labelViolation,
  craftViolation,
  CONCEPT_LABEL,
  type ConceptContactDetails,
} from './uiConceptGenerator';
import { genericnessViolation, type DesignBrief } from './designBrief';

export interface WebsiteDesign {
  /** What this design is, in one sentence, shown beside it. */
  rationale: string;
  html: string;
}

export type WebsiteDesignResult =
  | { ok: true; design: WebsiteDesign; runtime_ms: number; cost_usd: number }
  | { ok: false; error_class: 'EmptyModelResponse' | 'ContractViolation'; error: string };

/** Fewer in-page links than this is a long page with a header, not a navigable site. */
export const MIN_NAV_LINKS = 3;

/**
 * Whether the page can actually be navigated.
 *
 *     "There's no navigation - it's just a long page no one wants to read through."
 *     "The navigation should be within the page."   (Ali, 2026-09-06 and 2026-09-07)
 *
 * Both complaints are about the same thing and both are decidable. A nav link that points
 * at an id nothing declares is a dead link: the browser does nothing, and on the first
 * version it did something worse - `href="#"` resolves against the FRAMING page, so the
 * click loaded our own page inside the design frame.
 *
 * So: enough in-page links to be navigation, every one of them resolving to a section that
 * exists, and no bare `#` anywhere.
 */
export function navigationViolation(html: string): string | null {
  const source = html || '';

  if (/href\s*=\s*["']#["']/i.test(source)) {
    return 'design has a bare href="#" — that is a dead link, and inside a frame it navigates away from the design';
  }

  const targets = [...source.matchAll(/href\s*=\s*["']#([^"']+)["']/gi)].map((m) => m[1]);
  const unique = [...new Set(targets)];

  if (unique.length < MIN_NAV_LINKS) {
    return `design has ${unique.length} in-page link(s) (needs ${MIN_NAV_LINKS}) — that is a long page with a header, not a navigable site`;
  }

  const ids = new Set([...source.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
  const dead = unique.filter((t) => !ids.has(t));
  if (dead.length) {
    return `design links to ${dead.map((d) => `#${d}`).join(', ')} but nothing on the page has that id — the nav does nothing`;
  }

  return null;
}

/**
 * The exact hexes that mean "nobody chose a colour".
 *
 * Bootstrap's primary and success, the CSS named blue, and the blue every framework's
 * default button has been since 2013. Both models reached for `#007BFF` on a page for older
 * adults walking a city, with the instruction not to sitting directly above it in the
 * prompt. An instruction the output ignores twice is a check, not an instruction.
 *
 * This refuses six specific values, not a hue. A business whose world is genuinely blue can
 * still be blue - it just has to be a blue somebody picked.
 */
const STOCK_COLOURS = ['#007bff', '#0d6efd', '#0069d9', '#28a745', '#198754', '#17a2b8'];

export function stockPaletteViolation(html: string): string | null {
  const source = (html || '').toLowerCase();
  const found = STOCK_COLOURS.filter((c) => source.includes(c));
  if (found.length) {
    return `design uses ${found.join(', ')} — that is a framework default, not a palette chosen for this business`;
  }
  return null;
}

/**
 * A link with no text is a button a person cannot read.
 *
 * gpt-4o produced a header CTA that rendered as a bare blue rectangle. It passed every other
 * gate: the anchor was there, the styling was there, the label was not.
 */
export function emptyLinkViolation(html: string): string | null {
  const anchors = [...(html || '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
  const blank = anchors.filter((m) => !m[1].replace(/<[^>]*>/g, '').trim());
  if (blank.length) {
    return `design has ${blank.length} link(s) with no text — they render as a coloured rectangle nobody can read`;
  }
  return null;
}

/**
 * An `<svg>` with nothing in it.
 *
 * The scaffold shows a mark as `<svg …>…mark…</svg>`, and the model reproduced the shape
 * without the contents: two empty elements that rendered as a blank pink circle in the
 * middle of the product drawing. It is the same failure as an unlabelled button - the
 * element is present, the thing it exists to show is not.
 */
const SVG_CONTENT = /<(path|circle|rect|line|polygon|polyline|ellipse|text|use|g)\b/i;

export function emptySvgViolation(html: string): string | null {
  const svgs = [...(html || '').matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gi)];
  const blank = svgs.filter((m) => !SVG_CONTENT.test(m[1]));
  if (blank.length) {
    return `design has ${blank.length} empty <svg> element(s) — they render as a blank space where a mark should be`;
  }
  return null;
}

/**
 * The house stylesheet, given to the model as a scaffold to fill with THEIR identity.
 *
 * The first exemplar was markup only. Both models copied its class names exactly and then
 * invented their own CSS - Arial and stock Bootstrap blue, content flush to the window edge,
 * a 32px headline, and 200px voids between sections. Which is the lesson: the structure was
 * never the hard part. Craft lives in the stylesheet, so the stylesheet is what has to be
 * shown.
 *
 * Everything here is a value to be REPLACED, and each token says what decision it carries.
 * The layout rules (container, rhythm, type scale) are ours to keep; the identity - colour,
 * type, and every word - is theirs to choose. That split is deliberate: a model asked to
 * design from nothing produces a default, while a model asked to dress a good skeleton
 * spends its effort on the part that should differ per project.
 */
const SCAFFOLD = `<style>
  :root {
    /* REPLACE ALL SEVEN. Pick them from THEIR world - the signage, materials, safety
       colours, uniforms or paperwork the people in this business already look at. */
    --ground: #FBFAF8;      /* page background: an off-white with a hue, never pure #fff */
    --surface: #FFFFFF;     /* cards and raised panels */
    --ink: #10243A;         /* body text: near-black WITH the palette's hue in it */
    --muted: #5B6B7B;       /* secondary text */
    --line: #E3E1DC;        /* hairlines, 1px only */
    --accent: #0F7B55;      /* ONE accent, for the primary action and little else */
    --accent-soft: #E3F1EA; /* the accent at ~10%, for pills and quiet fills */
  }

  /* Type: name two real families. A display face for headings with a different voice from
     the body face is what separates a designed page from a styled document. */
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font: 400 1.0625rem/1.65 "REPLACE-BODY", system-ui, -apple-system, sans-serif;
  }
  h1, h2, h3 { font-family: "REPLACE-DISPLAY", Georgia, serif; letter-spacing: -0.02em; margin: 0 0 0.6rem; }
  h1 { font-size: clamp(2.4rem, 4.5vw, 3.4rem); line-height: 1.05; }
  h2 { font-size: clamp(1.7rem, 2.6vw, 2.3rem); line-height: 1.15; }
  h3 { font-size: 1.05rem; letter-spacing: 0; margin: 0 0 0.35rem; }
  p { margin: 0 0 1rem; }

  /* The container lives on the landmarks themselves, so there is no wrapper div to forget.
     Content is never flush against the window edge and never wider than a page. */
  header, footer, section, .hero { padding-inline: max(2rem, calc((100% - 68rem) / 2)); }

  /* Rhythm: every section on the same vertical beat, separated by a hairline. One band
     inverted, so the page has a shape instead of being one continuous scroll. */
  section { padding-block: 4.5rem; border-top: 1px solid var(--line); }
  .eyebrow { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin: 0 0 0.75rem; }
  .lede, .sub { color: var(--muted); max-width: 46ch; }

  header { border-bottom: 1px solid var(--line); }
  .bar { display: flex; align-items: center; gap: 2rem; padding: 1.1rem 0; }
  .mark { display: flex; align-items: center; gap: 0.55rem; font-family: "REPLACE-DISPLAY", Georgia, serif;
          font-weight: 600; font-size: 1.18rem; color: var(--ink); text-decoration: none; }
  nav.top { margin-left: auto; display: flex; align-items: center; gap: 1.75rem; }
  nav.top a { color: var(--muted); text-decoration: none; font-size: 0.92rem; }
  .bar-cta { flex: 0 0 auto; }

  .btn { display: inline-block; padding: 0.8rem 1.4rem; border-radius: 6px; font-weight: 600;
         font-size: 0.95rem; text-decoration: none; border: 1px solid transparent; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-quiet { background: var(--surface); color: var(--ink); border-color: var(--line); }
  .btn-onDark { background: var(--accent); color: #fff; }
  .cta-row { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }

  .hero { padding-block: 4rem 4.5rem; }
  .hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 3.5rem; align-items: center; }
  .pill { display: inline-block; padding: 0.3rem 0.7rem; border-radius: 999px; background: var(--accent-soft);
          color: var(--accent); font-size: 0.75rem; font-weight: 600; margin: 0 0 1.1rem; }

  /* THE DRAWING OF THE PRODUCT. Give it a real frame and a real screen. Replace the fields
     with the ones THIS product would show. */
  .device { justify-self: center; width: 100%; max-width: 20rem; border: 10px solid var(--ink);
            border-radius: 2.25rem; background: var(--ink); padding: 0.5rem; }
  .screen { background: var(--surface); border-radius: 1.75rem; padding: 1.5rem 1.25rem; }
  .screen-label { font-size: 0.8rem; color: var(--muted); margin: 0 0 0.15rem; }
  .screen-dest { font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line); }
  .screen-figure { display: grid; place-items: center; width: 7rem; height: 7rem; margin: 0 auto 1rem;
                   border-radius: 50%; background: var(--accent-soft); }
  .screen-headline { font-size: 1.8rem; font-weight: 700; text-align: center; margin: 0 0 0.2rem; }
  .screen-sub { text-align: center; color: var(--muted); margin: 0 0 1.25rem; }
  .screen-meta { font-size: 0.92rem; color: var(--muted); margin: 0 0 1.1rem; padding-top: 1rem; border-top: 1px solid var(--line); }
  .screen-btn { display: block; text-align: center; padding: 0.85rem; border-radius: 8px;
                background: var(--ink); color: var(--ground); font-weight: 600; }

  .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5rem; margin-top: 2.5rem; }
  .num { font-size: 0.8rem; color: var(--muted); margin: 0 0 0.5rem; }
  .step p:last-child { color: var(--muted); font-size: 0.95rem; margin: 0; }

  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5rem; align-items: center; }
  /* The artifact the other audience receives, shown rather than described. */
  .notice { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 1.25rem 1.4rem; }
  .notice-from { font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin: 0 0 0.6rem; }
  .notice-body { margin: 0 0 0.35rem; }
  .notice-time { font-size: 0.85rem; color: var(--muted); margin: 0; }

  .close { background: var(--ink); border-top: 0; }
  .close h2, .close p { color: var(--ground); }
  .close .eyebrow { color: var(--muted); }

  footer { padding-block: 1.75rem 2.5rem; }
  .concept-note { font-size: 0.78rem; color: var(--muted); margin: 0; }

  @media (max-width: 52rem) {
    header, footer, section, .hero { padding-inline: 1.25rem; }
    .hero-grid, .split, .steps { grid-template-columns: 1fr; gap: 2.5rem; }
    /* The drawing of the product comes FIRST on a phone: it is the thing being sold. */
    .device { order: -1; }
    /* The nav does NOT disappear. It moves to its own row and scrolls sideways if it must. */
    .bar { flex-wrap: wrap; gap: 0.85rem 1rem; }
    nav.top { order: 3; width: 100%; margin-left: 0; overflow-x: auto; padding-top: 0.7rem; border-top: 1px solid var(--line); }
    nav.top a { white-space: nowrap; }
    .bar-cta { margin-left: auto; }
    section { padding-block: 3rem; }
  }
</style>

<header>
  <div class="bar">
    <a class="mark" href="#top"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="var(--accent)"></circle><path d="M8 13.5 L12 7 L16 13.5 L12 11.6 Z" fill="#fff"></path></svg> Wayfinder</a>
    <nav class="top">
      <a href="#how">How it works</a>
      <a href="#family">For families</a>
      <a href="#access">Built for reading</a>
    </nav>
    <a class="btn btn-primary bar-cta" href="#start">Get started</a>
  </div>
</header>

<main id="top">
  <div class="hero">
    <div class="hero-grid">
      <div>
        <p class="pill">Concept — illustrative only</p>
        <h1>Get there on your own.</h1>
        <p class="sub">Step-free routes, one turn at a time, in type you can actually read.
           Your family hears when you arrive — and only then.</p>
        <div class="cta-row"><a class="btn btn-primary" href="#start">Start a walk</a>
          <a class="btn btn-quiet" href="#family">Set it up for someone</a></div>
      </div>

      <!-- THE PRODUCT ITSELF, DRAWN. Not a stock photo, not a grey rectangle: the actual
           screen, with real content from their domain on it. -->
      <div class="device">
        <div class="screen">
          <p class="screen-label">Going to</p>
          <p class="screen-dest">Elm Street Library</p>
          <div class="screen-figure"><svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M30 10 L14 24 L30 38" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path></svg></div>
          <p class="screen-headline">Turn left</p>
          <p class="screen-sub">onto Market Street</p>
          <p class="screen-meta">Step-free the whole way<br>7 minutes to go</p>
          <span class="screen-btn">I'm here</span>
        </div>
      </div>
    </div>
  </div>

  <section id="how">
    <p class="eyebrow">How it works</p>
    <h2>Three things, and nothing else on the screen.</h2>
    <p class="lede">Every screen asks for one thing and shows one thing.</p>
    <div class="steps">
      <div class="step"><p class="num">01</p><h3>Say where you are going</h3><p>Type it or say it.</p></div>
      <div class="step"><p class="num">02</p><h3>Follow one turn at a time</h3><p>A single instruction, in large type.</p></div>
      <div class="step"><p class="num">03</p><h3>Arrive, and they know</h3><p>Your contact hears that you got there.</p></div>
    </div>
  </section>

  <section id="family" class="split">
    <div>
      <p class="eyebrow">For families</p>
      <h2>Quiet on the good days.</h2>
      <p>You do not get a map of where your mother is. You get one line when she arrives.</p>
    </div>
    <!-- The artifact the other audience actually receives, shown rather than described. -->
    <div class="notice"><p class="notice-from">WAYFINDER</p>
      <p class="notice-body">Mum arrived at Elm Street Library.</p><p class="notice-time">Today, 10:42</p></div>
  </section>

  <section id="access">…third audience, same shape…</section>

  <section id="start" class="close">
    <p class="eyebrow">Get started</p>
    <h2>Set it up once, for someone who will use it every week.</h2>
    <a class="btn btn-onDark" href="#top">Set up Wayfinder</a>
  </section>
</main>

<footer><p class="concept-note">Concept — illustrative only. Not a working product.</p></footer>`;

/**
 * The design instructions. Deterministic, so the prompt behind any design can be
 * reconstructed rather than guessed at.
 */
export function buildWebsiteDesignPrompt(brief: DesignBrief): string {
  return [
    `Design the actual website for a real product: ${brief.project_title}.`,
    '',
    'This is a ONE-PAGE site that a visitor can navigate end to end. Not a dashboard, not a mockup of an admin panel — the page this business would put on the internet.',
    '',
    'WHAT THEY TOLD US',
    brief.roles.length ? `Who it is for: ${brief.roles.join(' | ')}` : '',
    brief.workflows.length ? `What happens: ${brief.workflows.join(' | ')}` : '',
    brief.actions.length ? `What they want: ${brief.actions.join(' | ')}` : '',
    brief.surfaces.length ? `Surfaces discussed: ${brief.surfaces.join(' | ')}` : '',
    '',
    `THEIR VOCABULARY — use these words on the page: ${brief.distinctive_terms.join(', ')}`,
    brief.not_discussed.length ? `NEVER DISCUSSED, so do not invent it: ${brief.not_discussed.join(', ')}.` : '',
    '',
    'RETURN STRICT JSON: { "rationale": "<one sentence on what this design is>", "html": "<the complete page>" }',
    '',
    'THE PAGE MUST HAVE:',
    '- A header with the product name, in-page navigation links to the sections below, and one primary action.',
    '- A hero that says what this does for the person using it, in their language, not in marketing language.',
    '- THE PRODUCT ITSELF, DRAWN, in the hero. Not a stock illustration and not a grey placeholder box: the actual screen a person would look at, built out of your own HTML and CSS (a device frame, a card, a panel) with REAL CONTENT FROM THEIR DOMAIN on it. This is the single thing that separates a page about a product from a page that shows one.',
    '- A "how it works" section with the real steps, in order.',
    '- A section for each audience you were told about, saying what they get — and where that audience receives something (a message, a report, a receipt, an alert), SHOW THAT ARTIFACT rather than describing it.',
    '- A closing call to action that matches what this business would actually ask for.',
    '- Section ids that the header links to, so the nav works.',
    '',
    'RULES THAT ARE CHECKED MECHANICALLY AND WILL REJECT THE DESIGN:',
    `- It must contain the word "${CONCEPT_LABEL}" visibly, so nobody mistakes it for a live product.`,
    '- NO <script>, no inline event handlers (onclick and friends), no javascript: URLs, no iframes. It is served sandboxed and none of it would run.',
    '- In-page navigation must therefore be plain anchor links to section ids. Do not write a single line of JavaScript.',
    '- No email addresses and no phone numbers anywhere. Invent nothing that looks like contact details.',
    '- It must use at least two of their words verbatim. A generic template with renamed headers will be refused.',
    `- At least ${MIN_NAV_LINKS} in-page nav links, and EVERY ONE must point at a section id that exists on the page. A link to an id nothing declares does nothing when clicked.`,
    '- NEVER write href="#" on its own. The page is shown inside a frame, where a bare "#" navigates away from the design entirely.',
    '',
    'RESPONSIVE, AND THIS IS NOT OPTIONAL:',
    'The same document is shown at 1280px and at 390px. It must be genuinely good at BOTH.',
    '- Use CSS grid or flex with wrapping, never fixed pixel widths on containers.',
    '- At 390px: one column, type stays at least 15px, nothing scrolls sideways.',
    '- DO NOT HIDE THE NAVIGATION ON A PHONE. `display: none` on the nav links is how a one-page site becomes the long scroll nobody reads, and there is no JavaScript here to open a menu. Move the links to their own row under the brand and let that row scroll sideways if it has to.',
    '- On a phone, put the drawing of the product ABOVE the headline. It is the thing being sold; it should not be below the fold.',
    '- Use a media query rather than hoping it reflows.',
    '',
    'CRAFT. THIS IS THE LAST THING THEY SEE BEFORE DECIDING WHETHER TO PAY.',
    '- Name TWO real font families, a display face for headings and a different body face, each with a fallback stack. Arial, Helvetica and Times are not choices, they are what you get when nobody chose.',
    '- A real type scale: distinct sizes and weights for hero, section heading, body and label. The hero headline should be genuinely large — around 3rem on a desktop — and short enough to fit two lines.',
    '- Consistent spacing on a rhythm (4 / 8 / 16 / 24 / 48px), and generous section padding. Cramped is the tell.',
    '- A restrained palette: one neutral ground, one text colour, ONE accent, and a hairline for rules. No stock green and blue buttons.',
    '- CHOOSE THE PALETTE FROM THEIR WORLD, not from a template. What do the people in this business already look at all day — signage, safety colours, paper forms, a workshop, a kitchen, a ward, a warehouse? Take it from there. Default SaaS blue on white says nobody thought about it.',
    '- Give the page a spine: sections separated by hairline rules or alternating grounds, one section band inverted (dark ground, light type) so the page has a rhythm instead of being one continuous scroll.',
    '- Inline CSS in a <style> block. No external stylesheets, fonts, scripts or images.',
    '- No emoji as icons. If you need a mark, draw it in inline SVG — with real path/circle/rect elements and explicit coordinates. An <svg> with nothing inside it renders as a blank hole in the page and will be refused.',
    '',
    'Write real copy for this specific business. Placeholder text, lorem ipsum, and "Feature One / Feature Two" are failures. Headlines should say something true and specific about this business, not "Streamline your workflow".',
    '',
    'START FROM THIS SCAFFOLD.',
    'The stylesheet below is the house layout: container, vertical rhythm, type scale, the',
    'phone breakpoint. KEEP those rules. They are why the page will not come out flush against',
    'the window edge with 200px voids between sections.',
    '',
    'Then make it THEIRS, and this is the part that is actually being judged:',
    `- Replace every value in :root. Choose the palette from ${brief.project_title}'s own world.`,
    '- Replace REPLACE-DISPLAY and REPLACE-BODY with two real font families you name explicitly,',
    '  each with a fallback stack. Do not link to a font file; name families and fall back.',
    '- Replace every word. The copy below belongs to a different business and is there to show',
    '  the register, not to be reused. A page that reads like this one with the nouns swapped is',
    '  the exact failure this example exists to prevent.',
    '- Draw THEIR product in the hero, not a walking-directions screen.',
    '- Add whatever sections this business needs. The scaffold is a floor, not a ceiling.',
    '',
    SCAFFOLD,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Generate the design, checked before it is returned.
 *
 * Runs the same gates as the concept generator - a design is a concept with a bigger job,
 * and the reasons those gates exist do not change because the artifact got more ambitious.
 */
export async function generateWebsiteDesign(params: {
  brief: DesignBrief;
  contact?: ConceptContactDetails;
  max_tokens?: number;
  /**
   * Which model draws it. Undefined means DEFAULT_MODEL, so nothing changes by adding this;
   * it exists so the choice can be measured on a real brief instead of argued about.
   */
  model?: string;
}): Promise<WebsiteDesignResult> {
  const system = buildWebsiteDesignPrompt(params.brief);

  const { parsed, runtime_ms, cost_usd } = await chatJson(
    'website-design',
    system,
    `Design the one-page site for ${params.brief.project_title}.`,
    params.model,
    // A whole page needs room. Too small a budget truncates mid-markup, which reads as a
    // broken design rather than a truncated one.
    params.max_tokens ?? 8000,
  );

  const html = typeof (parsed as any)?.html === 'string' ? (parsed as any).html : '';
  const rationale = typeof (parsed as any)?.rationale === 'string' ? (parsed as any).rationale.trim() : '';

  if (!html.trim()) {
    return { ok: false, error_class: 'EmptyModelResponse', error: 'model returned no html' };
  }

  const violation =
    executableViolation(html) ||
    genericnessViolation(html, params.brief) ||
    labelViolation(html) ||
    craftViolation(html) ||
    navigationViolation(html) ||
    emptySvgViolation(html) ||
    stockPaletteViolation(html) ||
    emptyLinkViolation(html) ||
    contactLeakViolation(html, params.contact || {});

  if (violation) {
    return { ok: false, error_class: 'ContractViolation', error: violation };
  }

  return {
    ok: true,
    design: { rationale: rationale || `A one-page site for ${params.brief.project_title}.`, html },
    runtime_ms,
    cost_usd,
  };
}
