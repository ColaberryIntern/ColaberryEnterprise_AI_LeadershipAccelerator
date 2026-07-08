/**
 * Student workspace repo API — the per-student GitHub repo that backs the
 * project workspace (platform-provisioned under ColaberryIntern; the student
 * commits locally and the portal syncs). Mirrors the axios + participant_token
 * pattern used by the other portal API clients.
 */
import axios from 'axios';

export interface WorkspaceRepo {
  connected: boolean;
  provisioned: boolean;
  repo_url?: string;
  repo_owner?: string;
  repo_name?: string;
  student_github_login?: string;
  file_count?: number;
  last_sync?: string | null;
  recent_commits?: { sha?: string; message?: string; author?: string; date?: string }[];
}

const api = axios.create({
  baseURL: '/api/portal/workspace',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('participant_token') || localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function getWorkspaceRepo(): Promise<WorkspaceRepo> {
  const { data } = await api.get('/repo');
  return data;
}

export async function provisionWorkspaceRepo(githubLogin: string): Promise<WorkspaceRepo> {
  const { data } = await api.post('/repo/provision', { github_login: githubLogin });
  return data;
}

export async function syncWorkspaceRepo(): Promise<WorkspaceRepo> {
  const { data } = await api.post('/repo/sync');
  return data;
}
