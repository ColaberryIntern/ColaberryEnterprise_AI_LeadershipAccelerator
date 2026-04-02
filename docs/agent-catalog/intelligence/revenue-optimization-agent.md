# Revenue Optimization Agent

## Purpose
Analyzes the lead-to-enrollment conversion funnel to identify bottlenecks and estimate revenue at risk. Prioritizes optimization opportunities by their potential revenue impact and generates actionable recommendations for improving funnel performance.

## Department
Strategy | Revenue Intelligence

## Status
Live | Trigger: cron (scheduled periodic analysis)

## Input
- Lead records grouped by status from the `leads` table
- Expected funnel stages: new, contacted, qualified, enrolled, converted

## Output
- `RevenueInsight` containing:
  - Funnel stages with counts and conversion rates
  - Identified bottleneck (stage-to-stage transition with the worst drop-off)
  - Estimated revenue at risk
  - Prioritized recommendations

## How It Works
1. Queries the leads table grouped by status to build the conversion funnel
2. Calculates conversion rate for each stage relative to total leads
3. Orders stages according to the expected funnel progression (new to contacted to qualified to enrolled to converted)
4. Identifies the worst stage-to-stage drop-off percentage
5. Flags bottlenecks where drop-off exceeds 70% as high-priority
6. Estimates revenue at risk based on total lead volume and drop-off severity
7. Generates recommendations based on funnel shape (e.g., adding qualification steps if too few stages exist)

## Use Cases
- **Sales Leadership**: Identifies which funnel stage loses the most prospects, enabling targeted intervention
- **Marketing**: Highlights whether lead quality or follow-up processes are causing conversion failures
- **Executive Strategy**: Provides revenue-at-risk estimates to prioritize investment in funnel optimization

## Integration Points
- Reads from the **leads** database table
- Recommendations feed into **Strategic Intelligence Agent** for holistic business health views
- Insights can trigger **Cory Strategic Agent** to create improvement tickets
- Works alongside **Cost Optimization Agent** for ROI analysis
