# Admissions Insights Agent

## Purpose
Aggregates admissions analytics into a comprehensive dashboard snapshot including visitor counts, conversation metrics, visitor type distribution, and top interests across all tracked visitors.

## Department
Admissions | Analytics

## Status
Live | Trigger: cron (every 30 minutes)

## Input
- AdmissionsMemory, ChatConversation, IntentScore data

## Output
- Insights object with total known visitors, conversation counts (today, week), active conversations, visitor type breakdown, and top 10 interests

## How It Works
1. Counts total memories, today's and this week's conversations, active conversations
2. Counts visitors by type: returning, high_intent, enterprise, ceo
3. Aggregates visitor_type distribution across all memory records
4. Extracts and ranks the top 10 interests across all visitors
5. Packages everything into a dashboard-ready insights object

## Use Cases
- **Dashboard**: Real-time admissions metrics display
- **Management**: Weekly trend analysis on visitor engagement
- **Marketing**: Interest-based content strategy optimization

## Integration Points
- AdmissionsMemory (visitor data)
- ChatConversation (conversation counts)
- Agent dashboard (insights consumer)
