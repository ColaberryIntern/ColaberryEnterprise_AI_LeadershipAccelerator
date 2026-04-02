# OpenClaw Market Signal Agent

## Purpose
Scans public platform APIs for AI-related conversations matching target keywords across 11+ platforms. Creates OpenclawSignal records for discovered conversations, feeding the content response pipeline.

## Department
OpenClaw | Signal Discovery

## Status
Live | Trigger: cron

## Input
- Configurable keywords (default: AI training, enterprise AI, AI leadership)
- Configurable platforms (Reddit, Hacker News, Dev.to, Hashnode, Discourse, Twitter, Bluesky, YouTube, Product Hunt, Facebook Groups, LinkedIn Comments)
- Learning-optimized keyword weights and platform priorities

## Output
- OpenclawSignal records for each discovered conversation (deduplicated by source URL)

## How It Works
1. Loads optimized scan configuration from learnings (keyword weights, platform priorities)
2. Merges learning-derived primary keywords with base secondary keywords
3. Scans each platform with adjusted signal limits based on platform multipliers
4. Deduplicates against existing signals by source_url
5. Creates OpenclawSignal records with platform, author, title, content excerpt, and details

## Use Cases
- **Marketing**: Discover relevant AI conversations across the internet
- **Lead Generation**: Find prospects actively discussing enterprise AI topics
- **Content Strategy**: Identify trending topics for authority content creation

## Integration Points
- Platform APIs (Reddit, HN, Dev.to, Hashnode, Discourse, Twitter, Bluesky, YouTube, PH, Facebook, LinkedIn)
- OpenclawSignal model (signal storage)
- Signal scaler service (learning-based optimization)
