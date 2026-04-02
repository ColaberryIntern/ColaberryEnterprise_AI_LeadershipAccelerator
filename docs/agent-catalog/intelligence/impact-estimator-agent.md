# Impact Estimator Agent

## Purpose
Predicts metric changes that would result from a proposed action by analyzing historical decision outcomes. When historical data is insufficient, falls back to conservative percentage estimates based on action type. Provides the Risk Evaluator Agent with quantified impact projections.

## Department
Operations | Decision Support

## Status
Live | Trigger: event (invoked during the autonomous decision pipeline)

## Input
- `ActionRecommendation` from the Action Planner Agent (action type, parameters, reversibility)
- `DetectedProblem` from the Problem Discovery Agent (problem type, current metrics)

## Output
- `ImpactEstimate` containing:
  - Action identifier
  - Target metric name
  - Current metric value
  - Predicted metric value
  - Percentage change
  - Confidence score (0 to 1)
  - Basis: "historical" or "conservative_estimate"

## How It Works
1. Searches for past decisions that used the same action and reached "completed" or "monitoring" status with recorded 24-hour impact data
2. If 2 or more historical outcomes exist, averages their recorded percentage changes
3. Computes confidence based on sample size (base 0.5 plus 0.05 per historical data point, capped at 0.9)
4. If historical data is insufficient, applies conservative hardcoded estimates:
   - update_agent_config: +12%
   - update_campaign_config: +10%
   - adjust_lead_scoring: +8%
   - modify_agent_schedule: +7%
   - launch_ab_test: +5%
   - pause_campaign: -15% (short-term negative, prevents further damage)
5. Conservative estimates receive a low confidence score of 0.3

## Use Cases
- **Operations**: Quantifies the expected improvement before auto-executing an agent config reset
- **Marketing**: Predicts conversion rate recovery timelines for campaign adjustments
- **Risk Management**: Feeds quantified impact data into the Risk Evaluator for gating decisions

## Integration Points
- Receives recommendations from **Action Planner Agent**
- Receives problem context from **Problem Discovery Agent**
- Outputs feed into **Risk Evaluator Agent** for risk/confidence scoring
- Reads historical outcomes from the **IntelligenceDecision** table
