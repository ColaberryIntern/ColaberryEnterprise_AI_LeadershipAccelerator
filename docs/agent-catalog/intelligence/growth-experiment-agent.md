# Growth Experiment Agent

## Purpose
Proposes A/B test experiments from uncertain intelligence decisions and recurring issues without clear solutions. Translates low-confidence recommendations into structured experiment proposals with hypotheses, control/variant definitions, success metrics, and traffic allocation.

## Department
Strategy | Experimentation and Growth

## Status
Live | Trigger: cron (scheduled periodic analysis)

## Input
- Proposed `IntelligenceDecision` records with confidence scores between 40 and 70
- Vector memory entries flagged as recurring issues without clear solutions

## Output
- List of `ExperimentProposal` objects, each containing:
  - Hypothesis statement
  - Control description (current state)
  - Variant description (proposed change)
  - Target metric
  - Duration in hours
  - Traffic split ratio
  - Source decision ID (when applicable)

## How It Works
1. Queries the decision table for proposed decisions with moderate confidence (40 to 70)
2. For each uncertain decision, generates an experiment proposal with a hypothesis based on the recommended action and target metric
3. Searches vector memory for recurring issues that lack clear solutions (similarity threshold above 0.5)
4. Creates additional experiment proposals for persistent issues using alternative approaches
5. Returns the full list of proposals, limited to 5 from decisions plus memory-based proposals

## Use Cases
- **Marketing**: When the system is unsure whether a campaign config change will help, it proposes a controlled A/B test instead of making an untested change
- **Product**: Identifies recurring user experience issues and proposes experiments to test alternative approaches
- **Data Science**: Converts uncertain analytical findings into structured experiments with measurable outcomes

## Integration Points
- Reads from **IntelligenceDecision** table (proposed decisions)
- Queries **Vector Memory** for recurring unresolved issues
- Proposals can be executed by **Execution Agent** (launch_ab_test action)
- Works alongside **Risk Evaluator Agent** to ensure experiments meet safety thresholds
