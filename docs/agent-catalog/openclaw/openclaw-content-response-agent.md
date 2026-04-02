# OpenClaw Content Response Agent

## Purpose
Generates educational, platform-appropriate responses for queued signals using GPT-4o. Creates draft responses with unique marketing tags, validates content against platform strategy rules, runs quality gates, and routes for posting or manual review.

## Department
OpenClaw | Content

## Status
Live | Trigger: cron

## Input
- OpenclawTask records with task_type = generate_response
- OpenclawSignal records with platform context and content

## Output
- OpenclawResponse records with content, tone, tracked URL, and UTM parameters
- Quality-approved responses routed to posting tasks
- Quality-rejected responses queued for regeneration
- Lead records created from signal authors

## How It Works
1. Fetches pending generate_response tasks
2. Selects tone based on learning data or keyword heuristics
3. Generates response via GPT-4o with platform-specific prompts and conversion stage guidance
4. Validates content against platform strategy rules (no links where forbidden, no brand mentions)
5. Runs deterministic quality gate (length, promotional language, value content checks)
6. Routes approved responses to post_response tasks; routes rejected responses for regeneration
7. Captures leads from signal authors

## Use Cases
- **Marketing**: Automated response generation across 14 platforms
- **Lead Generation**: Every response includes a tracked URL for attribution
- **Quality Control**: Deterministic quality gate prevents low-quality posts

## Integration Points
- OpenAI GPT-4o (content generation)
- Platform strategy layer (tone, link rules, validation)
- Quality gate agent (content review)
- Lead capture service (author-to-lead conversion)
- Rate limiter (posting frequency control)
