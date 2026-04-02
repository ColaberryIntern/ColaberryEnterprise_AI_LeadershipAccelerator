# Admissions Page Context Agent

## Purpose
Provides page-specific conversation strategy hints to Maya based on which website page the visitor is currently viewing. Each page has a defined focus area and suggested opening questions.

## Department
Admissions | Intelligence

## Status
Live | Trigger: on-demand

## Input
- page_category - the current page (homepage, program, pricing, enroll, sponsorship, strategy_call_prep, case_studies)

## Output
- Conversation strategy with focus description and suggested questions

## How It Works
1. Receives the page_category from the chat context
2. Looks up the predefined strategy for that page category
3. Returns the focus area and suggested conversation starters
4. Falls back to homepage strategy for unknown page categories

## Use Cases
- **Admissions**: Maya tailors its opening approach based on page context
- **Sales**: Pricing page visitors get ROI-focused conversations
- **Marketing**: Enrollment page visitors get objection-handling support

## Integration Points
- Maya chat system (strategy consumer)
- Page context detection (page_category source)
