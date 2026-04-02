# Admissions Call Compliance Monitor

## Purpose
Detects duplicate outreach, campaign conflicts, and spam patterns by scanning CallContactLog for visitors who received multiple calls within 24 hours. Identifies campaign priority conflicts and flags violations for review.

## Department
Admissions | Compliance

## Status
Live | Trigger: cron (every 15 minutes)

## Input
- CallContactLog entries from the last 24 hours with status completed or pending

## Output
- Compliance violation reports per visitor with call counts and campaign conflict details
- Highest-priority campaign identification when conflicts exist

## How It Works
1. Queries CallContactLog for visitors with more than one call in the last 24 hours
2. For each duplicate, retrieves the individual call records and their campaign sources
3. Checks for campaign conflicts (multiple sources targeting the same visitor)
4. When conflicts are found, determines the highest-priority campaign using a predefined ranking
5. Generates compliance violation actions with call count, sources, and priority resolution

## Use Cases
- **Compliance**: Prevent harassment by detecting over-contact patterns
- **Operations**: Resolve campaign conflicts where multiple streams target the same visitor
- **Management**: Audit trail for call frequency and campaign coordination

## Integration Points
- CallContactLog (call history analysis)
- Campaign priority configuration (conflict resolution)
- AI Event Service (activity logging)
