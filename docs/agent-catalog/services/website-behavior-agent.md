# Website Behavior Agent

## Purpose
Analyzes visitor behavior patterns across public pages to detect low-traffic pages and form abandonment. Creates website issues for pages with concerning behavioral patterns.

## Department
Services | Website

## Status
Live | Trigger: cron

## Input
- PageEvent records from the last 7 days
- VisitorSession data for form interaction analysis

## Output
- WebsiteIssue records for low-traffic pages (< 5 visits in 7 days)
- WebsiteIssue records for high form abandonment (< 20% submission rate)

## How It Works
1. Aggregates page visit counts from the last 7 days
2. Identifies pages with traffic below the threshold (< 5 visits)
3. Analyzes form interaction data to compute submission rates
4. Flags pages with form abandonment rates above 80%
5. Creates WebsiteIssue records for each finding

## Use Cases
- **Marketing**: Identify underperforming pages needing promotion
- **UX**: Detect forms causing user friction
- **Operations**: Data-driven website optimization

## Integration Points
- PageEvent model (traffic data)
- VisitorSession model (form interaction)
- WebsiteIssue model (issue creation)
