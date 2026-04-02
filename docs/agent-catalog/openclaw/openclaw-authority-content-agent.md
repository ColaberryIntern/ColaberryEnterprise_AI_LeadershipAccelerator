# OpenClaw Authority Content Agent

## Purpose
Generates daily LinkedIn thought-leadership posts by synthesizing recent market signals and top-performing learnings. Creates draft authority content with tracking URLs for attribution.

## Department
OpenClaw | Content

## Status
Live | Trigger: cron (daily at 8 AM UTC)

## Input
- Recent OpenclawSignal records (48-hour window)
- OpenclawLearning entries for tone and topic performance
- Configurable max_posts_per_run (default: 2)

## Output
- AuthorityContent records in draft status with tracked URLs and UTM parameters
- Signal synthesis summaries per trending topic

## How It Works
1. Gathers recent signals from the last 48 hours
2. Groups signals by topic tags to find trending themes
3. Queries learnings for the best-performing tone
4. Generates authority posts via GPT-4o with a thought-leadership prompt
5. Creates AuthorityContent records with unique tracking short IDs and UTM parameters
6. Strips any accidental brand mentions from generated content

## Use Cases
- **Marketing**: Automated thought-leadership content pipeline for LinkedIn
- **Brand Building**: Position the founder as an enterprise AI authority
- **Lead Generation**: Tracked URLs enable content-to-lead attribution

## Integration Points
- OpenclawSignal (signal synthesis)
- OpenclawLearning (tone optimization)
- AuthorityContent model (draft storage)
- OpenAI GPT-4o (content generation)
