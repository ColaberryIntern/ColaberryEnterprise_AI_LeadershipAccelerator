# Admissions Conversation Memory Agent

## Purpose
Processes closed chat conversations into persistent AdmissionsMemory summaries. Ensures that insights from every conversation are stored for future reference, enabling Maya to recall previous interactions and provide personalized responses.

## Department
Admissions | Intelligence

## Status
Live | Trigger: cron (every 30 minutes)

## Input
- ChatConversation records closed within the last hour

## Output
- Conversation summaries persisted to AdmissionsMemory
- Deduplication: skips conversations already present in memory

## How It Works
1. Finds conversations closed within the last hour
2. For each conversation, checks if it already exists in AdmissionsMemory conversation_summaries
3. If not yet processed, calls saveConversationToMemory() to extract and persist a summary
4. Logs the count of conversations checked and memorized

## Use Cases
- **Admissions**: Maya recalls previous conversations with returning visitors
- **Sales**: Counselors see conversation history before making calls
- **Analytics**: Complete conversation archive for pattern analysis

## Integration Points
- ChatConversation (source conversations)
- AdmissionsMemory (persistent storage)
- admissionsMemoryService.saveConversationToMemory() (extraction logic)
