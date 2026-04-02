# Admissions Executive Update Agent

## Purpose
Generates executive summaries of admissions activity every 4 hours, including conversation counts, enterprise lead discoveries, operational metrics, and notable high-engagement conversations.

## Department
Admissions | Reporting

## Status
Live | Trigger: cron (every 4 hours)

## Input
- ChatConversation, AdmissionsMemory, DocumentDeliveryLog, CallContactLog, CallbackRequest, AdmissionsActionLog data

## Output
- Executive summary with period metrics, visitor types, operational counts, and notable conversations

## How It Works
1. Gathers metrics for the last 4 hours: conversation count, new enterprise leads, high-intent visitors
2. Counts operational totals: documents sent, calls scheduled, pending callbacks, emails, SMS, governance denials
3. Finds the top 5 notable conversations (3+ messages) with lead details
4. Builds a comprehensive executive summary object
5. Logs as an admissions_intelligence AI event

## Use Cases
- **Executive Team**: Regular pulse on admissions activity and pipeline health
- **Management**: Monitor operational throughput across channels
- **Strategy**: Identify trends in enterprise lead generation and engagement

## Integration Points
- ChatConversation, AdmissionsMemory (engagement metrics)
- DocumentDeliveryLog, CallContactLog, CallbackRequest (operational metrics)
- AdmissionsActionLog (email/SMS counts)
- AI Event Service (executive update event)
