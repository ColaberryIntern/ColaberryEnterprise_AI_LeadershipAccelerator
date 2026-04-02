# Narrative Agent

## Purpose
Generates human-readable narratives from recent insights, translating data patterns and anomalies into plain-language descriptions suitable for non-technical stakeholders.

## Department
Reporting | Communications

## Status
Live | Trigger: cron

## Input
- Recent insights and patterns

## Output
- Human-readable narrative text

## How It Works
1. Calls generateNarrative() with current system state
2. Produces a narrative summary of recent findings
3. Returns the narrative with its length

## Use Cases
- **Executive Reporting**: Non-technical summaries for leadership
- **Communications**: Automated status updates
- **Documentation**: System activity narratives for audit trails

## Integration Points
- narrativeService (narrative generation)
