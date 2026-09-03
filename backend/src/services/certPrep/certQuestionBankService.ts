import { Op } from 'sequelize';
import CertQuestion from '../../models/CertQuestion';
import CertQuestionRevision, {
  CertQuestionOption,
  CertQuestionRevisionAttributes,
  CertReviewStatus,
  CertDifficulty,
} from '../../models/CertQuestionRevision';

/**
 * certQuestionBankService — the governed path between the question bank and a
 * student. Two guarantees live here, and both are acceptance criteria:
 *
 *   1. ONLY AN APPROVED REVISION IS EVER SERVED. A draft has not been read by a
 *      human. AI may draft an item, but a wrong answer key is worse than no
 *      practice at all, so nothing reaches a student without a reviewer.
 *
 *   2. ANSWER DATA NEVER LEAVES BEFORE SUBMISSION. `toSafeItem` is the only
 *      sanctioned way to shape an item for a client, and it builds its result by
 *      NAMING the safe fields rather than deleting the unsafe ones. That direction
 *      matters: a delete-list silently starts leaking the day someone adds a new
 *      answer-bearing column, an allow-list simply omits it.
 *
 * The scoring and selection logic is written as pure functions taking plain rows,
 * so the boundary cases are unit-tested without a database — same convention as
 * timelineGatingService's pure evaluator.
 *
 * NOTE ON PROVENANCE: this bank contains Colaberry-authored items only. Questions
 * are written against the publicly published exam blueprint; no third-party or
 * purchased practice content is imported, reworded or derived. `serveGuard` treats
 * a non-authored provenance as unservable rather than trusting the flag was set by
 * mistake.
 */

// ── shapes ───────────────────────────────────────────────────────────────────

/** Exactly what a client may see before it submits an answer. */
export interface SafeQuestionItem {
  question_key: string;
  revision: number;
  domain_id: string;
  objective_id: string | null;
  stem: string;
  options: CertQuestionOption[];
  /** How many options to select — the real exam always states this. */
  select_count: number;
  difficulty: CertDifficulty;
}

/** What a client may see AFTER it has submitted that item. */
export interface RevealedQuestionItem extends SafeQuestionItem {
  correct_keys: string[];
  rationale: string;
  distractor_rationales: Record<string, string>;
  your_selection: string[];
  is_correct: boolean;
}

/** The minimal revision shape the pure functions need. */
export type RevisionLike = Pick<
  CertQuestionRevisionAttributes,
  | 'question_key' | 'revision' | 'domain_id' | 'objective_id' | 'stem' | 'options'
  | 'select_count' | 'difficulty' | 'correct_keys' | 'rationale'
  | 'distractor_rationales' | 'review_status' | 'active_from' | 'active_to'
>;

// ── pure core ────────────────────────────────────────────────────────────────

/**
 * Shape an approved revision for delivery to a student.
 *
 * Built as an allow-list. Do not refactor this into `{ ...revision, correct_keys:
 * undefined }` — a spread of a Sequelize instance also behaves differently from a
 * spread of a plain row, which has bitten this repo before.
 */
export function toSafeItem(revision: RevisionLike): SafeQuestionItem {
  return {
    question_key: revision.question_key,
    revision: revision.revision,
    domain_id: revision.domain_id,
    objective_id: revision.objective_id ?? null,
    stem: revision.stem,
    options: (revision.options ?? []).map((o) => ({ key: o.key, text: o.text })),
    select_count: revision.select_count ?? 1,
    difficulty: (revision.difficulty ?? 'medium') as CertDifficulty,
  };
}

/**
 * Score one selection against the stored key.
 *
 * Set equality, not overlap: a multi-response item asking for two answers is
 * correct only when the student picked exactly the right two. Partial credit would
 * quietly inflate readiness, and the real exam does not award it. Duplicate and
 * out-of-order selections are normalised so a client quirk cannot change a result.
 */
