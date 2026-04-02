# OpenClaw Conversation Detection Agent

## Purpose
Scores discovered signals for relevance, engagement potential, and risk. Queues high-scoring signals for content response generation while filtering out risky or low-value conversations.

## Department
OpenClaw | Signal Processing

## Status
Live | Trigger: cron

## Input
- OpenclawSignal records with status = discovered

## Output
- Scored signals with relevance, engagement, and risk scores
- High-scoring signals queued with generate_response tasks
- Risky signals marked as skipped

## How It Works
1. Fetches unscored signals (status = discovered)
2. Scores relevance (0 to 1) based on keyword matching across three tiers: direct value prop, broad AI topics, adjacent tech
3. Scores engagement (0 to 1) based on comments, upvotes, amplification, recency, and platform type
4. Scores risk (0 to 1) based on risky terms, controversial contexts, and pile-on detection
5. Queues signals above relevance and engagement thresholds but below risk threshold
6. Creates generate_response tasks for queued signals

## Use Cases
- **Marketing**: Automated identification of high-value engagement opportunities
- **Risk Management**: Automated filtering of controversial or risky conversations
- **Prioritization**: Score-based ranking ensures highest-value signals are processed first

## Integration Points
- OpenclawSignal (signal scoring)
- OpenclawTask (task creation)
- Platform strategy layer (strategy-aware scoring adjustments)
