# Root Cause Agent

## Purpose
Investigates detected problems using multiple analysis layers: activity logs for correlated failures, knowledge graph for entity relationships and impact paths, vector memory for similar past cases, and an optional Python ML proxy for advanced root cause analysis. Produces a structured root cause result with confidence scoring.

## Department
Operations | Root Cause Analysis

## Status
Live | Trigger: event (invoked by the autonomous engine after problem discovery)

## Input
- `DetectedProblem` from the Problem Discovery Agent (type, severity, entity info, metrics)
- Trace ID for correlation across the investigation pipeline

## Output
- `RootCauseResult` containing:
  - Original problem reference
  - List of identified root causes (strings)
  - Related entities from the knowledge graph
  - Similar past cases with similarity scores
  - Overall confidence (0 to 1)
  - Human-readable reasoning summary

## How It Works
1. **Activity log analysis**: Queries failed actions from the past 48 hours to identify correlated failure patterns
2. **Knowledge graph traversal**: Looks up the affected entity, finds related entities within 2 hops, and traces impact propagation paths
3. **Vector memory search**: Searches for similar past investigations (similarity threshold above 0.6) to leverage institutional memory
4. **Python ML proxy** (optional, best-effort): Sends problem metrics to the ML service for advanced root cause suggestions
5. **Deterministic rules**: Applies problem-type-specific rules (e.g., "check agent configuration" for agent failures, "review campaign targeting" for conversion drops)
6. **Confidence calibration**: Starts at 0.5 and increases incrementally based on evidence found at each layer (correlated failures +0.1, impact paths +0.05, similar cases +0.05 each, ML results +0.15)

## Use Cases
- **IT Operations**: Traces an agent failure back to a configuration change or dependency issue using activity logs and knowledge graph
- **Marketing**: Identifies whether a conversion drop stems from targeting changes, content quality, or external factors
- **Platform Engineering**: Correlates error spikes with recent system changes across related entities

## Integration Points
- Receives problems from **Problem Discovery Agent**
- Queries **AiAgentActivityLog** for correlated failures
- Traverses the **Knowledge Graph** for entity relationships
- Searches **Vector Memory** for historical investigations
- Optionally calls the **Python ML Proxy** for advanced analysis
- Outputs feed into **Action Planner Agent** for remedy recommendations
