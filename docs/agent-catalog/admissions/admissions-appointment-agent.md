# Admissions Appointment Scheduling Agent

## Purpose
Schedules admissions strategy calls and appointments via Google Calendar integration. Resolves visitor identity through AdmissionsMemory, retrieves available time slots, creates calendar bookings with Google Meet links, and persists appointment records for tracking.

## Department
Admissions | Scheduling

## Status
Live | Trigger: on-demand

## Input
- visitor_id - the visitor requesting an appointment
- slot_start (optional) - desired appointment time; if omitted, returns available slots
- timezone - defaults to America/Chicago
- appointment_type - defaults to strategy_call

## Output
- Available time slots (when no slot_start provided)
- Confirmed appointment with Google Meet link, event ID, and start time
- AdmissionsActionLog entry recording the scheduling action

## How It Works
1. Looks up the visitor in AdmissionsMemory to resolve the associated lead record
2. If no slot_start is provided, fetches the next 7 days of available slots from Google Calendar
3. If slot_start is provided, creates a Google Calendar booking with the lead contact details
4. Creates an Appointment record in the database with the Meet link and event metadata
5. Logs the action to AdmissionsActionLog and the AI activity log

## Use Cases
- **Admissions**: Visitor requests a strategy call during a Maya chat conversation
- **Sales**: Proactive outreach scheduling for high-intent enterprise prospects
- **Operations**: Automated slot retrieval for calendar widgets

## Integration Points
- AdmissionsMemory (visitor-to-lead resolution)
- Google Calendar API (slot retrieval and booking)
- Appointment model (persistent record)
- AdmissionsActionLog (audit trail)
