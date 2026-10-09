/**
 * Splitting a generated deck into slides, and separating what the AUDIENCE sees from
 * what only the PRESENTER sees.
 *
 * THE RULE THIS FILE EXISTS FOR: speaker notes must never reach the audience view.
 * Not styled small, not visually hidden, not `display: none` — ABSENT from the markup
 * that is rendered on the shared screen. A note the student wrote to themselves
 * ("skip this if short on time", "the client hated this bit") appearing behind them
 * during a demo is the kind of failure nobody gets to undo, and CSS is one stray
 * stylesheet away from showing it.
 *
 * So the split happens HERE, in a pure function, before anything renders. The audience
 * renderer is handed markup that does not contain the notes at all.
 *
 * Pure: no DOM, no network. The same function runs in the viewer and in a test.
 */

export interface Slide {
  /** 1-based, for "3 of 11" and for deep links. */
  index: number;
  /** Markup shown to everyone. Notes already removed. */
  audienceHtml: string;
  /** The presenter's own notes for this slide, plain text. May be empty. */
  notes: string;
  /** First heading, for the outline and the fallback title. */
  title: string;
}

/**
 * How a note is marked in generated HTML. Several shapes are accepted because the
 * model is not perfectly consistent, and a note we fail to RECOGNISE is a note that
 * gets shown to the room — the failure mode is asymmetric, so recognition is generous.
 */
const NOTE_PATTERNS: RegExp[] = [
  /<aside\b[^>]*\bclass=["'][^"']*\bnotes?\b[^"']*["'][^>]*>([\s\S]*?)<\/aside>/gi,
  /<aside\b[^>]*\bdata-notes\b[^>]*>([\s\S]*?)<\/aside>/gi,
  /<div\b[^>]*\bclass=["'][^"']*\b(?:speaker-notes?|presenter-notes?|notes?)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  /<section\b[^>]*\bclass=["'][^"']*\bnotes?\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/gi,
  /<!--\s*notes?:([\s\S]*?)-->/gi,
];

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The notes in a slide, and the markup with every note removed. */
export function separateNotes(slideHtml: string): { audienceHtml: string; notes: string } {
  let audienceHtml = slideHtml;
  const collected: string[] = [];

  for (const pattern of NOTE_PATTERNS) {
    pattern.lastIndex = 0;
    audienceHtml = audienceHtml.replace(pattern, (_full, inner) => {
      const text = stripTags(String(inner || ''));
      if (text) collected.push(text);
      return '';
    });
  }

  return { audienceHtml: audienceHtml.trim(), notes: collected.join('\n\n').trim() };
}

/** The first heading in a slide, or a positional fallback. Never invents a title. */
export function titleOf(slideHtml: string, index: number): string {
  const m = slideHtml.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const text = m ? stripTags(m[1]) : '';
  return text || `Slide ${index}`;
}

/**
 * Split a deck into slides.
 *
 * `<section>` is the boundary, which is what the prompt asks the model for. A deck
 * that arrives with no sections is ONE slide rather than an error: a student with a
 * single-slide deck should still be able to present it, and failing here would lose
 * work over a formatting detail.
 */
export function splitSlides(deckHtml: string): Slide[] {
  const html = (deckHtml || '').trim();
  if (!html) return [];

  const sections = html.match(/<section\b[\s\S]*?<\/section>/gi);
  const parts = sections && sections.length ? sections : [html];

  return parts.map((part, i) => {
    const index = i + 1;
    const { audienceHtml, notes } = separateNotes(part);
    return { index, audienceHtml, notes, title: titleOf(audienceHtml, index) };
  });
}

/**
 * The markup handed to the audience view: every slide, notes already gone.
 *
 * Exported separately so a caller cannot accidentally render the ORIGINAL deck on the
 * shared screen — the thing they have is already safe.
 */
export function audienceDeck(slides: Slide[]): string {
  return slides.map((s) => s.audienceHtml).join('\n');
}

/** Does this markup still contain anything that looks like a note? Used as a last check. */
export function containsNotes(html: string): boolean {
  return NOTE_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(html);
  });
}
