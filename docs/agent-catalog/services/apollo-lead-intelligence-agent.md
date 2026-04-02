# Apollo Lead Intelligence Agent

## Purpose
Discovers leads from Apollo.io for active autonomous campaigns with ICP (Ideal Customer Profile) profiles. Creates lead recommendations pending admin approval - never adds leads directly to campaigns.

## Department
Services | Lead Generation

## Status
Live | Trigger: cron (every 6 hours)

## Input
- Active autonomous campaigns with linked ICP profiles
- Apollo.io API search parameters

## Output
- Lead recommendations with program fit scores
- Discovery results per campaign and ICP profile

## How It Works
1. Finds active autonomous campaigns with ICP profiles
2. For each campaign, calls discoverLeadsForCampaign() with configurable parameters
3. Applies minimum program fit score filtering (default: 40)
4. Creates lead recommendations pending admin approval
5. Returns discovery results per campaign

## Use Cases
- **Sales**: Automated lead discovery based on ideal customer profiles
- **Marketing**: Campaign-specific lead sourcing
- **Operations**: Scalable lead generation with quality thresholds

## Integration Points
- leadIntelligenceService (Apollo.io integration)
- Campaign and ICPProfile models (targeting)
