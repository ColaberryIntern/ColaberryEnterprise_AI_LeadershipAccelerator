# OpenClaw Conversation Sync Agent

## Purpose
Safety net for conversation data integrity. Links orphaned engagement events to conversations, detects stalled conversations, and re-scores active conversation leads.

## Department
OpenClaw | Data Integrity

## Status
Live | Trigger: cron (every 2 hours)

## Input
- EngagementEvent records with null conversation_id
- OpenclawConversation records in active/stalled status

## Output
- Orphaned events linked to conversations
- Stalled conversations detected (48h+ silence at stage >= 2)
- Lead scores refreshed for active conversations
- Conversation metrics summary

## How It Works
1. Links orphaned EngagementEvents (conversation_id IS NULL) to their conversations
2. Detects stalled conversations (48h+ silence at stage >= 2) and marks them
3. Re-scores all leads with active or stalled conversations
4. Reports metrics: total, active, stalled, and converted conversation counts

## Use Cases
- **Data Integrity**: Ensure all engagement events are properly linked
- **Sales**: Stalled conversation detection triggers follow-up workflows
- **Analytics**: Accurate conversation metrics for pipeline reporting

## Integration Points
- OpenclawConversation (conversation state)
- EngagementEvent (orphan linking)
- Lead scoring service (score refresh)
