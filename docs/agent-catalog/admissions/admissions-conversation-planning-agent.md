# Admissions Conversation Planning Agent

## Purpose
Determines the conversation goal and next-message strategy based on visitor type, intent level, interests, and conversation history. Provides Maya with tactical guidance for each interaction.

## Department
Admissions | Intelligence

## Status
Live | Trigger: on-demand (called before or during conversations)

## Input
- visitor_id - the visitor to plan for

## Output
- Conversation goal (discovery, engagement, conversion, executive_briefing, etc.)
- Next-message strategy with specific tactical guidance

## How It Works
1. Loads the visitor AdmissionsMemory and IntentScore
2. Evaluates visitor_type (ceo, enterprise, high_intent, returning, new)
3. Considers intent level, interests, and conversation count
4. Selects the appropriate goal: executive_briefing for CEOs, conversion for very-high intent, enterprise_qualification for corporate visitors, value_demonstration for pricing-interested, discovery for first-time visitors
5. Returns a strategy string with specific conversational guidance

## Use Cases
- **Admissions**: Maya adapts its tone and strategy per visitor profile
- **Sales**: Automatic qualification routing for enterprise prospects
- **Marketing**: Personalized engagement based on visitor journey stage

## Integration Points
- AdmissionsMemory (visitor context)
- IntentScore (intent level)
- Maya chat system (strategy consumer)
