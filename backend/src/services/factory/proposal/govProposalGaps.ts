/**
 * govProposalGaps — reads over the gov_proposal_document_gaps table (the typed questions the draft could not answer
 * from grounded facts). Gaps are keyed by (delivery_project_id, doc_key); `resolution` is open | answered | filler.
 * This module keeps the raw-SQL reads in one place so the projection's per-doc open-gap count (B.1) and the
 * open-questions route (B.3) share them. Fail-soft: a read error yields an empty result, never a throw.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/** Open-gap count per `doc_key` for a project (resolution='open'), in ONE query. Backs the projection summary. */
export async function openGapCountsByDoc(deliveryProjectId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!deliveryProjectId) return out;
  try {
    const rows = await sequelize.query<{ doc_key: string; n: string }>(
      "SELECT doc_key, COUNT(*)::text AS n FROM gov_proposal_document_gaps WHERE delivery_project_id = $1 AND resolution = 'open' GROUP BY doc_key",
      { bind: [deliveryProjectId], type: QueryTypes.SELECT },
    );
    for (const r of rows) out.set(r.doc_key, Number(r.n) || 0);
  } catch { /* gaps are additive; absence ⇒ empty */ }
  return out;
}

/** One open question for the agent panel's "Needs your answer" list (B.3): the question, a why line, the documents
 *  it blocks, and any suggested options. `key` is a URL-safe encoding of the question text (the gap-resolve matches
 *  on that text), so the answer route can round-trip it without a separate key store. */
export interface OpenQuestion { key: string; question: string; why: string | null; documentKeys: string[]; suggestions: string[] }

/** PURE: group raw open-gap rows into deduplicated questions (one per distinct question text). Exported for testing. */
export function groupOpenQuestions(rows: Array<{ question?: string | null; why?: string | null; suggestions?: unknown; doc_key?: string | null }>): OpenQuestion[] {
  const byQ = new Map<string, OpenQuestion>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const q = String(r?.question ?? '').trim();
    if (!q) continue;
    const sugg = Array.isArray(r?.suggestions) ? (r!.suggestions as unknown[]).map((s) => String(s)) : [];
    const docKey = r?.doc_key ? String(r.doc_key) : '';
    const existing = byQ.get(q);
    if (!existing) {
      byQ.set(q, { key: encodeQuestionKey(q), question: q, why: r?.why ?? null, documentKeys: docKey ? [docKey] : [], suggestions: [...new Set(sugg)] });
    } else {
      if (docKey && !existing.documentKeys.includes(docKey)) existing.documentKeys.push(docKey);
      for (const s of sugg) if (!existing.suggestions.includes(s)) existing.suggestions.push(s);
      if (!existing.why && r?.why) existing.why = r.why;
    }
  }
  return [...byQ.values()];
}

export const encodeQuestionKey = (question: string): string => Buffer.from(String(question ?? ''), 'utf8').toString('base64url');
export const decodeQuestionKey = (key: string): string | null => {
  try { const q = Buffer.from(String(key ?? ''), 'base64url').toString('utf8'); return q || null; } catch { return null; }
};

/** The open questions for a project's agent panel (B.3) — grouped, newest gap first. */
export async function listOpenQuestions(deliveryProjectId: string): Promise<OpenQuestion[]> {
  if (!deliveryProjectId) return [];
  try {
    const rows = await sequelize.query<{ question: string; why: string | null; suggestions: unknown; doc_key: string }>(
      "SELECT question, why, suggestions, doc_key FROM gov_proposal_document_gaps WHERE delivery_project_id = $1 AND resolution = 'open' ORDER BY created_at ASC",
      { bind: [deliveryProjectId], type: QueryTypes.SELECT },
    );
    return groupOpenQuestions(rows);
  } catch { return []; }
}
