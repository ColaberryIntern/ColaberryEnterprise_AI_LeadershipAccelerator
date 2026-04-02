# Admissions Email Agent

## Purpose
Sends admissions-related emails (follow-ups, materials, appointment confirmations, updates) after resolving the recipient from lead data and passing safety checks via the communication safety service.

## Department
Admissions | Communications

## Status
Live | Trigger: on-demand

## Input
- visitor_id - the target visitor
- email_type - one of: follow_up, materials, appointment_confirmation, admissions_update
- subject - email subject line
- body - email content

## Output
- Email queued via the communication log service
- AdmissionsActionLog entry recording the send action
- Blocked action if safety service denies the send

## How It Works
1. Validates all required fields (visitor_id, email_type, subject, body)
2. Resolves the recipient email from AdmissionsMemory and Lead record
3. Runs the evaluateSend() safety check (unsubscribe, rate limits, test mode)
4. If allowed, logs the communication as queued (actual sending delegated to emailService)
5. Creates an AdmissionsActionLog entry

## Use Cases
- **Admissions**: Send follow-up emails after conversations
- **Sales**: Deliver appointment confirmations and materials
- **Operations**: Automated email delivery with safety guardrails

## Integration Points
- communicationSafetyService.evaluateSend() (send gating)
- communicationLogService (delivery tracking)
- AdmissionsMemory and Lead model (recipient resolution)
- AdmissionsActionLog (audit trail)
