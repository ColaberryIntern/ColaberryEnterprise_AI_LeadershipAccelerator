/**
 * Parses and validates the `/knowledge` export (`kb.json`) into typed entries.
 *
 * WHY THIS IS A PARSER AND NOT A LOADER. `kb.json` lives at
 * `frontend/public/knowledge/kb.json` and is baked into the NGINX image by the CRA
 * build. `backend/Dockerfile` copies only `frontend/src/pages/`, so the file is not in
 * the backend image and cannot be read from disk at runtime - checked, not assumed.
 * `backend/src/assets/colaberryLogo.ts` is the existing precedent for a frontend asset
 * the backend needs: it was inlined rather than read. Inlining a 141 KB document that
 * changes with the marketing copy would be worse, so this module takes the parsed JSON
 * as an argument and leaves HOW the bytes arrive to the caller. That also keeps it pure
 * and testable without fs or network.
 *
 * WHY THE TRI-STATE MATTERS, AND WHY THIS REFUSES OLDER EXPORTS. The export carries a
 * boolean `needs_verification`, which is lossy: `build-kb.js` maps "drafted-verify" to
 * true and EVERYTHING ELSE to false. 137 of the 217 entries (63%) carry no `confidence`
 * value at all, because only the sales domain has ever been triaged - so for those 137,
 * `needs_verification: false` means "nobody said", not "verified". Reading the boolean
 * would treat most of the library as checked. Schema 1.1 added the raw `confidence`
 * value for exactly this reason, so this parser REQUIRES >= 1.1 rather than defaulting a
 * missing field to something comfortable. An older export fails loudly instead of
 * silently reading as fully verified.
 *
 * That fail-open shape is not hypothetical here: it is what `resolveContentPageAccess`
 * did when it read absent state as approved and once marked all 153 Explorers CONVERTED.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: decide whether an entry may be quoted. That is
 * `explorerKnowledgeQuote.ts`. This module answers only "is this a well-formed knowledge
 * base, and what does each entry actually say about its own provenance".
 */

import { z } from 'zod';

/**
 * An entry's own statement about its provenance, kept as three distinct states.
 *
 * - `grounded`        a human explicitly vouched for it
 * - `drafted-verify`  written but NOT confirmed; the hub's own admin copy says
 *                     "confirm before quoting verbatim"
 * - `unstated`        nobody ever said anything. NOT a synonym for `grounded`.
 */
export type KnowledgeConfidence = 'grounded' | 'drafted-verify' | 'unstated';

/** One question-and-answer pair, as a consumer should see it. */
export interface KnowledgeEntry {
  /**
   * The export's own id, e.g. `sales-8`.
   *
   * NOT A DURABLE KEY, and deliberately not used as one anywhere downstream.
   * `build-kb.js` computes it as `domain + "-" + (i + 1)` over the source array index,
   * so inserting or reordering a single entry silently renumbers every later entry in
   * that domain. It is kept because it is useful for talking about an entry inside one
   * version of the file, and it is the only handle the export offers.
   */
  readonly id: string;
  readonly domain: string;
  readonly category: string;
  readonly question: string;
  readonly answer: string;
  /** Supplementary text. Empty string when the source supplied none. */
  readonly detail: string;
  readonly tags: readonly string[];
  /** Deep link into the hub, e.g. `sales/index.html#cat-program-basics`. May be empty. */
  readonly reference: string;
  readonly referenceLabel: string;
  /** The tri-state. See {@link KnowledgeConfidence}. */
  readonly confidence: KnowledgeConfidence;
}

/** The parsed document, envelope included. */
export interface KnowledgeBase {
  readonly schema: string;
  readonly version: string;
  /** The hub's own file-level caveats. Carried through because they are load-bearing. */
  readonly description: string;
  /** The authoritative program facts string the hub maintains separately from entries. */
  readonly coreFacts: string;
  readonly generatedAt: string;
  readonly entries: readonly KnowledgeEntry[];
}

/**
 * Raised when the document is not a knowledge base this code can safely read.
 *
 * Carries a stable `errorClass` because the Observability rules require every caught
 * exception to be tagged with one before it is logged; a bare `Error` is not an
 * acceptable classification in a production path.
 */
export class KnowledgeBaseContractError extends Error {
  public readonly errorClass = 'ContractViolation';

  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeBaseContractError';
  }
}

/** The schema identifier this parser understands. */
export const SUPPORTED_SCHEMA = 'colaberry.kb/v1';

