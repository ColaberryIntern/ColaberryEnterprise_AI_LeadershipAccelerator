# Visualization Agent

## Purpose
On-demand agent that generates chart visualization specs from data. Currently a no-op in scheduled mode since visualization specs are generated on-demand by the frontend.

## Department
Reporting | Visualization

## Status
Live | Trigger: on-demand

## Input
- Data and chart configuration from frontend requests

## Output
- Chart visualization specifications (on-demand only)

## How It Works
1. In scheduled mode, returns a no-op success result
2. In on-demand mode (via frontend), generates chart specs from provided data

## Use Cases
- **Dashboard**: Dynamic chart generation for reporting dashboards
- **Analytics**: Custom visualization for ad-hoc analysis
- **Presentations**: Auto-generated charts for executive briefings

## Integration Points
- Frontend dashboard (on-demand consumer)
- Agent Registry (discovery)
