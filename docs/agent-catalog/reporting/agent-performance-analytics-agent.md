# Agent Performance Analytics Agent

## Purpose
Computes agent KPIs across all registered agents and flags those with low success rates (below 70%) for investigation. Provides system-wide agent health visibility.

## Department
Reporting | Agent Analytics

## Status
Live | Trigger: cron

## Input
- Agent execution logs and performance data via agentPerformanceService

## Output
- Agent KPI summaries with success rates
- Flagged low-performing agents with details

## How It Works
1. Calls computeAgentKPIs() to aggregate performance data across all agents
2. Scans results for agents with success rates below 70%
3. Flags low-performing agents with their success rate
4. Produces a summary with total agents analyzed and flags generated

## Use Cases
- **Operations**: Monitor agent health across the entire system
- **Debugging**: Quickly identify underperforming agents
- **Management**: Agent reliability reporting

## Integration Points
- agentPerformanceService (KPI computation)
- Agent Registry (agent discovery)
