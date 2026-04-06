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
export const getExecutionIntelligence = () => portalApi.get('/api/portal/project/execution-intelligence');
