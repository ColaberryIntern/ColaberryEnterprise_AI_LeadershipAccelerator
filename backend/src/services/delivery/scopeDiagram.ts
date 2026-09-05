/**
 * scopeDiagram — the workflow they described, with the part that stops being theirs marked.
 *
 * ## Why this is generated rather than drawn with a library
 *
 * Mermaid would have meant vendoring roughly two megabytes into a site that deliberately
 * ships no JavaScript at all, to draw a diagram whose shape we already know: a short linear
 * sequence of steps. Server-generated SVG has no library, no page weight, renders identically
 * in the scope page and in any HTML we send, and stays crisp on the phone somebody is
 * holding when they see it. (Decision, Ali, 2026-09-05.)
 *
 * The cost is that the layout logic lives here, so this handles a sequence well and would
 * need real work to handle branching. That is the right trade for the diagram this actually
 * needs to be.
 *
 * ## What the diagram is FOR
 *
 * Not decoration, and not a generic flowchart. A prospect describes a morning that costs
 * them something, and the useful picture is that same morning with the steps that would
 * become automatic marked as such - so the argument is visible rather than asserted. A
 * diagram that just redraws their process in boxes tells them nothing they did not say.
 *
 * Steps carry one of three states, and each has to be earned:
 *
 *   manual     they described it and nothing proposed changes it
 *   automated  an automation we proposed covers it
 *   decision   it stays with a person on purpose (§3: authority stays human)
 */

/**
 * Matching thresholds.
 *
 * Both exist because the first live diagram marked every step of a real project as a human
 * decision: in one domain every sentence shares vocabulary, so a raw count of two shared
 * words matched everything against everything.
 */
export const MIN_SHARED_WORDS = 2;
export const MIN_MATCH_RATIO = 0.4;

export type StepState = 'manual' | 'automated' | 'decision';

export interface DiagramStep {
  label: string;
  state: StepState;
}

/** Layout constants. Tuned so a five-step flow fits a phone without scrolling sideways. */
const WIDTH = 640;
const BOX_W = 520;
const BOX_MIN_H = 56;
const GAP = 26;
const PAD_Y = 16;
const CHAR_W = 7.6; // Archivo at 15px, near enough for wrapping
const LINE_H = 20;
const MAX_CHARS = Math.floor((BOX_W - 96) / CHAR_W);

const escapeXml = (s: string): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

/**
 * Wrap on words, because breaking mid-word in a diagram reads as a rendering fault rather
 * than as a long label.
 */
export function wrapLabel(text: string, maxChars = MAX_CHARS): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = '';

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });

  if (line) lines.push(line);
  // Three lines is the point where a step is really two steps. Truncate rather than let one
  // box grow until it dominates the diagram.
  if (lines.length > 3) {
    return [...lines.slice(0, 2), `${lines[2].slice(0, maxChars - 1)}…`];
  }
  return lines;
}

const STATE_STYLE: Record<StepState, { fill: string; stroke: string; label: string; labelFill: string }> = {
  // Colours come through CSS custom properties with literal fallbacks, so the diagram picks
  // up the page's theme where there is one and still renders standalone where there is not.
  manual: {
    fill: 'var(--surface, #FFFFFF)',
    stroke: 'var(--line, #DEDAD3)',
    label: 'Today',
    labelFill: 'var(--muted, #56524B)',
  },
  automated: {
    fill: 'var(--accent-soft, #FBE4D5)',
    stroke: 'var(--accent, #BA430E)',
    label: 'Runs itself',
    labelFill: 'var(--accent, #BA430E)',
  },
  decision: {
    fill: 'var(--surface, #FFFFFF)',
    stroke: 'var(--warn, #8F6400)',
    label: 'You decide',
    labelFill: 'var(--warn, #8F6400)',
  },
};

/**
 * Render the steps as a vertical flow.
 *
 * Vertical rather than horizontal because it is read on a phone at least as often as a
 * laptop, and a horizontal flow of five steps either scrolls sideways or shrinks the text
 * past reading.
 */
