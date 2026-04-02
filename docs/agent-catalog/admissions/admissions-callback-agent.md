# Admissions Callback Management Agent

## Purpose
Processes pending callback requests by scheduling them after governance approval, monitors overdue scheduled callbacks, and manages the callback lifecycle from request to completion.

## Department
Admissions | Operations

## Status
Live | Trigger: cron (every 5 minutes)

## Input
- CallbackRequest records with status pending
- Scheduled callbacks overdue by more than 30 minutes

## Output
- Callbacks marked as scheduled after governance approval
- Governance-denied callbacks annotated for retry on next cycle
- Overdue callback alerts for operations team

## How It Works
1. Fetches up to 20 pending callback requests, ordered by request time
2. Skips callbacks with a future requested_time (not yet due)
3. Runs each through the Call Governance Agent for approval
4. Approved callbacks are marked scheduled with an AdmissionsActionLog entry
5. Denied callbacks are kept pending with a note for retry
6. Scans for overdue scheduled callbacks (> 30 minutes past scheduled time) and flags them

## Use Cases
- **Admissions**: Automated callback scheduling with governance compliance
- **Operations**: Overdue callback monitoring prevents dropped follow-ups
- **Quality Assurance**: Full audit trail from request to completion

## Integration Points
- Admissions Call Governance Agent (approval workflow)
- CallbackRequest model (lifecycle management)
- AdmissionsActionLog (audit trail)
