# Revenue Opportunity Agent

## Purpose
Scans for revenue opportunities across the system by analyzing lead engagement, conversation stages, and behavioral signals to identify potential conversion points.

## Department
Reporting | Revenue

## Status
Live | Trigger: cron

## Input
- System-wide data via revenueOpportunityService

## Output
- Discovered revenue opportunities with count

## How It Works
1. Calls scanForOpportunities() to analyze the system
2. Returns the number of opportunities found

## Use Cases
- **Sales**: Automated pipeline discovery
- **Revenue**: Identify upsell and cross-sell opportunities
- **Management**: Revenue opportunity tracking

## Integration Points
- revenueOpportunityService (opportunity scanning)
