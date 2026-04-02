# Problem Discovery Agent

## Purpose
Scans business metrics and system state for anomalies, conversion drops, error spikes, and agent failures. Produces a deduplicated list of detected problems for the autonomous intelligence engine to investigate and resolve.

## Department
Operations | Anomaly Detection

## Status
Live | Trigger: cron (scheduled periodic scanning)

## Input
- Agent status records (from `AiAgent` table)
- Lead generation metrics (from `leads` table)
- System process error counts (from `system_processes` table)
- Vector memory for deduplication against recently reported issues

## Output
- List of `DetectedProblem` objects, each containing:
  - Problem type (kpi_anomaly, conversion_drop, error_spike, engagement_decline, agent_failure, pipeline_bottleneck)
  - Severity (low, medium, high, critical)
  - Entity type and ID (when applicable)
  - Description of the issue
  - Relevant metrics
  - Detection timestamp

## How It Works
1. Runs three detection checks in parallel:
   - **Agent failures**: Finds enabled agents in "error" status; severity escalates with error count
   - **Conversion drops**: Compares 48-hour lead count against the 7-day daily average; flags drops exceeding 40%
   - **Error spikes**: Compares last-hour error count against 24-hour hourly average; flags spikes exceeding 3x the norm
2. Collects all detected problems from the parallel checks
3. Deduplicates against vector memory by searching for similar recent entries (within 2 hours, similarity above 90%)
4. Returns only genuinely new problems for downstream investigation

## Use Cases
- **IT Operations**: Detects agents stuck in error state and escalates based on failure persistence
- **Marketing**: Identifies sudden drops in lead generation that may indicate campaign or funnel issues
- **Platform Engineering**: Catches error rate spikes early before they cascade into system-wide failures

## Integration Points
- Outputs feed directly into **Root Cause Agent** for investigation
- Queries **Vector Memory** for deduplication
- Reads from **AiAgent**, **leads**, and **system_processes** database tables
- Results initiate the full autonomous decision pipeline
