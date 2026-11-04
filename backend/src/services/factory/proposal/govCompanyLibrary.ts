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

export interface CompanyLibraryView {
  facts: Array<{ id: string; key: string; value: string; source: string | null; approved: boolean }>;
  references: Array<{ id: string; client: string; scope: string | null; contractValue: string | null; approved: boolean }>;
  personnel: Array<{ id: string; name: string; role: string | null; approved: boolean }>;
}

export async function listCompanyLibrary(tenantId: string): Promise<CompanyLibraryView> {
  const [facts, refs, people]: any[] = await Promise.all([
    GovCompanyFact.findAll({ where: { tenant_id: tenantId }, order: [['updated_at', 'DESC']] }),
    GovCompanyReference.findAll({ where: { tenant_id: tenantId }, order: [['updated_at', 'DESC']] }),
    GovCompanyPersonnel.findAll({ where: { tenant_id: tenantId }, order: [['updated_at', 'DESC']] }),
  ]);
  const p = (r: any) => r.get({ plain: true });
  return {
    facts: facts.map(p).map((f: any) => ({ id: f.id, key: f.key, value: f.value, source: f.source ?? null, approved: !!f.approved })),
    references: refs.map(p).map((r: any) => ({ id: r.id, client: r.client, scope: r.scope ?? null, contractValue: r.contract_value ?? null, approved: !!r.approved })),
    personnel: people.map(p).map((r: any) => ({ id: r.id, name: r.name, role: r.role ?? null, approved: !!r.approved })),
  };
}

/** Approved facts as grounding strings ("key: value") — the ONLY library content that reaches the drafter. */
export async function approvedGroundingFacts(tenantId: string): Promise<string[]> {
  const rows: any[] = await GovCompanyFact.findAll({ where: { tenant_id: tenantId, approved: true } });
  return rows.map((r) => { const f = r.get({ plain: true }); return `${f.key}: ${f.value}`; });
}

export async function addCompanyFact(tenantId: string, input: { key: string; value: string; source?: string | null; approved?: boolean }, identityId: string | null): Promise<string> {
  const row: any = await GovCompanyFact.create({ tenant_id: tenantId, key: input.key, value: input.value, source: input.source ?? null, approved: !!input.approved, approved_by_identity_id: input.approved ? identityId : null } as any);
  return row.id;
}
export async function approveCompanyFact(tenantId: string, id: string, identityId: string | null): Promise<void> {
  await GovCompanyFact.update({ approved: true, approved_by_identity_id: identityId, updated_at: new Date() } as any, { where: { id, tenant_id: tenantId } });
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
  const key = (input.key && input.key.trim()) || input.question.slice(0, 120);
  const factId = await addCompanyFact(tenantId, { key, value: input.answer, source: 'answered in proposal studio', approved: true }, identityId);
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
