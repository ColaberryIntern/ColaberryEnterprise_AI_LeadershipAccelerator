/**
 * Agent Mode Profiles — config-only layer defining how agents should behave
 * at each mode level. Agents can read this to adjust their behavior.
 *
 * This is NOT deeply integrated yet — it's a config layer that agents can
 * optionally consume. If an agent doesn't check mode, it behaves as before.
 */

export type AgentBehaviorLevel = 'basic' | 'personalized' | 'compliant' | 'self_optimizing'
  | 'simple' | 'weighted' | 'auditable' | 'adaptive'
  | 'minimal' | 'standard' | 'comprehensive' | 'autonomous'
  | 'off' | 'passive' | 'active' | 'proactive';

export interface AgentModeConfig {
  level: AgentBehaviorLevel;
  description?: string;
}

export type TargetMode = 'mvp' | 'production' | 'enterprise' | 'autonomous';

export const agentModeProfiles: Record<string, Record<TargetMode, AgentModeConfig>> = {
  message_generation: {
    mvp: { level: 'basic', description: 'Template-based messages, minimal personalization' },
    production: { level: 'personalized', description: 'AI-personalized content with A/B testing' },
    enterprise: { level: 'compliant', description: 'Compliance-checked, brand-governed messaging' },
    autonomous: { level: 'self_optimizing', description: 'Self-optimizing content with continuous improvement' },
  },
  scoring: {
    mvp: { level: 'simple', description: 'Basic rule-based scoring' },
    production: { level: 'weighted', description: 'Multi-factor weighted scoring model' },
    enterprise: { level: 'auditable', description: 'Auditable scoring with decision trail' },
    autonomous: { level: 'adaptive', description: 'ML-adaptive scoring that learns from outcomes' },
  },
  monitoring: {
    mvp: { level: 'off', description: 'No active monitoring' },
    production: { level: 'passive', description: 'Alert on failures, log metrics' },
    enterprise: { level: 'active', description: 'Active anomaly detection, escalation rules' },
    autonomous: { level: 'proactive', description: 'Predictive monitoring, auto-remediation' },
  },
  campaign_execution: {
    mvp: { level: 'minimal', description: 'Manual send, basic scheduling' },
    production: { level: 'standard', description: 'Automated sequences, A/B testing' },
    enterprise: { level: 'comprehensive', description: 'Multi-channel orchestration, compliance gates' },
    autonomous: { level: 'autonomous', description: 'Self-managing campaigns, budget optimization' },
  },
  data_processing: {
    mvp: { level: 'basic', description: 'Raw data pass-through' },
    production: { level: 'standard', description: 'Validated, normalized, deduplicated' },
    enterprise: { level: 'comprehensive', description: 'PII handling, audit logging, encryption' },
    autonomous: { level: 'adaptive', description: 'Self-healing pipelines, schema evolution' },
  },
  quality_assurance: {
    mvp: { level: 'off', description: 'No automated QA' },
    production: { level: 'standard', description: 'Basic validation checks' },
    enterprise: { level: 'comprehensive', description: 'Full regression testing, compliance verification' },
    autonomous: { level: 'proactive', description: 'Continuous testing, auto-fix on failures' },
  },
};

/**
 * Get the mode config for a specific agent capability at a given mode level.
 * Returns undefined if no profile exists — agent should use its default behavior.
 */
export function getAgentModeConfig(capability: string, mode: TargetMode): AgentModeConfig | undefined {
  return agentModeProfiles[capability]?.[mode];
}
