/**
 * govCompanyLibrary — the Proposal Studio P5 company library: the tenant's reusable, human-approved facts,
 * references and key personnel. Answering a proposal question saves to the library (approved, because a human just
 * confirmed it) AND resolves every open gap that asked that question, so the same question is never asked twice.
 * ONLY approved rows are returned to the grounding builder — an unapproved draft fact never grounds the agent.
 *
 * I/O at the edges (models + one gap-resolve query); tenant-scoped on every call.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import GovCompanyFact from '../../../models/GovCompanyFact';
import GovCompanyReference from '../../../models/GovCompanyReference';
import GovCompanyPersonnel from '../../../models/GovCompanyPersonnel';
import { cleanFactKey } from './proposalFactKey';

/** The clean fact key for an answered question: prefer the gap's typed need_key (humanized) over the raw sentence. */
async function factKeyForQuestion(deliveryProjectId: string, question: string): Promise<string | null> {
  try {
    const rows: any[] = await sequelize.query(
      `SELECT need_key FROM gov_proposal_document_gaps WHERE delivery_project_id = $1 AND question = $2 AND need_key IS NOT NULL ORDER BY created_at ASC LIMIT 1`,
      { bind: [deliveryProjectId, question], type: QueryTypes.SELECT },
    );
    const nk = rows[0]?.need_key as string | undefined;
    return nk ? cleanFactKey(nk, question) : null;
  } catch { return null; }
}

export interface CompanyLibraryView {
  facts: Array<{ id: string; key: string; value: string; source: string | null; category: string | null; approved: boolean }>;
  references: Array<{ id: string; client: string; scope: string | null; contractValue: string | null; dates: string | null; contact: string | null; phone: string | null; email: string | null; approved: boolean }>;
  personnel: Array<{ id: string; name: string; role: string | null; resumeHtml: string | null; approved: boolean }>;
}

export async function listCompanyLibrary(tenantId: string): Promise<CompanyLibraryView> {
  const [facts, refs, people]: any[] = await Promise.all([
    GovCompanyFact.findAll({ where: { tenant_id: tenantId }, order: [['updated_at', 'DESC']] }),
    GovCompanyReference.findAll({ where: { tenant_id: tenantId }, order: [['updated_at', 'DESC']] }),
    GovCompanyPersonnel.findAll({ where: { tenant_id: tenantId }, order: [['updated_at', 'DESC']] }),
  ]);
  const p = (r: any) => r.get({ plain: true });
  return {
    facts: facts.map(p).map((f: any) => ({ id: f.id, key: f.key, value: f.value, source: f.source ?? null, category: f.category ?? null, approved: !!f.approved })),
    references: refs.map(p).map((r: any) => ({ id: r.id, client: r.client, scope: r.scope ?? null, contractValue: r.contract_value ?? null, dates: r.dates ?? null, contact: r.contact ?? null, phone: r.phone ?? null, email: r.email ?? null, approved: !!r.approved })),
    personnel: people.map(p).map((r: any) => ({ id: r.id, name: r.name, role: r.role ?? null, resumeHtml: r.resume_html ?? null, approved: !!r.approved })),
  };
}

/** Approved facts as grounding strings ("key: value") — the ONLY library content that reaches the drafter. */
export async function approvedGroundingFacts(tenantId: string): Promise<string[]> {
  const rows: any[] = await GovCompanyFact.findAll({ where: { tenant_id: tenantId, approved: true } });
  return rows.map((r) => { const f = r.get({ plain: true }); return `${f.key}: ${f.value}`; });
}

/** Strip a résumé's HTML to a short, prompt-safe plain-text digest (no tags, collapsed whitespace, capped). */
export function resumeDigest(html: string | null | undefined, cap = 400): string | null {
  if (!html) return null;
  const text = String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > cap ? text.slice(0, cap - 1).trimEnd() + '…' : text;
}

/** Approved past-performance references — real, named clients the drafter MAY cite. Approved rows only. */
export async function approvedReferences(tenantId: string): Promise<Array<{ client: string; scope: string | null; contractValue: string | null; dates: string | null; contact: string | null }>> {
  const rows: any[] = await GovCompanyReference.findAll({ where: { tenant_id: tenantId, approved: true }, order: [['updated_at', 'DESC']] });
  return rows.map((row) => {
    const r = row.get({ plain: true });
    const contact = [r.contact, r.phone, r.email].filter((x: unknown) => typeof x === 'string' && x).join(', ') || null;
    return { client: String(r.client ?? ''), scope: r.scope ?? null, contractValue: r.contract_value ?? null, dates: r.dates ?? null, contact };
  }).filter((r: { client: string }) => r.client.trim() !== '');
}

