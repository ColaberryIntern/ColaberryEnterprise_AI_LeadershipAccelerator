/**
 * requirementTriage — is this extracted sentence an obligation on US, and of what kind? PURE.
 *
 * ## The gap this fills
 *
 * `contract_requirements` can say what KIND a requirement is, but it has no way to say
 * **"this row is not a requirement at all"**. So an extractor that pulls 56 sentences out of a
 * solicitation stores 56 requirements, and the SOURCE_COVERAGE gate then demands a task cite
 * every one of them — including the ones that impose nothing on anybody. That turns a compliance
 * gate into a citation quota and the tasks into buckets.
 *
 * The Herriman solicitation (`80b35be2`) contains, stored as `compliance/must` like everything
 * else: *"If the selected Proposer and the City attorneys' office are unable to negotiate an
 * acceptable agreement, then another Proposer(s) will be selected by the City Manager."* That
 * describes the City's own procedure. It binds Colaberry to nothing. It is not a requirement.
 *
 * ## Why rule-based
 *
 * A person has to be able to ask "why is this one administrative" and get a checkable answer, so
 * every result carries the `reason` that decided it. A model call here would reintroduce exactly
 * the unauditable classification that left 858 of 864 production rows identical — a classifier
 * with one output class is not classifying.
 *
 * ## What this does NOT do
 *
 * It does not write. Triage is advisory until a human confirms it; `ContractRequirement` already
 * has `interpretation` and `human_confirmed` for exactly that, and filling them is a separate,
 * authorised act. Nothing here changes a stored row.
 */

import { classifyRequirementCategory, type ReqItemCategory } from './requirementSignals';
import type { RequirementKind, RequirementPriority } from '../contracts/factoryContract';

/**
 * Whether the sentence binds the bidder.
 *
 * `obligation`   — it requires something of us. The only class that belongs in a compliance matrix.
 * `city_process` — it describes what the BUYER will do. Real information, not an obligation.
 * `question`     — a Q&A row. Often carries scope detail, but is not itself a requirement.
 * `note`         — informational. Binds nobody and asks nothing.
 */
export type TriageClass = 'obligation' | 'city_process' | 'question' | 'note';

export interface TriageResult {
  category: ReqItemCategory;
  kind: RequirementKind;
  priority: RequirementPriority;
  triageClass: TriageClass;
  /** The evidence that decided `triageClass`. Never empty — an unexplained verdict is not one. */
  reason: string;
}

/**
 * The existing four categories onto the existing five kinds.
 *
 * `pricing` IS UNREACHABLE THROUGH THIS MAP, and that is stated rather than hidden:
 * `SIGNALS.submit` already matches "pricing sheet", "cost proposal" and "fee schedule", so a
 * pricing requirement is categorised `submit` and lands here as `administrative`. Zero `pricing`
 * rows is therefore an artefact of the signal order, never a finding about a solicitation.
 */
const KIND_OF: Record<ReqItemCategory, RequirementKind> = {
  submit: 'administrative',
  rule: 'compliance',
  scope: 'technical',
  after_award: 'management',
};

/** Interrogative: a question row, whatever else it contains. */
const QUESTION_RE = /\?|^\s*(?:does|do|can|could|what|which|are|is|how|when|where|who|will)\b/i;

/**
 * An obligation falling on the bidder. Includes PROHIBITIONS, which bind just as hard as duties
 * and carry no positive modal: "No late response will be accepted" requires us not to be late.
 */
const OBLIGATION_RE = new RegExp(
  '\\b(?:must|shall|required\\s+to|should|needs?\\s+to|will\\s+be\\s+required)\\b'
  + '|\\b(?:prohibited|may\\s+not)\\b'
  // The window is 80 rather than 40 because the real clause lists three nouns between them:
  // "No late response, modification, or amendment will be accepted" spans 43 characters, and a
  // 40-char window silently filed a binding prohibition as an informational note.
  + '|\\bno\\s+[^.]{0,80}?will\\s+(?:not\\s+)?be\\s+accepted\\b',
  'i',
);

