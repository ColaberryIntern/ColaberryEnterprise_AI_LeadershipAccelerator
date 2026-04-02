# Security Director Agent

## Purpose
Orchestrates the security department by gathering recent security events, correlating threats and alerts, monitoring security agent health, and producing a unified security posture assessment.

## Department
Security | Management

## Status
Live | Trigger: cron

## Input
- DepartmentEvent records for the security department (last 10 minutes)
- AiAgent records for security agents
- Ticket records for unresolved security issues

## Output
- Correlated threat assessment with event counts and severity
- Security agent health status
- Unresolved ticket summary

## How It Works
1. Gathers recent security department events (threats, alerts, scans)
2. Correlates events to identify patterns and escalation needs
3. Checks health status of all security-category agents
4. Reviews unresolved security tickets
5. Produces a unified security posture assessment

## Use Cases
- **Security**: Centralized security operations center (SOC) automation
- **Management**: Security posture visibility
- **Compliance**: Security governance and audit trail

## Integration Points
- Department and DepartmentEvent models (event gathering)
- AiAgent model (agent health)
- Ticket model (issue tracking)
