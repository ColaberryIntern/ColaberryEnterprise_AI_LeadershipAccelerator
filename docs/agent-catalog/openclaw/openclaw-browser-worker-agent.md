# OpenClaw Browser Worker Agent

## Purpose
Processes approved responses by posting them to platforms via API, browser automation (Playwright), or manual queue. Handles authentication, screenshots, session health, circuit breakers, and rate limits.

## Department
OpenClaw | Posting

## Status
Live | Trigger: cron

## Input
- OpenclawTask records with task_type = post_response in assigned/pending status
- OpenclawResponse records with post_status = approved

## Output
- Responses posted to platforms with post_url recorded
- Responses queued for manual posting when API and browser methods fail
- Session health updates and error screenshots

## How It Works
1. Fetches pending post_response tasks, ordered by priority
2. For each task, applies safety gates: human-execution check, platform strategy, circuit breaker, rate limiter
3. Attempts API posting first via platform-specific services
4. If API fails, falls back to browser posting via Playwright (Dev.to, Medium)
5. If both fail, queues for manual posting (ready_to_post status)
6. Updates signal status to responded and task to completed

## Use Cases
- **Marketing**: Automated comment/response posting across 10+ platforms
- **Operations**: Multi-tier posting with API, browser, and manual fallbacks
- **Compliance**: Hard blocks on human-execution platforms (Reddit, LinkedIn, etc.)

## Integration Points
- Platform posting APIs (Dev.to, Hashnode, Discourse, Twitter, Bluesky, YouTube, Product Hunt)
- Playwright browser automation (Dev.to, Medium)
- Circuit breaker and rate limiter services
- OpenclawSession (session health tracking)
