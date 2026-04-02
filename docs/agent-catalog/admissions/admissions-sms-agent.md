# Admissions SMS Agent

## Purpose
Sends SMS messages via GoHighLevel for admissions purposes including conversation summaries, appointment reminders, and requested links. Includes communication safety checks and test mode support.

## Department
Admissions | Communications

## Status
Live | Trigger: on-demand

## Input
- visitor_id - the target visitor
- sms_type - one of: conversation_summary, appointment_reminder, requested_link
- message - the SMS content

## Output
- SMS sent or failed status with GHL message ID
- Communication log entry for tracking
- AdmissionsActionLog entry for audit

## How It Works
1. Validates required fields and SMS type
2. Resolves the GHL contact ID from AdmissionsMemory and Lead record
3. Runs the evaluateSend() safety check (unsubscribe, rate limits, test mode)
4. If allowed, sends the SMS via GoHighLevel API
5. Logs the communication and creates an AdmissionsActionLog entry

## Use Cases
- **Admissions**: Send conversation summaries to visitors after chat
- **Scheduling**: Appointment reminder SMS messages
- **Engagement**: Quick link delivery to mobile users

## Integration Points
- GoHighLevel API (SMS delivery)
- communicationSafetyService.evaluateSend() (send gating)
- communicationLogService (delivery tracking)
- AdmissionsActionLog (audit trail)