export function renderWorkflowSvg(steps: DiagramStep[], title = 'Your workflow today'): string {
  if (steps.length === 0) return '';

  const wrapped = steps.map((s) => ({ ...s, lines: wrapLabel(s.label) }));
  const heights = wrapped.map((s) => Math.max(BOX_MIN_H, s.lines.length * LINE_H + PAD_Y * 2));
  const totalH = heights.reduce((a, b) => a + b, 0) + GAP * (wrapped.length - 1) + 8;

  const x = (WIDTH - BOX_W) / 2;
  let y = 4;
  const parts: string[] = [];

  wrapped.forEach((step, i) => {
    const h = heights[i];
    const style = STATE_STYLE[step.state];

    parts.push(
      `<rect x="${x}" y="${y}" width="${BOX_W}" height="${h}" rx="8" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${step.state === 'manual' ? 1 : 2}"/>`,
    );

    // The state label sits inside the box, in text as well as colour — colour alone fails
    // anyone who cannot see it (WCAG 1.4.1), and this diagram's whole argument is carried
    // by which steps are marked.
    parts.push(
      `<text x="${x + 16}" y="${y + 20}" font-family="ui-monospace, monospace" font-size="9.5" letter-spacing="0.08em" fill="${style.labelFill}">${escapeXml(style.label.toUpperCase())}</text>`,
    );

    step.lines.forEach((line, li) => {
      parts.push(
        `<text x="${x + 16}" y="${y + 42 + li * LINE_H}" font-family="Archivo, system-ui, sans-serif" font-size="15" fill="var(--fg, #1A1917)">${escapeXml(line)}</text>`,
      );
    });

    if (i < wrapped.length - 1) {
      const cx = WIDTH / 2;
      const y1 = y + h;
      const y2 = y + h + GAP;
      parts.push(
        `<line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2 - 6}" stroke="var(--line, #DEDAD3)" stroke-width="1.5"/>`,
        `<path d="M ${cx - 4} ${y2 - 8} L ${cx} ${y2 - 2} L ${cx + 4} ${y2 - 8} Z" fill="var(--line, #DEDAD3)"/>`,
      );
    }

    y += h + GAP;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${totalH}" width="100%" height="auto" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    ...parts,
    '</svg>',
  ].join('');
}

/**
 * Decide each step's state.
 *
 * A step counts as automated when an automation we proposed clearly refers to it. The match
 * is deliberately conservative - shared significant words rather than anything fuzzy -
 * because marking a step "runs itself" when nothing proposed covers it is a promise the
 * scope has not made, and this diagram is the most persuasive thing on the page.
 */
export function classifySteps(params: {
  workflow: string[];
  automations: string[];
  decisions: string[];
}): DiagramStep[] {
  const significant = (text: string): Set<string> =>
    new Set(
      String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 4),
    );

  const autoWords = params.automations.map(significant);
  const decisionWords = params.decisions.map(significant);

  /**
   * How strongly a step matches a candidate, as a proportion rather than a raw count.
   *
   * A raw threshold of two shared words marked EVERY step of a real project as a human
   * decision, because in a single domain every sentence shares vocabulary - "older",
   * "adults", "family" appear in all of them. The resulting diagram said the customer's
   * whole workflow stays manual, which argues against the product it is meant to sell.
   *
   * Proportion fixes that: the shared words have to be a real share of the shorter of the
   * two phrasings, not just present somewhere in a long one.
   */
  const strength = (a: Set<string>, sets: Set<string>[]): number =>
    sets.reduce((best, b) => {
      if (a.size === 0 || b.size === 0) return best;
      let shared = 0;
      a.forEach((w) => {
        if (b.has(w)) shared += 1;
      });
      if (shared < MIN_SHARED_WORDS) return best;
      return Math.max(best, shared / Math.min(a.size, b.size));
    }, 0);

  return params.workflow.map((step) => {
    const words = significant(step);
    const auto = strength(words, autoWords);
    const decision = strength(words, decisionWords);

    if (auto < MIN_MATCH_RATIO && decision < MIN_MATCH_RATIO) return { label: step, state: 'manual' };

    // Ties go to the human. §3: authority stays human, so a step that could be read either
    // way must not be drawn as running itself.
    return { label: step, state: decision >= auto ? 'decision' : 'automated' };
  });
}
