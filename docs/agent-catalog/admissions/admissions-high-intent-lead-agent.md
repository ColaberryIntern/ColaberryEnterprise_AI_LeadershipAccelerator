# Admissions High-Intent Lead Agent

## Purpose
Flags enterprise prospects by detecting corporate email domains, multiple conversations, and enterprise interest signals. Upgrades visitor_type to enterprise and sets proactive outreach recommendations.

## Department
Admissions | Intelligence

## Status
Live | Trigger: cron (every 10 minutes)

## Input
- AdmissionsMemory records with 2+ conversations, not yet classified as enterprise or ceo

## Output
- Updated visitor_type to enterprise for qualifying visitors
- Recommended next action for enterprise outreach

## How It Works
1. Finds visitors with 2+ conversations not yet classified as enterprise or ceo
2. Looks up the linked Lead record and checks the email domain
3. Filters out free email providers (gmail, yahoo, hotmail, etc.)
4. Qualifies as enterprise if: corporate email AND (3+ conversations OR enterprise interest signals)
5. Updates visitor_type to enterprise with a proactive outreach recommendation

## Use Cases
- **Sales**: Automatic enterprise prospect detection for priority outreach
- **Admissions**: Maya adapts to enterprise qualification mode
- **Analytics**: Track enterprise lead funnel conversion

## Integration Points
- AdmissionsMemory (visitor classification)
- Lead model (email domain analysis)
- AI Event Service (enterprise_leads_flagged event)
