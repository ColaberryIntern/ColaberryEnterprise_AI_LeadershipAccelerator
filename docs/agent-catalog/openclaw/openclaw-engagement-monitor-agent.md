# OpenClaw Engagement Monitor Agent

## Purpose
Scans posted responses and authority content for new engagement (comments, replies) via platform APIs. Creates EngagementEvent records, scores intent, detects seniority, and aggregates engagement metrics.

## Department
OpenClaw | Engagement

## Status
Live | Trigger: cron (every 30 minutes)

## Input
- OpenclawResponse records with status = posted and a post_url
- AuthorityContent records with status = posted and a post_url

## Output
- EngagementEvent records for each new comment/reply with intent scores and seniority
- Aggregated engagement metrics on responses and authority content
- Conversation state updates via tracking service

## How It Works
1. Finds posted responses and authority content with URLs
2. Fetches engagements via platform APIs (Dev.to, Hashnode, Discourse, Twitter, Bluesky, YouTube, Product Hunt)
3. Deduplicates by source_url to avoid re-processing
4. Scores intent via GPT-4o-mini for each engagement
5. Detects role seniority from user titles (IC, manager, director, VP, C-level)
6. Wires each new event to the conversation tracking state machine
7. Aggregates weighted engagement scores back to source responses and content

## Use Cases
- **Sales**: Identify high-intent engagers for follow-up
- **Analytics**: Track engagement quality across platforms
- **Pipeline**: Seniority detection feeds lead scoring

## Integration Points
- Platform APIs (engagement fetching)
- OpenAI GPT-4o-mini (intent scoring)
- Conversation tracking service (state machine)
- EngagementEvent, OpenclawResponse, AuthorityContent (data storage)
