import portalApi from '../utils/portalApi';

export const getProcesses = () => portalApi.get('/api/portal/project/business-processes');
export const getProcess = (id: string) => portalApi.get(`/api/portal/project/business-processes/${id}`);
export const updateHITL = (id: string, config: any) => portalApi.put(`/api/portal/project/business-processes/${id}/hitl`, config);
export const updateAutonomy = (id: string, level: string, reason?: string) => portalApi.put(`/api/portal/project/business-processes/${id}/autonomy`, { level, reason });
export const evaluate = (id: string) => portalApi.post(`/api/portal/project/business-processes/${id}/evaluate`);
export const generatePrompt = (id: string, target: string) => portalApi.post(`/api/portal/project/business-processes/${id}/prompt`, { target });
export const predictImpact = (id: string, action: string) => portalApi.post(`/api/portal/project/business-processes/${id}/predict`, { action });
export const syncProcess = (id: string, report: string) => portalApi.post(`/api/portal/project/business-processes/${id}/sync`, { report });
export const resyncProcess = (id: string) => portalApi.post(`/api/portal/project/business-processes/${id}/resync`);
export const reclassifyRequirements = () => portalApi.post('/api/portal/project/business-processes/reclassify', {}, { timeout: 120000 });
export const setLifecycle = (id: string, status: string) => portalApi.put(`/api/portal/project/business-processes/${id}/lifecycle`, { status });
export const setUserStatus = (id: string, status: 'in_progress' | 'verified' | 'archived') => portalApi.put(`/api/portal/project/business-processes/${id}/user-status`, { status });
export const bulkVerify = (minCoverage: number = 95) => portalApi.post('/api/portal/project/business-processes/bulk-verify', { min_coverage: minCoverage }, { timeout: 60000 });
export type PageCategory = 'layout' | 'accessibility' | 'responsiveness' | 'interaction' | 'content';
export const setPageCategory = (id: string, category: PageCategory, verified: boolean) =>
  portalApi.put(`/api/portal/project/business-processes/${id}/page-category`, { category, verified });
export type UIStepKey = 'layout_hierarchy' | 'usability' | 'mobile_responsiveness';
export const setUIStepStatus = (id: string, step_key: UIStepKey, opts?: { issues_found?: number; clear?: boolean }) =>
  portalApi.put(`/api/portal/project/business-processes/${id}/ui-step-status`, {
    step_key,
    issues_found: opts?.issues_found ?? 0,
    clear: opts?.clear ?? false,
  });
export const connectPage = (id: string, route: string) =>
  portalApi.put(`/api/portal/project/business-processes/${id}/connect-page`, { route });
export const generateCombinedPrompt = (id: string, payload: { execution_steps: string[]; autonomy_gaps: any[]; include_agents: string[] }) => portalApi.post(`/api/portal/project/business-processes/${id}/combined-prompt`, payload);
export const getExecutionIntelligence = () => portalApi.get('/api/portal/project/execution-intelligence');
export const getSystemPromptDraft = () => portalApi.get('/api/portal/project/system-prompt/draft');
export const saveSystemPrompt = (system_prompt: string) => portalApi.put('/api/portal/project/system-prompt', { system_prompt });
export const bulkResolveFeedback = (id: string) =>
  portalApi.put(`/api/portal/project/business-processes/${id}/element-feedback/bulk-resolve`, {});

// ─── PHASE 2: Authoritative System State ────────────────────────────────
// Single source of truth for readiness, coverage, maturity, queue, and
// next-action. Every consumer (dashboards, Blueprint, Cory, system view)
// reads from this endpoint instead of re-deriving locally.
export const getSystemState = (opts?: { fresh?: boolean }) =>
  portalApi.get('/api/portal/project/system-state', { params: opts?.fresh ? { fresh: '1' } : {} });

// "Why is this next?" panel — fetches the full DecisionTrace for a task.
export const explainSystemTask = (taskId: string) =>
  portalApi.get(`/api/portal/project/system-state/explain/${encodeURIComponent(taskId)}`);

// ─── PHASE 4: Self-synchronizing execution helpers ────────────────────
export const autoGenerateManifest = (payload: {
  task_id: string;
  bp_id?: string | null;
  diff_stdout?: string;
  parsed_validation_report?: any;
  task_type?: string;
  ingest?: boolean;
}) => portalApi.post('/api/portal/project/telemetry/auto-generate', payload);

export const checkManifestCompleteness = (manifest: any, task_type: string) =>
  portalApi.post('/api/portal/project/telemetry/completeness', { manifest, task_type });

export const startBuildSession = (payload: { task_id: string; bp_id?: string | null; task_type: string }) =>
  portalApi.post('/api/portal/project/build-session/start', payload);

export const completeBuildSession = (sessionId: string, payload: { manifest: any; task_type: string; enforce_completeness?: boolean }) =>
  portalApi.post(`/api/portal/project/build-session/${encodeURIComponent(sessionId)}/complete`, payload);

export const listBuildSessions = (limit: number = 50) =>
  portalApi.get('/api/portal/project/build-sessions', { params: { limit } });

export const getQueueHistory = (opts: { limit?: number; since_hours?: number } = {}) =>
  portalApi.get('/api/portal/project/history/queue', { params: opts });

export const getScoreHistory = (limit: number = 100) =>
  portalApi.get('/api/portal/project/history/scores', { params: { limit } });

export const getContradictionHistory = (limit: number = 50) =>
  portalApi.get('/api/portal/project/history/contradictions', { params: { limit } });
