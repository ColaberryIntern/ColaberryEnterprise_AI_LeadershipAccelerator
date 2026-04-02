# Risk Evaluator Agent

## Purpose
Provides deterministic risk and confidence scoring for autonomous action gating. Computes a composite risk score (blast radius, reversibility, data confidence) and a confidence score (data quality, pattern match, historical success) to decide whether an action can auto-execute or must be proposed for human review.

## Department
Operations | Risk Assessment

## Status
Live | Trigger: event (invoked during the autonomous decision pipeline)

## Input
- `ActionRecommendation` from the Action Planner Agent
- `ImpactEstimate` from the Impact Estimator Agent
- `RootCauseResult` from the Root Cause Agent

## Output
- `RiskEvaluation` containing:
  - Risk score (0 to 100)
  - Confidence score (0 to 100)
  - Risk tier (safe, moderate, risky, dangerous)
  - Auto-executable flag (true/false)
  - Reasoning chain explaining each scoring component
  - Score breakdown by category

## How It Works
1. **Risk Score** (0 to 100) is computed from three components:
   - Blast radius (0 to 40): Based on action type; ranges from 5 (single agent config) to 35 (pause campaign)
   - Reversibility (0 to 30): Lower for easily reversible actions; higher for actions with lasting effects
   - Data confidence penalty (0 to 30): Higher penalty when impact estimates have low confidence
2. **Confidence Score** (0 to 100) is computed from three components:
   - Data quality (0 to 40): Based on root cause analysis confidence
   - Pattern match (0 to 30): Based on similarity to past cases found in vector memory
   - Historical success (0 to 30): Based on past success rate of the recommended action
3. **Risk Tier** is assigned: safe (<25), moderate (25 to 49), risky (50 to 74), dangerous (75+)
4. **Auto-execution gate**: Resolves thresholds from governance config (defaults: risk < 40, confidence > 70)
5. Actions meeting both thresholds are flagged for auto-execution; others are flagged as "propose only"

## Use Cases
- **Operations**: Ensures low-risk, high-confidence agent fixes execute automatically while uncertain changes require human approval
- **Risk Management**: Provides transparent scoring breakdown for every autonomous decision
- **Compliance**: Governance thresholds are configurable via database, enabling policy adjustments without code changes

## Integration Points
- Receives inputs from **Action Planner Agent**, **Impact Estimator Agent**, and **Root Cause Agent**
- Reads governance thresholds from **GovernanceResolutionService**
- Output determines whether the **Execution Agent** auto-executes or the decision enters the proposal queue
- Scoring breakdown is recorded in the **IntelligenceDecision** for audit
