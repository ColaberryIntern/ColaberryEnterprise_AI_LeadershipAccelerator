# Cost Optimization Agent

## Purpose
Analyzes the efficiency of the entire agent fleet by identifying agents with high run counts but low action rates, excessive error rates, or slow execution times. Produces actionable recommendations to reduce wasted compute and improve overall system efficiency.

## Department
Strategy | Resource Optimization

## Status
Live | Trigger: cron (scheduled periodic analysis)

## Input
- All enabled `AiAgent` records with their runtime statistics:
  - Run count
  - Average duration (ms)
  - Error count
  - Last execution result

## Output
- `CostInsight` containing:
  - List of inefficient agents with issue descriptions
  - Total compute minutes consumed across the fleet
  - Prioritized recommendations for efficiency improvements

## How It Works
1. Queries all enabled agents from the database with their runtime metrics
2. Skips agents with fewer than 5 runs (insufficient data)
3. Flags agents with error rates above 20%
4. Flags agents with more than 20 runs but zero actions taken (idle runs)
5. Flags agents with average execution times exceeding 30 seconds
6. Calculates total compute minutes across the fleet (run count multiplied by average duration)
7. Generates recommendations when inefficient agents are found or total compute exceeds 60 minutes

## Use Cases
- **IT Operations**: Identifies agents that run frequently but never take action, suggesting schedule frequency reduction
- **Platform Engineering**: Spots slow-running agents that may need code optimization or dependency updates
- **Finance**: Provides compute cost visibility for infrastructure budgeting and optimization

## Integration Points
- Reads from the **AiAgent** database table
- Recommendations feed into **Governance Agent** for policy enforcement
- Results inform **Strategic Intelligence Agent** fleet health assessments
