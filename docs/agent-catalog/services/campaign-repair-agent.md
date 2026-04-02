# Campaign Repair Agent

## Purpose
Detects and repairs broken campaign automations by retrying failed email sends that have not exhausted max attempts, and logging errors for campaigns with incomplete leads but no pending actions.

## Department
Services | Operations

## Status
Live | Trigger: cron

## Input
- ScheduledEmail records with status = failed and attempts < 3
- CampaignLead records for incomplete state detection

## Output
- Retried failed sends with updated scheduled_for times
- Error logs for campaigns with broken state

## How It Works
1. Finds failed ScheduledEmail records that have not exhausted max attempts (< 3)
2. Checks lead sendability via communication safety service
3. Reschedules eligible sends with a 30-minute delay
4. Logs errors for campaigns with incomplete leads but no pending actions

## Use Cases
- **Operations**: Automated recovery from transient email failures
- **Reliability**: Prevent permanent failure from temporary issues
- **Monitoring**: Detect and log broken campaign states

## Integration Points
- ScheduledEmail model (failure detection and retry)
- communicationSafetyService (send eligibility)
- CampaignError model (error logging)
