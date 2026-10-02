/**
 * Stable identity and provenance for source items.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a source item's identity is minted ONCE, at first
 * capture, and is NOT derived from its text. Two consequences, and both matter:
 *
 *   - Fixing a typo in a requirement must not read as a new requirement. Text-derived identity
 *     makes every wording correction look like an insertion plus a deletion, which quietly
 *     destroys the traceability the whole lifecycle is for.
 *   - Identical text alone must not establish identity. Two stakeholders independently saying
 *     "the system must notify the applicant" are two statements, possibly with different
 *     provenance, and collapsing them loses one of them.
 *
 * `factoryIds.factoryId(kind, parts)` remains the right tool for a DERIVED id — a task id that
 * should be reproducible from its inputs. It is the wrong tool for a captured human statement,
 * which has no reproducible inputs, only a history.
 *
 * PROVENANCE IS NEVER INVENTED. A legacy item whose provenance was never recorded keeps its
 * citation and carries `provenance: null`. The request is explicit: "preserve existing legacy
 * dimension citations without inventing missing provenance". `null` means unrecorded; it does
 * not mean "assume the interview".
 *
 * Contract: docs/project-lifecycle/blueprint-contract.md §2-3.
 */
import { randomUUID } from 'crypto';

/**
 * The six states the request requires to keep distinct meanings.
 *
 * Extends the existing `SectionKind` ('heard' | 'proposed' | 'open') from
 * services/delivery/buildBlueprint.ts rather than inventing a parallel vocabulary; `confirmed`
 * already exists in services/sbp/intakeReview.ts, and `tested` in the Factory's EvidenceState.
 */
export const SOURCE_STATES = [
  'heard',                // the customer said it. NOT that we agree with it.
  'proposed',             // we are suggesting it. NOT that they accepted it.
  'confirmed',            // a human explicitly confirmed it. NOT merely "was not contradicted".
  'open',                 // genuinely undecided. NOT zero, and NOT a default.
  'tested',               // a test covers it. NOT that it runs in production.
  'production_verified',  // observed working in production. NOT merely deployed.
] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

/** Where an item came from. `null` on the item means unrecorded — never inferred. */
export interface Provenance {
  /** e.g. 'interview', 'solicitation', 'email', 'legacy_import'. */
  kind: string;
  /** A locator within that source — a section, a timestamp, a document id. */
  locator: string;
  /** The revision of the source document this was read from. */
  sourceRevision?: string | null;
}

export interface SourceItem {
  /** Minted once, carried forever. Never derived from `text`. */
  id: string;
  /** Bumps on every wording correction. The pair (id, revision) identifies an exact wording. */
  revision: number;
  text: string;
  state: SourceState;
  /** `null` means unrecorded. Legacy items keep their citation and carry null here. */
  provenance: Provenance | null;
  /** Our reading of an ambiguous statement, kept separate from the statement itself. */
  interpretation?: string | null;
}

/** A state only a human act may produce. Reaching it any other way is invented confirmation. */
const HUMAN_ONLY_STATES: ReadonlySet<SourceState> = new Set<SourceState>(['confirmed']);

export function isSourceState(v: unknown): v is SourceState {
  return typeof v === 'string' && (SOURCE_STATES as ReadonlyArray<string>).includes(v);
}

/**
 * Capture a new source item. The id is random, not a hash of the text — see the file header.
 *
 * A new item may never be born `confirmed`: confirmation is an act a human performs on something
 * already captured, so claiming it at capture time is exactly the "invented confirmation" the
 * acceptance criteria forbid.
 */
export function mintSourceItem(input: {
  text: string;
  state: SourceState;
  provenance?: Provenance | null;
  interpretation?: string | null;
}): SourceItem {
  if (HUMAN_ONLY_STATES.has(input.state)) {
    throw new Error(
      `InvalidSourceState: an item cannot be captured directly as '${input.state}'. ` +
      'Confirmation is a human act on an existing item; capture it as heard or proposed first.',
    );
  }
  return {
    id: randomUUID(),
    revision: 1,
    text: input.text,
    state: input.state,
    provenance: input.provenance ?? null,
    interpretation: input.interpretation ?? null,
  };
}

/**
 * Correct the wording of an existing item. Same id, next revision.
 *
 * The state is deliberately NOT advanced here. Re-wording something a human confirmed does not
 * re-confirm it, and silently carrying `confirmed` through an edit is how a changed requirement
 * keeps a stale approval.
 */
export function reviseSourceItem(existing: SourceItem, text: string): SourceItem {
  return {
    ...existing,
    revision: existing.revision + 1,
    text,
    // A material re-wording drops a human confirmation back to 'heard'; it must be re-confirmed.
    state: existing.state === 'confirmed' ? 'heard' : existing.state,
  };
}

/**
 * Record a human confirmation. The only path to `confirmed`.
 *
 * Requires a named actor, because "confirmed" with nobody attached is indistinguishable from
 * "nobody contradicted it", and those are the two meanings the request insists stay apart.
 */
export function confirmSourceItem(existing: SourceItem, confirmedBy: string): SourceItem {
  if (!confirmedBy || !confirmedBy.trim()) {
    throw new Error('InvalidConfirmation: confirmation requires a named human actor.');
  }
  return { ...existing, state: 'confirmed' };
}

/** Identity is the id. Never the text. */
export function isSameItem(a: Pick<SourceItem, 'id'>, b: Pick<SourceItem, 'id'>): boolean {
  return a.id === b.id;
}

export interface SourceLossReport {
  ok: boolean;
  /** Ids present before and absent after. Any entry at all is a failure. */
  lost: string[];
  /** Ids that changed state in a direction a human act did not authorize. */
  inventedConfirmations: string[];
  /** Ids appearing more than once after the round trip. */
  duplicated: string[];
}

/**
 * Compare a set of source items before and after a transformation — generation, an adapter round
 * trip, a decomposition.
 *
 * This is the check behind LC-02 and LC-03. It is deliberately a *set* comparison on ids and
 * states, not a diff of generated prose: asserting exact wording would fail the first time a
 * prompt is tuned, and the team would learn to ignore it.
 */
export function compareSourceSets(
  before: ReadonlyArray<SourceItem>,
  after: ReadonlyArray<SourceItem>,
): SourceLossReport {
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const afterIds = after.map((i) => i.id);
  const afterById = new Map(after.map((i) => [i.id, i]));

  const lost = [...beforeById.keys()].filter((id) => !afterById.has(id));

  const duplicated = [...new Set(afterIds.filter((id, n) => afterIds.indexOf(id) !== n))];

  // A state may only become 'confirmed' through confirmSourceItem, which no transformation
  // should be calling. If an item comes back confirmed that did not go in confirmed, something
  // manufactured a human decision.
  const inventedConfirmations = after
    .filter((a) => {
      const b = beforeById.get(a.id);
      return b && !HUMAN_ONLY_STATES.has(b.state) && HUMAN_ONLY_STATES.has(a.state);
    })
    .map((a) => a.id);

  return {
    ok: lost.length === 0 && duplicated.length === 0 && inventedConfirmations.length === 0,
    lost,
    duplicated,
    inventedConfirmations,
  };
}

/**
 * Items whose provenance was never recorded. Surfaced so the gap is visible and honest, rather
 * than filled in with a plausible-looking guess.
 */
export function itemsMissingProvenance(items: ReadonlyArray<SourceItem>): string[] {
  return items.filter((i) => i.provenance === null).map((i) => i.id);
}
