# OpenClaw Follow-Up Agent

## Purpose
Generates conversation-aware follow-up messages for stalled conversations. Targets hot and warm leads at stage 2+ that have been silent for 48+ hours. Also expires stale response drafts.

## Department
OpenClaw | Nurture

## Status
Live | Trigger: cron (daily at 10 AM UTC)

## Input
- Stalled OpenclawConversation records (hot/warm, stage >= 2)
- Hot leads at stage >= 3 without recent follow-ups (enforcement mode)
- ResponseQueue drafts past their expiry date

## Output
- ResponseQueue follow-up drafts with conversation context
- Expired stale drafts
- Blocked follow-ups when validation fails

## How It Works
1. Expires stale ResponseQueue drafts past their expires_at date
2. Finds stalled conversations (hot/warm priority, stage >= 2)
3. Enforces follow-up on hot leads at stage >= 3 with no follow-up in 48 hours
4. Generates follow-up text via GPT-4o with stage-appropriate prompt guidance
5. Validates follow-up content against safety rules and stage content rules
6. Creates ResponseQueue drafts with 48-hour expiry

## Use Cases
- **Sales**: Automated re-engagement of stalled high-value conversations
- **Nurture**: Stage-appropriate follow-up messaging
- **Compliance**: Content validation prevents pushy or off-brand messages

## Integration Points
- OpenclawConversation (stall detection)
- ResponseQueue (draft management)
- EngagementEvent (conversation context)
- OpenAI GPT-4o (follow-up generation)
- Platform strategy layer (content validation)
