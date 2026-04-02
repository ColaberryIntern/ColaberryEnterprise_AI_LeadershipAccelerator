# OpenClaw LinkedIn Comment Monitor Agent

## Purpose
Periodically scans tracked LinkedIn posts for new comments using browser scraping. For each new commenter, generates a personalized reply via GPT-4o and queues it for manual posting.

## Department
OpenClaw | LinkedIn

## Status
Live | Trigger: cron (8 AM, 12 PM, 4 PM UTC, weekdays)

## Input
- OpenclawSignal records with platform = linkedin_post_tracking and status = active
- Known commenters list per tracked post

## Output
- OpenclawResponse records for new commenters (ready_for_manual_post status)
- Updated known_commenters lists on tracked posts

## How It Works
1. Finds all actively tracked LinkedIn posts
2. Scrapes each post for current comments via Playwright
3. Identifies new commenters not in the known list
4. Generates personalized replies via GPT-4o based on commenter name, title, and comment content
5. Creates OpenclawResponse records queued for manual posting (LinkedIn requires human execution)
6. Updates the known_commenters list to avoid duplicate replies

## Use Cases
- **Engagement**: Stay active on LinkedIn posts with timely, personalized replies
- **Lead Generation**: Engage high-seniority commenters on thought-leadership posts
- **Brand Building**: Consistent presence in LinkedIn discussions

## Integration Points
- Playwright (LinkedIn scraping)
- OpenAI GPT-4o (reply generation)
- OpenclawSignal (post tracking)
- OpenclawResponse (reply storage)
