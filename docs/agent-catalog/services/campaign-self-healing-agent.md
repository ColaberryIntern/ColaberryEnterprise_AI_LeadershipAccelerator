# Campaign Self-Healing Agent

## Purpose
Extends CampaignRepairAgent with QA-driven healing. Detects recent QA failures and attempts automated repairs based on the type of failure detected.

## Department
Services | Operations

## Status
Live | Trigger: cron (every 30 minutes)

## Input
- CampaignTestStep records with status = failed (last 6 hours)
- Associated CampaignTestRun and Campaign records

## Output
- Repair attempts for known failure patterns
- Diagnostic comments on tickets for unknown failures

## How It Works
1. Finds recent failed test steps from the last 6 hours
2. Groups failures by campaign
3. Identifies the failure type and applies appropriate repair strategy
4. Re-runs QA tests after repair to verify the fix
5. Reports repair outcomes per campaign

## Use Cases
- **Operations**: Automated recovery from QA-detected failures
- **Reliability**: Self-healing reduces manual intervention needs
- **Quality**: Continuous improvement through automated repair cycles

## Integration Points
- CampaignTestStep and CampaignTestRun models (failure detection)
- campaignTestHarness (re-verification)
- communicationSafetyService (send eligibility)
