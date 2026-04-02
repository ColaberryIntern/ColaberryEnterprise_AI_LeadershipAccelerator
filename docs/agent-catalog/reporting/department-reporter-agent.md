# Department Reporter Agent

## Purpose
Parametric agent that snapshots KPIs for a configured department. Can be instantiated multiple times with different department configurations to cover all organizational units.

## Department
Reporting | Department Analytics

## Status
Live | Trigger: cron (daily)

## Input
- config.department - the department to report on (e.g., admissions, marketing, security)

## Output
- KPI snapshot persisted via the kpiService

## How It Works
1. Reads the department from configuration
2. Calls snapshotKPIs() for that department with daily granularity
3. Returns the snapshot result with KPI count

## Use Cases
- **Management**: Daily department-level KPI tracking
- **Operations**: Trend analysis per department
- **Governance**: Consistent KPI collection across all departments

## Integration Points
- kpiService.snapshotKPIs() (KPI persistence)
