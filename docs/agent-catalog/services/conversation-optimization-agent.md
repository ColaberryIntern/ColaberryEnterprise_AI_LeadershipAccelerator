# Conversation Optimization Agent

## Purpose
Detects step-level conversation dropoffs in campaigns and proposes AI instruction enhancements. Operates in suggest-only mode with admin approval required.

## Department
Services | Marketing

## Status
Live | Trigger: cron

## Input
- Active campaigns with step-level performance data
- Dropoff threshold: 80% reply rate drop from previous step

## Output
- ProposedAgentAction records with enhanced AI instructions
- Dropoff analysis with step-level metrics

## How It Works
1. Finds active campaigns and analyzes step-level reply rates
2. Identifies steps with significant dropoffs (> 80% drop from previous step)
3. Generates AI instruction enhancements for underperforming steps
4. Creates ProposedAgentAction records (never directly modifies instructions)

## Use Cases
- **Marketing**: Optimize multi-step campaign conversation flows
- **Sales**: Reduce dropoff at critical conversion steps
- **Analytics**: Step-level performance visibility

## Integration Points
- InteractionOutcome model (step performance)
- agentPermissionService (proposal creation)
