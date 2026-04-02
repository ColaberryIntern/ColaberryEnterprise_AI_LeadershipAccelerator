# Admissions Assistant Agent

## Purpose
Serves as the operational hub for admissions by building daily call queues from high-intent visitors, verifying governance eligibility for each, and monitoring the overall backlog of callbacks, pending actions, documents, calls, emails, and SMS messages.

## Department
Admissions | Operations

## Status
Live | Trigger: cron (every 10 minutes)

## Input
- IntentScore records with score >= 70
- CallbackRequest, AdmissionsActionLog, DocumentDeliveryLog, CallContactLog counts

## Output
- Prioritized call queue with eligibility flags per visitor
- Operational health report with pending callbacks, actions, and daily communication counts

## How It Works
1. Queries the top 30 high-intent visitors (score >= 70), ordered by score descending
2. For each visitor, runs the Call Governance Agent to check 24-hour rule eligibility
3. Builds a call queue with visitor_id, score, and eligibility status
4. Counts pending callbacks, pending actions, and today's documents, calls, emails, and SMS
5. Produces an operational health report action with all metrics

## Use Cases
- **Admissions Team**: Daily prioritized call list for admissions counselors
- **Management**: Real-time backlog visibility across all communication channels
- **Operations**: Early warning for growing backlogs

## Integration Points
- Admissions Call Governance Agent (eligibility checks)
- IntentScore model (high-intent visitor identification)
- CallbackRequest, AdmissionsActionLog, DocumentDeliveryLog, CallContactLog (backlog metrics)
