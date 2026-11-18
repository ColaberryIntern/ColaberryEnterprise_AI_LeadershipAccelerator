/**
 * adminGovDossierApi — typed client for the Gov Company Dossier admin portal (Dossier Phase 2a).
 *
 * Tenant-wide: no projectId. Mirrors the backend CompanyLibraryView from
 *   backend/src/services/factory/proposal/govCompanyLibrary.ts  (GET  /api/admin/factory/dossier/library)
 *   backend/src/routes/admin/govCompanyDossierRoutes.ts         (POST .../library/:kind, POST .../library/:kind/:id/approve)
 * These interfaces are hand-copied (the frontend cannot import backend types across the workspace) and must change
 * together with those files. Only approved rows reach the proposal agent's grounding.
 */
import api from '../utils/api';

const BASE = '/api/admin/factory/dossier/library';

export type DossierKind = 'fact' | 'reference' | 'personnel';

export interface DossierFact { id: string; key: string; value: string; source: string | null; category: string | null; approved: boolean }
export interface DossierReference { id: string; client: string; scope: string | null; contractValue: string | null; dates: string | null; contact: string | null; phone: string | null; email: string | null; approved: boolean }
export interface DossierPersonnel { id: string; name: string; role: string | null; resumeHtml: string | null; approved: boolean }

export interface DossierLibrary { facts: DossierFact[]; references: DossierReference[]; personnel: DossierPersonnel[] }

export interface NewFact { key: string; value: string; source?: string; category?: string; approved?: boolean }
export interface NewReference { client: string; contact?: string; phone?: string; email?: string; contractValue?: string; dates?: string; scope?: string; approved?: boolean }
export interface NewPersonnel { name: string; role?: string; resumeHtml?: string; approved?: boolean }
export type NewItem = NewFact | NewReference | NewPersonnel;

export async function getDossier(): Promise<DossierLibrary> {
  const { data } = await api.get<DossierLibrary>(BASE);
  return data;
}

export async function addDossierItem(kind: DossierKind, input: NewItem): Promise<{ ok: boolean; id: string }> {
  const { data } = await api.post<{ ok: boolean; id: string }>(`${BASE}/${kind}`, input);
  return data;
}

export async function approveDossierItem(kind: DossierKind, id: string): Promise<{ ok: boolean; id: string; approved: boolean }> {
  const { data } = await api.post<{ ok: boolean; id: string; approved: boolean }>(`${BASE}/${kind}/${encodeURIComponent(id)}/approve`, {});
  return data;
}

export interface FactEdit { value: string; key?: string; category?: string }

/** Edit a saved fact in place (correcting an answered need). Value required; approval state is unchanged server-side. */
export async function updateDossierFact(id: string, patch: FactEdit): Promise<{ ok: boolean; id: string }> {
  const { data } = await api.post<{ ok: boolean; id: string }>(`${BASE}/fact/${encodeURIComponent(id)}/update`, patch);
  return data;
}

// ── Tenant-wide company documents (Phase 2b): uploaded once, grounds every pursuit ──────────────────────────────
const DOCS = '/api/admin/factory/dossier/documents';

export interface CompanyDoc { id: string; name: string; status: string; approved: boolean; chunkCount: number; embeddedCount: number; truncated: boolean; createdAt: string | null }

