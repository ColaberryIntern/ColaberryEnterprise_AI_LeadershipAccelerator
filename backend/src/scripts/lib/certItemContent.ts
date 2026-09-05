import { canonicalJson } from '../../utils/canonicalHash';

/**
 * Has an authored CCAR item changed from what is stored?
 *
 * A LEAF MODULE, deliberately. It imports one pure helper and nothing else -- no
 * model, no service, no database. `sameContent` decides whether a student's
 * question gets re-minted as a new revision, which is exactly the kind of rule
 * that must be testable without standing up Sequelize. It lived inside
 * `seedCertPrepContent.ts` first, and importing that file to test it pulled in
 * the model layer and failed on a mocked connection.
 *
 * ── WHY canonicalJson AND NOT JSON.stringify ─────────────────────────────────
 * `options`, `correct_keys` and `distractor_rationales` are jsonb. Postgres does
 * not store object keys in the order they were written -- it returns them
 * sorted -- so a stored `{B, C, D}` never string-matches a freshly built
 * `{C, D, B}`. Exactly one item in a hundred and fifty differed on nothing but
 * that, and it re-minted a fresh draft revision on every single --revise run.
 * Nothing failed; the review queue just grew by one, forever.
 *
 * That was the SECOND appearance of this bug in one day. The first was in
 * `seedTypeCertificationMap`, fixed there in a private helper that this file
 * could not reach -- which is precisely the failure mode `utils/canonicalHash`
 * warns about in its own header. Both seeders now import the shared one.
 *
 * ── WHAT COUNTS AS A CHANGE ──────────────────────────────────────────────────
 * Only what a student sees and is scored on: the stem, the options and their
 * order, which option is correct, and the explanations. Difficulty and scenario
 * labels are editorial metadata -- re-opening an approved question for review
 * because somebody re-tagged it `hard` would train reviewers to click through.
 *
 * Note that the options ARRAY order is significant here even though object key
 * order is not. That is not an inconsistency: the position of the correct answer
 * is the very thing the rebalance changed, so a reordered array is the change.
 */
export interface ComparableItem {
  stem: string;
  options: unknown;
  correct_keys: unknown;
  rationale: string | null;
  distractor_rationales?: unknown;
}

export const sameContent = (stored: ComparableItem, authored: ComparableItem): boolean =>
  stored.stem === authored.stem
  && canonicalJson(stored.options ?? null) === canonicalJson(authored.options ?? null)
  && canonicalJson(stored.correct_keys ?? null) === canonicalJson(authored.correct_keys ?? null)
  && (stored.rationale ?? '') === (authored.rationale ?? '')
  && canonicalJson(stored.distractor_rationales ?? null) === canonicalJson(authored.distractor_rationales ?? null);
