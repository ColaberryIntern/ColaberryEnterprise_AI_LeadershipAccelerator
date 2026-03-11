// ─── Vector Executor ──────────────────────────────────────────────────────
// Calls Python proxy vector search endpoints. Gracefully skips if proxy is down.

import { intelligenceProxy } from '../../services/intelligenceProxyService';
import { VectorTask } from './planBuilder';

export interface VectorResult {
  task: VectorTask;
  data: Record<string, any>[];
  status: 'success' | 'skipped' | 'error';
  error?: string;
}

/**
 * Execute vector search tasks in parallel via the Python proxy service.
 */
export async function executeVectorSearch(
  tasks: VectorTask[],
  question: string,
  entityType?: string
): Promise<VectorResult[]> {
  if (tasks.length === 0) return [];

  const results = await Promise.allSettled(
    tasks.map((task) => runVectorTask(task, question, entityType))
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      task: tasks[i],
      data: [],
      status: 'error' as const,
      error: result.reason?.message || 'Vector task failed',
    };
  });
}

async function runVectorTask(
  task: VectorTask,
  question: string,
  _entityType?: string
): Promise<VectorResult> {
  try {
    let response;

    switch (task) {
      case 'similar_entities':
        response = await intelligenceProxy.getSimilarEntities({ query: question });
        break;
      case 'semantic_entity_search':
        response = await intelligenceProxy.semanticSearch(question, 10);
        break;
      case 'similar_text_search':
        response = await intelligenceProxy.semanticSearch(question, 20);
        break;
      default:
        return { task, data: [], status: 'skipped', error: `Unknown vector task: ${task}` };
    }

    const data = Array.isArray(response.data) ? response.data : response.data?.results || [];
    return { task, data, status: 'success' };
  } catch (err: any) {
    return {
      task,
      data: [],
      status: 'error',
      error: err?.message?.slice(0, 200) || 'Vector proxy call failed',
    };
  }
}
