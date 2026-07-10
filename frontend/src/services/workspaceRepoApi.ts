import axios from 'axios';

// Thin axios client for the per-student workspace repo endpoints (Part B).
// Mirrors onboardingApi.ts / portalApi.ts: reads the participant JWT from the
// SAME localStorage key the rest of the portal uses ('participant_token') and
// attaches it as a Bearer token. Kept separate from portalApi so a failure to
// reach these three routes fails soft in the drawer without touching the
// portal-wide 401 redirect interceptor.

export interface WorkspaceRepoView {
  connected: boolean;
  provisioned: boolean;
  repo_url: string | null;
  repo_owner: string | null;
  repo_name: string | null;
  student_github_login: string | null;
  file_count: number | null;
  last_sync: string | null;
  recent_commits: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }>;
}

const workspaceApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

workspaceApi.interceptors.request.use((config) => {
  // Same key portalApi.ts uses — the participant session JWT.
  const token = localStorage.getItem('participant_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** GET the current workspace repo state for the signed-in student. */
export async function getWorkspaceRepo(): Promise<WorkspaceRepoView> {
  const { data } = await workspaceApi.get<WorkspaceRepoView>('/api/portal/workspace/repo');
  return data;
}

/** Provision (idempotent) a private workspace repo and add the student as a push collaborator. */
export async function provisionWorkspaceRepo(githubLogin: string): Promise<WorkspaceRepoView> {
  const { data } = await workspaceApi.post<WorkspaceRepoView>(
    '/api/portal/workspace/repo/provision',
    { github_login: githubLogin },
  );
  return data;
}

/** Sync (pull) the student's repo — the portal never commits for them. */
export async function syncWorkspaceRepo(): Promise<WorkspaceRepoView> {
  const { data } = await workspaceApi.post<WorkspaceRepoView>('/api/portal/workspace/repo/sync');
  return data;
}
