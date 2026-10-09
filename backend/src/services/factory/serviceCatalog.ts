/**
 * serviceCatalog — CRUD for Colaberry's own service offerings (the catalog an opportunity is later matched against).
 *
 * Tenant-scoped: every read and write filters tenant_id, so one team never sees or edits another's catalog. A
 * service is RETIRED via a status flip (never hard-deleted), so history and any past match references survive.
 * The JSONB array columns (keywords/naics/psc) are written as clean string arrays; the DTO exposes them camelCased.
 * The model is lazy-loaded inside each function so importing this module never initializes the ORM.
 */

export class ServiceOfferingNotFoundError extends Error {
  constructor(public id: string) { super('service offering not found'); this.name = 'ServiceOfferingNotFoundError'; }
}

const MAX_ARRAY = 50;
const MAX_ITEM = 60;

/** Coerce arbitrary input into a clean, bounded string[] (trimmed, non-empty, de-duped, capped). null when empty. */
function toStrArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const s = x.trim();
    if (s === '' || s.length > MAX_ITEM) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= MAX_ARRAY) break;
  }
  return out.length ? out : null;
}

const toStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** The browser-facing shape: camelCased, arrays as string[] (never the raw JSONB column). */
export function toServiceOfferingDto(row: any): any {
  const r = row && row.get ? row.get() : row;
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    category: r.category ?? null,
    keywords: r.keywords_json ?? [],
    naicsCodes: r.naics_codes_json ?? [],
    pscCodes: r.psc_codes_json ?? [],
    pastPerformance: r.past_performance ?? null,
    owner: r.owner ?? null,
    status: r.status,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateServiceOfferingInput {
  tenantId: string;
  organizationId?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  keywords?: unknown;
  naicsCodes?: unknown;
  pscCodes?: unknown;
  pastPerformance?: string | null;
  owner?: string | null;
  createdBy: string;
}

export async function createServiceOffering(input: CreateServiceOfferingInput): Promise<any> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const row: any = await ServiceOffering.create({
    tenant_id: input.tenantId, organization_id: input.organizationId ?? null,
    name: input.name.trim(), description: toStr(input.description), category: toStr(input.category),
    keywords_json: toStrArray(input.keywords), naics_codes_json: toStrArray(input.naicsCodes),
    psc_codes_json: toStrArray(input.pscCodes), past_performance: toStr(input.pastPerformance),
    owner: toStr(input.owner), status: 'active', created_by: input.createdBy,
  });
  return toServiceOfferingDto(row);
}

export interface UpdateServiceOfferingInput {
  tenantId: string;
  id: string;
  patch: Partial<Omit<CreateServiceOfferingInput, 'tenantId' | 'createdBy'>>;
}

/** Update the allowed fields of a service the tenant owns. 404 (ServiceOfferingNotFoundError) if it isn't theirs. */
export async function updateServiceOffering(input: UpdateServiceOfferingInput): Promise<any> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const row: any = await ServiceOffering.findOne({ where: { id: input.id, tenant_id: input.tenantId } });
  if (!row) throw new ServiceOfferingNotFoundError(input.id);
  const p = input.patch;
  if (p.name !== undefined && toStr(p.name)) row.name = (p.name as string).trim();
  if (p.description !== undefined) row.description = toStr(p.description);
  if (p.category !== undefined) row.category = toStr(p.category);
  if (p.keywords !== undefined) row.keywords_json = toStrArray(p.keywords);
  if (p.naicsCodes !== undefined) row.naics_codes_json = toStrArray(p.naicsCodes);
  if (p.pscCodes !== undefined) row.psc_codes_json = toStrArray(p.pscCodes);
  if (p.pastPerformance !== undefined) row.past_performance = toStr(p.pastPerformance);
  if (p.owner !== undefined) row.owner = toStr(p.owner);
  await row.save();
  return toServiceOfferingDto(row);
}

/** Soft-retire (status -> 'retired'). Idempotent: retiring an already-retired service returns it unchanged. 404 if absent. */
export async function retireServiceOffering(input: { tenantId: string; id: string }): Promise<any> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const row: any = await ServiceOffering.findOne({ where: { id: input.id, tenant_id: input.tenantId } });
  if (!row) throw new ServiceOfferingNotFoundError(input.id);
  if (row.status !== 'retired') { row.status = 'retired'; await row.save(); }
  return toServiceOfferingDto(row);
}

/** List the tenant's services, newest first. status 'active' (default) returns only active; 'all' returns every status. */
export async function listServiceOfferings(input: { tenantId: string; status?: 'active' | 'all' }): Promise<any[]> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const where: any = { tenant_id: input.tenantId };
  if ((input.status ?? 'active') === 'active') where.status = 'active';
  const rows: any[] = await ServiceOffering.findAll({ where, order: [['created_at', 'DESC']] });
  return rows.map(toServiceOfferingDto);
}

/** Get one service the tenant owns, or null. */
export async function getServiceOffering(input: { tenantId: string; id: string }): Promise<any | null> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const row: any = await ServiceOffering.findOne({ where: { id: input.id, tenant_id: input.tenantId } });
  return row ? toServiceOfferingDto(row) : null;
}
