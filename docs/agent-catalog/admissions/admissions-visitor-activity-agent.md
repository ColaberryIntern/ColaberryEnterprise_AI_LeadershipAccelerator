# Admissions Visitor Activity Agent

## Purpose
Enriches visitor profiles by analyzing page view events on admissions-relevant pages. Detects interest signals from page visits and updates AdmissionsMemory interests for personalized engagement.

## Department
Admissions | Intelligence

## Status
Live | Trigger: cron (every 10 minutes)

## Input
- PageEvent records from the last 15 minutes on admissions pages (/pricing, /enroll, /program, /sponsorship, /strategy-call-prep)

## Output
- Updated interests array on AdmissionsMemory (pricing, enrollment, enterprise, curriculum)

## How It Works
1. Finds recent page view events on admissions-relevant pages (last 15 minutes)
2. Filters to admissions pages and groups by visitor_id
3. Ensures an AdmissionsMemory record exists for each visitor (creates if needed)
4. Maps page visits to interest signals: /pricing to pricing, /enroll to enrollment, etc.
5. Merges new interests into the existing interests array without duplicates

## Use Cases
- **Admissions**: Maya knows what pages a visitor has been browsing
- **Sales**: Interest-based prioritization for outreach
- **Analytics**: Track which pages drive the most admissions interest

## Integration Points
- PageEvent model (page view data)
- AdmissionsMemory (interest enrichment)
- Visitor model (visitor lookup)
