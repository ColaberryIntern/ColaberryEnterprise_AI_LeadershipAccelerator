# Curriculum Optimizer Agent

## Purpose
Analyzes student behavior data to identify drop-off points, slow lessons, and high mentor usage patterns. Creates tickets for actionable curriculum improvements.

## Department
Services | Curriculum

## Status
Live | Trigger: cron (daily at 6 AM)

## Input
- LessonInstance completion data from the last 30 days
- MentorConversation usage data

## Output
- Tickets for high drop-off lessons (> 40% drop-off rate)
- Tickets for slow lessons (> 60 min average duration)
- Tickets for high mentor usage lessons (> 70% of students needing help)

## How It Works
1. Aggregates completion rates per lesson from the last 30 days
2. Identifies lessons with drop-off rates exceeding 40%
3. Flags lessons with average duration exceeding 60 minutes
4. Detects lessons where more than 70% of students use the mentor
5. Creates tickets for each finding with lesson details and metrics

## Use Cases
- **Education**: Data-driven curriculum improvement
- **Quality**: Identify struggling lessons before students complain
- **Operations**: Prioritize curriculum fixes by impact

## Integration Points
- LessonInstance model (completion data)
- MentorConversation model (help-seeking data)
- Ticket service (improvement tickets)
