# OpenClaw Tech Research Agent

## Purpose
Daily scan of Playwright releases, anti-bot detection changes, and platform API updates. Logs findings as tech_update learnings to keep the automation infrastructure current.

## Department
OpenClaw | Infrastructure

## Status
Live | Trigger: cron (daily)

## Input
- Playwright GitHub releases API
- Platform API status endpoints

## Output
- OpenclawLearning entries of type tech_update with version info and impact analysis

## How It Works
1. Checks the latest Playwright release version against GitHub API
2. Detects new versions and logs the insight with version details
3. Checks platform API health endpoints for changes or deprecations
4. Creates OpenclawLearning entries for each finding
5. Findings inform browser automation updates and API integration maintenance

## Use Cases
- **DevOps**: Stay ahead of browser automation changes
- **Infrastructure**: Early warning for platform API deprecations
- **Maintenance**: Data-driven upgrade scheduling

## Integration Points
- GitHub API (Playwright releases)
- Platform API endpoints (health checks)
- OpenclawLearning (finding storage)
