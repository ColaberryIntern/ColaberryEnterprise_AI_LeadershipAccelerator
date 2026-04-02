# Action Planner Agent

## Purpose
Maps root cause analysis results to safe, executable actions drawn from a curated allowlist. The agent matches detected problem types and root cause patterns against predefined action rules, then consults vector memory for historical success rates to improve recommendation quality over time.

## Department
Operations | Autonomous Decision Pipeline

## Status
Live | Trigger: event (invoked by the autonomous engine after root cause analysis)

## Input
- Root cause analysis result (`RootCauseResult`) containing the detected problem, identified root causes, and confidence score
- Vector memory context for past action outcomes

## Output
- List of `ActionRecommendation` objects, each containing:
  - Safe action identifier (from allowlist)
  - Human-readable description
  - Execution parameters
  - Expected impact statement
  - Reversibility flag
  - Historical success rate (when available)

## How It Works
1. Receives a root cause result from the Root Cause Agent
2. Iterates through a deterministic set of action rules, matching on problem type and root cause regex patterns
3. For each matched rule, queries vector memory for past outcomes of the same action type
4. Computes a historical success rate from stored results (successes divided by total attempts)
5. Assembles an `ActionRecommendation` with parameters, impact estimate, and success rate
6. If no rules match and root cause confidence is below 70%, defaults to proposing an A/B test to validate the hypothesis

## Use Cases
- **IT Operations**: Automatically recommends agent configuration resets or schedule modifications when agent failures are detected
- **Marketing**: Suggests campaign config updates, lead scoring adjustments, or A/B tests when conversion drops are identified
- **Platform Engineering**: Proposes campaign pauses during error spikes to stop propagation

## Integration Points
- Receives input from **Root Cause Agent**
- Outputs feed into **Impact Estimator Agent** and **Risk Evaluator Agent**
- Reads from and writes to **Vector Memory** for learning
- Action allowlist is defined by the `SafeAction` type in the `IntelligenceDecision` model
