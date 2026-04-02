# Orchestration Auto-Repair Agent

## Purpose
Reads recent findings from monitoring agents and automatically repairs safe, well-understood issues like inactive prompt reactivation and broken foreign key nullification.

## Department
Services | Operations

## Status
Live | Trigger: cron

## Input
- AiSystemEvent records from the last 10 minutes (from orchestration_health, student_progress_monitor, prompt_monitor sources)

## Output
- Repaired issues with before/after state
- Skipped issues above confidence threshold

## How It Works
1. Reads recent monitoring findings (inactive prompts referenced, broken FK references)
2. Filters to safe repair types that can be auto-fixed
3. For inactive prompt reactivation: reactivates the prompt template
4. For broken FK nullification: nullifies the broken reference
5. Respects configurable max repairs per run (default: 10)

## Use Cases
- **Operations**: Automated repair of common orchestration issues
- **Reliability**: Self-healing reduces downtime from routine problems
- **Monitoring**: Complements monitoring agents with automated remediation

## Integration Points
- AiSystemEvent model (finding source)
- PromptTemplate, MiniSection, ArtifactDefinition models (repair targets)
