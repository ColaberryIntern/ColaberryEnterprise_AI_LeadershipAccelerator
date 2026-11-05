/**
 * govProposalGaps — reads over the gov_proposal_document_gaps table (the typed questions the draft could not answer
 * from grounded facts). Gaps are keyed by (delivery_project_id, doc_key); `resolution` is open | answered | filler.
 * This module keeps the raw-SQL reads in one place so the projection's per-doc open-gap count (B.1) and the
 * open-questions route (B.3) share them. Fail-soft: a read error yields an empty result, never a throw.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { parsePlaceholderNeeds } from './placeholderNeeds';

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

/**
 * v3 (T03): reconcile the placeholder gaps for one document against its current content, so a `[PLACEHOLDER: …]`
 * marker is NEVER left without an open need and an answered marker's gap closes. Every marker becomes one open gap row
 * carrying its typed `need` (JSONB) and a stable `need_key` (for cross-document dedupe). Insert-missing + close-gone,
 * deduped by `need_key`. Fail-soft (gaps are additive; a write error is logged by the caller, never thrown here).
 * Returns the number of needs now open for this document.
 */
export async function reconcilePlaceholderGaps(
  deliveryProjectId: string, docKey: string, contentHtml: string | null | undefined,
): Promise<number> {
  if (!deliveryProjectId || !docKey) return 0;
  const needs = parsePlaceholderNeeds(contentHtml, docKey);
  const wantKeys = new Set(needs.map((n) => n.needKey));
  try {
    const existing = await sequelize.query<{ id: string; need_key: string }>(
      "SELECT id, need_key FROM gov_proposal_document_gaps WHERE delivery_project_id = $1 AND doc_key = $2 AND resolution = 'open' AND need_key IS NOT NULL",
      { bind: [deliveryProjectId, docKey], type: QueryTypes.SELECT },
    );
    const haveKeys = new Set(existing.map((e) => e.need_key));
    for (const n of needs) {
      if (haveKeys.has(n.needKey)) continue;
      await sequelize.query(
        `INSERT INTO gov_proposal_document_gaps
           (delivery_project_id, doc_key, section_key, question, why, suggestions, resolution, need, need_key)
         VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, 'open', $6::jsonb, $7)`,
        { bind: [deliveryProjectId, docKey, n.need.usedIn[0]?.sectionKey ?? '', n.ask, n.need.why, JSON.stringify(n.need), n.needKey] },
      );
    }
    // A marker that is gone was answered or rewritten by the agent: close its open gap.
    for (const e of existing) {
      if (!wantKeys.has(e.need_key)) {
        await sequelize.query("UPDATE gov_proposal_document_gaps SET resolution = 'answered', resolved_at = NOW() WHERE id = $1", { bind: [e.id] });
      }
    }
  } catch (err) {
    console.warn('[gaps] reconcilePlaceholderGaps skipped:', (err as Error)?.message);
  }
  return needs.length;
}
