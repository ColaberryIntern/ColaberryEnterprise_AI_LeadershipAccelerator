# Strategic Intelligence Agent

## Purpose
Provides a holistic, cross-entity view of business health by aggregating KPIs across leads, campaigns, and students, detecting systemic patterns, and assessing agent fleet health. Serves as the primary intelligence source for the AI COO dashboard.

## Department
Strategy | Business Intelligence

## Status
Live | Trigger: cron (scheduled periodic analysis)

## Input
- Agent fleet status records from the `AiAgent` table
- Entity row counts and recent activity from key business tables (leads, campaign_healths, students)

## Output
- `StrategicOverview` containing:
  - Entity KPIs (total rows, recent 24h activity, trend direction per entity)
  - Systemic patterns detected across the organization
  - Risk areas requiring attention
  - Opportunity areas for growth
  - Agent fleet health summary (total, healthy, errored, paused counts)

## How It Works
1. Queries all agents and computes fleet health metrics (healthy, errored, paused percentages)
2. Flags risk if more than 20% of agents are in error state
3. For each key entity table (leads, campaigns, students):
   - Counts total rows and rows created in the last 24 hours
   - Computes trend direction by comparing daily activity to the monthly average
   - Flags declining entities as risk areas and growing entities as opportunities
4. Detects systemic patterns:
   - Multiple risk areas suggest a systemic issue
   - Many paused agents suggest a fleet-wide review is needed
5. Assembles the complete strategic overview for executive consumption

## Use Cases
- **Executive Leadership**: Single-pane-of-glass view of platform health across all business entities
- **Operations**: Early warning when multiple entity types decline simultaneously, suggesting a systemic cause
- **Strategic Planning**: Identifies growth opportunities by highlighting entities with accelerating activity

## Integration Points
- Reads from **AiAgent**, **leads**, **campaign_healths**, and **students** database tables
- Overview informs **Governance Agent** and **Cory Strategic Agent** decision-making
- Risk areas can trigger **Problem Discovery Agent** investigations
- Opportunity areas can feed into **Revenue Optimization Agent** for deeper analysis
