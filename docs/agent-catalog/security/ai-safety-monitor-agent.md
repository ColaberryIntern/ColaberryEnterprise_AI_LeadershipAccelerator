# AI Safety Monitor Agent

## Purpose
Scans recent chat messages for prompt injection attacks, jailbreak attempts, and data exfiltration probes using pattern-matching against known injection techniques.

## Department
Security | AI Safety

## Status
Live | Trigger: cron

## Input
- ChatMessage records from the last 5 minutes

## Output
- Injection findings with pattern name, severity, and content preview
- Tickets for critical and high-severity detections

## How It Works
1. Scans recent user messages (last 5 minutes) against injection patterns
2. Detects: system prompt overrides, role impersonation, system message injection, instruction reveal attempts, base64/data URI probes, OS command probes, DAN jailbreaks, hypothetical bypasses
3. Classifies findings by severity (critical, high, medium)
4. Creates tickets for actionable findings

## Use Cases
- **Security**: Real-time detection of prompt injection attacks
- **Compliance**: Audit trail for all attempted AI manipulation
- **Safety**: Protect the AI system from being tricked into harmful behavior

## Integration Points
- ChatMessage model (message scanning)
- Ticket service (incident creation)
- Department events (security alerts)
