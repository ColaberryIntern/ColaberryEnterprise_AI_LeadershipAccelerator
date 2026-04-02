# Campaign QA Agent

## Purpose
Runs end-to-end tests on all active campaigns using synthetic test leads with unroutable email domains. Validates campaign flows, step execution, and safety guards.

## Department
Services | Quality Assurance

## Status
Live | Trigger: cron (every 6 hours)

## Input
- Active Campaign records
- Synthetic test leads with test domain emails

## Output
- Test run results with pass/fail status and scores per campaign
- QA status updates on campaigns

## How It Works
1. Finds all active campaigns
2. Runs each campaign through the test harness using synthetic leads
3. Tests use unroutable test domain emails for safety
4. The scheduler blocks any test emails targeting non-test domains
5. Reports pass/fail status with scores for each campaign

## Use Cases
- **Quality**: Continuous validation of campaign automations
- **Operations**: Early detection of broken campaign flows
- **Compliance**: Verify safety guards work correctly

## Integration Points
- campaignTestHarness (test execution)
- testLeadGenerator (synthetic lead creation)
- Campaign model (status updates)
