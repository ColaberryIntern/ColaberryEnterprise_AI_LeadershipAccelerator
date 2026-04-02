# Prompt Monitor Agent

## Purpose
Monitors the integrity of prompt template references across the system. Detects inactive prompts still referenced by active mini-sections and broken foreign key references to non-existent prompts.

## Department
Services | Monitoring

## Status
Live | Trigger: cron

## Input
- Active MiniSection records with prompt template FK references
- PromptTemplate records with active/inactive status

## Output
- AI system events for inactive prompt references and broken FK references

## How It Works
1. Checks if any active mini-sections exist; exits early if none
2. For each prompt FK field (concept, build, mentor), finds active mini-sections referencing prompts
3. Detects inactive prompts still referenced by active mini-sections
4. Detects broken FKs where the referenced prompt no longer exists
5. Logs findings as AiSystemEvent records for the auto-repair agent

## Use Cases
- **Operations**: Prevent broken learning experiences from invalid prompt references
- **Quality**: Continuous integrity monitoring of the prompt system
- **Automation**: Findings feed directly into the auto-repair agent

## Integration Points
- MiniSection model (reference scanning)
- PromptTemplate model (status checking)
- AiSystemEvent model (finding storage)
