# Artifact Generation Agent

## Purpose
On-demand agent that generates teaching artifacts (slides, lab exercises, assessments, project briefs, reference guides) for curriculum lessons using AI content generation.

## Department
Services | Curriculum

## Status
Live | Trigger: on-demand (ticket-driven)

## Input
- lesson_id from ticket metadata
- lesson_type for artifact selection

## Output
- Generated artifact content stored in ArtifactDefinition records
- Artifacts appropriate for the lesson type

## How It Works
1. Receives a ticket with lesson_id metadata
2. Loads the lesson details and determines which artifacts to generate based on lesson type
3. Generates each artifact using AI (chatCompletion)
4. Stores generated artifacts in the ArtifactDefinition model

## Use Cases
- **Education**: Automated teaching material generation
- **Curriculum**: Scale content creation across all lessons
- **Operations**: Reduce manual effort for artifact production

## Integration Points
- CurriculumLesson model (lesson context)
- ArtifactDefinition model (artifact storage)
- OpenAI (content generation)