/** Approved key personnel the drafter MAY name and describe. Approved rows only; résumé reduced to a short digest. */
export async function approvedPersonnel(tenantId: string): Promise<Array<{ name: string; role: string | null; summary: string | null }>> {
  const rows: any[] = await GovCompanyPersonnel.findAll({ where: { tenant_id: tenantId, approved: true }, order: [['updated_at', 'DESC']] });
  return rows.map((row) => {
    const p = row.get({ plain: true });
    return { name: String(p.name ?? ''), role: p.role ?? null, summary: resumeDigest(p.resume_html) };
  }).filter((p: { name: string }) => p.name.trim() !== '');
}

export async function addCompanyFact(tenantId: string, input: { key: string; value: string; source?: string | null; category?: string | null; approved?: boolean }, identityId: string | null): Promise<string> {
  const row: any = await GovCompanyFact.create({ tenant_id: tenantId, key: input.key, value: input.value, source: input.source ?? null, category: input.category ?? null, approved: !!input.approved, approved_by_identity_id: input.approved ? identityId : null } as any);
  return row.id;
}
export async function approveCompanyFact(tenantId: string, id: string, identityId: string | null): Promise<void> {
  await GovCompanyFact.update({ approved: true, approved_by_identity_id: identityId, updated_at: new Date() } as any, { where: { id, tenant_id: tenantId } });
}
/**
 * Edit a fact's value (and optionally its key/category) in place — an admin correcting a saved answer. Tenant-scoped.
 * Approval state is left untouched: an admin who can reach this portal has already vetted the row, so editing the
 * wording of an approved fact keeps it approved and the next rebuild picks up the new wording. Only provided fields
 * are written.
 */
export async function updateCompanyFact(tenantId: string, id: string, patch: { value?: string; key?: string; category?: string }, _identityId: string | null): Promise<void> {
  const set: Record<string, unknown> = { updated_at: new Date() };
  if (typeof patch.value === 'string') set.value = patch.value;
  if (typeof patch.key === 'string') set.key = patch.key;
  if (typeof patch.category === 'string') set.category = patch.category;
  await GovCompanyFact.update(set as any, { where: { id, tenant_id: tenantId } });
}
export async function approveCompanyReference(tenantId: string, id: string, identityId: string | null): Promise<void> {
  await GovCompanyReference.update({ approved: true, approved_by_identity_id: identityId, updated_at: new Date() } as any, { where: { id, tenant_id: tenantId } });
}
export async function approveCompanyPersonnel(tenantId: string, id: string, identityId: string | null): Promise<void> {
  await GovCompanyPersonnel.update({ approved: true, approved_by_identity_id: identityId, updated_at: new Date() } as any, { where: { id, tenant_id: tenantId } });
}
export async function addCompanyReference(tenantId: string, input: Record<string, unknown>, identityId: string | null): Promise<string> {
  const row: any = await GovCompanyReference.create({ tenant_id: tenantId, client: String(input.client ?? ''), contact: (input.contact as string) ?? null, phone: (input.phone as string) ?? null, email: (input.email as string) ?? null, contract_value: (input.contractValue as string) ?? null, dates: (input.dates as string) ?? null, scope: (input.scope as string) ?? null, approved: !!input.approved, approved_by_identity_id: input.approved ? identityId : null } as any);
  return row.id;
}
export async function addCompanyPersonnel(tenantId: string, input: { name: string; role?: string | null; resumeHtml?: string | null; approved?: boolean }, identityId: string | null): Promise<string> {
  const row: any = await GovCompanyPersonnel.create({ tenant_id: tenantId, name: input.name, role: input.role ?? null, resume_html: input.resumeHtml ?? null, approved: !!input.approved, approved_by_identity_id: input.approved ? identityId : null } as any);
  return row.id;
}

/**
 * Answer a proposal question: save the answer to the library as an APPROVED fact (a human just confirmed it) and
 * resolve every OPEN gap in this project that asked the same question (set resolution='answered' + the answer).
 * Returns how many gaps were resolved. This is the "ask once" rail.
 */
export async function answerQuestionToLibrary(
  tenantId: string,
  deliveryProjectId: string,
  input: { question: string; answer: string; key?: string },
  identityId: string | null,
): Promise<{ factId: string; gapsResolved: number }> {
  const key = (input.key && input.key.trim()) || (await factKeyForQuestion(deliveryProjectId, input.question)) || input.question.slice(0, 120);
  const factId = await addCompanyFact(tenantId, { key, value: input.answer, source: 'answered in proposal studio', category: 'general', approved: true }, identityId);
  let gapsResolved = 0;
  try {
    const [, meta]: any = await sequelize.query(
      `UPDATE gov_proposal_document_gaps SET resolution = 'answered', answer = $1, answer_ref = $2, resolved_by = $3, resolved_at = NOW()
       WHERE delivery_project_id = $4 AND question = $5 AND resolution = 'open'`,
      { bind: [input.answer, factId, identityId, deliveryProjectId, input.question], type: QueryTypes.UPDATE },
    );
    gapsResolved = typeof meta === 'number' ? meta : (meta?.rowCount ?? 0);
  } catch { /* the gaps table may not carry this question; the fact is still saved */ }
  return { factId, gapsResolved };
}