export function scoreSelection(correctKeys: string[] | undefined, selectedKeys: string[] | undefined): boolean {
  const correct = new Set((correctKeys ?? []).map(String));
  const selected = new Set((selectedKeys ?? []).map(String));
  if (correct.size === 0) return false; // an item with no key is never "correct"
  if (correct.size !== selected.size) return false;
  for (const key of correct) if (!selected.has(key)) return false;
  return true;
}

/** True when a revision is approved and inside its active window. */
export function isRevisionServable(revision: RevisionLike, now: Date = new Date()): boolean {
  if (revision.review_status !== 'approved') return false;
  if (revision.active_from && new Date(revision.active_from) > now) return false;
  if (revision.active_to && new Date(revision.active_to) <= now) return false;
  return true;
}

/**
 * Choose which revision of a question to serve: the highest-numbered servable one.
 * Returns null when every revision is draft, in review, retired or out of window —
 * the caller must then omit the question, never fall back to an unapproved row.
 */
export function pickServableRevision<T extends RevisionLike>(revisions: T[], now: Date = new Date()): T | null {
  const servable = revisions.filter((r) => isRevisionServable(r, now));
  if (servable.length === 0) return null;
  return servable.reduce((best, r) => (r.revision > best.revision ? r : best));
}

/**
 * Reveal an item after submission — the only place answer data is attached, and
 * only ever for an item this student has actually answered.
 */
export function toRevealedItem(revision: RevisionLike, selectedKeys: string[]): RevealedQuestionItem {
  return {
    ...toSafeItem(revision),
    correct_keys: (revision.correct_keys ?? []).map(String),
    rationale: revision.rationale,
    distractor_rationales: revision.distractor_rationales ?? {},
    your_selection: (selectedKeys ?? []).map(String),
    is_correct: scoreSelection(revision.correct_keys, selectedKeys),
  };
}

// ── database-backed ──────────────────────────────────────────────────────────

/**
 * Load the servable revision for each requested question key.
 *
 * Retired questions are excluded at the identity level, and anything whose
 * provenance is not Colaberry-authored is excluded too. Keys with no servable
 * revision are simply absent from the returned map — callers must handle a short
 * form rather than substituting an unapproved item.
 */
export async function loadServableRevisions(
  questionKeys: string[],
  now: Date = new Date(),
): Promise<Map<string, CertQuestionRevision>> {
  const out = new Map<string, CertQuestionRevision>();
  if (questionKeys.length === 0) return out;

  const identities = await CertQuestion.findAll({
    where: { question_key: { [Op.in]: questionKeys }, is_retired: false },
    attributes: ['question_key', 'provenance'],
  });
  const allowedKeys = identities
    .filter((q) => q.provenance === 'colaberry_authored')
    .map((q) => q.question_key);
  if (allowedKeys.length === 0) return out;

  const revisions = await CertQuestionRevision.findAll({
    where: { question_key: { [Op.in]: allowedKeys }, review_status: 'approved' },
  });

  const byKey = new Map<string, CertQuestionRevision[]>();
  for (const rev of revisions) {
    const list = byKey.get(rev.question_key) ?? [];
    list.push(rev);
    byKey.set(rev.question_key, list);
  }
  for (const [key, list] of byKey) {
    const picked = pickServableRevision(list, now);
    if (picked) out.set(key, picked);
  }
  return out;
}

/**
 * Build the safe, ordered payload for a set of served items.
 *
 * Takes the session's stored form ([{question_key, revision}]) and returns the
 * items as the student saw them — pinned to the recorded revision, so a question
 * approved-then-revised mid-session does not change underneath them.
 */
export async function loadServedItems(
  served: { question_key: string; revision: number }[],
): Promise<SafeQuestionItem[]> {
  if (served.length === 0) return [];
  const rows = await CertQuestionRevision.findAll({
    where: {
      [Op.or]: served.map((s) => ({ question_key: s.question_key, revision: s.revision })),
    },
  });
  const index = new Map(rows.map((r) => [`${r.question_key}#${r.revision}`, r]));
  const items: SafeQuestionItem[] = [];
  for (const s of served) {
    const row = index.get(`${s.question_key}#${s.revision}`);
    if (row) items.push(toSafeItem(row));
  }
  return items;
}

