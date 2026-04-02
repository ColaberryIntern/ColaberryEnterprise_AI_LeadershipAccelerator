# Content Optimization Agent

## Purpose
Detects campaigns with low open or reply rates and proposes AI-generated rewrites for pending emails. Operates in suggest-only mode - creates proposals that require admin approval.

## Department
Services | Marketing

## Status
Live | Trigger: cron

## Input
- Active campaigns with engagement metrics (last 48 hours)
- Open rate threshold: 10%, reply rate threshold: 1%, minimum sample: 10

## Output
- ProposedAgentAction records with AI-rewritten email content
- Proposal reasoning with before/after metrics

## How It Works
1. Finds active campaigns and computes engagement metrics from the last 48 hours
2. Identifies campaigns below open rate (10%) or reply rate (1%) thresholds
3. Generates AI-rewritten subject lines and body content
4. Creates ProposedAgentAction records (never directly modifies content)
5. An admin must approve proposals before they take effect

## Use Cases
- **Marketing**: Data-driven email content optimization
- **Sales**: Improve campaign engagement without manual rewriting
- **Governance**: All changes require human approval

## Integration Points
- InteractionOutcome model (engagement metrics)
- aiMessageService (content generation)
- agentPermissionService (proposal creation)