/**
 * The minimum export version, because 1.1 is where per-entry `confidence` arrived.
 * Below this the tri-state is simply absent and cannot be reconstructed.
 */
export const MIN_SUPPORTED_VERSION = '1.1';

const entrySchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  category: z.string(),
  category_key: z.string(),
  question: z.string().min(1),
  answer: z.string().min(1),
  detail: z.string(),
  tags: z.array(z.string()),
  reference: z.string(),
  reference_label: z.string(),
  // Required, not defaulted. A missing value here is the whole problem this parser
  // exists to refuse, so it must not be quietly filled in.
  confidence: z.enum(['grounded', 'drafted-verify', 'unstated']),
});

const envelopeSchema = z.object({
  schema: z.string(),
  version: z.string(),
  description: z.string(),
  core_facts: z.string(),
  generated_at: z.string(),
  count: z.number().int().nonnegative(),
  entries: z.array(entrySchema),
});

/** Compares dotted numeric versions. Returns true when `actual` >= `minimum`. */
function versionAtLeast(actual: string, minimum: string): boolean {
  const a = actual.split('.').map((n) => Number.parseInt(n, 10));
  const m = minimum.split('.').map((n) => Number.parseInt(n, 10));
  if (a.some(Number.isNaN) || m.some(Number.isNaN)) return false;
  const len = Math.max(a.length, m.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = m[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

/**
 * Validates a parsed `kb.json` and returns typed entries.
 *
 * Throws {@link KnowledgeBaseContractError} rather than returning a partial result: a
 * half-read knowledge base is more dangerous than no knowledge base, because the missing
 * half is invisible at the call site.
 *
 * @param raw the result of `JSON.parse` on the export - this function does no I/O.
 */
export function parseKnowledgeBase(raw: unknown): KnowledgeBase {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first && first.path.length > 0 ? first.path.join('.') : '(root)';
    const why = first ? first.message : 'unknown validation failure';
    throw new KnowledgeBaseContractError(
      `kb.json does not match the expected shape at ${where}: ${why}`,
    );
  }

  const doc = parsed.data;

  if (doc.schema !== SUPPORTED_SCHEMA) {
    throw new KnowledgeBaseContractError(
      `unsupported knowledge base schema "${doc.schema}" (expected "${SUPPORTED_SCHEMA}")`,
    );
  }

  if (!versionAtLeast(doc.version, MIN_SUPPORTED_VERSION)) {
    throw new KnowledgeBaseContractError(
      `knowledge base version "${doc.version}" predates ${MIN_SUPPORTED_VERSION}, which is ` +
        'where per-entry `confidence` was added. Without it, an entry nobody reviewed is ' +
        'indistinguishable from one a human vouched for, so this export cannot be read safely. ' +
        'Regenerate it with `node build-kb.js` from frontend/public/knowledge.',
    );
  }

  // The export states its own entry count. Nothing used it before now; a mismatch means
  // the document was edited by hand or truncated in transit, and either way the entry
  // list cannot be trusted to be complete.
  if (doc.count !== doc.entries.length) {
    throw new KnowledgeBaseContractError(
      `knowledge base declares count ${doc.count} but carries ${doc.entries.length} entries`,
    );
  }

  const seen = new Set<string>();
  for (const entry of doc.entries) {
    if (seen.has(entry.id)) {
      throw new KnowledgeBaseContractError(`duplicate entry id "${entry.id}"`);
    }
    seen.add(entry.id);
  }

  return {
    schema: doc.schema,
    version: doc.version,
    description: doc.description,
    coreFacts: doc.core_facts,
    generatedAt: doc.generated_at,
    entries: doc.entries.map((e) => ({
      id: e.id,
      domain: e.domain,
      category: e.category,
      question: e.question,
      answer: e.answer,
      detail: e.detail,
      tags: e.tags,
      reference: e.reference,
      referenceLabel: e.reference_label,
      confidence: e.confidence,
    })),
  };
}

/**
 * How many entries sit in each confidence state.
 *
 * Exported because the distribution is the argument for the gate's posture, and a number
 * in a comment rots while a function does not.
 */
export function confidenceBreakdown(
  base: KnowledgeBase,
): Record<KnowledgeConfidence, number> {
  const out: Record<KnowledgeConfidence, number> = {
    grounded: 0,
    'drafted-verify': 0,
    unstated: 0,
  };
  for (const entry of base.entries) out[entry.confidence] += 1;
  return out;
}
