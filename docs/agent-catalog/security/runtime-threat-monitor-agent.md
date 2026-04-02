# Runtime Threat Monitor Agent

## Purpose
Monitors runtime behavior for suspicious patterns including high-volume visitors (potential scrapers), unusual request patterns, and anomalous agent activity within a 5-minute sliding window.

## Department
Security | Runtime

## Status
Live | Trigger: cron

## Input
- PageEvent records from the last 5 minutes
- AiAgentActivityLog entries for error detection

## Output
- Suspicious visitor alerts (> 30 events in 5-minute window)
- Tickets for potential scraping or abuse detection

## How It Works
1. Queries recent page events within the 5-minute window
2. Groups events by visitor_id and counts occurrences
3. Flags visitors exceeding the threshold (30 events in 5 minutes)
4. Creates tickets for suspicious activity patterns

## Use Cases
- **Security**: Detect web scraping and automated abuse
- **Operations**: Identify visitors causing high load
- **Compliance**: Runtime threat audit trail

## Integration Points
- PageEvent model (activity monitoring)
- AiAgentActivityLog (agent behavior)
- Ticket service (threat reporting)
