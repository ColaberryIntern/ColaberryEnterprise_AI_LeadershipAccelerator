// ─── ML Executor ──────────────────────────────────────────────────────────
// Calls Python proxy ML endpoints. Gracefully skips if proxy is down.

import { intelligenceProxy } from '../../services/intelligenceProxyService';
import { MlTask } from './planBuilder';

export interface MlResult {
  task: MlTask;
  data: Record<string, any>[];
  status: 'success' | 'skipped' | 'error';
  error?: string;
}

/**
 * Execute ML tasks in parallel via the Python proxy service.
 */
export async function executeML(
  tasks: MlTask[],
  entityType?: string
): Promise<MlResult[]> {
  if (tasks.length === 0) return [];

  const results = await Promise.allSettled(
    tasks.map((task) => runMlTask(task, entityType))
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      task: tasks[i],
      data: [],
      status: 'error' as const,
      error: result.reason?.message || 'ML task failed',
    };
  });
}

async function runMlTask(task: MlTask, entityType?: string): Promise<MlResult> {
  try {
    let response;
    const params = entityType ? { entity_type: entityType } : {};

    switch (task) {
      case 'anomaly_detector':
        response = await intelligenceProxy.getAnomalies();
        break;
      case 'forecaster':
        response = await intelligenceProxy.getForecast(params);
        break;
      case 'risk_scorer':
        response = await intelligenceProxy.getRiskScores();
        break;
      case 'root_cause_explainer':
        response = await intelligenceProxy.getRootCause(params);
        break;
      case 'text_clusterer':
        response = await intelligenceProxy.getTextClusters(params);
        break;
      default:
        return { task, data: [], status: 'skipped', error: `Unknown ML task: ${task}` };
    }

    const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
    return { task, data, status: 'success' };
  } catch (err: any) {
    return {
      task,
      data: [],
      status: 'error',
      error: err?.message?.slice(0, 200) || 'ML proxy call failed',
    };
  }
}
