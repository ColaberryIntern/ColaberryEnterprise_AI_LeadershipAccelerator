/**
 * Whether a revision is an ADJUSTMENT or a REBUILD, and the instruction each one sends.
 *
 * WHY THIS EXISTS. The revise path has always ended with "Apply them and leave everything else
 * alone". For "make the headline about the mentor review" that is exactly right, and it is why
 * revisions are safe. For "rebuild this under the new design" it is a cap: the model is being
 * told to redesign and simultaneously told not to change anything it was not asked about, and it
 * resolves that contradiction by changing almost nothing. This was diagnosed earlier and
 * misattributed to prompt v6, which was fine - the ceiling was in the revise instruction, not in
 * the page rules.
 *
 * WHY THE MODE IS EXPLICIT AND NOT INFERRED. Reading intent out of the operator's wording would
 * make a destructive rebuild depend on a guess about a sentence. A rebuild discards a page
 * somebody may have spent an hour revising, so it is a choice the operator makes, not one a
 * regex makes for them. `readsAsRedesignRequest` exists only to SAY SO when the two disagree -
 * the operator asked for a rebuild while in adjust mode - because silently capping them is the
 * bug this is fixing, and silently rebuilding would be a worse one.
 *
 * WHAT A REBUILD MAY AND MAY NOT CHANGE. Structure, section types, order and wording are open.
 * The facts are not: a rebuild may not introduce a number, date, price or claim the brief does
 * not support, and `findInventedSpecifics` still reads the result. Freeing the shape is the
 * point; freeing the facts would make a redesign the easiest way to get a lie onto a public page.
 */

export type RevisionMode = 'tweak' | 'redesign';

export const REVISION_MODES: readonly RevisionMode[] = ['tweak', 'redesign'];

export function isRevisionMode(value: unknown): value is RevisionMode {
  return value === 'tweak' || value === 'redesign';
}

/**
 * Phrases that describe rebuilding the page rather than changing something on it.
 *
 * Deliberately narrow. This drives a sentence of advice, never an action, so a miss costs the
 * operator nothing but a false positive would nag on ordinary edits.
 */
const REDESIGN_PHRASES: readonly RegExp[] = [
  /\bre-?design\b/i,
  /\bre-?build\b/i,
  /\bstart (?:it )?(?:over|again|from scratch)\b/i,
  /\bfrom scratch\b/i,
  /\bnew (?:design|layout|structure|look)\b/i,
  /\bdifferent (?:design|layout|structure)\b/i,
  /\brestructure\b/i,
  /\breorganis|\breorganiz/i,
  /\bwhole page\b/i,
  /\bscrap (?:it|this|the page)\b/i,
];

/** Does this feedback describe rebuilding the page rather than adjusting it? */
export function readsAsRedesignRequest(feedback: string): boolean {
  const text = feedback.trim();
  if (text === '') return false;
  return REDESIGN_PHRASES.some((p) => p.test(text));
}

/**
 * The sentence shown when the operator asks for a rebuild while in adjust mode.
 *
 * Says what will happen, not what they did wrong - they have not done anything wrong, the two
 * controls simply disagree and only they can say which they meant.
 */
export function modeMismatchNotice(): string {
  return 'This reads like a request to rebuild the page, but the revision is set to adjust, '
    + 'which tells the model to leave everything it was not asked about alone. Switch to '
    + '"Rebuild" if you want the structure to change too.';
}

/**
 * The instruction the model receives for this mode.
 *
 * Returned as lines so the caller can join them into the user message the same way it joins
 * everything else, and so the two modes are legible side by side in one place.
 */
export function revisionInstruction(mode: RevisionMode, feedback: string): string[] {
  if (mode === 'redesign') {
    return [
      '',
      'The operator wants this page REBUILT, not adjusted. Produce a new page for the same brief,',
      'following the direction below. You may change the structure, which section types are used,',
      'their order, and the wording throughout - this is a redesign and the previous shape is not',
      'a constraint.',
      '',
      'What you may NOT change: the facts. Every number, date, price, name and claim must still',
      'come from the brief. A redesign is a new arrangement of the same true things, so do not',
      'introduce a specific the brief does not support, and do not carry forward one that was',
      'already unsupported.',
      '',
      'The direction:',
      feedback.trim(),
    ];
  }
  return [
    '',
    'The operator wants these changes. Apply them and leave everything else alone:',
    feedback.trim(),
  ];
}
