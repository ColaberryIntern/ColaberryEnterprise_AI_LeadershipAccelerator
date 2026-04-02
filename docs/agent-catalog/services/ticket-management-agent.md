# Ticket Management Agent

## Purpose
Auto-assigns unassigned tickets to appropriate agents, escalates stale tickets, and manages the ticket lifecycle. Serves as the central ticket routing system.

## Department
Services | Operations

## Status
Live | Trigger: cron (every 15 minutes)

## Input
- Ticket records with status = todo and no assignee
- Ticket records with status = in_progress older than 48 hours

## Output
- Auto-dispatched tickets to appropriate agents
- Escalated stale tickets

## How It Works
1. Finds unassigned tickets in todo status, ordered by priority
2. Dispatches each to the appropriate agent via the ticket agent dispatcher
3. Scans for stale tickets (in_progress for > 48 hours)
4. Escalates stale tickets with status updates

## Use Cases
- **Operations**: Automated ticket routing eliminates manual triage
- **Efficiency**: Tickets reach the right agent within minutes
- **Management**: Stale ticket escalation prevents items from falling through

## Integration Points
- Ticket model (ticket management)
- ticketAgentDispatcher (agent routing)
- ticketService (status updates)