/**
 * The BUYER as the actor. Only consulted when no obligation on us was found, because
 * "Proposals must be submitted to the City" names the City and still binds us.
 */
const CITY_ACTOR_RE = new RegExp(
  '\\bthe\\s+City\\s+(?:is|will|may|reserves|requests?|requesting|intends)\\b'
  + '|\\breview\\s+panel\\b'
  + '|\\bwill\\s+be\\s+(?:selected|reviewed|appointed|taken|provided|asked)\\b'
  + '|\\bno\\s+guarant(?:y|ee)\\b',
  'i',
);

/** `should` alone is a preference; anything mandatory outranks it. */
function priorityOf(text: string): RequirementPriority {
  const mandatory = /\b(?:must|shall|required\s+to|prohibited|may\s+not)\b/i.test(text);
  if (mandatory) return 'must';
  return /\bshould\b/i.test(text) ? 'should' : 'must';
}

/** The matched substring, so the reason quotes the evidence instead of asserting it. */
function matched(re: RegExp, text: string): string {
  const m = text.match(re);
  return m ? m[0].trim().toLowerCase() : '';
}

/**
 * Triage one statement.
 *
 * PRECEDENCE, and why this order:
 *   1. question     — an interrogative is unambiguous and often also contains modal verbs
 *                     ("Can you provide the expected number of users?"), so it must win.
 *   2. obligation   — any duty or prohibition on the bidder, even where the City is named.
 *   3. city_process — the buyer acting, with nothing asked of us.
 *   4. note         — everything else. Honest, and not a guess dressed as a class.
 */
export function triageStatement(text: string): TriageResult {
  const raw = String(text ?? '').trim();
  const category = classifyRequirementCategory(raw);
  const base = { category, kind: KIND_OF[category], priority: priorityOf(raw) };

  if (!raw) {
    return { ...base, priority: 'must', triageClass: 'note', reason: 'empty statement' };
  }

  const q = matched(QUESTION_RE, raw);
  if (q) {
    return { ...base, triageClass: 'question', reason: `interrogative (${JSON.stringify(q)})` };
  }

  const o = matched(OBLIGATION_RE, raw);
  if (o) {
    return { ...base, triageClass: 'obligation', reason: `obligation on the bidder (${JSON.stringify(o)})` };
  }

  const c = matched(CITY_ACTOR_RE, raw);
  if (c) {
    return {
      ...base,
      triageClass: 'city_process',
      reason: `describes the buyer's own process (${JSON.stringify(c)}), nothing required of the bidder`,
    };
  }

  return { ...base, triageClass: 'note', reason: 'no obligation, question or buyer action found' };
}

export interface TriageTally {
  total: number;
  byClass: Record<TriageClass, number>;
  byKind: Partial<Record<RequirementKind, number>>;
  /** Rows that belong in a compliance matrix. The rest are informational. */
  binding: number;
  /** True when every row landed in one class — the defect this work exists to detect. */
  singleValued: boolean;
}

/** Tally a set, so "is the distribution still single-valued" is one call and not a judgement. */
export function tallyTriage(results: readonly TriageResult[]): TriageTally {
  const byClass: Record<TriageClass, number> = { obligation: 0, city_process: 0, question: 0, note: 0 };
  const byKind: Partial<Record<RequirementKind, number>> = {};
  for (const r of results) {
    byClass[r.triageClass] += 1;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  }
  const nonEmptyKinds = Object.values(byKind).filter((n) => (n ?? 0) > 0).length;
  return {
    total: results.length,
    byClass,
    byKind,
    binding: byClass.obligation,
    // One kind across a whole set is the 858-of-864 signature. Zero rows is not single-valued,
    // it is empty, and calling it single-valued would be a false positive on nothing.
    singleValued: results.length > 0 && nonEmptyKinds === 1,
  };
}
