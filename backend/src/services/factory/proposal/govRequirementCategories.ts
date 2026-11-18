/**
 * govRequirementCategories - the growable requirement taxonomy (CC-20261117-q8k3).
 *
 * The built-in groups live in code (needGrouping.GROUP_DEFS) and are always active. This service adds the GROWTH:
 * categories an admin adds, or the AI classifier PROPOSES, when a new kind of demand shows up, stored per tenant in
 * gov_requirement_categories. A proposed category is `pending` and never shapes the drafter or the picker until an
 * admin activates it (trust before intelligence). Tenant-scoped; idempotent upserts.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { GROUP_DEFS, type GroupKind } from './needGrouping';

export interface RequirementCategory {
  slug: string;
  label: string;
  kind: GroupKind;
  subject: string | null;
  status: 'active' | 'pending';
  source: 'seed' | 'ai' | 'admin';
  confidence?: number | null;
  exampleAsk?: string | null;
}

/** The built-in groups, always active. Their slugs are reserved: a tenant category never shadows one. */
const BUILTIN: RequirementCategory[] = GROUP_DEFS.map((g) => ({
  slug: g.slug, label: g.label, kind: g.kind, subject: null, status: 'active', source: 'seed',
}));
const BUILTIN_SLUGS = new Set(BUILTIN.map((b) => b.slug));

function rowToCategory(r: any): RequirementCategory {
  const kind: GroupKind = r.kind === 'reference' || r.kind === 'personnel' ? r.kind : 'fact';
  return {
    slug: String(r.slug), label: String(r.label), kind, subject: r.subject ?? null,
    status: r.status === 'active' ? 'active' : 'pending',
    source: r.source === 'admin' ? 'admin' : r.source === 'seed' ? 'seed' : 'ai',
    confidence: typeof r.confidence === 'number' ? r.confidence : r.confidence != null ? Number(r.confidence) : null,
    exampleAsk: r.example_ask ?? null,
  };
}

async function tenantRows(tenantId: string, status?: 'active' | 'pending'): Promise<RequirementCategory[]> {
  if (!tenantId) return [];
  try {
    const rows = await sequelize.query<any>(
      `SELECT slug, label, kind, subject, status, source, confidence, example_ask
         FROM gov_requirement_categories
        WHERE tenant_id = $1 ${status ? 'AND status = $2' : ''}
        ORDER BY created_at ASC`,
      { bind: status ? [tenantId, status] : [tenantId], type: QueryTypes.SELECT },
    );
    return rows.map(rowToCategory);
  } catch { return []; }
}

/** The effective active taxonomy: the built-in groups plus any tenant categories an admin has activated. */
export async function listRequirementCategories(tenantId: string): Promise<RequirementCategory[]> {
  const active = (await tenantRows(tenantId, 'active')).filter((c) => !BUILTIN_SLUGS.has(c.slug));
  return [...BUILTIN, ...active];
}

/** Categories awaiting an admin's decision (AI-proposed or admin-drafted but not yet active). */
export async function listPendingCategories(tenantId: string): Promise<RequirementCategory[]> {
  return (await tenantRows(tenantId, 'pending')).filter((c) => !BUILTIN_SLUGS.has(c.slug));
}

export interface ProposeCategoryInput {
  slug: string; label: string; kind?: GroupKind; subject?: string | null;
  source?: 'ai' | 'admin'; confidence?: number | null; exampleAsk?: string | null;
}

/**
 * Propose (or admin-add) a category. Idempotent: a slug already present for the tenant is left as-is (first write
 * wins), and a built-in slug is never created. Returns whether a new row was inserted. An admin-sourced category is
 * created already `active`; an AI-sourced one is `pending` until an admin activates it.
 */
export async function proposeCategory(tenantId: string, input: ProposeCategoryInput): Promise<{ created: boolean }> {
  const slug = String(input?.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  const label = String(input?.label ?? '').trim().slice(0, 200);
  if (!tenantId || !slug || !label || BUILTIN_SLUGS.has(slug)) return { created: false };
  const kind: GroupKind = input.kind === 'reference' || input.kind === 'personnel' ? input.kind : 'fact';
  const source = input.source === 'admin' ? 'admin' : 'ai';
  const status = source === 'admin' ? 'active' : 'pending';
  try {
    const [, meta]: any = await sequelize.query(
      `INSERT INTO gov_requirement_categories (tenant_id, slug, label, kind, subject, status, source, confidence, example_ask)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, slug) DO NOTHING`,
      {
        bind: [tenantId, slug, label, kind, input.subject ?? null, status, source,
          typeof input.confidence === 'number' ? input.confidence : null, input.exampleAsk ?? null],
        type: QueryTypes.INSERT,
      },
    );
    const inserted = typeof meta === 'number' ? meta : (meta?.rowCount ?? 0);
    return { created: inserted > 0 };
  } catch { return { created: false }; }
}

/** Activate a pending category so it joins the effective taxonomy. Tenant-scoped; no-op if absent. */
export async function activateCategory(tenantId: string, slug: string): Promise<{ ok: boolean }> {
  if (!tenantId || !slug) return { ok: false };
  try {
    await sequelize.query(
      `UPDATE gov_requirement_categories SET status = 'active', updated_at = NOW() WHERE tenant_id = $1 AND slug = $2`,
      { bind: [tenantId, slug], type: QueryTypes.UPDATE },
    );
    return { ok: true };
  } catch { return { ok: false }; }
}
