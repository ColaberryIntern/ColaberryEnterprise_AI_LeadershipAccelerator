import api from '../utils/api';

export const getBusinessProcesses = () => api.get('/api/admin/business-processes');
export const getBusinessProcess = (id: string) => api.get(`/api/admin/business-processes/${id}`);
export const updateHITLConfig = (id: string, config: any) => api.put(`/api/admin/business-processes/${id}/hitl-config`, config);
export const updateAutonomyLevel = (id: string, level: string, reason?: string) => api.put(`/api/admin/business-processes/${id}/autonomy`, { level, reason });
export const getApprovals = (id: string) => api.get(`/api/admin/business-processes/${id}/approvals`);
export const evaluateProcess = (id: string) => api.post(`/api/admin/business-processes/${id}/evaluate`);
export const getEvolution = (id: string) => api.get(`/api/admin/business-processes/${id}/evolution`);
export const generatePrompt = (id: string, target: string) => api.post(`/api/admin/business-processes/${id}/generate-prompt`, { target });
export const seedProcesses = () => api.post('/api/admin/business-processes/seed');
export const runOptimization = () => api.post('/api/admin/business-processes/optimize');
