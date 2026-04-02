# Audit Agent

## Purpose
Runs a daily audit of all autonomous intelligence decisions, computing success rates, tracking execution statuses, identifying missing monitor results, and storing governance-ready summaries. Also triggers batch learning from completed decisions to strengthen future recommendations.

## Department
Operations | Governance and Compliance

## Status
Live | Trigger: cron (daily)

## Input
- All `IntelligenceDecision` records from the past 24 hours
- Decision status counts (proposed, executed, completed, rolled back, failed)
- Average risk and confidence scores

## Output
- `AuditSummary` containing:
  - Period identifier
  - Total decisions, executed, completed, rolled back, and failed counts
  - Success rate percentage
  - Average risk and confidence scores
  - Count of decisions missing monitor results
  - Breakdown of actions by type

## How It Works
1. Queries the database for all intelligence decisions from the last 24 hours
2. Groups decisions by execution status and computes counts
3. Calculates the success rate as completed decisions divided by total executed
4. Computes average risk and confidence scores across all recent decisions
5. Identifies decisions stuck in "monitoring" status with no monitor results for over 2 hours
6. Builds an action-type breakdown showing which actions were recommended most
7. Stores the audit summary in vector memory for historical reference
8. Triggers `batchLearnFromDecisions()` to update the learning engine with completed outcomes

## Use Cases
- **Executive Leadership**: Daily governance report showing AI decision quality and safety metrics
- **Compliance**: Audit trail proving all autonomous actions were tracked, monitored, and evaluated
- **Operations**: Identifies stale monitoring jobs and decisions that fell through the cracks

## Integration Points
- Reads from **IntelligenceDecision** database table
- Writes summaries to **Vector Memory**
- Invokes the **Learning Engine** for batch outcome learning
- Reports feed into **Governance Agent** compliance checks
