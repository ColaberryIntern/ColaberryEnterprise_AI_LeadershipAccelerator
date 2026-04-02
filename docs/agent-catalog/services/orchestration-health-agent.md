# Orchestration Health Agent

## Purpose
Generates a health report covering curriculum, prompts, artifacts, students, and gating integrity. Computes a composite health score (0 to 100) with component-level breakdowns.

## Department
Services | Operations

## Status
Live | Trigger: cron

## Input
- System findings from healthReportService across all components

## Output
- OrchestrationHealth record with composite score and component scores
- Health report with findings by severity and category

## How It Works
1. Calls generateHealthReport() to scan all system components
2. Computes a health score starting at 100, subtracting penalties per finding severity (critical: -25, warning: -10, info: -2)
3. Breaks down scores by component: curriculum, prompts, artifacts, students, gating
4. Creates an OrchestrationHealth record with the scores
5. Logs critical findings as AI events

## Use Cases
- **Operations**: Real-time system health monitoring
- **Management**: Health score trending over time
- **Debugging**: Component-level health visibility

## Integration Points
- healthReportService (finding generation)
- OrchestrationHealth model (score persistence)
- AI Event Service (critical finding alerts)
