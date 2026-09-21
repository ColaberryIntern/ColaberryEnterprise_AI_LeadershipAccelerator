/**
 * factoryApi — the Command Center's data access. Thin typed wrappers over the shared axios `api`
 * client (which attaches the admin_token and bounces to /admin/login on 401). The view-model types
 * mirror the backend's factoryProjectView output + the route's approval envelope; kept here because
 * the frontend cannot import backend types across the workspace boundary.
 */
import api from '../utils/api';

export interface GateCheck { code: string; label: string; ok: boolean; }
export interface CcTrack {
  trackType: string;
  status: string;
  owner: string | null;
  requirementIds: string[];
  linkedStudentProjectId: string | null;
}
export interface CcFlowNode {
  id: string;
  title: string;
  kind: 'START' | 'TASK' | 'DECISION' | 'END';
  executorType: string | null;
  performerRole: string | null;
  accountableRole: string | null;
  method: string;
  confidence: number | null;
  sourceEvidence: string[];
}
export interface CcFlowEdge { from: string; to: string; condition: string | null; isRework: boolean; }
export interface CcAllocation {
  taskId: string;
  taskTitle: string;
  executionClass: string;
  performer: string | null;
  accountable: string | null;
  rationale: string;
}
export interface CcRole {
  roleId: string;
  name: string;
  definition: string;
  executorType: string | null;
  isAgent: boolean;
  accountableHuman: string | null;
}
export interface CcRequirement {
  id: string;
  statement: string;
  kind: string;
  priority: string;
  evidenceState: string;
  tracks: string[];
  citedBy: string[];
}
export interface CcRoleMap { previousFunction: string; aiContribution: string; newRole: string; retained: string[]; }

export interface FactoryApprovalInfo {
  status: string;
  level: string | null;
  version: number;
  trackType: string;
  enrichmentStatus: string | null;
  contentHash: string | null;
}

export interface FactoryCommandCenterView {
  deliveryProjectId: string;
  contractName: string;
  isSample: boolean;
  gate: { ok: boolean; errorCount: number; checks: GateCheck[] };
  process: { id: string; businessOutcome: string; successCriterion: string } | null;
  tracks: CcTrack[];
  flow: { nodes: CcFlowNode[]; edges: CcFlowEdge[] };
  allocation: CcAllocation[];
  roster: CcRole[];
  compliance: CcRequirement[];
  roleMap: CcRoleMap[];
  workforce: { people: number; agents: number };
  approval: FactoryApprovalInfo | null;
}

/** The day-one fixture (the Phase-1 sample), always available. */
export async function getFactorySample(): Promise<FactoryCommandCenterView> {
  const { data } = await api.get<FactoryCommandCenterView>('/api/admin/factory/sample');
  return data;
}

/** A real delivery contract's decomposition; rejects (404) until one has been generated. */
export async function getFactoryContract(deliveryProjectId: string): Promise<FactoryCommandCenterView> {
  const { data } = await api.get<FactoryCommandCenterView>(`/api/admin/factory/contract/${encodeURIComponent(deliveryProjectId)}`);
  return data;
}

// ── Phase 4 write actions ────────────────────────────────────────────────────
export interface FactoryContractListItem {
  deliveryProjectId: string;
  name: string | null;
  trackType: string;
  status: string;
  version: number;
}
export interface ApproveContractBody {
  trackType: string;
  expectedVersion: number;
  level: 'documented' | 'full';
  enrichmentStatus: 'pending' | 'partial' | 'resolved';
}
export interface RequestChangesBody { trackType: string; reviewedVersion: number; reason: string; }
export interface ApprovalResult { id: string; version: number; status: string; approval_level: string; approved_at: string; }

/** Delivery contracts that have a persisted decomposition, so the page can default to a real one. */
export async function listFactoryContracts(): Promise<FactoryContractListItem[]> {
  const { data } = await api.get<{ contracts: FactoryContractListItem[] }>('/api/admin/factory/contracts');
  return data.contracts;
}

/** Approve a contract's decomposition (transactional, gate-checked, CAS-guarded). */
export async function approveFactoryContract(deliveryProjectId: string, body: ApproveContractBody): Promise<ApprovalResult> {
  const { data } = await api.post<ApprovalResult>(`/api/admin/factory/contract/${encodeURIComponent(deliveryProjectId)}/approve`, body);
  return data;
}

/** Record a "request changes" review against the version the reviewer looked at. */
export async function requestFactoryChanges(deliveryProjectId: string, body: RequestChangesBody): Promise<{ id: string; decision: string }> {
  const { data } = await api.post<{ id: string; decision: string }>(`/api/admin/factory/contract/${encodeURIComponent(deliveryProjectId)}/request-changes`, body);
  return data;
}
