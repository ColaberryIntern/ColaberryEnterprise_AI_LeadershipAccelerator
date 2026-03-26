export interface AgentAction {
  campaign_id: string | null;
  action: string;
  reason: string;
  confidence: number;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  result: 'success' | 'failed' | 'skipped' | 'flagged';
  details?: Record<string, any>;
  /** Target entity type for non-campaign actions */
  entity_type?: 'campaign' | 'lead' | 'agent' | 'system' | 'config' | 'visitor' | 'authority_content' | 'engagement_event' | 'response_queue' | 'linkedin_action' | 'openclaw_conversation';
  /** Target entity identifier */
  entity_id?: string;
}

export interface AgentExecutionResult {
  agent_name: string;
  campaigns_processed: number;
  actions_taken: AgentAction[];
  errors: string[];
  duration_ms: number;
  /** Number of entities scanned/processed (for non-campaign agents) */
  entities_processed?: number;
}
