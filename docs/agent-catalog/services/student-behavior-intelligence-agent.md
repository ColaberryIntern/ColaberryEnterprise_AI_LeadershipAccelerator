# Student Behavior Intelligence Agent

## Purpose
Aggregates student navigation events to detect behavioral anomalies including high drop-off rates, idle patterns, and unusual mentor usage. Creates tickets when thresholds are exceeded.

## Department
Services | Education

## Status
Live | Trigger: cron (every 30 minutes)

## Input
- StudentNavigationEvent records from the last 24 hours

## Output
- Behavioral anomaly detections per lesson
- Tickets for lessons exceeding anomaly thresholds

## How It Works
1. Aggregates navigation events by lesson and event type from the last 24 hours
2. Computes per-lesson metrics: event counts, unique students, average duration
3. Detects anomalies: unusual event patterns, high idle rates, excessive mentor usage
4. Creates tickets for lessons exceeding anomaly thresholds

## Use Cases
- **Education**: Real-time student behavior monitoring
- **Curriculum**: Identify lessons causing confusion or frustration
- **Support**: Early intervention for struggling students

## Integration Points
- StudentNavigationEvent (behavior data)
- CurriculumLesson (lesson context)
- Ticket service (anomaly reporting)
