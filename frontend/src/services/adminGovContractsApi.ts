import api from '../utils/api';
import type { StudentGovProjectView } from './govProjectPortalApi';

/**
 * adminGovContractsApi — the admin Interns-hub "Gov Contracts" tab's one data call.
 *
 * `GET /api/admin/gov-contracts` returns the active government pursuits this caller may see
 * (gated `gov_contracts`): every pursuit for a management/operator viewer, or only the
 * delivery projects the caller is a member of for a scoped viewer. `scope` echoes which.
 * The shape mirrors the backend `GovPipelineCard` (services/factory/govPipeline.ts) exactly.
 */

export type GovContractStage = 'qualifying' | 'ready_to_assign' | 'in_build' | 'passed';

export interface GovContractBuildProgress {
  studentProjectId: string;
  pct: number;
  verified: number;
  total: number;
}

/** An active intern assigned to build this contract (membership ∩ live intern roster). */
export interface GovContractAssignedIntern {
  identityId: string;
  name: string;
  email: string | null;
}

export interface GovContractCard {
  key: string;
  isDecoupled: boolean;
  biddingEntity: string;
  title: string | null;
  agency: string | null;
  decision: string;
  version: number;
  stage: GovContractStage;
  deliveryProjectId: string | null;
  establishedCount: number;
  readyToAdvance: boolean;
  zipAttested: boolean;
  pursuitKind: 'software' | 'services';
  build: GovContractBuildProgress | null;
  /** The submission/close date (ISO), or null when none is resolvable (treated as not-yet-expired, not hidden). */
  closeDate: string | null;
  /** Active interns assigned to this contract; drives the owner line and the "has an active intern" filter. */
  assignedInterns: GovContractAssignedIntern[];
  hasActiveIntern: boolean;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface GovContractsResponse {
  projects: GovContractCard[];
  scope: 'all' | 'member';
}

export async function fetchGovContracts(): Promise<GovContractsResponse> {
  const { data } = await api.get('/api/admin/gov-contracts');
  return data as GovContractsResponse;
}

/**
 * The SAME student-safe projection the assigned intern sees in their cockpit, for an owner/admin to
 * read read-only from the admin left-nav. `GET /api/admin/gov-contracts/:projectId/cockpit`, gated
 * `gov_contracts`; projectId is the delivery project id (a card's `deliveryProjectId`).
 */
export async function fetchGovContractCockpit(projectId: string): Promise<StudentGovProjectView> {
  const { data } = await api.get(`/api/admin/gov-contracts/${encodeURIComponent(projectId)}/cockpit`);
  return (data as { project: StudentGovProjectView }).project;
}

export function errorMessage(e: unknown, fallback: string): string {
  const r = e as { response?: { data?: { error?: string } } };
  return r?.response?.data?.error ?? fallback;
}
