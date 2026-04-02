# Executive Briefing Reporting Agent

## Purpose
Aggregates system-wide KPIs and top insights, then generates a human-readable executive summary combining metrics with anomaly detection findings.

## Department
Reporting | Executive

## Status
Live | Trigger: cron (daily)

## Input
- System-wide KPIs via kpiService
- Anomaly detection results via insightDiscoveryService
- Narrative generation via narrativeService

## Output
- Executive summary combining KPIs, insights, and narrative

## How It Works
1. Snapshots system-wide KPIs for all departments
2. Runs anomaly detection across the system
3. Generates an executive summary narrative from insights and KPIs
4. Returns the summary with KPI count and narrative length

## Use Cases
- **Executive Team**: Daily briefing with key metrics and anomalies
- **Strategy**: Data-driven decision support
- **Governance**: Automated reporting compliance

## Integration Points
- kpiService (KPI aggregation)
- insightDiscoveryService (anomaly detection)
- narrativeService (summary generation)
