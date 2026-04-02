# OpenClaw Conversion Detection Agent

## Purpose
Detects conversations ready for conversion by identifying high-confidence interest signals at stage 5, advances them to stage 6, and creates RevenueOpportunity records for pipeline tracking.

## Department
OpenClaw | Revenue

## Status
Live | Trigger: cron (every 4 hours)

## Input
- OpenclawConversation records at stage 5 (interest expressed) with active status
- ResponseQueue entries for offer verification

## Output
- Conversations advanced to stage 6
- RevenueOpportunity records with full attribution chain
- Opportunity status updates for conversations beyond stage 6

## How It Works
1. Finds active conversations at stage 5 (interest expressed)
2. Checks for high-confidence conversion signals (>= 0.8) and whether a call/link was offered
3. Advances to stage 6 if: offer was made AND positive response, OR very high confidence signals (>= 0.9)
4. Creates RevenueOpportunity records with estimated value, attribution chain, and conversion signals
5. Updates existing opportunity status as conversations progress beyond stage 6

## Use Cases
- **Sales**: Automatic pipeline creation from social engagement
- **Revenue Tracking**: Full attribution from signal to response to conversion
- **Management**: Pipeline visibility across all OpenClaw platforms

## Integration Points
- OpenclawConversation (stage management)
- RevenueOpportunity (pipeline creation)
- ResponseQueue (offer verification)
