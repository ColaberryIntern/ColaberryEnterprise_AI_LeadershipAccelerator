import { checkGrounding, type MetricClaim } from './presentationGrounding';

/**
 * The summary a stranger reads in the gallery, built from the take that was approved.
 *
 * THE RISK IS DIFFERENT FROM THE DECK'S. A deck is shown by its author, who is standing
 * there and can correct it. A showcase summary is read by an employer months later with
 * nobody in the room. An invented metric in a deck is an awkward moment; an invented
 * metric here is a claim on a public page with a student's name on it.
 *
 * So the same grounding check runs, and it runs against the student's own words — and a
 * QUOTE is held to a stricter rule than a number: a quote must appear in the transcript
 * verbatim, because a paraphrase inside quotation marks is a thing the student did not
 * say being attributed to them.
 *
 * NOTHING HERE PUBLISHES. It produces a draft and a verdict; approval and publication
 * are `showcaseService`, and both approvals are still required.
 *
 * Pure. No database, no model call — the caller supplies the generated text and the
 * evidence, so the rule is testable without either.
 */

export interface DraftInput {
  /** What the model produced for the gallery. */
  summary: string;
  /** Chapter titles / section headings offered alongside it. */
  chapters?: string[];
  /** Direct quotes the draft attributes to the student. */
  quotes?: string[];
  /** The student's own writing: narrative, project description, task titles. */
  sources: string[];
  /** The transcript of the approved take, when one exists. */
  transcript?: string | null;
}

export interface DraftVerdict {
  /** Figures that appear in nothing the student wrote. */
  unsupportedFigures: MetricClaim[];
  /** Quotes that do not appear in the transcript verbatim. */
  unverifiedQuotes: string[];
  /** Chapters referring to content the take does not contain. */
  unsupportedChapters: string[];
  /** True when the draft can go forward for approval as it stands. */
  publishable: boolean;
  /** What the student is asked to fix, in order. */
  notices: string[];
}

/** Whitespace and smart quotes normalised, so formatting is not mistaken for invention. */
function normalise(s: string): string {
  return String(s || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Is this quote actually in the transcript?
 *
 * Verbatim, allowing only for whitespace and quote-mark differences. A paraphrase in
 * quotation marks is the student being made to say something they did not say, and
 * "close enough" is exactly the standard that lets that through.
 */
export function quoteIsVerbatim(quote: string, transcript: string | null | undefined): boolean {
  const q = normalise(quote).replace(/^["']|["']$/g, '');
  if (!q) return false;
  const t = normalise(transcript || '');
  if (!t) return false;
  return t.includes(q);
}

/**
 * Does this chapter title refer to something the take actually covers?
 *
 * Deliberately generous — a chapter is a label, not a claim, so it only fails when it
 * names something with NO lexical footing in the transcript at all. The strict rule is
 * reserved for quotes and figures, which assert.
 */
export function chapterHasFooting(chapter: string, transcript: string | null | undefined): boolean {
  const t = normalise(transcript || '');
  if (!t) return true; // No transcript is not evidence the chapter is wrong.
  const words = normalise(chapter).split(' ').filter((w) => w.length > 4);
  if (words.length === 0) return true;
  return words.some((w) => t.includes(w));
}

export function reviewDraft(input: DraftInput): DraftVerdict {
  const prose = [input.summary, ...(input.chapters || [])].join('\n');
  const grounding = checkGrounding(prose, input.sources);

  const unverifiedQuotes = (input.quotes || []).filter((q) => !quoteIsVerbatim(q, input.transcript));
  const unsupportedChapters = (input.chapters || []).filter((c) => !chapterHasFooting(c, input.transcript));

  const notices: string[] = [];
  for (const f of grounding.unsupported) {
    notices.push(`“${f.text}” does not appear in anything you wrote. Confirm it or take it out.`);
  }
  for (const q of unverifiedQuotes) {
    notices.push(`“${q}” is quoted as your words but is not in the transcript. Reword it or remove the quotation marks.`);
  }
  for (const c of unsupportedChapters) {
    notices.push(`The chapter “${c}” does not match anything in the recording.`);
  }

  return {
    unsupportedFigures: grounding.unsupported,
    unverifiedQuotes,
    unsupportedChapters,
    // A draft with any unverified claim does not go forward. This is the surface an
    // employer reads; the bar is higher than the deck's.
    publishable: grounding.clean && unverifiedQuotes.length === 0 && unsupportedChapters.length === 0,
    notices,
  };
}

/**
 * How an externally-hosted project is described, and what is NOT claimed about it.
 *
 * A student may have built something elsewhere — a repo, a live site, work from a
 * previous job. It belongs in their showcase. What must never happen is the platform
 * appearing to vouch for it: we did not watch it being built, we did not verify the
 * claim, and a gallery that presents external work identically to verified work is
 * quietly lending it our credibility.
 */
export interface ExternalLink {
  url: string;
  label: string;
}

export interface ExternalProvenance {
  url: string;
  label: string;
  /** ALWAYS false for external work. There is no path that makes this true. */
  platformVerified: false;
  /** Shown next to the link, never in a tooltip. */
  badge: string;
  note: string;
}

export const UNVERIFIED_BADGE = 'Not verified by Colaberry';

export function describeExternal(link: ExternalLink): ExternalProvenance {
  return {
    url: link.url,
    label: link.label,
    platformVerified: false,
    badge: UNVERIFIED_BADGE,
    note: 'This was built outside the programme. We have not reviewed it and make no claim about it.',
  };
}
