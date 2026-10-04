/**
 * What step 1 still needs before a draft can be created.
 *
 * WHY THIS IS A MODULE. The Create draft button was disabled by
 * `brand_id !== '' && title.trim() !== '' && !busy` and said nothing about it. A title is
 * internal - it never appears in a post - so leaving it blank is the natural thing to do, and
 * the page's answer was a grey button and silence. Reported from production 2026-09-29: "I have
 * a draft but can't create it."
 *
 * A disabled control has to say what would enable it. Putting that in a pure function keeps the
 * button's condition and the sentence explaining it as ONE fact - they cannot drift into
 * disagreeing, which is the failure where the button is grey and the hint says everything is fine.
 */

export interface SetupGateValues {
  brand_id: string;
  title: string;
}

/** What is missing, in the order the fields appear on the form. Empty means ready. */
export function missingToCreate(values: SetupGateValues): string[] {
  const missing: string[] = [];
  if (values.brand_id === '') missing.push('choose a brand');
  if (values.title.trim() === '') missing.push('add an internal title');
  return missing;
}

/**
 * The sentence shown beside the button. `null` when nothing is missing, so the caller renders
 * nothing rather than an empty element.
 *
 * `busy` is deliberately NOT a blocker here: while a request is in flight the button is disabled
 * for a reason the spinner already gives, and saying "add a title" then would be wrong.
 */
export function blockerSentence(values: SetupGateValues): string | null {
  const missing = missingToCreate(values);
  if (missing.length === 0) return null;
  if (missing.length === 1) return `To create the draft, ${missing[0]}.`;
  return `To create the draft, ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}.`;
}

/** The single source of truth for whether the button is live. */
export function canCreate(values: SetupGateValues, busy: boolean): boolean {
  return missingToCreate(values).length === 0 && !busy;
}
