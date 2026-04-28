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
export const generateCombinedPrompt = (id: string, payload: { execution_steps: string[]; autonomy_gaps: any[]; include_agents: string[] }) => portalApi.post(`/api/portal/project/business-processes/${id}/combined-prompt`, payload);
export const getExecutionIntelligence = () => portalApi.get('/api/portal/project/execution-intelligence');
