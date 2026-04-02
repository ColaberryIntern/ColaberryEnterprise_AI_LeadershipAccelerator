# Experiment Recommendation Agent

## Purpose
Proposes experiments based on recent high-scoring insights. Identifies opportunities for A/B tests and process improvements by analyzing anomalies and patterns.

## Department
Reporting | Experimentation

## Status
Live | Trigger: cron

## Input
- Insights from anomaly detection with score >= 0.7

## Output
- Experiment proposals linked to specific insights

## How It Works
1. Detects anomalies across the system via insightDiscoveryService
2. Filters to high-scoring insights (score >= 0.7)
3. For each qualifying insight, proposes an experiment via experimentService
4. Returns the list of proposed experiments

## Use Cases
- **Product**: Data-driven experiment ideation
- **Marketing**: A/B test recommendations based on engagement patterns
- **Operations**: Process improvement suggestions

## Integration Points
- insightDiscoveryService (insight source)
- experimentService (experiment creation)
