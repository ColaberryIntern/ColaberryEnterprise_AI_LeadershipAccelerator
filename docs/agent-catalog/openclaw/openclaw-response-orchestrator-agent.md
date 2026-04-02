# OpenClaw Response Orchestrator Agent

## Purpose
Generates conversation follow-up drafts for new high-intent engagement events. Builds conversation context chains and creates stage-appropriate response drafts in the ResponseQueue.

## Department
OpenClaw | Engagement

## Status
Live | Trigger: cron (every 15 minutes)

## Input
- EngagementEvent records with status = new and intent_score above threshold (default: 0.3)

## Output
- ResponseQueue entries with follow-up drafts (status = draft)
- Updated EngagementEvent status to responded

## How It Works
1. Finds new engagement events above the intent score threshold
2. Builds conversation context by tracing: engagement to response to original signal
3. Detects conversation stage from the engagement history
4. Generates a stage-appropriate follow-up via GPT-4o with strategy and conversion guidance
5. Validates content against stage rules
6. Creates ResponseQueue draft with 48-hour expiry

## Use Cases
- **Sales**: Automated follow-up on high-intent social engagements
- **Engagement**: Timely responses to interested commenters
- **Pipeline**: Stage-aware conversation advancement

## Integration Points
- EngagementEvent (trigger source)
- OpenclawResponse, OpenclawSignal (conversation context)
- ResponseQueue (draft storage)
- OpenAI GPT-4o (response generation)
- Platform strategy layer (stage validation)
