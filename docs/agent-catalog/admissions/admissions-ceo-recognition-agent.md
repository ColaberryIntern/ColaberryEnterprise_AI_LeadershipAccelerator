# Admissions CEO Recognition Agent

## Purpose
Detects when a visitor is a CEO based on their linked lead data and updates their AdmissionsMemory visitor_type to "ceo". This triggers executive-level greeting workflows and ensures Maya adapts its conversation strategy for C-level visitors.

## Department
Admissions | Intelligence

## Status
Live | Trigger: event-driven (called when a lead is linked to a visitor)

## Input
- visitor_id and/or lead_id (single visitor check)
- If neither provided, scans all visitors with linked leads (batch mode, up to 100)

## Output
- Updated AdmissionsMemory records with visitor_type = ceo
- AI event log entries for CEO recognition events

## How It Works
1. If visitor_id/lead_id provided, checks the single lead via the isCEO() classifier
2. If neither provided, scans all visitors with linked leads (up to 100) for batch detection
3. For each CEO match, creates or updates the AdmissionsMemory record with visitor_type = ceo
4. Logs a ceo_recognized AI event for downstream systems

## Use Cases
- **Admissions**: Auto-switch Maya to executive briefing mode for CEO visitors
- **Sales**: Instantly flag high-value prospects for priority outreach
- **Marketing**: Trigger VIP communication flows for C-suite website visitors

## Integration Points
- AdmissionsMemory (visitor classification)
- Lead model (contact data lookup)
- admissionsMemoryService.isCEO() (classification logic)
- AI Event Service (event logging)
