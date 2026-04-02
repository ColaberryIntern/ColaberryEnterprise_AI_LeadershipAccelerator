# Reporting Intelligence Agent

## Purpose
Runs a full system scan via the reporting orchestration service, producing comprehensive intelligence across all departments and subsystems.

## Department
Reporting | Intelligence

## Status
Live | Trigger: cron

## Input
- All system data via reportingOrchestrationService

## Output
- Complete system scan results with scan count

## How It Works
1. Calls runSystemScan() to execute a comprehensive system analysis
2. Returns the scan results including number of scans completed

## Use Cases
- **Operations**: Comprehensive system health assessment
- **Governance**: Regular compliance and performance scanning
- **Strategy**: Cross-department intelligence gathering

## Integration Points
- reportingOrchestrationService (scan execution)
