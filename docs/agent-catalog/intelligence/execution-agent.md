# Execution Agent

## Purpose
Executes approved safe actions within database transactions, capturing before/after state snapshots for full auditability and rollback capability. Serves as the single execution gateway for all autonomous actions in the intelligence pipeline.

## Department
Operations | Action Execution

## Status
Live | Trigger: event (invoked when a decision is approved for execution)

## Input
- Decision ID referencing an `IntelligenceDecision` record
- Safe action type (from the allowlist)
- Execution parameters
- Trace ID for audit correlation
- Executor identity (auto or human)

## Output
- `ExecutionResult` containing:
  - Success flag
  - Before-state snapshot
  - After-state snapshot
  - Error message (if failed)

## How It Works
1. Looks up the decision record and updates its status to "executing"
2. Validates the action type against the registered executor map
3. Executes the action within a Sequelize transaction (for transactional actions)
4. Captures before-state and after-state snapshots of affected entities
5. On success, sets the decision to "monitoring" status with a 1-hour checkpoint
6. On failure, marks the decision as "failed" with error details
7. Logs the execution activity to the agent activity log for audit

## Supported Actions
- **update_agent_config**: Resets error counts, updates agent configuration patches
- **modify_agent_schedule**: Applies backoff by pausing agents temporarily
- **update_campaign_config**: Adjusts campaign-specific settings
- **adjust_lead_scoring**: Recalibrates lead scoring weights
- **launch_ab_test**: Starts an A/B test with configurable duration and traffic split
- **pause_campaign**: Temporarily pauses a campaign to stop error propagation

## Use Cases
- **Operations**: Automatically resets a failing agent's error count and restores it to idle status
- **Marketing**: Pauses a campaign that is causing error spikes, with full state capture for later review
- **Data Science**: Launches A/B tests proposed by the Growth Experiment Agent

## Integration Points
- Receives execution requests from the **Autonomous Decision Pipeline**
- Updates **IntelligenceDecision** records with execution results
- Feeds into **Monitor Agent** for post-execution outcome tracking
- Logs activities to **AiAgentActivityLog** via `aiEventService`
