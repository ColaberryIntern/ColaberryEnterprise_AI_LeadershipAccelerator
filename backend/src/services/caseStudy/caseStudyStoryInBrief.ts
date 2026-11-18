/**
 * THE STORY IN BRIEF: the band at the top of a public case study page that tells the
 * whole arc in three to five short beats, before the body begins.
 *
 * Ali, 2026-11-18: "the story is so shortened I can't even tell what the story is. Can
 * we create a small format at the top that tells the story of what happened in the case
 * study. Sometimes the opening paragraph does a good job explaining and sometimes it
 * doesn't."
 *
 * ALL OR NOTHING. A record's beats are projected only when the whole set is usable:
 * 3 to 5 beats, each with a label and a text inside the limits below. A partial arc
 * (two beats, or a beat with no text) reads as a finished story with its middle cut
 * out, which is worse than no band, so one bad beat drops the band and the page reads
 * exactly as it did before this field existed.
 *
 * NEVER DERIVED. A record with no beats gets no band. Building one from the first
 * sentences of other sections would print the opening paragraph again, which is the
 * very thing Ali said does not always explain the story.
 */
import type { PublicCaseStudyStoryBeat } from '../../types/caseStudyPublic';

export const STORY_IN_BRIEF_LIMITS = Object.freeze({
  minBeats: 3,
  maxBeats: 5,
  /** "Before", "What we built", "What happened", "Why it matters": a few words. */
  maxLabelChars: 32,
  /** One or two plain sentences. The band is a glance, not a second body. */
  maxTextChars: 240,
});

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Why a record's beats would not print, or null when they would. Shared by the audit. */
export function storyInBriefProblem(value: unknown): string | null {
  if (value === undefined || value === null) return 'no story in brief';
  if (!Array.isArray(value)) return 'storyInBrief is not a list';
  const L = STORY_IN_BRIEF_LIMITS;
  if (value.length < L.minBeats || value.length > L.maxBeats) {
    return `storyInBrief has ${value.length} beats; it needs ${L.minBeats} to ${L.maxBeats}`;
  }
  for (const [i, beat] of value.entries()) {
    const label = clean((beat as { label?: unknown } | null)?.label);
    const text = clean((beat as { text?: unknown } | null)?.text);
    if (!label) return `beat ${i + 1} has no label`;
    if (!text) return `beat ${i + 1} has no text`;
    if (label.length > L.maxLabelChars) return `beat ${i + 1} label is ${label.length} characters; the limit is ${L.maxLabelChars}`;
    if (text.length > L.maxTextChars) return `beat ${i + 1} text is ${text.length} characters; the limit is ${L.maxTextChars}`;
  }
  return null;
}

/** The beats a page may print: the whole usable set, or none. */
export function projectStoryInBrief(value: unknown): readonly PublicCaseStudyStoryBeat[] {
  if (storyInBriefProblem(value) !== null) return [];
  return (value as readonly unknown[]).map((beat) => ({
    label: clean((beat as { label?: unknown }).label),
    text: clean((beat as { text?: unknown }).text),
  }));
}
