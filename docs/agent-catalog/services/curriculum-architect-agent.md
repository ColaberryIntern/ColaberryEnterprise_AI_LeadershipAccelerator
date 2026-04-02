# Curriculum Architect Agent

## Purpose
On-demand agent that designs curriculum module structures from ticket metadata. Creates modules, lessons, and sub-tickets for artifact generation using AI-driven curriculum design.

## Department
Services | Curriculum

## Status
Live | Trigger: on-demand (ticket-driven)

## Input
- Ticket metadata with program_id, module_name, skill_area, target_audience, lesson_count

## Output
- CurriculumModule record with structured lesson sequence
- CurriculumLesson records for each designed lesson
- Sub-tickets for artifact generation per lesson

## How It Works
1. Receives a ticket with curriculum design parameters
2. Generates a lesson plan via AI (chatCompletion) with title, description, type, skill focus, and duration
3. Creates the CurriculumModule record
4. Creates CurriculumLesson records for each lesson in sequence
5. Creates sub-tickets to trigger artifact generation for each lesson

## Use Cases
- **Education**: AI-assisted curriculum design
- **Operations**: Automated module creation from high-level requirements
- **Scalability**: Rapid curriculum expansion

## Integration Points
- CurriculumModule, CurriculumLesson models (structure creation)
- Ticket service (sub-ticket creation)
- OpenAI (lesson plan generation)
