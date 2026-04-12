/**
 * Mode-Aware Agent Execution Wrapper
 *
 * Wraps agent execution to optionally enrich inputs and outputs based on
 * the resolved mode (MVP/Production/Enterprise/Autonomous).
 *
 * SAFETY: If mode is not present, agents execute exactly as before.
 * If the wrapper itself fails, it falls back to original execution.
 */
import { AgentExecutionResult, AgentAction } from './agents/types';
import { getAgentModeConfig, TargetMode, AgentModeConfig } from '../config/agentModeProfiles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModeAwareContext {
  mode?: TargetMode;
  modeSource?: 'project' | 'campaign' | 'capability' | 'default';
  capabilityId?: string;
  campaignId?: string;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Input Enrichment — adds mode hints without changing structure
// ---------------------------------------------------------------------------

export function applyModeToInput(
  config: Record<string, any>,
  mode: TargetMode,
  agentCapability?: string,
): Record<string, any> {
  const profile = agentCapability ? getAgentModeConfig(agentCapability, mode) : undefined;

  return {
    ...config,
    _mode: mode,
    _modeProfile: profile || null,
    _behaviorHints: profile ? {
      level: profile.level,
      description: profile.description,
    } : null,
  };
}

// ---------------------------------------------------------------------------
// Output Enrichment — adds metadata without removing fields
// ---------------------------------------------------------------------------

export function applyModeToOutput(
  result: AgentExecutionResult,
  mode: TargetMode,
  agentCapability?: string,
): AgentExecutionResult {
  const profile = agentCapability ? getAgentModeConfig(agentCapability, mode) : undefined;

  // Enrich each action with mode metadata
  const enrichedActions: AgentAction[] = result.actions_taken.map(action => ({
    ...action,
    details: {
      ...action.details,
      _mode: mode,
      _behaviorLevel: profile?.level || null,
    },
  }));

  return {
    ...result,
    actions_taken: enrichedActions,
  };
}

// ---------------------------------------------------------------------------
// Execution Wrapper — the main entry point
// ---------------------------------------------------------------------------

/**
 * Wrap an agent executor with mode-aware behavior.
 * Returns a new executor function with the same signature.
 *
 * If mode is not in context, the original executor runs unchanged.
 * If the wrapper logic fails, it falls back to the original executor.
 */
export function wrapExecutor(
  originalExecutor: (agentId: string, config: Record<string, any>) => Promise<AgentExecutionResult>,
  context: ModeAwareContext,
  agentCapability?: string,
): (agentId: string, config: Record<string, any>) => Promise<AgentExecutionResult> {
  const mode = context.mode;

  // No mode → no wrapping, return original executor unchanged
  if (!mode) return originalExecutor;

  return async (agentId: string, config: Record<string, any>): Promise<AgentExecutionResult> => {
    try {
      // Enrich input
      const enrichedConfig = applyModeToInput(config, mode, agentCapability);

      // Execute
      const result = await originalExecutor(agentId, enrichedConfig);

      // Enrich output
      return applyModeToOutput(result, mode, agentCapability);
    } catch (err) {
      // SAFETY: If wrapper fails, fall back to original execution
      console.error(`[AgentWrapper] Mode enrichment failed for ${agentCapability || 'unknown'}, falling back:`, (err as Error).message);
      return originalExecutor(agentId, config);
    }
  };
}

// ---------------------------------------------------------------------------
// Logging helper — creates execution_context metadata for activity logs
// ---------------------------------------------------------------------------

export function buildModeExecutionContext(context: ModeAwareContext): Record<string, any> {
  if (!context.mode) return {};
  return {
    mode: context.mode,
    mode_source: context.modeSource || 'default',
    mode_profile_applied: true,
    capability_id: context.capabilityId || null,
    campaign_id: context.campaignId || null,
  };
}
