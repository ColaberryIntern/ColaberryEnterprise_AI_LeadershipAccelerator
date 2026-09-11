import {
  validateItem,
  type UnderstandingItem,
  type UnderstandingItemHistoryEntry,
} from '../delivery/projectUnderstanding';
import type { StoryTruthEnrichment } from './storyEnrichmentContract';

/**
 * enrichmentMerge - what a story's evidence does to the truth. PURE.
 *
 * ## Additive, deterministic, idempotent, conflict-aware
 *
 * The brief names these four and this module is their implementation. In
 * plain terms:
 *
 *   additive         nothing is ever deleted; a new statement is appended
 *   deterministic    same truth, same event, same answer, in the same order
 *   idempotent       applying an event twice is the same as once
 *   conflict-aware   a value that disagrees with a HUMAN cannot replace it;
 *                    it becomes a question the human is asked
 *
 * ## What evidence may do
 *
 *   strengthen   an ASSUMPTION the system made, matched word for word by a
 *                repo fact, becomes that fact. The assumption is kept in the
 *                item's history, because "we guessed this and the build proved
 *                it" is worth more than "the build says this".
 *   add          a statement no item makes yet is appended, as repo evidence
 *   question     a statement that disagrees with a confirmed item is filed as
 *                a QUESTION naming both values. It sits in the review's
 *                openQuestions group until a person settles it.
 *   nothing      a statement already present is left alone. Not re-dated, not
 *                re-sourced; the first evidence for a fact is enough
 *
 * What evidence may NOT do is refused by the contract, not by this module:
 * `validateItem` rejects a repo fact on a business dimension, and this module
 * reports the refusal rather than quietly softening it to an assumption.
 *
 * ## Decisions and limitations
 *
 * Filed under `constraints`: a decision constrains the stories after it, and
 * a limitation is a constraint the build discovered about itself. Decisions
 * carry the DECISION classification the contract already has. Demonstration
 * evidence and measurement events are NOT merged into truth at all; the
 * brief allows measurements to populate results only through approved
 * measurement definitions, and none exist yet. The ledger keeps them.
 */

export interface MergeCounts {
  added: number;
  strengthened: number;
  questions: number;
  unchanged: number;
  refused: number;
}

export interface MergeRefusal {
  readonly dimension: string;
  readonly value: string;
  readonly reason: string;
}

export interface MergeResult {
  readonly items: UnderstandingItem[];
  readonly counts: MergeCounts;
  readonly refused: MergeRefusal[];
  /** True when `items` differs from the input, i.e. a new revision is warranted. */
  readonly changed: boolean;
}

const HUMAN_CONFIRMED = new Set(['client_confirmed', 'pm_confirmed']);

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

const isHuman = (i: UnderstandingItem): boolean => HUMAN_CONFIRMED.has(i.provenance);

function historyEntry(from: UnderstandingItem, at: string): UnderstandingItemHistoryEntry {
  return {
    value: from.value,
    classification: from.classification,
    provenance: from.provenance,
    ...(from.source_quote ? { source_quote: from.source_quote } : {}),
    replaced_at: at,
    replaced_by: 'repo_evidence',
  };
}

function questionText(storyId: string, found: string, confirmed: string): string {
  return `${storyId} found "${found}", but you confirmed "${confirmed}". Which is right?`;
}

export function mergeEnrichment(
  current: readonly UnderstandingItem[],
  event: StoryTruthEnrichment,
  now: () => string = () => new Date().toISOString(),
): MergeResult {
  const items: UnderstandingItem[] = current.map((i) => ({ ...i }));
  const counts: MergeCounts = { added: 0, strengthened: 0, questions: 0, unchanged: 0, refused: 0 };
  const refused: MergeRefusal[] = [];
  let changed = false;

  const proposals: Array<{ item: UnderstandingItem; label: string }> = [];

  for (const p of event.factProposals) {
    proposals.push({
      label: p.dimension,
      item: {
        dimension: p.dimension,
        value: p.value,
        classification: p.classification,
        provenance: 'repo_evidence',
        source_quote: p.evidence,
      },
    });
  }
  for (const d of event.decisions) {
    const value = d.rationale ? `${d.statement} (because ${d.rationale})` : d.statement;
    proposals.push({
      label: 'decision',
      item: { dimension: 'constraints', value, classification: 'DECISION', provenance: 'repo_evidence', source_quote: d.evidence },
    });
  }
  for (const l of event.limitations) {
    proposals.push({
      label: 'limitation',
      item: { dimension: 'constraints', value: l.statement, classification: 'FACT', provenance: 'repo_evidence', source_quote: l.evidence },
    });
  }

  for (const { item: candidate } of proposals) {
    // The contract decides what a repository may establish. A refusal here is
    // reported, never softened: downgrading a refused fact to an assumption
    // would let it back in through the side door.
    const valid = validateItem(candidate);
    if (!valid.ok) {
      counts.refused += 1;
      refused.push({ dimension: candidate.dimension, value: candidate.value, reason: valid.reason });
      continue;
    }

    const sameDim = items.filter((i) => i.dimension === candidate.dimension);
    const twin = sameDim.find((i) => norm(i.value) === norm(candidate.value));

    if (twin) {
      // Word-for-word match. If what we had was a guess and the build proves
      // it, the guess becomes the fact and is kept in history. Anything else
      // already present is left exactly as it is.
      const canStrengthen = twin.classification === 'ASSUMPTION'
        && candidate.classification === 'FACT'
        && !isHuman(twin);
      if (canStrengthen) {
        const idx = items.indexOf(twin);
        items[idx] = {
          ...twin,
          classification: 'FACT',
          provenance: 'repo_evidence',
          source_quote: candidate.source_quote,
          history: [historyEntry(twin, now()), ...(twin.history ?? [])],
        };
        counts.strengthened += 1;
        changed = true;
      } else {
        counts.unchanged += 1;
      }
      continue;
    }

    const confirmed = sameDim.find(isHuman);
    if (confirmed && candidate.classification === 'FACT') {
      // A disagreement with a person is a question for that person, never a
      // replacement. Filed once: the same question twice is the same question.
      const text = questionText(event.storyId, candidate.value, confirmed.value);
      const asked = items.some((i) => i.dimension === candidate.dimension && i.classification === 'QUESTION' && norm(i.value) === norm(text));
      if (asked) {
        counts.unchanged += 1;
      } else {
        items.push({
          dimension: candidate.dimension,
          value: text,
          classification: 'QUESTION',
          provenance: 'repo_evidence',
          source_quote: candidate.source_quote,
        });
        counts.questions += 1;
        changed = true;
      }
      continue;
    }

    items.push(candidate);
    counts.added += 1;
    changed = true;
  }

  return { items, counts, refused, changed };
}
