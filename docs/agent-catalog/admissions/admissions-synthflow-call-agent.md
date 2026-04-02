# Admissions Synthflow Call Agent

## Purpose
Initiates AI-powered voice calls via Synthflow after obtaining governance approval and passing communication safety checks. Handles the full call lifecycle from approval through placement and logging.

## Department
Admissions | Voice

## Status
Live | Trigger: on-demand

## Input
- visitor_id - the target visitor
- call_type - defaults to admissions_outreach
- reason - justification for the call
- campaign_source (optional) - originating campaign

## Output
- Call placed or denied/blocked status
- CallContactLog entry with Synthflow call ID
- Communication log and AdmissionsActionLog entries

## How It Works
1. Runs the Call Governance Agent for approval
2. If denied, logs the denial to CallContactLog and returns
3. Resolves the lead phone number from AdmissionsMemory
4. Runs the evaluateSend() safety check (test mode, unsubscribe, rate limit)
5. If allowed, triggers the Synthflow voice call with lead context
6. Logs to CallContactLog, communicationLogService, and AdmissionsActionLog

## Use Cases
- **Admissions**: AI-powered outreach calls to high-intent prospects
- **Follow-up**: Automated callback execution after visitor requests
- **Campaigns**: Campaign-driven voice outreach with full governance

## Integration Points
- Admissions Call Governance Agent (approval gate)
- communicationSafetyService (safety gate)
- Synthflow API (voice call execution)
- CallContactLog, communicationLogService, AdmissionsActionLog (logging)
