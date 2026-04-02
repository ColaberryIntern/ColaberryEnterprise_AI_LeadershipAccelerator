# Platform Fix Agent

## Purpose
On-demand agent triggered by bug tickets. Uses AI to diagnose issues and either auto-executes high-confidence fixes or adds diagnostic comments for human review.

## Department
Services | Operations

## Status
Live | Trigger: on-demand (ticket-driven, type = bug)

## Input
- Ticket title and description from bug report

## Output
- Diagnostic result with root cause, fix description, confidence, and risk level
- Auto-executed fix (confidence >= 0.80) or diagnostic comment (confidence < 0.80)

## How It Works
1. Receives a bug ticket with title and description
2. Sends the bug report to GPT for diagnosis (root cause, fix, confidence, risk, affected components)
3. If confidence >= auto-fix threshold (0.80): executes the fix automatically
4. If confidence < threshold: adds a diagnostic comment to the ticket for human review
5. Returns the diagnostic result with recommended action

## Use Cases
- **Operations**: Automated bug triage and diagnosis
- **Development**: AI-assisted fix recommendations
- **Efficiency**: Reduce time from bug report to resolution

## Integration Points
- OpenAI (diagnosis generation)
- Ticket service (comment and status updates)
