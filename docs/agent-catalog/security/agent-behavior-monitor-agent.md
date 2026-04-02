# Agent Behavior Monitor Agent

## Purpose
Monitors all enabled agents for behavioral anomalies including stuck executions (running > 15 minutes), error rate spikes, and duration anomalies (> 3x average). Creates tickets for detected issues.

## Department
Security | Agent Safety

## Status
Live | Trigger: cron

## Input
- AiAgent records with enabled status
- AiAgentActivityLog entries from the last hour

## Output
- Behavioral anomaly reports (stuck, error_spike, duration_anomaly)
- Tickets for critical and high-severity anomalies

## How It Works
1. Scans all enabled agents for stuck status (running for more than 15 minutes)
2. Checks activity logs for error rate spikes (> 5 errors in the last hour)
3. Detects duration anomalies where recent runs take > 3x the average duration
4. Creates tickets for each anomaly with severity and details

## Use Cases
- **Operations**: Early detection of agent failures before they cascade
- **Reliability**: Prevent stuck agents from blocking the task queue
- **Debugging**: Automated error spike detection with context

## Integration Points
- AiAgent model (agent status monitoring)
- AiAgentActivityLog (performance analysis)
- Ticket service (issue escalation)
