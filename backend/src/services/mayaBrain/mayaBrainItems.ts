/**
 * OH1i (T3): the AI-fact and build-prompt shelves (table maya_brain_items).
 *
 * The rule this file exists to hold: NOTHING reaches a learner unless a person approved it.
 *   - status = 'approved'
 *   - not expired
 *   - an ai_fact carries a Claim Registry id (CLM-nnn) or a public source URL
 *   - a build_prompt has test_build_status = 'passed' (it actually built something)
 *
 * The Claim Registry is a Basecamp CSV, not a table, so the registry id is recorded on the row
 * (source_label) by the person approving it. The same gates are CHECK constraints in
 * ensureMayaBrainSchema, and the reader below re-checks every row in code, so neither a bad
 * query nor a hand-edited row can put an unapproved item in front of a learner.
 *
 * Every database touch goes through an injectable `Query`, so the gating is unit tested
 * without a database.
 */
import { QueryTypes } from 'sequelize';
import { findBannedCopy } from '../content/bannedCopyMatch';

export type BrainItemKind = 'ai_fact' | 'build_prompt';
export type BrainItemStatus = 'draft' | 'approved' | 'retired';
export type TestBuildStatus = 'pending' | 'passed' | 'failed';

export interface BrainItem {
  id: string;
  kind: BrainItemKind;
  title: string;
  body: string;
  source_url: string | null;
  source_label: string | null;
  virality: number | null;
  signal_id: string | null;
  status: BrainItemStatus;
  test_build_status: TestBuildStatus;
  test_build_notes: string | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  expires_at: string | Date | null;
  created_at?: string | Date;
  updated_at?: string | Date;
}

/** One SQL call with named replacements; returns rows. Injected in tests. */
export type Query = <T = any>(sql: string, replacements?: Record<string, unknown>) => Promise<T[]>;

export const defaultQuery: Query = async <T = any>(sql: string, replacements: Record<string, unknown> = {}) => {
  const { sequelize } = await import('../../config/database');
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT }) as unknown as Promise<T[]>;
};

/** Days an approval lasts when the approver does not set one: facts age fast, prompts slower. */
export const DEFAULT_EXPIRY_DAYS: Record<BrainItemKind, number> = { ai_fact: 30, build_prompt: 90 };

export const CLAIM_ID_RE = /\bCLM-\d{3,}\b/;
const PUBLIC_URL_RE = /^https?:\/\/[^/\s]+\.[^/\s]+/i;
/** Hosts that are never a public source: our own admin, local machines, private ranges. */
const PRIVATE_HOST_RE = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|[^/]*\/admin\b)/i;

/** True when the URL is a public web address a learner could open. */
export function isPublicSourceUrl(url: string | null | undefined): boolean {
  const u = String(url || '').trim();
  return PUBLIC_URL_RE.test(u) && !PRIVATE_HOST_RE.test(u);
}

/** Why this row may not be approved (empty = it may). Pure. */
export function approvalProblems(item: Pick<BrainItem, 'kind' | 'title' | 'body' | 'source_url' | 'source_label' | 'test_build_status' | 'status'>): string[] {
  const p: string[] = [];
  if (item.status === 'retired') p.push('a retired item cannot be approved; create a new one');
  if (!String(item.title || '').trim() || !String(item.body || '').trim()) p.push('title and body are required');
  if (item.kind === 'ai_fact' && !CLAIM_ID_RE.test(String(item.source_label || '')) && !isPublicSourceUrl(item.source_url)) {
    p.push('an AI fact needs a Claim Registry id (CLM-nnn) in source_label or a public source URL');
  }
  if (item.kind === 'build_prompt' && item.test_build_status !== 'passed') {
    p.push('a build prompt must pass its test-build before it is approved');
  }
  // Everything here can end up in an email: the credit line too (a viral post's own title can
  // carry a banned word). The approver fixes it by passing a clean source_label at approval.
  const hits = findBannedCopy(`${item.title || ''}\n${item.body || ''}\n${item.source_label || ''}`);
  if (hits.length) p.push(`banned word in the title, body or source label: ${hits.map((h) => h.text).join(', ')}`);
  return p;
}

