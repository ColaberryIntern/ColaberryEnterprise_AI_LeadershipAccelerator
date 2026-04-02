# Curriculum QA Agent

## Purpose
Validates curriculum integrity by walking lesson sequences, checking content existence, and verifying gating logic. Creates tickets for structural issues found.

## Department
Services | Quality Assurance

## Status
Live | Trigger: cron (every 6 hours) + on-demand

## Input
- CurriculumModule, CurriculumLesson, ArtifactDefinition, MiniSection records

## Output
- QA issues with severity (critical, high, medium, low)
- Tickets for issues requiring remediation

## How It Works
1. Loads all modules with their lessons, artifact definitions, and mini-sections
2. Validates lesson ordering and sequence continuity
3. Checks for missing content (lessons without artifacts or mini-sections)
4. Verifies gating logic consistency
5. Creates tickets for each issue found

## Use Cases
- **Quality**: Continuous curriculum integrity validation
- **Development**: Catch structural issues before students encounter them
- **Operations**: Automated QA reduces manual review burden

## Integration Points
- CurriculumModule, CurriculumLesson, ArtifactDefinition, MiniSection models
- Ticket service (issue creation)
