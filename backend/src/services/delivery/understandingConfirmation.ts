/**
 * understandingConfirmation — §17's four actions, and the only honest way an assumption
 * ever becomes a fact.
 *
 * The wow screen says "I THINK YOU'RE BUILDING …" and offers:
 *
 *     That's right   ·   Change something   ·   Why?   ·   Add something
 *
 * "Why?" is a read. The other three write, and they are the only writes in this system
 * that may promote an item's standing.
 *
 * ## The one legitimate path from ASSUMPTION to FACT
 *
 * Everywhere else in this codebase an inference is barred from being a fact, permanently
 * and by contract - `ai_inferred` can never carry FACT, and no amount of model confidence
 * changes it. That rule exists because a fact here means "a human is on the record", not
 * "the system is sure".
 *
 * Confirmation is the moment a human GOES on the record. So this is the one place the
 * promotion is legitimate, and it is legitimate precisely because a person did it: the
 * provenance becomes `client_confirmed`, which is a stronger claim than the transcript
 * quote it replaces, because they were shown the statement and agreed to it.
 *
 * ## What must never happen here
 *
 * A customer cannot confirm something they were not shown.
 *
 * It would be trivially easy to let "That's right" on a summary screen sweep every
 * inference in the document into confirmed fact - the counts looked right, so everything
 * under them must be right. That is how a system ends up holding twenty confirmed facts
 * from one click on a screen that displayed four numbers. So confirmation is per item, the
 * caller names exactly which items were on screen, and an index that was never displayed is
 * rejected rather than quietly included.
 */

import {
  parseUnderstanding,
  type ProjectUnderstanding,
  type UnderstandingItem,
  type UnderstandingDimension,
} from './projectUnderstanding';

export type ConfirmationAction =
  /** "That's right" — for the items actually shown. */
  | { type: 'confirm'; item_indexes: number[] }
  /** "Change something" — they corrected a statement. */
  | { type: 'amend'; item_index: number; value: string }
  /** "Change something", when the statement was simply wrong. */
  | { type: 'remove'; item_indexes: number[] }
  /** "Add something" — they told us something new. */
  | { type: 'add'; dimension: UnderstandingDimension; value: string };

export interface ConfirmationResult {
  understanding: ProjectUnderstanding;
  /** What actually changed, for the audit trail and for showing the customer. */
  confirmed: number;
  amended: number;
  removed: UnderstandingItem[];
  added: number;
  /** Indexes the caller asked for that do not exist. Reported, never silently skipped. */
  invalid_indexes: number[];
}

/**
 * A confirmed item, whatever it used to be.
 *
 * The quote is DROPPED on promotion, deliberately. Once a person has confirmed a statement,
 * the transcript line is no longer what supports it - they are - and keeping a quote
 * alongside `client_confirmed` invites the reader to check the wrong evidence. The original
 * conversation is still stored on the understanding record if anyone needs to go back.
 */
function confirmItem(item: UnderstandingItem): UnderstandingItem {
  const { source_quote: _dropped, ...rest } = item;
  return { ...rest, classification: 'FACT', provenance: 'client_confirmed' };
}

function isConfirmable(item: UnderstandingItem): boolean {
  // A QUESTION is not a statement, so there is nothing to agree with; it has to be answered
  // instead. A DECISION belongs to the customer by right (§3) and is not resolved by
  // nodding at a summary screen.
  return item.classification !== 'QUESTION' && item.classification !== 'DECISION';
}

/**
 * Apply one action. Pure: returns a new understanding and never mutates the input, so the
 * pre-confirmation version stays intact and the difference between what the AI heard and
 * what the customer confirmed is always recoverable.
 */
export function applyConfirmation(u: ProjectUnderstanding, action: ConfirmationAction): ConfirmationResult {
  const items = u.items.map((i) => ({ ...i }));
  const result: ConfirmationResult = {
    understanding: u,
    confirmed: 0,
    amended: 0,
    removed: [],
    added: 0,
    invalid_indexes: [],
  };

  const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < items.length;

  if (action.type === 'confirm') {
    action.item_indexes.forEach((index) => {
      if (!valid(index)) return result.invalid_indexes.push(index);
      if (!isConfirmable(items[index])) return;
      items[index] = confirmItem(items[index]);
      result.confirmed += 1;
    });
  }

  if (action.type === 'amend') {
    const { item_index, value } = action;
    if (!valid(item_index)) {
      result.invalid_indexes.push(item_index);
    } else if (value.trim()) {
      // A corrected statement is theirs by definition - they just said it.
      items[item_index] = confirmItem({ ...items[item_index], value: value.trim() });
      result.amended += 1;
    }
  }

  if (action.type === 'remove') {
    const doomed = action.item_indexes.filter((index) => {
      if (!valid(index)) {
        result.invalid_indexes.push(index);
        return false;
      }
      return true;
    });
    result.removed = doomed.map((index) => items[index]);
    const drop = new Set(doomed);
    for (let i = items.length - 1; i >= 0; i -= 1) if (drop.has(i)) items.splice(i, 1);
  }

  if (action.type === 'add' && action.value.trim()) {
    items.push({
      dimension: action.dimension,
      value: action.value.trim(),
      classification: 'FACT',
      provenance: 'client_confirmed',
    });
    result.added += 1;
  }

  // Round-trip through the contract so a confirmation can never produce an understanding
  // the rest of the system would reject. If this throws, the bug is here and it should be
  // loud rather than persisted.
  result.understanding = parseUnderstanding({ ...u, items });
  return result;
}

/**
 * How much of this understanding the customer has personally stood behind.
 *
 * The number that matters before a blueprint goes out. A document built entirely from
 * `ai_inferred` items is a guess with headings; one where the customer has confirmed the
 * substance is a shared account of their business, and the difference should be visible
 * rather than inferred from a general air of confidence.
 */
export function confirmationProfile(u: ProjectUnderstanding): {
  total: number;
  client_confirmed: number;
  confirmed_ratio: number;
  awaiting_confirmation: number;
} {
  const total = u.items.length;
  const confirmed = u.items.filter((i) => i.provenance === 'client_confirmed').length;
  const awaiting = u.items.filter((i) => isConfirmable(i) && i.provenance !== 'client_confirmed').length;

  return {
    total,
    client_confirmed: confirmed,
    confirmed_ratio: total === 0 ? 0 : confirmed / total,
    awaiting_confirmation: awaiting,
  };
}
