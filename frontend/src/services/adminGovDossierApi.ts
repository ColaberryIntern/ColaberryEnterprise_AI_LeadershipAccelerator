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
