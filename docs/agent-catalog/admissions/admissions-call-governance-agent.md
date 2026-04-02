# Admissions Call Governance Agent

## Purpose
Acts as a gatekeeper for all outbound voice calls by enforcing a 24-hour contact rule. Approves or denies call requests based on the visitor's recent call history and whether the call type qualifies as a valid exception.

## Department
Admissions | Governance

## Status
Live | Trigger: on-demand

## Input
- visitor_id - the target visitor
- call_type - the type of call being requested
- reason - justification for the call
- requesting_agent - the agent requesting the call

## Output
- Approval or denial decision with reasoning
- Governance metadata including last call timestamp and exception status

## How It Works
1. Receives a call request with visitor_id, call_type, and reason
2. Checks CallContactLog for any completed or pending calls within the last 24 hours
3. If a recent call exists, checks whether the call_type is a valid exception (visitor_requested_callback, appointment_reminder, support_followup)
4. Returns call_approved or call_denied with detailed reasoning

## Use Cases
- **Admissions**: Gate all outbound calls to prevent over-contacting prospects
- **Compliance**: Enforce consistent contact frequency rules across all agents
- **Customer Experience**: Protect visitor experience by limiting unsolicited outreach

## Integration Points
- CallContactLog (recent call lookup)
- Called by: Admissions Assistant Agent, Callback Agent, Synthflow Call Agent
- AI Event Service (governance decision logging)
