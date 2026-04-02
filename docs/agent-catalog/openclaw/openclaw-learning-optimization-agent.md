# OpenClaw Learning Optimization Agent

## Purpose
Analyzes engagement metrics by tone, timing, and topic to create learning entries and identify optimization opportunities. Feeds insights back into the content generation pipeline.

## Department
OpenClaw | Optimization

## Status
Live | Trigger: cron

## Input
- OpenclawResponse records with post_status = posted and engagement metrics
- Minimum sample size requirement (default: 10)

## Output
- OpenclawLearning entries for tone effectiveness, timing patterns, and topic performance
- Optimization recommendations based on engagement data

## How It Works
1. Loads all posted responses with engagement metrics
2. Groups by tone and computes average engagement per tone category
3. Analyzes posting time patterns to find optimal engagement windows
4. Identifies top-performing topics by engagement scores
5. Creates learning entries with confidence scores and sample sizes
6. Learnings are consumed by the Content Response Agent for tone selection

## Use Cases
- **Marketing**: Data-driven tone and topic optimization
- **Strategy**: Identify which platforms and topics generate the best engagement
- **Automation**: Learning-aware content generation improves over time

## Integration Points
- OpenclawResponse (engagement data source)
- OpenclawLearning (learning storage)
- Content Response Agent (learning consumer)