// ── authoring lifecycle ──────────────────────────────────────────────────────

export interface DraftRevisionInput {
  question_key: string;
  track_id: string;
  blueprint_version: string;
  domain_id: string;
  objective_id?: string | null;
  scenario_family?: string | null;
  stem: string;
  options: CertQuestionOption[];
  correct_keys: string[];
  select_count?: number;
  rationale: string;
  distractor_rationales?: Record<string, string>;
  difficulty?: CertDifficulty;
  author?: string | null;
}

/**
 * Create the next draft revision of a question, creating the stable identity row
 * if this is the first one. Always lands as 'draft' — there is no code path that
 * writes an approved revision directly, including for AI-drafted items.
 */
export async function createDraftRevision(input: DraftRevisionInput): Promise<CertQuestionRevision> {
  await CertQuestion.findOrCreate({
    where: { question_key: input.question_key },
    defaults: {
      question_key: input.question_key,
      track_id: input.track_id,
      scenario_family: input.scenario_family ?? null,
      provenance: 'colaberry_authored',
      created_by: input.author ?? null,
    },
  });

  const latest = await CertQuestionRevision.findOne({
    where: { question_key: input.question_key },
    order: [['revision', 'DESC']],
  });
  const nextRevision = (latest?.revision ?? 0) + 1;

  return CertQuestionRevision.create({
    question_key: input.question_key,
    revision: nextRevision,
    blueprint_version: input.blueprint_version,
    domain_id: input.domain_id,
    objective_id: input.objective_id ?? null,
    stem: input.stem,
    options: input.options,
    correct_keys: input.correct_keys,
    select_count: input.select_count ?? 1,
    rationale: input.rationale,
    distractor_rationales: input.distractor_rationales ?? {},
    difficulty: input.difficulty ?? 'medium',
    author: input.author ?? null,
    review_status: 'draft',
  });
}

/** Validation a revision must pass before a human is asked to review it. */
export function validateRevision(input: DraftRevisionInput): string[] {
  const problems: string[] = [];
  if (!input.stem?.trim()) problems.push('stem is required');
  if (!input.rationale?.trim()) problems.push('rationale is required');
  if (!Array.isArray(input.options) || input.options.length < 2) {
    problems.push('at least 2 options are required');
  }
  const optionKeys = new Set((input.options ?? []).map((o) => o.key));
  if (optionKeys.size !== (input.options ?? []).length) problems.push('option keys must be unique');
  if (!Array.isArray(input.correct_keys) || input.correct_keys.length === 0) {
    problems.push('at least one correct key is required');
  }
  for (const key of input.correct_keys ?? []) {
    if (!optionKeys.has(key)) problems.push(`correct key ${key} is not one of the options`);
  }
  const declared = input.select_count ?? 1;
  if (declared !== (input.correct_keys ?? []).length) {
    // The stem tells the student how many to pick; if that disagrees with the key,
    // the item is unanswerable and would score everyone wrong.
    problems.push('select_count must equal the number of correct keys');
  }
  return problems;
}

/**
 * Move a revision through the review lifecycle. Approval requires a named
 * reviewer — an item cannot approve itself, and an unattributed approval is not an
 * audit trail.
 */
export async function setReviewStatus(
  questionKey: string,
  revision: number,
  status: CertReviewStatus,
  reviewer?: string | null,
): Promise<CertQuestionRevision | null> {
  const row = await CertQuestionRevision.findOne({ where: { question_key: questionKey, revision } });
  if (!row) return null;

  if (status === 'approved') {
    if (!reviewer) {
      const err: any = new Error('approval requires a reviewer');
      err.status = 400;
      err.code = 'CERT_APPROVAL_NEEDS_REVIEWER';
      throw err;
    }
    row.reviewer = reviewer;
    row.reviewed_at = new Date();
  }
  row.review_status = status;
  await row.save();
  return row;
}
