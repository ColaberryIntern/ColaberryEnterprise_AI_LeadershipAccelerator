# Admissions Visitor Identity Agent

## Purpose
Classifies visitor_type on AdmissionsMemory records using lead data, email domain, and behavioral signals. Periodically reclassifies visitors as their profile data evolves.

## Department
Admissions | Intelligence

## Status
Live | Trigger: event-driven (called when a visitor is identified or lead is linked)

## Input
- AdmissionsMemory records (up to 100 per run)

## Output
- Updated visitor_type classifications where changes are detected

## How It Works
1. Loads all AdmissionsMemory records (up to 100)
2. For each record, calls classifyVisitorType() to determine the current classification
3. If the classification has changed from the stored value, updates visitor_type
4. Logs the reclassification count

## Use Cases
- **Admissions**: Visitors are auto-classified as new, returning, high_intent, enterprise, or ceo
- **Sales**: Classification drives conversation strategy and outreach priority
- **Analytics**: Track visitor type distribution over time

## Integration Points
- AdmissionsMemory (classification storage)
- admissionsMemoryService.classifyVisitorType() (classification logic)
- Lead model (input data)