function toTime(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = new Date(v as any).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** The learner gate, applied to every row a reader returns (pure). */
export function isServable(item: BrainItem, now: Date = new Date()): boolean {
  if (!item || item.status !== 'approved') return false;
  const exp = toTime(item.expires_at);
  if (exp !== null && (Number.isNaN(exp) || exp <= now.getTime())) return false;
  if (!item.approved_at) return false;
  return approvalProblems(item).length === 0;
}

/**
 * Approved, unexpired, gated items of one kind, best first. The SQL filters, then every row is
 * re-checked by isServable. A table that does not exist yet (schema not applied) is an empty
 * shelf, never an error that blocks a send.
 */
export async function readServableItems(
  kind: BrainItemKind,
  opts: { limit?: number; excludeIds?: string[]; now?: Date; query?: Query } = {},
): Promise<BrainItem[]> {
  const q = opts.query ?? defaultQuery;
  const now = opts.now ?? new Date();
  try {
    const rows = await q<BrainItem>(
      `SELECT * FROM maya_brain_items
        WHERE kind = :kind AND status = 'approved'
          AND (expires_at IS NULL OR expires_at > :now)
          AND (kind <> 'build_prompt' OR test_build_status = 'passed')
        ORDER BY virality DESC NULLS LAST, approved_at DESC
        LIMIT :limit`,
      { kind, now, limit: Math.max(1, Math.min(200, opts.limit ?? 50)) },
    );
    const exclude = new Set(opts.excludeIds ?? []);
    return rows.filter((r) => r.kind === kind && !exclude.has(r.id) && isServable(r, now));
  } catch (err: any) {
    console.warn(`[MayaBrain] ${kind} shelf unavailable: ${err?.message}`);
    return [];
  }
}

export async function listItems(
  filter: { kind?: BrainItemKind; status?: BrainItemStatus; limit?: number } = {},
  query: Query = defaultQuery,
): Promise<BrainItem[]> {
  return query<BrainItem>(
    `SELECT * FROM maya_brain_items
      WHERE (CAST(:kind AS text) IS NULL OR kind = :kind) AND (CAST(:status AS text) IS NULL OR status = :status)
      ORDER BY created_at DESC LIMIT :limit`,
    { kind: filter.kind ?? null, status: filter.status ?? null, limit: Math.max(1, Math.min(500, filter.limit ?? 100)) },
  );
}

async function getItem(id: string, query: Query): Promise<BrainItem | null> {
  const [row] = await query<BrainItem>(`SELECT * FROM maya_brain_items WHERE id = :id`, { id });
  return row ?? null;
}

export class BrainItemError extends Error {
  constructor(public code: 'not_found' | 'not_allowed', message: string, public problems: string[] = []) {
    super(message);
  }
}

/** A new draft. Drafts never reach a learner; approval is a separate, gated step. */
export async function createDraft(
  input: { kind: BrainItemKind; title: string; body: string; source_url?: string | null; source_label?: string | null;
    virality?: number | null; signal_id?: string | null; test_build_notes?: string | null },
  query: Query = defaultQuery,
): Promise<BrainItem | null> {
  const [row] = await query<BrainItem>(
    `INSERT INTO maya_brain_items (kind, title, body, source_url, source_label, virality, signal_id, status, test_build_status, test_build_notes)
     VALUES (:kind, :title, :body, :source_url, :source_label, :virality, :signal_id, 'draft', 'pending', :notes)
     ON CONFLICT (kind, signal_id) WHERE signal_id IS NOT NULL DO NOTHING
     RETURNING *`,
    {
      kind: input.kind, title: input.title.slice(0, 300), body: input.body,
      source_url: input.source_url ?? null, source_label: input.source_label ? input.source_label.slice(0, 300) : null,
      virality: input.virality ?? null, signal_id: input.signal_id ?? null, notes: input.test_build_notes ?? null,
    },
  );
  return row ?? null;
}

export async function approveItem(
  id: string,
  by: string,
  opts: { expiresAt?: Date | null; sourceLabel?: string | null; sourceUrl?: string | null; now?: Date } = {},
  query: Query = defaultQuery,
): Promise<BrainItem> {
  const item = await getItem(id, query);
  if (!item) throw new BrainItemError('not_found', 'item not found');
  const candidate = {
    ...item,
    source_label: opts.sourceLabel !== undefined ? opts.sourceLabel : item.source_label,
    source_url: opts.sourceUrl !== undefined ? opts.sourceUrl : item.source_url,
  };
  const problems = approvalProblems(candidate);
  if (problems.length) throw new BrainItemError('not_allowed', 'item cannot be approved', problems);
  const now = opts.now ?? new Date();
  const expiresAt = opts.expiresAt !== undefined && opts.expiresAt !== null
    ? opts.expiresAt
    : new Date(now.getTime() + DEFAULT_EXPIRY_DAYS[item.kind] * 864e5);
  if (expiresAt.getTime() <= now.getTime()) throw new BrainItemError('not_allowed', 'expiry must be in the future', ['expires_at is in the past']);
  const [row] = await query<BrainItem>(
    `UPDATE maya_brain_items SET status = 'approved', approved_by = :by, approved_at = :now, expires_at = :exp,
            source_label = :label, source_url = :url, updated_at = :now
      WHERE id = :id RETURNING *`,
    { id, by, now, exp: expiresAt, label: candidate.source_label, url: candidate.source_url },
  );
  return row;
}

export async function retireItem(id: string, query: Query = defaultQuery): Promise<BrainItem> {
  const [row] = await query<BrainItem>(
    `UPDATE maya_brain_items SET status = 'retired', updated_at = NOW() WHERE id = :id RETURNING *`, { id });
  if (!row) throw new BrainItemError('not_found', 'item not found');
  return row;
}

/**
 * A person records the result of running the prompt with an agent. A failed test-build on an
 * approved prompt takes it off the shelf (back to draft) in the same statement, so the CHECK
 * constraint and the learner gate never disagree.
 */
export async function markTestBuild(
  id: string,
  result: 'passed' | 'failed',
  notes: string,
  by: string,
  query: Query = defaultQuery,
): Promise<BrainItem> {
  const item = await getItem(id, query);
  if (!item) throw new BrainItemError('not_found', 'item not found');
  if (item.kind !== 'build_prompt') throw new BrainItemError('not_allowed', 'only build prompts are test-built');
  const stamp = `[${new Date().toISOString()} ${by}] ${result.toUpperCase()}: ${notes}`.slice(0, 4000);
  const [row] = await query<BrainItem>(
    `UPDATE maya_brain_items
        SET test_build_status = :result,
            status = CASE WHEN :result = 'failed' AND status = 'approved' THEN 'draft' ELSE status END,
            test_build_notes = CONCAT_WS(E'\\n', test_build_notes, CAST(:stamp AS text)),
            updated_at = NOW()
      WHERE id = :id RETURNING *`,
    { id, result, stamp },
  );
  return row;
}

/** Shelf counts for the controls page (T5): approved-and-servable vs waiting. */
export async function shelfCounts(query: Query = defaultQuery): Promise<Record<BrainItemKind, { servable: number; draft: number }>> {
  const out: Record<BrainItemKind, { servable: number; draft: number }> = {
    ai_fact: { servable: 0, draft: 0 }, build_prompt: { servable: 0, draft: 0 },
  };
  try {
    for (const kind of ['ai_fact', 'build_prompt'] as BrainItemKind[]) {
      out[kind].servable = (await readServableItems(kind, { limit: 200, query })).length;
      const [d] = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM maya_brain_items WHERE kind = :kind AND status = 'draft'`, { kind });
      out[kind].draft = Number(d?.n || 0);
    }
  } catch (err: any) {
    console.warn(`[MayaBrain] shelf counts unavailable: ${err?.message}`);
  }
  return out;
}
