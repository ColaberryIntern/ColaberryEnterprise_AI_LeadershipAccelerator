import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { retrieveData, pushUpdate } from './legacyErpClient';
import type { AgentExecutionResult, AgentAction } from '../agents/types';
import type { ErpModuleConfig, ErpUpdateRequest } from './types';

const AGENT_NAME = 'LegacyErpIntegrationAgent';

function parseModuleConfig(): ErpModuleConfig[] {
  try {
    const raw = env.vaErpModuleConfigJson;
    if (!raw || raw === '[]') return [];
    return JSON.parse(raw) as ErpModuleConfig[];
  } catch {
    return [];
  }
}

// ─── Retrieval runner (STORY-001) ─────────────────────────────────────────────

export async function runLegacyErpIntegrationAgent(): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const modules = parseModuleConfig();
  let entitiesProcessed = 0;

  for (const module of modules) {
    for (const endpoint of module.endpoints) {
      const correlationId = randomUUID();
      try {
        const result = await retrieveData(module.baseUrl, {
          module: module.name,
          endpoint,
          correlationId,
        });

        actions.push({
          campaign_id: null,
          action: 'erp_data_retrieved',
          reason: `Retrieved ${result.recordCount} record(s) from ${module.name}${endpoint}`,
          confidence: 1.0,
          before_state: null,
          after_state: { recordCount: result.recordCount, durationMs: result.durationMs },
          result: 'success',
          entity_type: 'system',
          entity_id: undefined,
          details: { correlationId, module: module.name, endpoint },
        });

        entitiesProcessed++;
      } catch (err: unknown) {
        const e = err as Error & { errorClass?: string };
        const msg = `${module.name}${endpoint}: [${e.errorClass ?? 'Error'}] ${e.message}`;
        errors.push(msg);

        actions.push({
          campaign_id: null,
          action: 'erp_data_retrieval_failed',
          reason: msg,
          confidence: 1.0,
          before_state: null,
          after_state: null,
          result: 'failed',
          entity_type: 'system',
          details: { correlationId, module: module.name, endpoint, errorClass: e.errorClass },
        });
      }
    }
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: entitiesProcessed,
  };
}

// ─── Push runner (STORY-002) ──────────────────────────────────────────────────

export async function runLegacyErpPushAgent(
  updates: ErpUpdateRequest[],
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const moduleConfigs = parseModuleConfig();
  let entitiesProcessed = 0;

  for (const update of updates) {
    const moduleConfig = moduleConfigs.find(m => m.name === update.module);

    try {
      const result = await pushUpdate(
        moduleConfig?.baseUrl ?? '',
        update,
        {
          allowedRoles: moduleConfig?.allowedRoles ?? [],
          requiredFields: moduleConfig?.requiredFields ?? [],
        },
      );

      actions.push({
        campaign_id: null,
        action: 'erp_data_pushed',
        reason: `${update.method} to ${update.module}${update.endpoint} by role '${update.callerRole}'`,
        confidence: 1.0,
        before_state: result.oldValues as Record<string, unknown> | null,
        after_state: result.newValues as Record<string, unknown> | null,
        result: 'success',
        entity_type: 'system',
        details: {
          correlationId: update.correlationId,
          module: update.module,
          endpoint: update.endpoint,
          method: update.method,
          rolledBack: result.rolledBack,
        },
      });

      entitiesProcessed++;
    } catch (err: unknown) {
      const e = err as Error & { errorClass?: string };
      const msg = `${update.module}${update.endpoint}: [${e.errorClass ?? 'Error'}] ${e.message}`;
      errors.push(msg);

      actions.push({
        campaign_id: null,
        action: 'erp_data_push_failed',
        reason: msg,
        confidence: 1.0,
        before_state: null,
        after_state: null,
        result: 'failed',
        entity_type: 'system',
        details: {
          correlationId: update.correlationId,
          module: update.module,
          endpoint: update.endpoint,
          errorClass: e.errorClass,
        },
      });
    }
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: entitiesProcessed,
  };
}
