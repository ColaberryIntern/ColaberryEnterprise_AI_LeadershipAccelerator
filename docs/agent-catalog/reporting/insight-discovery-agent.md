# Insight Discovery Agent

## Purpose
Detects anomalies and patterns across the system, then persists discovered insights for consumption by other agents and dashboards.

## Department
Reporting | Intelligence

## Status
Live | Trigger: cron

## Input
- System-wide data via insightDiscoveryService

## Output
- Persisted anomaly and pattern insights with counts

## How It Works
1. Runs anomaly detection across the system
2. Runs pattern detection across the system
3. Combines all discovered insights
4. Persists insights to the database for downstream consumption

## Use Cases
- **Analytics**: Automated anomaly detection without manual monitoring
- **Operations**: Early warning system for unusual patterns
- **Strategy**: Pattern-based strategic insights

## Integration Points
- insightDiscoveryService (detection and persistence)
