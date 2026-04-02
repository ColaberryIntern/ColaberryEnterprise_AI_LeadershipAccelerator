# Admissions Proactive Outreach Agent

## Purpose
Flags high-intent visitors for proactive Maya chat outreach by setting a proactive_chat_pending flag on visitors who have high intent scores but no active conversation.

## Department
Admissions | Outreach

## Status
Live | Trigger: cron (every 5 minutes)

## Input
- IntentScore records with score >= 60
- Visitor metadata for proactive chat status

## Output
- Visitor metadata updated with proactive_chat_pending = true and context

## How It Works
1. Finds visitors with intent scores >= 60
2. Skips visitors who already have an active conversation
3. Skips visitors who already have proactive_chat_pending set
4. Sets the proactive chat flag with context (reason, intent score, intent level)
5. The frontend picks up this flag and triggers a proactive Maya greeting

## Use Cases
- **Admissions**: Maya proactively engages high-intent visitors before they leave
- **Sales**: Capture interested visitors who may not initiate chat themselves
- **Conversion**: Reduce bounce rate on key pages by proactive engagement

## Integration Points
- IntentScore model (intent identification)
- ChatConversation (active conversation check)
- Visitor model (metadata flag)
- Frontend chat widget (proactive greeting trigger)
