/**
 * cardBodyHtmlSanitizer — repairs malformed block-level OPEN TAGS in the
 * model-generated `body_html` we persist onto a timeline card.
 *
 * WHY THIS EXISTS
 * The card generator asks an LLM for "clean self-contained HTML". Occasionally it
 * emits a block-level open tag with the closing angle bracket missing, e.g.
 *
 *     <h4>Troubleshooting Skills</h4>
 *     <pThis prompt will help you diagnose why a Skill will not trigger.</p>
 *     <pre>Claude, let us troubleshoot a Skill that is not triggering.</pre>
 *
 * That single missing ">" is not a cosmetic problem. The HTML tokenizer reads
 * `<pThis prompt ... trigger.</p` as ONE start tag named `pthis` with junk
 * attributes, so:
 *   1. the explanation paragraph is consumed into the tag name and never renders, and
 *   2. `<pthis>` is an unknown element with no end tag, so EVERY following sibling
 *      (the <pre> prompt, the next <h4>, its <p> and its <pre>) is re-parented
 *      INSIDE it and is no longer a direct child of the container.
 *
 * PromptCatalogRender.parseCatalog() walks only `root.children` (direct children),
 * pairing <h3> category / <h4> title / <p> explanation / <pre> prompt. Once the
 * siblings are re-parented it cannot see them, so the card still paints its title,
 * heading and an unconditional "Show prompt" button that reveals an EMPTY box, and
 * the remaining prompts in that card vanish with no error anywhere.
 *
 * Observed in production 2026-08-18: 10 malformed tags across 6 published
 * prompt_lab cards (Weeks 2, 3, 7, 10, 11, 12) hid 8 prompts outright and left 6
 * prompt boxes empty. Reported by a staff reviewer as "the prompt is missing".
 *
 * WHY THE ALLOWLIST
 * A naive "tag name runs into a letter" rule is WRONG and destructive: `<path ...>`
 * inside the Deep Dive cards' inline SVG starts with "p" too, and repairing it
 * would produce `<p>ath ...>` and corrupt 13 published cards. So a run of letters
 * after "<" is only treated as damage when it is NOT a real element name.
 *
 * CONTRACT
 *   repairMalformedBlockOpenTags(html) -> html
 *     Pure. Inserts the missing ">" and nothing else. Byte-identical output for
 *     well-formed input, so it is safe to run unconditionally on every write.
 *   findMalformedBlockOpenTags(html) -> string[]
 *     Pure. The offending fragments, for logging/observability.
 *
 * SCOPE: block-level open tags only. Deliberately NOT a general HTML sanitizer: it
 * does not balance end tags, strip scripts, or validate nesting.
 */

/** Block tags the card-content contract uses. Longest-first so `pre` is matched
 *  before `p` and a well-formed `<pre>` is never mistaken for a broken `<p>`. */
const BLOCK_TAGS = [
  'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'p',
] as const;

/**
 * Element names that legitimately appear in card bodies. Anything in here is left
 * alone even though it may share a prefix with a block tag (`path`/`p`,
 * `option`/`ol`, `line`/`li`, `header`/`h1`...). HTML plus the SVG subset the Deep
 * Dive field guides embed.
 */
const KNOWN_ELEMENTS = new Set([
  // HTML
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi',
  'bdo', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code',
  'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog',
  'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr',
  'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li',
  'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript',
  'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre',
  'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'search', 'section',
  'select', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary',
  'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead',
  'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
  // SVG
  'animate', 'circle', 'clippath', 'defs', 'desc', 'ellipse', 'feblend',
  'fecolormatrix', 'fegaussianblur', 'femerge', 'feoffset', 'filter', 'foreignobject',
  'g', 'image', 'line', 'lineargradient', 'marker', 'mask', 'path', 'pattern',
  'polygon', 'polyline', 'radialgradient', 'rect', 'stop', 'svg', 'symbol', 'text',
  'textpath', 'tspan', 'use', 'view',
]);

/** The identifier immediately after "<", or '' when there is none. */
function readIdentifier(html: string, start: number): string {
  let i = start;
  while (i < html.length && /[a-zA-Z0-9-]/.test(html[i])) i++;
  return html.slice(start, i);
}

function scan(html: string, onMalformed: (index: number, tag: string) => void): void {
  for (let i = 0; i < html.length; i++) {
    if (html[i] !== '<') continue;

    // Skip comments wholesale. Example markup inside `<!-- ... -->` is not
    // rendered, so "repairing" it would corrupt an author's note.
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end === -1 ? html.length : end + 2; // loop's i++ moves past the ">"
      continue;
    }
    if (html[i + 1] === '/' || html[i + 1] === '!' || html[i + 1] === '?') continue;

    const ident = readIdentifier(html, i + 1);
    if (!ident) continue;

    const lower = ident.toLowerCase();

    // A real element (`<p>`, `<pre>`, `<path ...>`, `<line ...>`) is never touched,
    // whether it carries attributes, self-closes, or stands alone.
    if (KNOWN_ELEMENTS.has(lower)) continue;

    // Unknown identifier. If it opens with one of our block tags, the model ran the
    // tag name straight into the sentence and dropped the ">".
    const tag = BLOCK_TAGS.find((t) => lower.startsWith(t));
    if (tag) onMalformed(i, tag);
  }
}

/** The malformed fragments found in `html`, truncated for readable logs. */
export function findMalformedBlockOpenTags(html: string, sampleLength = 60): string[] {
  if (!html) return [];
  const out: string[] = [];
  scan(html, (index) => out.push(html.slice(index, index + sampleLength)));
  return out;
}

/**
 * Insert the missing ">" on any malformed block-level open tag.
 * Returns the input unchanged (byte-identical) when nothing is malformed.
 */
export function repairMalformedBlockOpenTags(html: string): string {
  if (!html) return html;
  const cuts: number[] = [];
  scan(html, (index, tag) => cuts.push(index + 1 + tag.length));
  if (!cuts.length) return html;
  let out = '';
  let prev = 0;
  for (const cut of cuts) {
    out += html.slice(prev, cut) + '>';
    prev = cut;
  }
  return out + html.slice(prev);
}
