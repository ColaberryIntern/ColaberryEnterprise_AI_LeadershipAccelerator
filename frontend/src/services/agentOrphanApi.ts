/**
 * agentOrphanApi — client for the orphan-adoption admin endpoints.
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface OrphanSuggestion {
  capId: string;
  capName: string;
  score: number;
  evidence: string[];
  nameStemBoost: boolean;
}

export interface OrphanAgent {
  sourcePath: string;
  agentName: string;
  suggestions: OrphanSuggestion[];
}

export interface OrphanListResult {
  projectId: string;
  scannedCount: number;
  skippedDeclared: number;
  skippedAlreadyMapped: number;
  orphans: OrphanAgent[];
}

export interface CapabilityRef {
  id: string;
  name: string;
}

export interface AdoptInput {
  projectId: string;
  agentName: string;
  capabilityId: string;
  role?: 'executor' | 'monitor' | 'classifier' | 'orchestrator' | null;
}

export interface AdoptResult {
  action: 'inserted' | 'reactivated' | 'already_active';
  mapId: string;
}

export async function listOrphans(projectId: string): Promise<OrphanListResult> {
  const res = await api.get('/api/admin/agent-orphans', { params: { projectId } });
  return res.data;
}

export async function listProjectCapabilities(projectId: string): Promise<CapabilityRef[]> {
  const res = await api.get('/api/admin/agent-orphans/capabilities', { params: { projectId } });
  return res.data.capabilities;
}

export async function adoptOrphan(input: AdoptInput): Promise<AdoptResult> {
  const res = await api.post('/api/admin/agent-orphans/adopt', input);
  return res.data;
}
