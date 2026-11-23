/**
 * AF12.19 - which outline sections are worth a row.
 *
 * ## The defect
 *
 * Ali, 2026-11-22, reading a builder's board: *"Are they not supposed to have any task in the
 * other stories?"* He was looking at R1 through R9 and a superseded release, every one reading
 * `0/0`, and the reasonable conclusion from that picture is that work went missing.
 *
 * Nothing is missing. An agent-domain board is created with THIRTEEN sections, and only one of
 * them can hold anything:
 *
 *   - Ten are the rungs of the autonomy ladder (`agentDomainReleaseLadder.ts`). A capability story
 *     hangs on the rung its `starting_autonomy` names, and every capability record names
 *     `autonomy:R0`, so R1..R9 are empty by construction until a capability is promoted. Measured
 *     on the ten published v3 plans, 2026-11-22: 598 stories, ALL of them on R0.
 *   - Three are the pre-migration releases, kept deliberately as the rollback path and documented
 *     as holding nothing.
 *
 * So twelve of the thirteen rows are permanently `0/0` on every board, for every builder. The
 * ladder file already saw this coming and ordered the legacy three last so an intern "sees the
 * rung they are on first, not three empty lists" - ordering made them later, not quieter.
 *
 * ## Why hidden rather than deleted
 *
 * The sections are real and must keep existing: a promotion moves a story onto R4, and the
 * rollback path needs the legacy three. This is a rendering decision only, and it is made here
 * rather than in the component so the rule can be asserted without a browser.
 *
 * ## Why collapsed rather than dropped
 *
 * An outline row is a FILTER. A row that filters to nothing is a dead control, and twelve of them
 * drown the one that works. But the empty rungs are also the ladder ahead of a builder, which is
 * worth being able to look at, so they collapse behind a count instead of vanishing. Default
 * closed, because the common case is a person trying to find their work.
 */

/** What the outline needs of a section, and nothing more, so this is testable without the store. */
export interface OutlineSection {
  id: string;
  name: string;
  tasks: readonly unknown[];
}

export interface OutlineSplit<T> {
  /** Sections holding at least one task. Always shown, in their original order. */
  filled: T[];
  /** Sections holding none. Shown only when the viewer asks. */
  empty: T[];
}

/** Sections that can be navigated to, and sections that cannot. Order is preserved in both. */
export function splitOutline<T extends OutlineSection>(lists: readonly T[]): OutlineSplit<T> {
  const filled: T[] = [];
  const empty: T[] = [];
  for (const l of lists) (l.tasks.length > 0 ? filled : empty).push(l);
  return { filled, empty };
}

/**
 * The label on the disclosure.
 *
 * Says "empty", not "not started": three of the twelve are superseded releases that will never
 * fill, so "yet" would be false for them. One word that is true of both beats two that are only
 * true of nine.
 */
export function emptySectionsLabel(n: number, open: boolean): string {
  const what = `${n} empty ${n === 1 ? 'section' : 'sections'}`;
  return open ? `Hide ${what}` : `Show ${what}`;
}

/**
 * The selection to hold when the empty sections are collapsed away.
 *
 * Collapsing the row a filter is pointing at would leave the feed filtered to nothing with no
 * visible control to undo it, which is a worse version of the bug this fixes.
 */
export function selectionAfterCollapse<T extends OutlineSection>(
  sel: string,
  empty: readonly T[],
): string {
  return empty.some((l) => l.id === sel) ? 'all' : sel;
}
