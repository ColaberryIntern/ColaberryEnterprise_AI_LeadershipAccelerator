# Monitor Agent

## Purpose
Tracks outcomes of executed decisions at scheduled checkpoints (1 hour, 6 hours, and 24 hours post-execution). Evaluates whether actions improved target metrics and automatically rolls back actions that cause significant degradation.

## Department
Operations | Outcome Tracking

## Status
Live | Trigger: cron (runs periodically to check due monitoring checkpoints)

## Input
- `IntelligenceDecision` records in "monitoring" status with a `monitor_next_at` timestamp that has passed
- Before-state and after-state snapshots captured during execution
- Impact estimates from the decision pipeline

## Output
- Monitoring cycle results:
  - Number of decisions checked
  - Number completed successfully
  - Number rolled back due to degradation

## How It Works
1. Queries for all decisions in "monitoring" status where the next checkpoint time has passed (up to 50 per cycle)
2. Determines which checkpoint applies based on elapsed time since execution (1h, 6h, or 24h)
3. Evaluates the outcome by comparing before-state and after-state (e.g., error count changes)
4. Records the checkpoint result in the decision's `monitor_results` field
5. At the 24-hour final checkpoint:
   - Marks the decision as "completed" if metrics improved
   - Marks the decision as "rolled_back" if metrics worsened
6. At intermediate checkpoints (1h, 6h):
   - Triggers early rollback if degradation exceeds 20%
   - Otherwise schedules the next checkpoint
7. Updates the learning engine with checkpoint data for future decision improvement

## Use Cases
- **Operations**: Automatically validates that an agent config reset actually reduced errors within 24 hours
- **Marketing**: Monitors whether a campaign configuration change improved conversion rates
- **Risk Management**: Provides early warning and automatic rollback when an action causes unexpected degradation

## Integration Points
- Reads and updates **IntelligenceDecision** records
- Invokes the **Learning Engine** (`updateFromMonitor`) to record outcomes
- Works in sequence after **Execution Agent** completes an action
- Results feed into **Audit Agent** daily summaries
