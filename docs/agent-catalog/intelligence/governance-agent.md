# Governance Agent

## Purpose
Enforces system-wide guardrails by monitoring auto-execution rates, risk budgets, proposal queue depth, and concurrent monitoring limits. Automatically takes corrective action (such as rejecting stale proposals) when limits are exceeded.

## Department
Strategy | Governance and Safety

## Status
Live | Trigger: cron (every 10 minutes)

## Input
- Governance configuration from database (with hardcoded fallbacks):
  - Maximum auto-executions per hour
  - Maximum risk budget per hour
  - Maximum pending proposals
  - Maximum concurrent monitoring slots
- Recent `IntelligenceDecision` records

## Output
- `GovernanceReport` containing:
  - Compliance flag (true/false)
  - List of violations
  - Current metrics (executions, risk budget, pending proposals, active monitors)
  - Corrective actions taken

## How It Works
1. Resolves governance thresholds from the database via `resolveGlobalConfig`, falling back to hardcoded defaults on error
2. Counts auto-executions in the last hour and sums their risk scores
3. Checks if auto-execution count exceeds the hourly limit
4. Checks if cumulative risk budget exceeds the hourly risk cap
5. Counts pending proposals and auto-rejects the oldest ones if the queue overflows
6. Counts active monitoring slots and flags if concurrent monitoring exceeds limits
7. Logs all violations and corrective actions taken

## Use Cases
- **Risk Management**: Prevents runaway autonomous execution by enforcing hourly action and risk caps
- **Operations**: Keeps the proposal queue from growing unbounded by auto-rejecting stale items
- **Compliance**: Provides a continuous compliance report showing all guardrail metrics and violations

## Integration Points
- Reads thresholds from **GovernanceResolutionService** (database-backed configuration)
- Monitors **IntelligenceDecision** records
- Auto-rejects stale proposals directly in the decision table
- Reports feed into **Audit Agent** daily summaries
