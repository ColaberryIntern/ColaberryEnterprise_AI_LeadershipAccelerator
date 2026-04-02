# Admissions Conversation Continuity Agent

## Purpose
Merges context from short, fragmented conversations by the same visitor into a coherent understanding. Detects when visitors have multiple brief chats across different pages and annotates their memory with browsing behavior patterns.

## Department
Admissions | Intelligence

## Status
Live | Trigger: cron (every 5 minutes)

## Input
- Recently closed ChatConversations (last 30 minutes) with fewer than 3 visitor messages

## Output
- Updated AdmissionsMemory personality_notes with browsing behavior annotations
- Continuity merge actions indicating pages visited and conversation count

## How It Works
1. Finds recently closed short conversations (< 3 messages) from the last 30 minutes
2. Groups them by visitor_id to identify visitors with multiple fragments
3. For visitors with 2+ short conversations across different page categories, creates a browsing behavior note
4. Updates AdmissionsMemory personality_notes so Maya can reference the browsing journey

## Use Cases
- **Admissions**: Maya references cross-page browsing journeys for contextual responses
- **Sales Intelligence**: Identify visitors comparing options across program pages
- **Analytics**: Detect and quantify fragmented conversation patterns

## Integration Points
- ChatConversation (short conversation detection)
- AdmissionsMemory (personality notes enrichment)