export async function listCompanyDocs(): Promise<{ documents: CompanyDoc[] }> {
  const { data } = await api.get<{ documents: CompanyDoc[] }>(DOCS);
  return data;
}
export async function uploadCompanyDoc(file: File): Promise<{ ok: boolean; chunkCount: number; embeddedCount: number; status: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<{ ok: boolean; chunkCount: number; embeddedCount: number; status: string }>(DOCS, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}
export async function approveCompanyDoc(id: string, approved: boolean): Promise<{ ok: boolean; id: string; approved: boolean }> {
  const { data } = await api.post<{ ok: boolean; id: string; approved: boolean }>(`${DOCS}/${encodeURIComponent(id)}/approve`, { approved });
  return data;
}
export async function deleteCompanyDoc(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete<{ ok: boolean }>(`${DOCS}/${encodeURIComponent(id)}`);
  return data;
}

// ── Tenant-wide "Needs across contracts" (spec decision #2): every open question across the tenant's bids ──────────
// Mirrors backend/src/services/factory/proposal/tenantNeeds.ts (TenantNeed) via GET /api/admin/factory/dossier/needs.
const NEEDS = '/api/admin/factory/dossier/needs';

export interface DossierNeedProject { projectId: string; projectName: string }
export interface DossierNeed {
  key: string;
  kind: string;
  ask: string;
  why?: string | null;
  blocking: 'fatal' | 'score';
  recordType?: 'reference' | 'personnel';
  projects: DossierNeedProject[];
}

/** A concept inside a group card (a fact group lists several; a record group is one). */
export interface NeedGroupConcept { conceptId: string; label: string; asks: string[]; needKeys: string[]; why?: string; sourceQuote?: string }
/** One (group, subject) slot: the collapsed, fillable unit the restructured Needs view renders. */
export interface NeedGroupCard {
  groupSlug: string;
  groupLabel: string;
  groupKind: 'fact' | 'reference' | 'personnel';
  subject: string;
  subjectLabel: string;
  blocking: 'fatal' | 'score';
  projects: DossierNeedProject[];
  bidCount: number;
  concepts: NeedGroupConcept[];
  needKeys: string[];
}

/** Every open need across the tenant's bids: the flat deduped list AND the (group, subject) cards. Read-only. */
export async function getDossierNeeds(): Promise<{ needs: DossierNeed[]; groups: NeedGroupCard[] }> {
  const { data } = await api.get<{ needs: DossierNeed[]; groups: NeedGroupCard[] }>(NEEDS);
  return { needs: data?.needs ?? [], groups: data?.groups ?? [] };
}

/** Fill one group card in a single action: resolve every open need under this (group, subject) across every bid. A
 *  record group sends `record`; a fact group sends `values` keyed by conceptId. Returns the refreshed group cards. */
export async function fillNeedGroup(input: { groupSlug: string; subject: string; record?: Record<string, string>; values?: Record<string, string> }): Promise<{ ok: boolean; resolved: number; groups: NeedGroupCard[] }> {
  const { data } = await api.post<{ ok: boolean; resolved: number; groups: NeedGroupCard[] }>(`${NEEDS}/fill`, input);
  return data;
}

// ── Requirement taxonomy (CC-20261117-q8k3): the growable groups ─────────────────────────────────────────────────
const CATEGORIES = '/api/admin/factory/dossier/categories';

export interface RequirementCategory {
  slug: string; label: string; kind: 'fact' | 'reference' | 'personnel'; subject: string | null;
  status: 'active' | 'pending'; source: 'seed' | 'ai' | 'admin'; confidence?: number | null; exampleAsk?: string | null;
}

export async function getCategories(): Promise<{ active: RequirementCategory[]; pending: RequirementCategory[] }> {
  const { data } = await api.get<{ active: RequirementCategory[]; pending: RequirementCategory[] }>(CATEGORIES);
  return { active: data?.active ?? [], pending: data?.pending ?? [] };
}

/** Ask the classifier to propose groups for the currently ungrouped needs (bounded, admin-reviewed before use). */
export async function suggestCategories(): Promise<{ ok: boolean; scanned: number; proposed: number; pending: RequirementCategory[] }> {
  const { data } = await api.post<{ ok: boolean; scanned: number; proposed: number; pending: RequirementCategory[] }>(`${CATEGORIES}/suggest`, {});
  return data;
}

export async function activateCategory(slug: string): Promise<{ ok: boolean; slug: string }> {
  const { data } = await api.post<{ ok: boolean; slug: string }>(`${CATEGORIES}/${encodeURIComponent(slug)}/activate`, {});
  return data;
}

/** The proposal-demand buckets the fill-UI groups facts by. Labels are plain copy (no special punctuation). */
export const FACT_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'registrations', label: 'Registrations (SAM, UEI, CAGE, DUNS)' },
  { id: 'reps_certs', label: 'Representations and Certifications' },
  { id: 'socioeconomic', label: 'Socioeconomic status (8a, HUBZone, SDVOSB, WOSB)' },
  { id: 'financials', label: 'Financials, insurance and bonding' },
  { id: 'quality_certs', label: 'Quality certifications (ISO, CMMI)' },
  { id: 'pricing', label: 'Pricing and rate card' },
  { id: 'general', label: 'General' },
];
