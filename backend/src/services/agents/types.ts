export interface AgentAction {
  campaign_id: string;
  action: string;
  reason: string;
  confidence: number;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  result: 'success' | 'failed' | 'skipped';
  details?: Record<string, any>;
}

export interface AgentExecutionResult {
  agent_name: string;
  campaigns_processed: number;
  actions_taken: AgentAction[];
  errors: string[];
  duration_ms: number;
}
