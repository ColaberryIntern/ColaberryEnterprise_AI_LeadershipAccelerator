import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { retrieveData, pushUpdate } from './legacyErpClient';
import { authorizeAgentAction } from '../agentAuthorizationService';
import { startRealtimeSync, type RealtimeSyncOptions } from './realtimeSyncEngine';
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

    // REQ-003 / TBI L5 governance: run every push through the ABAC chokepoint. In
    // 'enforce' mode a high-stakes ERP write is HELD for human approval ("AI proposes,
    // human approves"); in the default 'shadow' mode this records the would-deny
    // exposure and proceeds, so it is safe to ship dark and flip on later.
    const authz = await authorizeAgentAction({
      agentId: AGENT_NAME,
      agentName: AGENT_NAME,
      action: 'erp_data_push',
      resourceType: 'legacy_erp_module',
      resourceId: update.module,
      context: { resourceType: 'legacy_erp_module' },
    });
    if (!authz.allowed) {
      actions.push({
        campaign_id: null,
        action: 'erp_data_push_held_for_approval',
        reason: `Held pending human approval (${authz.reason}) — ${update.method} to ${update.module}${update.endpoint}`,
        confidence: 1.0,
        before_state: null,
        after_state: null,
        result: 'flagged',
        entity_type: 'system',
        details: {
          correlationId: update.correlationId,
          module: update.module,
          endpoint: update.endpoint,
          requiresApproval: authz.requiresApproval,
          reason: authz.reason,
        },
      });
      continue; // do NOT perform the write — it is held for a human
    }

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

// ─── Real-time sync runner (STORY-003) ────────────────────────────────────────

/**
 * Start listening for platform-change events and sync each one to its legacy ERP module
 * in real time. Unlike the two runners above, this isn't a one-shot batch -- it's a
 * standing subscription, so it returns an unsubscribe function instead of an
 * AgentExecutionResult. Call the returned function to stop listening.
 */
export function startLegacyErpRealtimeSyncAgent(options?: RealtimeSyncOptions): () => void {
  return startRealtimeSync(parseModuleConfig(), options);
}
