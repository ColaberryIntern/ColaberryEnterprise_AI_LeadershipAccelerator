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
  /**
   * True when the agent only looked and advised, and changed nothing.
   *
   * The dispatcher moves a ticket to `in_review` whenever an agent returns with no errors, which
   * reads a clean finish as work done. For an agent that only ever proposes, finishing cleanly
   * is its normal outcome, so that rule promoted tickets nothing had been done to. A reviewer
   * then opens a ticket the system has already moved, and the move is itself a claim.
   *
   * Set this and the dispatcher leaves the ticket where it is. Absent, nothing changes, so an
   * agent that really does change something keeps the old behavior without opting in.
   */
  advisory_only?: boolean;
}
