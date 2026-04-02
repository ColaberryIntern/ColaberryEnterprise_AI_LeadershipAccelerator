# Admissions Conversation Task Monitor

## Purpose
Scans active chat conversations for actionable task requests from visitors using pattern matching. Detects requests for callbacks, emails, SMS, documents, and appointments, then creates the appropriate action records.

## Department
Admissions | Operations

## Status
Live | Trigger: cron (every 2 minutes)

## Input
- Active ChatConversations and their visitor messages
- Pattern matching against task detection regex rules

## Output
- AdmissionsActionLog entries for detected tasks (pending status)
- CallbackRequest records for callback requests
- Task detection actions with matched patterns

## How It Works
1. Finds all active conversations and their unscanned visitor messages
2. For each message, checks against task detection patterns: document requests, callback requests, email requests, SMS requests, appointment requests
3. Deduplicates against existing AdmissionsActionLog entries for the same message
4. Creates the appropriate task record (e.g., CallbackRequest for callback requests)
5. Logs a pending AdmissionsActionLog entry for each detected task

## Use Cases
- **Admissions**: Automatically detect when visitors request callbacks or documents
- **Operations**: Tasks are created instantly without waiting for manual review
- **Quality**: Ensure no visitor request goes unprocessed

## Integration Points
- ChatConversation and ChatMessage (message scanning)
- CallbackRequest (callback creation)
- AdmissionsActionLog (task tracking)
