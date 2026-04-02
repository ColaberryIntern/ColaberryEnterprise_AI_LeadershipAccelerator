# OpenClaw LinkedIn Flow Agent

## Purpose
Generates LinkedIn action suggestions including comments, connection requests, and DM follow-ups. All actions are created as pending and never auto-executed, requiring manual approval.

## Department
OpenClaw | LinkedIn

## Status
Live | Trigger: cron (9 AM and 3 PM UTC, weekdays)

## Input
- Recent LinkedIn signals (last 24 hours)
- High-intent EngagementEvent records from LinkedIn
- OpenclawConversation records at advanced stages

## Output
- LinkedInActionQueue entries for comments, connection requests, and DM follow-ups (all pending status)

## How It Works
1. Finds recent LinkedIn signals worth engaging with and generates comment suggestions via GPT-4o
2. Identifies high-seniority engagers (director+) for connection request suggestions
3. Finds advanced-stage LinkedIn conversations for DM follow-up suggestions
4. Creates all actions as pending in the LinkedInActionQueue - never auto-executes
5. Respects configurable limits per action type per run

## Use Cases
- **Sales**: Curated daily LinkedIn action list for the team
- **Networking**: Strategic connection requests to high-seniority engagers
- **Pipeline**: DM suggestions for advancing conversations toward conversion

## Integration Points
- OpenclawSignal (engagement opportunities)
- EngagementEvent (high-intent detection)
- OpenclawConversation (stage-based DM triggers)
- LinkedInActionQueue (action storage)
- OpenAI GPT-4o (content generation)
